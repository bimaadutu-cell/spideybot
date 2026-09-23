import * as THREE from "three";
import { floorBloodTexture } from "./blood";
import { CELL, gridToWorld, getLevelItems, LEVELS, tileAt, WALL_HEIGHT, type DoorDef, type FeatureDef, type ItemSpawn } from "./maps";
import { ITEM_NAMES, type GameSettings, type ItemId, type LevelId, type SaveData } from "./types";

export interface WorldInteraction {
  id: string;
  kind: "door" | "item" | FeatureDef["kind"];
  x: number;
  z: number;
  name: string;
  item?: ItemId;
  door?: DoorDef;
  feature?: FeatureDef;
  object: THREE.Object3D;
}

export interface WorldHandle {
  group: THREE.Group;
  interactions: WorldInteraction[];
  colliders: { x: number; z: number; radius: number }[];
  flickerLights: THREE.PointLight[];
  dust: THREE.Points | null;
  rain: THREE.Points | null;
  setDoor: (id: string, open: boolean) => void;
  setDrawer: (id: string, open: boolean) => void;
  setSafe: (open: boolean) => void;
  setPower: (on: boolean) => void;
  stampBlood: (x: number, z: number, angle: number) => void;
  animate: (dt: number) => void;
  addItem: (item: ItemSpawn) => void;
  removeInteraction: (id: string) => void;
  dispose: () => void;
}

