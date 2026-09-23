import type { ItemId, LevelId, SaveData } from "./types";

export const CELL = 2.25;
export const WALL_HEIGHT = 3.65;

export interface DoorDef {
  id: string;
  x: number;
  z: number;
  name: string;
  required?: ItemId | "power";
  gate?: boolean;
}

export interface ItemSpawn {
  uid: string;
  item: ItemId;
  x: number;
  z: number;
}

export interface FeatureDef {
  id: string;
  kind: "note" | "safe" | "power" | "portal" | "hide" | "drawer" | "escape";
  x: number;
  z: number;
  name: string;
  noteId?: string;
  destination?: LevelId;
  required?: ItemId;
}

export interface LevelDef {
  id: LevelId;
  width: number;
  height: number;
  grid: string[];
  doors: DoorDef[];
  features: FeatureDef[];
  patrol: [number, number][];
  monsterSpawn: [number, number];
}

function makeGrid(width: number, height: number, rooms: [number, number, number, number][], openings: [number, number][]): string[] {
  const cells = Array.from({ length: height }, () => Array(width).fill("#") as string[]);
  for (const [x1, z1, x2, z2] of rooms) {
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) cells[z][x] = ".";
    }
  }
  for (const [x, z] of openings) cells[z][x] = "D";
  return cells.map((row) => row.join(""));
}

