import * as THREE from "three";
import { coatBloodTexture } from "./blood";
import type { MonsterState } from "./types";

export interface CreeperRig {
  group: THREE.Group;
  animate: (time: number, state: MonsterState, speed: number, attack?: number) => void;
  setDetail: (high: boolean) => void;
}

export function createCreeper(): CreeperRig {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1, side: THREE.DoubleSide });
  const coatEdge = new THREE.MeshStandardMaterial({ color: 0x7d786d, roughness: 1, side: THREE.DoubleSide });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc8c2b1, roughness: 0.94 });
  const oldBone = new THREE.MeshStandardMaterial({ color: 0x676e65, roughness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x801c16, emissive: 0xbb1b11, emissiveIntensity: 2.8 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xbeb5a0, roughness: 0.75 });
  const blood = new THREE.MeshPhysicalMaterial({ color: 0x610608, roughness: 0.17, metalness: 0.03, clearcoat: 0.95, clearcoatRoughness: 0.11 });
  const wetCoat = new THREE.MeshPhysicalMaterial({ map: coatBloodTexture(), transparent: true, depthWrite: false, roughness: 0.21, metalness: 0.06, clearcoat: 0.85, clearcoatRoughness: 0.18, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  const flows: { mesh: THREE.Mesh; x: number; z: number; y: number; length: number; phase: number; speed: number; radius: number }[] = [];

  const drip = (parent: THREE.Object3D, x: number, y: number, z: number, length: number, speed: number, phase: number, radius = .015) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 6), blood);
    mesh.castShadow = false;
    parent.add(mesh);
    flows.push({ mesh, x, y, z, length, speed, phase, radius });
  };
  const rivulet = (parent: THREE.Object3D, points: THREE.Vector3[], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, radius, 5, false), blood);
    mesh.castShadow = false;
    parent.add(mesh);
  };

  const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const joint = (parent: THREE.Object3D, r1: number, r2: number, length: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, length, 7), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // A crooked, impossibly narrow silhouette reads clearly even in near darkness.
  const torso = new THREE.Group();
  torso.position.set(0, 1.35, 0);
  group.add(torso);
  const coatBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.59, 1.35, 9, 1), coat);
  coatBody.position.y = 0.47;
  coatBody.rotation.z = -0.07;
  coatBody.castShadow = true;
  torso.add(coatBody);
  const stainedCoat = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.596, 1.355, 12, 1), wetCoat);
  stainedCoat.position.copy(coatBody.position);
  stainedCoat.rotation.copy(coatBody.rotation);
  stainedCoat.castShadow = false;
  torso.add(stainedCoat);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), coat);
  shoulders.scale.set(1.18, 0.43, 0.76);
  shoulders.position.set(0, 1.03, 0.12);
  torso.add(shoulders);
  box(torso, 0.08, 1.05, 0.055, -0.05, 0.65, -0.345, coatEdge).rotation.z = 0.07;
  for (let i = 0; i < 12; i++) {
    const x = -0.27 + (i % 6) * 0.106;
    const start = 0.83 - Math.floor(i / 6) * 0.42;
    const z = -0.42 - Math.floor(i / 6) * 0.12;
    if (i % 2 === 0) rivulet(torso, [new THREE.Vector3(x, start, z), new THREE.Vector3(x + .016, start - .12, z - .03), new THREE.Vector3(x - .009, start - .26, z - .016)], .005 + i % 3 * .003);
    drip(torso, x, start - .2, z - .03, .31 + (i % 4) * .11, .27 + (i % 3) * .07, i * .163, .011 + i % 3 * .004);
  }

  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (0.14 + (i % 4) * 0.115);
    const length = 0.32 + (i % 3) * 0.12;
    const rag = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
        x - 0.105, 0.03, 0.015, x + 0.105, 0.04, 0.015, x + side * 0.08, -length, 0.055,
      ], 3)),
      i % 3 ? coat : coatEdge,
    );
    rag.geometry.computeVertexNormals();
    torso.add(rag);
  }

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  for (const [index, leg] of [leftLeg, rightLeg].entries()) {
    const side = index === 0 ? -1 : 1;
    leg.position.set(side * 0.205, 1.18, 0);
    group.add(leg);
    joint(leg, 0.135, 0.08, 0.72, 0, -0.35, 0.03, coat);
    joint(leg, 0.092, 0.055, 0.54, side * 0.035, -0.94, -0.04, oldBone).rotation.z = side * 0.11;
    box(leg, 0.24, 0.105, 0.42, side * 0.04, -1.13, -0.16, black);
  }

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  for (const [index, arm] of [leftArm, rightArm].entries()) {
    const side = index === 0 ? -1 : 1;
    arm.position.set(side * 0.46, 2.38, 0.075);
    group.add(arm);
    joint(arm, 0.175, 0.103, 0.72, side * 0.09, -0.34, 0.02, coat).rotation.z = side * 0.15;
    joint(arm, 0.084, 0.054, 0.72, side * 0.17, -0.96, -0.12, oldBone).rotation.z = side * 0.11;
    const palm = box(arm, 0.145, 0.2, 0.12, side * 0.23, -1.36, -0.15, bone);
    palm.rotation.z = side * 0.2;
    const handStain = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), blood);
    handStain.scale.set(.72, .66, .22);
    handStain.position.set(side * .235, -1.4, -.215);
    arm.add(handStain);
    rivulet(arm, [new THREE.Vector3(side * .22, -1.4, -.21), new THREE.Vector3(side * .245, -1.51, -.21), new THREE.Vector3(side * .22, -1.63, -.2)], .009);
    drip(arm, side * .22, -1.66, -.2, .63, .38, .21 + index * .44, .017);
    for (let finger = 0; finger < 4; finger++) {
      const f = joint(arm, 0.025, 0.008, 0.31 + (finger % 2) * 0.09,
        side * 0.23 + (finger - 1.5) * 0.048, -1.59, -0.17, bone);
      f.rotation.z = (finger - 1.5) * 0.15;
      const claw = joint(arm, 0.012, 0.002, 0.12,
        side * 0.23 + (finger - 1.5) * 0.057, -1.79 - (finger % 2) * 0.06, -0.215, black);
      claw.rotation.x = 0.42;
    }
  }

  joint(torso, 0.17, 0.13, 0.43, 0, 1.32, -0.13, oldBone).rotation.x = -0.22;
  const head = new THREE.Group();
  head.position.set(0, 2.84, -0.19);
  group.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), bone);
  skull.scale.set(0.85, 1.24, 0.79);
  skull.castShadow = true;
  head.add(skull);
  const chin = new THREE.Mesh(new THREE.ConeGeometry(0.275, 0.37, 7), oldBone);
  chin.rotation.z = Math.PI;
  chin.position.set(0, -0.37, -0.11);
  head.add(chin);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.128, 10, 12), black);
  mouth.scale.set(0.72, 1.65, 0.23);
  mouth.position.set(0, -0.19, -0.304);
  head.add(mouth);
  const jawSmear = new THREE.Mesh(new THREE.SphereGeometry(.125, 10, 8), blood);
  jawSmear.scale.set(1, .21, .19);
  jawSmear.position.set(0, -.33, -.3);
  head.add(jawSmear);
  for (let i = 0; i < 6; i++) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.115, 5), tooth);
    fang.rotation.z = Math.PI;
    fang.position.set((i - 2.5) * 0.04, -0.13, -0.342);
    head.add(fang);
  }
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.128, 10, 8), black);
    socket.scale.set(1.15, 1.38, 0.38);
    socket.position.set(side * 0.15, 0.12, -0.276);
    head.add(socket);
    rivulet(head, [
      new THREE.Vector3(side * .17, .04, -.324),
      new THREE.Vector3(side * .205, -.1, -.32),
      new THREE.Vector3(side * .18, -.24, -.281),
      new THREE.Vector3(side * .21, -.35, -.23),
    ], .014);
    rivulet(head, [
      new THREE.Vector3(side * .11, -.003, -.33),
      new THREE.Vector3(side * .095, -.11, -.31),
      new THREE.Vector3(side * .12, -.23, -.27),
    ], .006);
    drip(head, side * .21, -.1, -.32, .31, .33, side > 0 ? .34 : .77, .013);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.039, 9, 9), eye);
    pupil.position.set(side * 0.145, 0.105, -0.326);
    head.add(pupil);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.08), oldBone);
    cheek.position.set(side * 0.17, -0.08, -0.27);
    cheek.rotation.z = side * -0.22;
    head.add(cheek);
  }
  const glow = new THREE.PointLight(0xa51a11, 0.35, 2.4, 2);
  glow.position.set(0, 0.08, -0.35);
  head.add(glow);
  // A curtain of wet black hair hides the face; only the eyes burn through it.
  for (let i = 0; i < 26; i++) {
    const column = i % 13;
    const depth = Math.floor(i / 13);
    const x = -0.34 + column * 0.057;
    const length = 0.68 + ((i * 5) % 6) * 0.13;
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.0025, length, 4), black);
    strand.position.set(x + (depth ? 0.026 : 0), 0.34 - length / 2 - depth * 0.07, -0.27 - depth * 0.055 - Math.abs(x) * 0.12);
    strand.rotation.z = x * 0.5;
    strand.rotation.x = -0.08;
    head.add(strand);
    if (i % 3 === 0) {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.003, length * 1.45, 4), black);
      back.position.set(x * 1.08, 0.34 - length * 0.6, 0.12 + depth * 0.05);
      back.rotation.z = x * 0.34;
      head.add(back);
    }
  }

  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material !== blood && object.material !== wetCoat) object.castShadow = true;
  });

  return {
    group,
    setDetail(high) {
      flows.forEach((flow, index) => { flow.mesh.userData.detailed = !high && index % 3 !== 0; });
    },
    animate(time, state, speed, attack = 0) {
      const moving = state === "CHASE" || speed > 0.2;
      const pace = state === "CHASE" ? 9.5 : 5.2;
      const step = time * pace;
      leftLeg.rotation.x = moving ? Math.sin(step) * (state === "CHASE" ? 0.49 : 0.28) : 0;
      rightLeg.rotation.x = moving ? -leftLeg.rotation.x : 0;
      leftArm.rotation.x = (moving ? -Math.sin(step) * 0.18 + 0.13 : 0.09) + attack * 1.42;
      rightArm.rotation.x = (moving ? Math.sin(step) * 0.18 - 0.13 : -0.09) + attack * 1.51;
      leftArm.rotation.z = 0.17 + Math.sin(time * 1.8) * 0.045;
      rightArm.rotation.z = -0.17 - Math.sin(time * 1.7) * 0.05;
      torso.rotation.z = Math.sin(time * 1.3) * 0.045;
      torso.rotation.x = (state === "CHASE" ? -0.16 : -0.045) - attack * 0.27;
      head.rotation.z = Math.sin(time * 0.7) * 0.13 + (state === "CHASE" ? Math.sin(time * 17) * 0.025 : 0);
      head.rotation.x = -0.09 + Math.sin(time * 1.2) * 0.04 - attack * 0.21;
      mouth.scale.y = state === "CHASE" ? 1.9 + Math.sin(time * 11) * .38 : 1.43 + Math.sin(time * 1.4) * .17;
      jawSmear.position.y = -.33 - (state === "CHASE" ? .03 : 0);
      group.position.y = moving ? Math.abs(Math.sin(step)) * 0.048 : Math.sin(time * 1.8) * 0.022;
      glow.intensity = 0.31 + Math.sin(time * 2.3) * 0.11 + (state === "CHASE" ? 0.45 : 0);
      for (const flow of flows) {
        if (flow.mesh.userData.detailed) { flow.mesh.visible = false; continue; }
        const travel = (time * flow.speed + flow.phase) % 1;
        flow.mesh.visible = travel < .94;
        flow.mesh.position.set(flow.x + Math.sin(time * 3 + flow.phase * 20) * .004, flow.y - travel * flow.length, flow.z);
        flow.mesh.scale.set(flow.radius, flow.radius * (1.9 + travel * 2.5), flow.radius * 1.1);
      }
    },
  };
}