function canvasTexture(kind: "wall" | "wood" | "concrete" | "earth", quality: GameSettings["quality"]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const size = quality === "LOW" ? 128 : quality === "MEDIUM" ? 256 : 512;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(size / 256, size / 256);
  let seed = { wall: 173, wood: 419, concrete: 271, earth: 731 }[kind];
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = { wall: "#464039", wood: "#342a24", concrete: "#353a39", earth: "#252b28" }[kind];
  ctx.fillRect(0, 0, 256, 256);
  if (kind === "wood") {
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = y % 64 ? "#3b3029" : "#302722";
      ctx.fillRect(0, y, 256, 31);
      ctx.fillStyle = "rgba(3,2,2,.5)";
      ctx.fillRect(0, y, 256, 2);
      for (let k = 0; k < 19; k++) {
        ctx.strokeStyle = `rgba(${random() > 0.5 ? "2,2,2" : "120,95,71"},${0.04 + random() * 0.14})`;
        ctx.beginPath();
        const ly = y + random() * 29;
        ctx.moveTo(random() * 80, ly);
        ctx.bezierCurveTo(85, ly + random() * 3, 160, ly - random() * 4, 255, ly + random() * 3);
        ctx.stroke();
      }
      ctx.fillRect(y % 64 ? 190 : 80, y, 2, 30);
    }
  } else if (kind === "wall") {
    for (let x = 9; x < 256; x += 34) {
      ctx.fillStyle = "rgba(17,13,14,.14)";
      ctx.fillRect(x, 0, 2, 256);
      ctx.strokeStyle = "rgba(125,101,86,.13)";
      for (let y = 15; y < 256; y += 43) {
        ctx.beginPath();
        ctx.ellipse(x + 16, y + 8, 10, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(12,11,10,${0.02 + random() * 0.11})`;
      ctx.fillRect(random() * 256, random() * 256, 2 + random() * 29, 3 + random() * 46);
    }
  } else {
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(${kind === "earth" ? "77,83,69" : "102,100,91"},${random() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(random() * 256, random() * 256, random() * 22, random() * 11, 0, 0, 7);
      ctx.fill();
    }
  }
  for (let i = 0; i < 6500 * (size / 256) ** 2; i++) {
    const alpha = random() * 0.085;
    ctx.fillStyle = random() > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(220,203,170,${alpha * 0.45})`;
    ctx.fillRect(random() * 256, random() * 256, random() * 3 + 1, random() * 3 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = quality === "LOW" ? 2 : quality === "MEDIUM" ? 4 : 8;
  return texture;
}

function addBox(parent: THREE.Object3D, material: THREE.Material, width: number, height: number, depth: number,
  x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent: THREE.Object3D, material: THREE.Material, top: number, bottom: number, height: number,
  x: number, y: number, z: number, segments = 9): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createWorld(level: LevelId, save: SaveData, quality: GameSettings["quality"] = "MEDIUM"): WorldHandle {
  const map = LEVELS[level];
  const group = new THREE.Group();
  const interactions: WorldInteraction[] = [];
  const colliders: { x: number; z: number; radius: number }[] = [];
  const flickerLights: THREE.PointLight[] = [];
  const doorHinges = new Map<string, { pivot: THREE.Group; angle: number; target: number }>();
  const drawerGroups = new Map<string, { group: THREE.Group; target: number }>();
  let safeDoor: THREE.Group | null = null;
  let safeTarget = 0;
  let powerIndicator: THREE.Mesh | null = null;
  const wallTexture = canvasTexture("wall", quality);
  const woodTexture = canvasTexture("wood", quality);
  const concreteTexture = canvasTexture("concrete", quality);
  const earthTexture = canvasTexture("earth", quality);
  woodTexture.repeat.set(14, 10);
  concreteTexture.repeat.set(11, 9);
  earthTexture.repeat.set(11, 5);
  const materials = {
    wall: new THREE.MeshStandardMaterial({
      map: level === "maze" ? earthTexture : wallTexture,
      bumpMap: quality === "LOW" ? null : level === "maze" ? earthTexture : wallTexture,
      bumpScale: level === "maze" ? .075 : .033,
      color: level === "maze" ? 0x5f7260 : level === "basement" ? 0x9aa1a0 : 0xc1b6a6,
      roughness: .96,
    }),
    woodFloor: new THREE.MeshStandardMaterial({ map: woodTexture, bumpMap: quality === "LOW" ? null : woodTexture, bumpScale: .046, roughness: .71, metalness: .04 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture, bumpMap: quality === "LOW" ? null : concreteTexture, bumpScale: .035, roughness: .91 }),
    earth: new THREE.MeshStandardMaterial({ map: earthTexture, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: level === "basement" ? 0x242929 : 0x393631, roughness: 1, side: THREE.DoubleSide }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x281b18, roughness: 0.96 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x211916, roughness: 0.9 }),
    oldWood: new THREE.MeshStandardMaterial({ color: 0x493629, roughness: 0.95 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x343334, roughness: 1 }),
    mattress: new THREE.MeshStandardMaterial({ color: 0x626058, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x555a59, metalness: 0.68, roughness: 0.58 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x4c352c, metalness: 0.42, roughness: 0.86 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d1012, metalness: 0.2, roughness: 0.65 }),
    pale: new THREE.MeshStandardMaterial({ color: 0xa29c86, roughness: 0.98 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xb7a88b, roughness: 1, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x263b4a, emissive: 0x172b3b, emissiveIntensity: 0.28, metalness: 0.26, roughness: 0.38 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8d201c, emissive: 0x75110c, emissiveIntensity: 0.7 }),
    green: new THREE.MeshStandardMaterial({ color: 0x4b7055, emissive: 0x193a20, emissiveIntensity: 0.45 }),
  };

  const addFloor = (z1: number, z2: number, mat: THREE.Material, y = -0.08) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(map.width * CELL, (z2 - z1 + 1) * CELL), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(0, y, gridToWorld(level, 0, (z1 + z2) / 2).z);
    p.receiveShadow = true;
    group.add(p);
  };
  if (level === "ground") {
    addFloor(0, 19, materials.woodFloor);
    addFloor(20, 30, materials.earth, -0.095);
  } else if (level === "maze") addFloor(0, map.height - 1, materials.earth, -0.095);
  else addFloor(0, map.height - 1, level === "basement" ? materials.concrete : materials.woodFloor);

  const roofEnd = level === "ground" ? 19 : map.height - 1;
  if (level !== "maze") {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(map.width * CELL, (roofEnd + 1) * CELL), materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, WALL_HEIGHT, gridToWorld(level, 0, roofEnd / 2).z);
    group.add(ceiling);
  }

  const wallTiles: [number, number][] = [];
  const exposed: { x: number; z: number; dx: number; dz: number }[] = [];
  const fenceTiles: [number, number][] = [];
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (tileAt(level, x, z) !== "#") continue;
      const neighbors: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const adjacent = neighbors.filter(([dx, dz]) => tileAt(level, x + dx, z + dz) !== "#");
      if (!adjacent.length) continue;
      if (level === "ground" && z >= 20 && z !== 19) fenceTiles.push([x, z]);
      else {
        wallTiles.push([x, z]);
        for (const [dx, dz] of adjacent) exposed.push({ x, z, dx, dz });
      }
    }
  }

  const wallGeom = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
  const walls = new THREE.InstancedMesh(wallGeom, materials.wall, wallTiles.length);
  const instanceMatrix = new THREE.Matrix4();
  wallTiles.forEach(([x, z], i) => {
    const pos = gridToWorld(level, x, z);
    instanceMatrix.makeTranslation(pos.x, WALL_HEIGHT / 2, pos.z);
    walls.setMatrixAt(i, instanceMatrix);
    const tone = 0.77 + ((x * 7 + z * 13) % 9) * 0.021;
    walls.setColorAt(i, new THREE.Color().setRGB(tone, tone, tone));
  });
  walls.instanceMatrix.needsUpdate = true;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const panelGeom = new THREE.BoxGeometry(CELL, 1.08, 0.075);
  const panels = new THREE.InstancedMesh(panelGeom, materials.darkWood, exposed.length);
  const mouldGeom = new THREE.BoxGeometry(CELL, 0.075, 0.12);
  const moulds = new THREE.InstancedMesh(mouldGeom, materials.oldWood, exposed.length);
  exposed.forEach(({ x, z, dx, dz }, i) => {
    const p = gridToWorld(level, x, z);
    const turn = dx !== 0 ? Math.PI / 2 : 0;
    const offX = dx * (CELL / 2 + 0.04);
    const offZ = dz * (CELL / 2 + 0.04);
    instanceMatrix.compose(new THREE.Vector3(p.x + offX, 0.54, p.z + offZ), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(1, 1, 1));
    panels.setMatrixAt(i, instanceMatrix);
    instanceMatrix.setPosition(p.x + offX, 1.09, p.z + offZ);
    moulds.setMatrixAt(i, instanceMatrix);
  });
  panels.instanceMatrix.needsUpdate = true;
  moulds.instanceMatrix.needsUpdate = true;
  group.add(panels, moulds);

  // The exterior uses open iron fencing instead of opaque house walls.
  for (const [x, z] of fenceTiles) {
    const p = gridToWorld(level, x, z);
    const fence = new THREE.Group();
    fence.position.set(p.x, 0, p.z);
    const alongX = z === 27 || z === 30;
    if (!alongX) fence.rotation.y = Math.PI / 2;
    addBox(fence, materials.rust, CELL, 0.075, 0.075, 0, 1.65, 0);
    addBox(fence, materials.rust, CELL, 0.065, 0.075, 0, 0.37, 0);
    for (let j = -2; j <= 2; j++) {
      addBox(fence, materials.black, 0.052, 1.8, 0.055, j * 0.46, 0.9, 0);
      const spear = new THREE.Mesh(new THREE.ConeGeometry(0.077, 0.19, 4), materials.metal);
      spear.position.set(j * 0.46, 1.88, 0);
      fence.add(spear);
    }
    group.add(fence);
  }

  const furniture = (x: number, z: number, build: (root: THREE.Group) => void, rotation = 0, radius = 0) => {
    const p = gridToWorld(level, x, z);
    const root = new THREE.Group();
    root.position.set(p.x, 0, p.z);
    root.rotation.y = rotation;
    build(root);
    group.add(root);
    if (radius) colliders.push({ x: p.x, z: p.z, radius });
    return root;
  };
  const table = (x: number, z: number, length = 1.8) => furniture(x, z, (root) => {
    addBox(root, materials.oldWood, length, 0.12, 1.1, 0, 0.88, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(root, materials.darkWood, 0.11, 0.82, 0.11, sx * (length / 2 - 0.12), 0.42, sz * 0.42);
    addBox(root, materials.trim, length - 0.12, 0.17, 0.08, 0, 0.73, 0.44);
  }, 0, Math.max(0.7, length * 0.43));
  const shelf = (x: number, z: number, rotation = 0) => furniture(x, z, (root) => {
    addBox(root, materials.darkWood, 1.6, 2.55, 0.14, 0, 1.28, 0.35);
    for (const s of [-1, 1]) addBox(root, materials.oldWood, 0.12, 2.55, 0.76, s * 0.76, 1.28, 0);
    for (let y = 0.33; y < 2.5; y += 0.51) {
      addBox(root, materials.oldWood, 1.56, 0.075, 0.73, 0, y, -0.03);
      for (let j = 0; j < 5; j++) {
        const book = addBox(root, j % 3 === 0 ? materials.rust : materials.cloth,
          0.11 + (j % 2) * 0.04, 0.21 + (j % 3) * 0.055, 0.32,
          -0.56 + j * 0.23, y + 0.15, -0.06);
        book.rotation.z = j === 4 ? 0.17 : 0;
      }
    }
  }, rotation, 0.58);
  const bed = (x: number, z: number) => furniture(x, z, (root) => {
    addBox(root, materials.darkWood, 2.35, 0.3, 1.55, 0, 0.32, 0);
    addBox(root, materials.mattress, 2.12, 0.23, 1.39, 0, 0.55, 0);
    addBox(root, materials.cloth, 1.28, 0.13, 1.41, 0.4, 0.73, 0);
    addBox(root, materials.pale, 0.47, 0.15, 0.54, -0.76, 0.74, -0.38);
    addBox(root, materials.pale, 0.47, 0.15, 0.54, -0.76, 0.74, 0.37);
    addBox(root, materials.oldWood, 0.17, 1.25, 1.63, -1.13, 0.68, 0);
  }, Math.PI / 2, 1.12);
  const crate = (x: number, z: number, size = 0.82) => furniture(x, z, (root) => {
    addBox(root, materials.oldWood, size, size, size, 0, size / 2, 0);
    addBox(root, materials.trim, size + 0.02, 0.095, 0.12, 0, size * 0.77, size / 2);
    addBox(root, materials.trim, 0.12, size, 0.12, -size * 0.36, size / 2, size / 2);
  }, 0, size * 0.56);

  if (level === "ground") {
    table(6, 6, 2.5);
    table(6, 13, 1.5);
    furniture(6, 16, (root) => {
      addBox(root, materials.darkWood, 2.4, 0.32, 0.9, 0, 0.27, 0);
      addBox(root, materials.cloth, 2.15, 0.32, 0.81, 0, 0.55, 0);
      addBox(root, materials.cloth, 2.42, 0.87, 0.22, 0, 0.95, 0.45);
      for (const side of [-1, 1]) addBox(root, materials.cloth, 0.21, 0.52, 0.95, side * 1.12, 0.7, 0);
    }, 0, 1.17);
    shelf(3, 4, Math.PI / 2);
    shelf(18, 7);
    shelf(21, 7);
    shelf(17, 3, Math.PI / 2);
    table(12, 11, 1.25);
    const clockWall = gridToWorld(level, 11, 8);
    const clock = new THREE.Group();
    clock.position.set(clockWall.x - CELL / 2 + 0.12, 2.31, clockWall.z);
    clock.rotation.y = Math.PI / 2;
    const rim = addCylinder(clock, materials.oldWood, 0.35, 0.35, 0.1, 0, 0, 0, 16);
    rim.rotation.x = Math.PI / 2;
    const dial = addCylinder(clock, materials.pale, 0.27, 0.27, 0.012, 0, 0, 0.065, 16);
    dial.rotation.x = Math.PI / 2;
    addBox(clock, materials.black, 0.02, 0.17, 0.015, 0.03, 0.055, 0.083).rotation.z = -0.25;
    addBox(clock, materials.black, 0.13, 0.02, 0.015, 0.045, -0.015, 0.085);
    group.add(clock);
    for (const x of [17, 20, 22]) {
      furniture(x, 11, (root) => {
        addBox(root, materials.oldWood, 1.62, 0.88, 0.74, 0, 0.44, 0);
        addBox(root, materials.metal, 1.7, 0.07, 0.8, 0, 0.92, 0);
      }, 0, 0.83);
    }
    crate(18, 17);
    crate(21, 17, 0.66);
    furniture(26, 17, (root) => {
      addBox(root, materials.black, 1.75, 0.53, 1.31, 0, 0.68, 0);
      addBox(root, materials.rust, 1.18, 0.48, 1.14, 0, 1.12, 0);
      for (const side of [-1, 1]) {
        const wheel = addCylinder(root, materials.black, 0.27, 0.27, 0.14, side * 0.88, 0.35, -0.53, 10);
        wheel.rotation.z = Math.PI / 2;
        const rear = addCylinder(root, materials.black, 0.27, 0.27, 0.14, side * 0.88, 0.35, 0.53, 10);
        rear.rotation.z = Math.PI / 2;
      }
    }, 0, 1.18);
    // Outside landmarks: an abandoned shed, a well, and dead garden trees.
    furniture(5, 23, (root) => {
      addBox(root, materials.oldWood, 3.5, 2.35, 0.12, 0, 1.18, 1.44);
      for (const side of [-1, 1]) {
        addBox(root, materials.oldWood, 0.12, 2.35, 2.95, side * 1.7, 1.18, 0);
        addBox(root, materials.oldWood, 1.13, 2.35, 0.12, side * 1.2, 1.18, -1.44);
      }
      const roof = addBox(root, materials.rust, 3.9, 0.13, 3.3, 0, 2.55, 0);
      roof.rotation.z = 0.12;
      addBox(root, materials.black, 0.7, 0.1, 0.55, 0.55, 0.08, 0.6);
    });
    const shed = gridToWorld(level, 5, 23);
    for (const side of [-1, 1]) {
      colliders.push({ x: shed.x + side * 1.65, z: shed.z, radius: 0.28 });
      colliders.push({ x: shed.x + side * 1.2, z: shed.z - 1.42, radius: 0.43 });
    }
    colliders.push({ x: shed.x, z: shed.z + 1.44, radius: 0.7 });
    furniture(25, 23, (root) => {
      addCylinder(root, materials.rust, 0.86, 0.86, 0.75, 0, 0.4, 0, 14);
      addCylinder(root, materials.black, 0.64, 0.64, 0.78, 0, 0.48, 0, 14);
      for (const side of [-1, 1]) addBox(root, materials.oldWood, 0.12, 1.65, 0.15, side * 0.83, 1.23, 0);
      addBox(root, materials.oldWood, 1.9, 0.12, 0.15, 0, 2.05, 0);
    }, 0, 0.87);
    for (const [x, z] of [[3, 21], [8, 25], [20, 24], [27, 21], [15, 25]]) {
      furniture(x, z, (root) => {
        addCylinder(root, materials.darkWood, 0.12, 0.23, 2.7, 0, 1.3, 0, 6);
        for (let k = 0; k < 3; k++) {
          const branch = addCylinder(root, materials.darkWood, 0.025, 0.08, 1.6, (k - 1) * 0.35, 2.23, 0, 5);
          branch.rotation.z = (k - 1) * 0.65;
        }
      }, 0, 0.25);
    }
  } else if (level === "upstairs") {
    bed(6, 6); bed(6, 15); bed(19, 6);
    shelf(19, 12); shelf(4, 12, Math.PI / 2);
    table(18, 15, 1.25);
    crate(20, 17, 0.68);
  } else if (level === "basement") {
    furniture(4, 7, (root) => {
      addCylinder(root, materials.rust, 0.75, 0.75, 2.12, 0, 1.07, 0, 12);
      addBox(root, materials.metal, 0.5, 0.3, 0.2, 0, 1.38, -0.77);
      for (const sx of [-1, 1]) addCylinder(root, materials.metal, 0.08, 0.08, 2.95, sx * 0.42, 1.68, 0.62, 7);
    }, 0, 0.82);
    shelf(18, 4); shelf(18, 7, Math.PI / 2);
    crate(4, 13); crate(7, 16, 1.15); crate(17, 16);
    for (const z of [6, 12]) {
      const p = gridToWorld(level, 12, z);
      const pipe = addCylinder(group, materials.rust, 0.12, 0.12, 6.5, p.x, 3.2, p.z, 8);
      pipe.rotation.z = Math.PI / 2;
    }
  } else {
    for (const [x, z, s] of [[7, 5, 0.8], [9, 9, 1.1], [14, 4, 0.8], [19, 8, 0.7]] as [number, number, number][]) crate(x, z, s);
    shelf(5, 10); table(11, 8, 1.2);
    for (const x of [5, 10, 15]) {
      const p = gridToWorld(level, x, 6);
      addBox(group, materials.oldWood, 0.16, 0.21, map.height * CELL, p.x, 3.34, 0);
    }
  }

  function makeItem(item: ItemSpawn) {
    const p = gridToWorld(level, item.x, item.z);
    const root = new THREE.Group();
    root.position.set(p.x, 0.84, p.z);
    root.userData.baseY = 0.84;
    const silver = materials.metal;
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb3a075, metalness: 0.83, roughness: 0.34 });
    if (["mainKey", "basementKey", "securityKey"].includes(item.item)) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.048, 7, 12), yellow);
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 0.15;
      root.add(ring);
      addBox(root, yellow, 0.095, 0.4, 0.075, 0, -0.1, 0);
      addBox(root, yellow, 0.17, 0.075, 0.075, 0.05, -0.27, 0);
    } else if (item.item === "fuse" || item.item === "battery") {
      const body = addCylinder(root, item.item === "battery" ? materials.black : materials.pale, 0.13, 0.13, 0.42, 0, 0, 0, 12);
      body.rotation.z = 0.5;
      addCylinder(root, silver, 0.14, 0.14, 0.055, -0.10, -0.18, 0, 12).rotation.z = 0.5;
      addCylinder(root, silver, 0.14, 0.14, 0.055, 0.10, 0.18, 0, 12).rotation.z = 0.5;
    } else if (item.item === "screwdriver") {
      addCylinder(root, materials.rust, 0.11, 0.12, 0.38, 0, -0.13, 0).rotation.z = 0.6;
      addCylinder(root, silver, 0.035, 0.035, 0.46, 0.16, 0.18, 0).rotation.z = 0.6;
    } else if (item.item === "boltCutter") {
      for (const side of [-1, 1]) {
        const handle = addCylinder(root, materials.rust, 0.05, 0.08, 0.65, side * 0.13, -0.2, 0);
        handle.rotation.z = side * 0.32;
        const blade = addBox(root, silver, 0.1, 0.35, 0.08, side * 0.1, 0.34, 0);
        blade.rotation.z = side * 0.3;
      }
    } else {
      addBox(root, materials.pale, 0.48, 0.3, 0.38, 0, 0, 0);
      addBox(root, materials.red, 0.25, 0.06, 0.02, 0, 0.01, -0.2);
      addBox(root, materials.red, 0.06, 0.22, 0.02, 0, 0.01, -0.21);
    }
    root.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
    group.add(root);
    interactions.push({ id: item.uid, kind: "item", x: item.x, z: item.z, name: ITEM_NAMES[item.item], item: item.item, object: root });
  }

  function makeFeature(feature: FeatureDef) {
    const p = gridToWorld(level, feature.x, feature.z);
    const root = new THREE.Group();
    root.position.set(p.x, 0, p.z);
    group.add(root);
    if (feature.kind === "note") {
      addBox(root, materials.paper, 0.44, 0.016, 0.34, 0, 0.94, 0).rotation.y = -0.27;
      for (let i = 0; i < 4; i++) addBox(root, materials.rust, 0.25 - i * 0.018, 0.002, 0.006, 0, 0.953, -0.09 + i * 0.06, false);
    } else if (feature.kind === "safe") {
      colliders.push({ x: p.x, z: p.z, radius: 0.51 });
      addBox(root, materials.black, 1.02, 0.83, 0.7, 0, 0.46, 0);
      const pivot = new THREE.Group();
      pivot.position.set(-0.39, 0, -0.39);
      addBox(pivot, materials.metal, 0.79, 0.63, 0.05, 0.39, 0.47, 0);
      const dial = addCylinder(pivot, materials.rust, 0.16, 0.16, 0.06, 0.59, 0.49, -0.05, 12);
      dial.rotation.x = Math.PI / 2;
      addBox(pivot, materials.black, 0.23, 0.035, 0.075, 0.59, 0.49, -0.12);
      root.add(pivot);
      safeDoor = pivot;
      safeTarget = save.safeOpen ? -1.25 : 0;
      pivot.rotation.y = safeTarget;
    } else if (feature.kind === "power") {
      addBox(root, materials.rust, 0.68, 1.12, 0.21, 0, 1.5, 0);
      addBox(root, materials.black, 0.49, 0.52, 0.055, 0, 1.58, -0.135);
      for (const sx of [-1, 1]) addCylinder(root, materials.metal, 0.075, 0.075, 0.27, sx * 0.12, 1.61, -0.18);
      powerIndicator = addBox(root, save.powerOn ? materials.green : materials.red, 0.1, 0.1, 0.05, 0, 1.97, -0.155);
    } else if (feature.kind === "portal") {
      const downward = feature.destination === "basement" || feature.destination === "ground";
      if (feature.destination === "attic" || (level === "attic" && downward)) {
        for (let i = -1; i <= 1; i += 2) addBox(root, materials.oldWood, 0.08, 2.55, 0.09, i * 0.43, 1.25, 0);
        for (let h = 0.25; h <= 2.4; h += 0.35) addBox(root, materials.oldWood, 0.94, 0.075, 0.14, 0, h, 0);
      } else if (feature.destination === "basement") {
        colliders.push({ x: p.x, z: p.z + 0.55, radius: 0.69 });
        addBox(root, materials.darkWood, 1.62, 2.58, 0.15, 0, 1.29, 0.55);
        addBox(root, materials.rust, 0.15, 0.15, 0.11, 0.53, 1.2, 0.42);
        addBox(root, materials.black, 1.7, 0.1, 1.6, 0, 0.03, 0);
      } else {
        for (let i = 0; i < 5; i++) addBox(root, materials.oldWood, 1.8, 0.16, 0.3, 0, 0.08 + i * 0.15, -0.78 + i * 0.36);
        for (const side of [-1, 1]) addBox(root, materials.trim, 0.08, 1.25, 0.08, side * 0.94, 0.68, 0.1);
      }
    } else if (feature.kind === "hide") {
      const low = feature.name === "Old Trunk";
      colliders.push({ x: p.x, z: p.z, radius: low ? 0.77 : 0.64 });
      addBox(root, level === "basement" ? materials.metal : materials.darkWood, low ? 1.45 : 1.15,
        low ? 0.75 : 2.7, 0.69, 0, low ? 0.39 : 1.35, 0);
      if (!low) {
        addBox(root, materials.oldWood, 0.025, 2.51, 0.04, 0, 1.36, -0.37);
        for (const side of [-1, 1]) addBox(root, materials.metal, 0.035, 0.17, 0.05, side * 0.09, 1.25, -0.4);
      }
    } else if (feature.kind === "escape") {
      addBox(root, materials.pale, 0.44, 2.85, 0.52, -1.15, 1.42, 0);
      addBox(root, materials.pale, 0.44, 2.85, 0.52, 1.15, 1.42, 0);
      addBox(root, materials.pale, 2.85, 0.44, 0.56, 0, 3.0, 0);
      addBox(root, materials.black, 1.9, 2.6, 0.16, 0, 1.3, 0.2);
      addBox(root, materials.rust, 0.16, 0.24, 0.1, 0.7, 1.2, 0.05);
      for (let i = 0; i < 5; i++) addBox(root, materials.red, 0.05, 0.3 + i * 0.11, 0.04, -0.6 + i * 0.3, 1.5 + i * 0.08, 0.11);
    } else {
      colliders.push({ x: p.x, z: p.z, radius: 0.64 });
      addBox(root, materials.oldWood, 1.26, 0.9, 0.72, 0, 0.45, 0);
      addBox(root, materials.oldWood, 1.3, 0.07, 0.8, 0, 0.94, 0);
      const drawer = new THREE.Group();
      drawer.position.z = save.unlockedDoors.includes(feature.id) ? -0.34 : 0;
      addBox(drawer, materials.darkWood, 1.14, 0.27, 0.08, 0, 0.59, -0.4);
      addBox(drawer, materials.metal, 0.19, 0.04, 0.055, 0, 0.59, -0.46);
      root.add(drawer);
      drawerGroups.set(feature.id, { group: drawer, target: drawer.position.z });
    }
    interactions.push({ id: feature.id, kind: feature.kind, x: feature.x, z: feature.z, name: feature.name, feature, object: root });
  }

  for (const door of map.doors) {
    const p = gridToWorld(level, door.x, door.z);
    const horizontal = tileAt(level, door.x - 1, door.z) !== "#" && tileAt(level, door.x + 1, door.z) !== "#";
    const baseAngle = horizontal ? Math.PI / 2 : 0;
    const frame = new THREE.Group();
    frame.position.set(p.x, 0, p.z);
    frame.rotation.y = baseAngle;
    group.add(frame);
    if (door.gate) {
      for (const side of [-1, 1]) addBox(frame, materials.rust, 0.13, 2.8, 0.16, side * 1.08, 1.4, 0);
    } else {
      for (const side of [-1, 1]) addBox(frame, materials.trim, 0.16, WALL_HEIGHT - 0.3, 0.24, side * 1.06, (WALL_HEIGHT - 0.3) / 2, 0);
      addBox(frame, materials.trim, 2.24, 0.18, 0.25, 0, WALL_HEIGHT - 0.28, 0);
    }
    const pivot = new THREE.Group();
    pivot.position.set(p.x + (horizontal ? 0 : -0.97), 0, p.z + (horizontal ? 0.97 : 0));
    pivot.rotation.y = baseAngle;
    group.add(pivot);
    if (door.gate) {
      for (let i = 0; i < 5; i++) addBox(pivot, materials.black, 0.055, 2.22, 0.08, 0.16 + i * 0.39, 1.13, 0);
      addBox(pivot, materials.rust, 2.03, 0.07, 0.13, 1.03, 0.41, 0);
      addBox(pivot, materials.rust, 2.03, 0.07, 0.13, 1.03, 1.83, 0);
      if (!save.unlockedDoors.includes(door.id)) {
        addBox(pivot, materials.metal, 0.37, 0.36, 0.18, 1.09, 1.1, -0.13);
      }
    } else {
      addBox(pivot, materials.darkWood, 1.94, 2.91, 0.13, 0.97, 1.47, 0);
      for (const y of [0.84, 2.07]) {
        addBox(pivot, materials.oldWood, 1.56, 0.08, 0.18, 0.97, y + 0.39, -0.02);
        addBox(pivot, materials.oldWood, 1.56, 0.08, 0.18, 0.97, y - 0.39, -0.02);
        for (const side of [-1, 1]) addBox(pivot, materials.oldWood, 0.08, 0.7, 0.18, 0.97 + side * 0.74, y, -0.02);
      }
      addCylinder(pivot, materials.metal, 0.075, 0.075, 0.22, 1.69, 1.33, -0.15, 8).rotation.x = Math.PI / 2;
      if (door.required && !save.unlockedDoors.includes(door.id)) {
        addBox(pivot, materials.rust, 0.17, 0.28, 0.07, 1.67, 1.05, -0.14);
      }
    }
    doorHinges.set(door.id, { pivot, angle: baseAngle, target: baseAngle });
    interactions.push({ id: door.id, kind: "door", x: door.x, z: door.z, name: door.name, door, object: pivot });
  }

  for (const feature of map.features) makeFeature(feature);
  for (const item of getLevelItems(level, save)) makeItem(item);
  for (const door of map.doors) {
    const hinge = doorHinges.get(door.id)!;
    hinge.target = hinge.angle + (save.openedDoors.includes(door.id) ? 1.43 : 0);
    hinge.pivot.rotation.y = hinge.target;
  }

  const point = (x: number, z: number, color: number, strength: number, distance: number, flicker = false) => {
    const p = gridToWorld(level, x, z);
    const light = new THREE.PointLight(color, strength, distance, 2);
    light.position.set(p.x, 2.75, p.z);
    group.add(light);
    if (flicker) flickerLights.push(light);
    return light;
  };
  if (level === "ground") {
    point(12, 9, 0xd94223, 1.7, 10, true);
    point(18, 13, 0xd6a777, 0.7, 8, true);
    point(25, 23, 0x93b8d5, 1.2, 19);
    point(12, 22, 0x607e9e, 0.9, 12);
  } else if (level === "upstairs") {
    point(12, 11, 0x9c2219, 1.1, 11, true);
    point(5, 5, 0x57718b, 0.52, 8, true);
  } else if (level === "basement") {
    point(11, 8, 0xa82316, 1.15, 10, true);
    point(5, 5, 0x948467, 0.35, 6, true);
  } else if (level === "maze") {
    point(13, 13, 0xb4201a, 1.5, 13, true);
    point(13, 24, 0x6d8ba6, 0.8, 12, true);
    point(7, 7, 0x8d7a5a, 0.5, 8, true);
    point(20, 19, 0x8d7a5a, 0.5, 8, true);
  } else point(10, 6, 0x607189, 0.49, 12, true);

  if (level !== "basement") {
    const windows = level === "ground" ? [[2, 5], [2, 13], [28, 13], [18, 2]] : level === "upstairs" ? [[2, 5], [2, 15], [22, 5]] : [[3, 6]];
    for (const [x, z] of windows) {
      const p = gridToWorld(level, x, z);
      const w = new THREE.Group();
      w.position.set(p.x, 0, p.z);
      if (x <= 2) { w.position.x -= CELL / 2 + 0.07; w.rotation.y = Math.PI / 2; }
      else if (x >= 22) { w.position.x += CELL / 2 + 0.07; w.rotation.y = Math.PI / 2; }
      else w.position.z -= CELL / 2 + 0.07;
      addBox(w, materials.trim, 1.0, 1.51, 0.055, 0, 2.19, 0);
      addBox(w, materials.glass, 0.79, 1.29, 0.065, 0, 2.19, -0.04, false);
      addBox(w, materials.oldWood, 0.065, 1.39, 0.09, 0, 2.19, -0.1);
      addBox(w, materials.oldWood, 0.88, 0.065, 0.09, 0, 2.19, -0.1);
      group.add(w);
    }
  }

  // A painted silhouette on the wall is a clue, not a borrowed image asset.
  if (level === "ground" || level === "upstairs") {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 170;
    const c = canvas.getContext("2d")!;
    const gradient = c.createLinearGradient(0, 0, 128, 170);
    gradient.addColorStop(0, "#3d302a"); gradient.addColorStop(1, "#0d1010");
    c.fillStyle = gradient; c.fillRect(0, 0, 128, 170);
    c.fillStyle = "#171a19"; c.beginPath(); c.ellipse(64, 155, 49, 61, 0, 0, 7); c.fill();
    c.fillStyle = "#9a9180"; c.beginPath(); c.ellipse(65, 73, 23, 34, 0.1, 0, 7); c.fill();
    c.fillStyle = "#242320"; c.fillRect(49, 67, 9, 5); c.fillRect(73, 67, 9, 5);
    const portraitTexture = new THREE.CanvasTexture(canvas);
    portraitTexture.colorSpace = THREE.SRGBColorSpace;
    const loc = gridToWorld(level, 2, 12);
    const frame = new THREE.Group();
    frame.position.set(loc.x - CELL / 2 + 0.095, 2.13, loc.z);
    frame.rotation.y = Math.PI / 2;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.77, 1.08), new THREE.MeshStandardMaterial({ map: portraitTexture, roughness: 1, side: THREE.DoubleSide }));
    art.position.z = 0.045;
    frame.add(art);
    for (const side of [-1, 1]) addBox(frame, materials.oldWood, 0.08, 1.21, 0.075, side * 0.43, 0, 0.08);
    for (const side of [-1, 1]) addBox(frame, materials.oldWood, 0.94, 0.08, 0.075, 0, side * 0.59, 0.08);
    group.add(frame);
  }

  let dust: THREE.Points | null = null;
  const particles: number[] = [];
  for (let i = 0; i < 270; i++) {
    const x = (i * 17 + 4) % map.width;
    const z = (i * 29 + Math.floor(i / 13) * 7 + 4) % map.height;
    if (tileAt(level, x, z) === "#") continue;
    const p = gridToWorld(level, x + ((i * 13) % 7) / 8, z + ((i * 11) % 7) / 8);
    particles.push(p.x, 0.45 + ((i * 19) % 27) / 10, p.z);
  }
  if (particles.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(particles, 3));
    dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xadafa7, size: 0.045, transparent: true, opacity: 0.37, depthWrite: false }));
    group.add(dust);
  }

  let rain: THREE.Points | null = null;
  if (level === "ground" || level === "maze") {
    const drops: number[] = [];
    for (let i = 0; i < 190; i++) {
      const x = level === "maze" ? 1 + (i * 37 % 250) / 10 : 2 + (i * 37 % 260) / 10;
      const z = level === "maze" ? 1 + (i * 23 % 250) / 10 : 20 + (i * 23 % 65) / 10;
      const p = gridToWorld(level, x, z);
      drops.push(p.x, 0.2 + (i * 13 % 35) / 10, p.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(drops, 3));
    rain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa9b9c6, size: 0.042, transparent: true, opacity: 0.47, depthWrite: false }));
    group.add(rain);
  }

  const bloodMaterial = new THREE.MeshPhysicalMaterial({
    map: floorBloodTexture(), transparent: true, depthWrite: false,
    roughness: .17, metalness: .04, clearcoat: .92, clearcoatRoughness: .12,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const stains: Record<LevelId, [number, number, number][]> = {
    ground: [[12, 13, 1.8], [6, 12, 1.3], [19, 8, 1.1], [18, 15, 1.25]],
    upstairs: [[12, 11, 1.65], [7, 5, 1.1], [19, 15, 1.2]],
    basement: [[11, 14, 1.8], [5, 13, 1.3], [18, 6, 1.1]],
    attic: [[11, 7, 1.4], [19, 7, .9]],
    maze: [[13, 13, 2.1], [5, 7, 1.25], [19, 19, 1.35]],
  };
  stains[level].slice(0, quality === "LOW" ? 1 : undefined).forEach(([x, z, size], index) => {
    const p = gridToWorld(level, x, z);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(size, size * .82), bloodMaterial);
    decal.rotation.set(-Math.PI / 2, 0, (index * 1.79) % Math.PI);
    decal.position.set(p.x, -.066, p.z);
    decal.receiveShadow = true;
    group.add(decal);
  });

  const trailCount = quality === "LOW" ? 12 : 24;
  const trail = new THREE.InstancedMesh(new THREE.PlaneGeometry(.56, .42), bloodMaterial, trailCount);
  trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trail.frustumCulled = false;
  trail.castShadow = false;
  const trailMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < trailCount; i++) trail.setMatrixAt(i, trailMatrix);
  trail.instanceMatrix.needsUpdate = true;
  group.add(trail);
  const planeRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const vertical = new THREE.Vector3(0, 1, 0);
  let trailCursor = 0;

  return {
    group,
    interactions,
    colliders,
    flickerLights,
    dust,
    rain,
    setDoor(id, open) {
      const hinge = doorHinges.get(id);
      if (hinge) hinge.target = hinge.angle + (open ? 1.43 : 0);
    },
    setDrawer(id, open) {
      const drawer = drawerGroups.get(id);
      if (drawer) drawer.target = open ? -0.34 : 0;
    },
    setSafe(open) { safeTarget = open ? -1.25 : 0; },
    setPower(on) { if (powerIndicator) powerIndicator.material = on ? materials.green : materials.red; },
    stampBlood(x, z, angle) {
      const rotation = new THREE.Quaternion().setFromAxisAngle(vertical, angle).multiply(planeRotation);
      const scale = .82 + ((trailCursor * 7) % 5) * .11;
      trailMatrix.compose(new THREE.Vector3(x, -.058, z), rotation, new THREE.Vector3(scale, scale, scale));
      trail.setMatrixAt(trailCursor, trailMatrix);
      trail.instanceMatrix.needsUpdate = true;
      trailCursor = (trailCursor + 1) % trailCount;
    },
    animate(dt) {
      for (const hinge of doorHinges.values()) hinge.pivot.rotation.y = THREE.MathUtils.lerp(hinge.pivot.rotation.y, hinge.target, Math.min(1, dt * 7));
      for (const drawer of drawerGroups.values()) drawer.group.position.z = THREE.MathUtils.lerp(drawer.group.position.z, drawer.target, Math.min(1, dt * 6));
      if (safeDoor) safeDoor.rotation.y = THREE.MathUtils.lerp(safeDoor.rotation.y, safeTarget, Math.min(1, dt * 5));
      if (rain?.visible) {
        const attribute = rain.geometry.getAttribute("position") as THREE.BufferAttribute;
        const positions = attribute.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= dt * 7.5;
          if (positions[i] < 0.15) positions[i] = 3.65;
        }
        attribute.needsUpdate = true;
      }
    },
    addItem: makeItem,
    removeInteraction(id) {
      const index = interactions.findIndex((interaction) => interaction.id === id);
      if (index < 0) return;
      interactions[index].object.visible = false;
      interactions.splice(index, 1);
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const usedMaterials = new Set<THREE.Material>();
      group.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.InstancedMesh) {
          geometries.add(node.geometry);
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((mat) => usedMaterials.add(mat));
        }
      });
      geometries.forEach((geo) => geo.dispose());
      usedMaterials.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial && mat.map) mat.map.dispose();
        mat.dispose();
      });
    },
  };
}