// A real generated maze: recursive backtracker on odd cells, plus a carved
// entrance corridor and a small chamber at the heart where the exit waits.
function makeMaze(width = 27, height = 27): string[] {
  let seed = 20260214;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cells = Array.from({ length: height }, () => Array(width).fill("#") as string[]);
  const stack: [number, number][] = [[1, 1]];
  cells[1][1] = ".";
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const directions = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as [number, number][]).sort(() => random() - 0.5);
    let moved = false;
    for (const [dx, dz] of directions) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx > 0 && nz > 0 && nx < width - 1 && nz < height - 1 && cells[nz][nx] === "#") {
        cells[z + dz / 2][x + dx / 2] = ".";
        cells[nz][nx] = ".";
        stack.push([nx, nz]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
  // Entrance from the garden gate at the bottom, and the heart of the maze.
  for (const [x, z] of [[13, 25], [13, 24], [13, 23]] as [number, number][]) cells[z][x] = ".";
  for (let z = 11; z <= 15; z++) for (let x = 11; x <= 15; x++) cells[z][x] = ".";
  return cells.map((row) => row.join(""));
}

const groundDoors: DoorDef[] = [
  { id: "dining", x: 10, z: 5, name: "Dining Room" },
  { id: "living", x: 10, z: 14, name: "Living Room" },
  { id: "storage", x: 15, z: 5, name: "Storage Room" },
  { id: "kitchen", x: 15, z: 14, name: "Kitchen" },
  { id: "left-passage", x: 5, z: 9, name: "Dining Passage" },
  { id: "right-passage", x: 19, z: 9, name: "Service Passage" },
  { id: "garage", x: 23, z: 14, name: "Garage", required: "power" },
  { id: "front", x: 12, z: 19, name: "Front Door", required: "mainKey" },
  { id: "gate", x: 12, z: 27, name: "Escape Gate", required: "boltCutter", gate: true },
];

const upstairsDoors: DoorDef[] = [
  { id: "bedroom-one", x: 10, z: 5, name: "Bedroom One" },
  { id: "bedroom-two", x: 10, z: 14, name: "Bedroom Two" },
  { id: "master", x: 15, z: 5, name: "Master Bedroom" },
  { id: "locked-room", x: 15, z: 14, name: "Locked Room", required: "securityKey" },
];

const basementDoors: DoorDef[] = [
  { id: "boiler", x: 9, z: 5, name: "Boiler Room" },
  { id: "basement-storage", x: 14, z: 5, name: "Basement Storage" },
  { id: "secret", x: 9, z: 14, name: "Secret Room", required: "screwdriver" },
  { id: "underground", x: 14, z: 14, name: "Underground Corridor" },
];

const atticDoors: DoorDef[] = [
  { id: "attic-hidden", x: 17, z: 6, name: "Hidden Attic Room", required: "securityKey" },
];

const mazeGrid = makeMaze();

export const LEVELS: Record<LevelId, LevelDef> = {
  ground: {
    id: "ground", width: 31, height: 31,
    grid: makeGrid(31, 31, [
      [11, 2, 14, 18], [2, 2, 9, 8], [2, 10, 9, 18],
      [16, 2, 22, 8], [16, 10, 22, 18], [24, 10, 28, 18],
      [2, 20, 28, 26], [11, 28, 13, 29],
    ], groundDoors.map(({ x, z }) => [x, z])),
    doors: groundDoors,
    features: [
      { id: "note-code", kind: "note", x: 5, z: 14, name: "Torn Note", noteId: "code" },
      { id: "safe", kind: "safe", x: 5, z: 5, name: "Old Safe" },
      { id: "power", kind: "power", x: 21, z: 5, name: "Fuse Box" },
      { id: "stairs-up", kind: "portal", x: 12, z: 3, name: "Stairs to Second Floor", destination: "upstairs" },
      { id: "stairs-down", kind: "portal", x: 19, z: 5, name: "Basement Door", destination: "basement", required: "basementKey" },
      { id: "hide-living", kind: "hide", x: 3, z: 17, name: "Old Wardrobe" },
      { id: "hide-storage", kind: "hide", x: 17, z: 3, name: "Storage Cabinet" },
      { id: "drawer-kitchen", kind: "drawer", x: 21, z: 16, name: "Kitchen Drawer" },
    ],
    patrol: [[12, 8], [12, 14], [5, 12], [5, 5], [19, 7], [19, 13], [26, 14]],
    monsterSpawn: [19, 7],
  },
  upstairs: {
    id: "upstairs", width: 25, height: 21,
    grid: makeGrid(25, 21, [
      [11, 2, 14, 18], [2, 2, 9, 8], [2, 10, 9, 18],
      [16, 2, 22, 8], [16, 10, 22, 18],
    ], upstairsDoors.map(({ x, z }) => [x, z])),
    doors: upstairsDoors,
    features: [
      { id: "stairs-to-ground", kind: "portal", x: 12, z: 3, name: "Stairs Down", destination: "ground" },
      { id: "attic-stairs", kind: "portal", x: 20, z: 5, name: "Attic Ladder", destination: "attic" },
      { id: "note-family", kind: "note", x: 18, z: 3, name: "Family Diary", noteId: "family" },
      { id: "hide-bed-one", kind: "hide", x: 3, z: 7, name: "Bedroom Wardrobe" },
      { id: "hide-bed-two", kind: "hide", x: 3, z: 17, name: "Bedroom Wardrobe" },
      { id: "hide-locked", kind: "hide", x: 20, z: 16, name: "Wardrobe" },
    ],
    patrol: [[12, 7], [12, 15], [5, 5], [5, 15], [19, 5]],
    monsterSpawn: [5, 5],
  },
  basement: {
    id: "basement", width: 24, height: 20,
    grid: makeGrid(24, 20, [
      [10, 2, 13, 17], [2, 2, 8, 8], [2, 10, 8, 17],
      [15, 2, 21, 8], [15, 10, 21, 17],
    ], basementDoors.map(({ x, z }) => [x, z])),
    doors: basementDoors,
    features: [
      { id: "basement-up", kind: "portal", x: 12, z: 3, name: "Stairs to Ground Floor", destination: "ground" },
      { id: "note-secret", kind: "note", x: 5, z: 14, name: "Burned Report", noteId: "secret" },
      { id: "hide-basement", kind: "hide", x: 19, z: 15, name: "Metal Locker" },
    ],
    patrol: [[11, 5], [11, 14], [5, 5], [18, 5], [18, 14]],
    monsterSpawn: [18, 14],
  },
  attic: {
    id: "attic", width: 24, height: 14,
    grid: makeGrid(24, 14, [
      [2, 2, 16, 11], [18, 4, 21, 9],
    ], atticDoors.map(({ x, z }) => [x, z])),
    doors: atticDoors,
    features: [
      { id: "attic-down", kind: "portal", x: 4, z: 4, name: "Ladder Down", destination: "upstairs" },
      { id: "note-attic", kind: "note", x: 12, z: 8, name: "Writing on the Wall", noteId: "attic" },
      { id: "hide-attic", kind: "hide", x: 14, z: 10, name: "Old Trunk" },
    ],
    patrol: [[5, 6], [11, 5], [12, 9], [19, 6]],
    monsterSpawn: [13, 9],
  },
  maze: {
    id: "maze", width: 27, height: 27, grid: mazeGrid, doors: [],
    features: [
      { id: "maze-exit", kind: "escape", x: 13, z: 13, name: "The Old Escape Door" },
      { id: "maze-return", kind: "portal", x: 13, z: 25, name: "Garden Gate", destination: "ground" },
      { id: "note-maze", kind: "note", x: 23, z: 3, name: "Note on the Hedge", noteId: "maze" },
      { id: "hide-maze-one", kind: "hide", x: 3, z: 13, name: "Stone Alcove" },
      { id: "hide-maze-two", kind: "hide", x: 21, z: 15, name: "Overgrown Arch" },
    ],
    patrol: [[3, 3], [23, 3], [3, 23], [23, 23], [13, 7], [7, 13], [19, 13], [13, 19], [13, 13]],
    monsterSpawn: [23, 3],
  },
};

export function gridToWorld(level: LevelId, x: number, z: number): { x: number; z: number } {
  const map = LEVELS[level];
  return { x: (x - (map.width - 1) / 2) * CELL, z: (z - (map.height - 1) / 2) * CELL };
}

export function worldToGrid(level: LevelId, x: number, z: number): { x: number; z: number } {
  const map = LEVELS[level];
  return { x: x / CELL + (map.width - 1) / 2, z: z / CELL + (map.height - 1) / 2 };
}

export function tileAt(level: LevelId, x: number, z: number): string {
  const map = LEVELS[level];
  return map.grid[z]?.[x] || "#";
}

export function getLevelItems(level: LevelId, save: SaveData): ItemSpawn[] {
  const items: Record<LevelId, ItemSpawn[]> = {
    ground: [
      { uid: "ground-screwdriver", item: "screwdriver", x: 18, z: 13 },
      { uid: "ground-battery", item: "battery", x: 7, z: 16 },
      { uid: "shed-battery", item: "battery", x: 5, z: 23 },
      { uid: "garage-cutters", item: "boltCutter", x: 26, z: 14 },
      { uid: "ground-medkit", item: "medkit", x: 21, z: 7 },
      ...(save.safeOpen ? [{ uid: "safe-basement-key", item: "basementKey" as ItemId, x: 5, z: 5 }] : []),
      ...(save.unlockedDoors.includes("drawer-kitchen") ? [{ uid: "drawer-battery", item: "battery" as ItemId, x: 20.5, z: 15.6 }] : []),
    ],
    upstairs: [
      { uid: "upstairs-main-key", item: "mainKey", x: [6, 6, 19][save.mainKeyLocation] || 6, z: [5, 14, 6][save.mainKeyLocation] || 5 },
      { uid: "upstairs-battery", item: "battery", x: 7, z: 13 },
      { uid: "locked-medkit", item: "medkit", x: 18, z: 14 },
    ],
    basement: [
      { uid: "basement-fuse", item: "fuse", x: 5, z: 5 },
      { uid: "basement-security-key", item: "securityKey", x: 18, z: 6 },
      { uid: "basement-battery", item: "battery", x: 17, z: 13 },
    ],
    attic: [
      { uid: "attic-battery", item: "battery", x: 11, z: 5 },
      { uid: "attic-medkit", item: "medkit", x: 19, z: 6 },
    ],
    maze: [
      { uid: "maze-battery-one", item: "battery", x: 7, z: 7 },
      { uid: "maze-battery-two", item: "battery", x: 19, z: 21 },
      { uid: "maze-medkit", item: "medkit", x: 5, z: 19 },
    ],
  };
  return [...items[level], ...save.dropped.filter((d) => d.level === level).map((d) => ({ uid: d.uid, item: d.item, x: d.x, z: d.z }))]
    .filter((item) => !save.collected.includes(item.uid));
}

export function roomName(level: LevelId, x: number, z: number): string {
  if (level === "maze") {
    if (Math.abs(x - 13) < 3 && Math.abs(z - 13) < 3) return "HEART OF THE MAZE";
    return z >= 23 ? "MAZE GATE" : "GARDEN MAZE";
  }
  if (level === "ground") {
    if (z >= 20) return z >= 27 ? "ESCAPE GATE" : Math.abs(x - 5) < 0.9 && Math.abs(z - 23) < 0.9 ? "GARDEN SHED" : "FRONT GARDEN";
    if (x >= 24) return "GARAGE";
    if (x <= 9) return z <= 9 ? "DINING ROOM" : "LIVING ROOM";
    if (x >= 16) return z <= 9 ? "STORAGE ROOM" : "KITCHEN";
    return "ENTRANCE HALL";
  }
  if (level === "upstairs") {
    if (x <= 9) return z <= 9 ? "BEDROOM ONE" : "BEDROOM TWO";
    if (x >= 16) return z <= 9 ? "MASTER BEDROOM" : "LOCKED ROOM";
    return "LONG CORRIDOR";
  }
  if (level === "basement") {
    if (x <= 8) return z <= 9 ? "BOILER ROOM" : "SECRET ROOM";
    if (x >= 15) return z <= 9 ? "BASEMENT STORAGE" : "UNDERGROUND CORRIDOR";
    return "BASEMENT HALL";
  }
  return x >= 18 ? "HIDDEN ROOM" : "OLD ATTIC";
}

export function currentObjective(save: SaveData): string {
  if (save.level === "maze") return "Taklukkan labirin dan temukan pintu keluar di tengahnya";
  if (!save.readNotes.includes("code") && !save.safeOpen) return "Cari petunjuk di ruang tamu";
  if (!save.safeOpen) return "Buka brankas di ruang makan";
  if (!save.unlockedDoors.includes("stairs-down")) return "Temukan jalan ke basement";
  if (!save.powerOn && !save.inventory.includes("fuse") && !save.collected.includes("basement-fuse")) return "Cari sekring di ruang boiler";
  if (!save.powerOn) return "Pulihkan listrik di ruang penyimpanan";
  if (!save.unlockedDoors.includes("garage") && !save.inventory.includes("boltCutter")) return "Buka garasi yang terkunci";
  if (!save.inventory.includes("boltCutter") && !save.collected.includes("garage-cutters") && !save.unlockedDoors.includes("gate")) return "Ambil pemotong rantai di garasi";
  if (!save.unlockedDoors.includes("front") && !save.inventory.includes("mainKey")) return "Cari kunci pintu depan di lantai atas";
  if (!save.unlockedDoors.includes("front")) return "Buka pintu depan rumah";
  return "Potong rantai gerbang, lalu masuki labirin";
}
