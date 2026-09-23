import * as THREE from "three";

function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Hand-drawn procedural albedo: transparent edges and layered dark/wet channels.
export function coatBloodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const random = seeded(6819);

  for (const [cx, cy, rx, ry] of [[252, 185, 69, 104], [195, 253, 37, 78], [321, 341, 47, 75]] as [number, number, number, number][]) {
    const shade = ctx.createRadialGradient(cx - 8, cy - 9, 4, cx, cy, rx * 1.35);
    shade.addColorStop(0, "rgba(103,3,10,.95)");
    shade.addColorStop(.44, "rgba(66,4,10,.9)");
    shade.addColorStop(.78, "rgba(31,2,5,.65)");
    shade.addColorStop(1, "rgba(15,0,3,0)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.35, ry * 1.06, (random() - .5) * .5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 62; i++) {
    const x = 180 + random() * 165;
    const y = 75 + random() * 350;
    const r = 1.4 + random() ** 2 * 11;
    ctx.fillStyle = random() > .4 ? `rgba(104,7,13,${.23 + random() * .63})` : `rgba(25,0,4,${.3 + random() * .56})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (.7 + random()), r * (1 + random() * 2), random() * .4, 0, 7);
    ctx.fill();
  }

  for (let i = 0; i < 24; i++) {
    const x = 195 + random() * 115;
    const y = 110 + random() * 230;
    const end = Math.min(510, y + 70 + random() * 170);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 3 - random() * 8, y + 50, x + random() * 11, end - 40, x - 2, end);
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5 + random() * 5.5;
    ctx.strokeStyle = i % 3 ? "rgba(69,1,8,.85)" : "rgba(136,14,20,.78)";
    ctx.stroke();
    ctx.fillStyle = "rgba(92,3,11,.9)";
    ctx.beginPath();
    ctx.ellipse(x - 2, end, ctx.lineWidth * .75, ctx.lineWidth * 1.45, 0, 0, 7);
    ctx.fill();
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 8);
      ctx.lineTo(x, Math.min(end, y + 52));
      ctx.strokeStyle = "rgba(185,46,40,.4)";
      ctx.lineWidth = .9;
      ctx.stroke();
    }
  }
  return canvasTexture(canvas);
}

export function floorBloodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const random = seeded(2312);
  const gradient = ctx.createRadialGradient(252, 261, 20, 260, 263, 193);
  gradient.addColorStop(0, "rgba(84,6,14,.91)");
  gradient.addColorStop(.45, "rgba(54,2,8,.86)");
  gradient.addColorStop(.77, "rgba(28,0,4,.44)");
  gradient.addColorStop(1, "rgba(22,0,3,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const angle = i / 60 * Math.PI * 2;
    const edge = 145 + Math.sin(angle * 7) * 15 + Math.sin(angle * 13) * 9 + random() * 19;
    const x = 256 + Math.cos(angle) * edge;
    const y = 256 + Math.sin(angle) * edge * .68;
    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 30; i++) {
    const angle = random() * Math.PI * 2;
    const dist = 170 + random() * 87;
    const size = 1.8 + random() ** 2 * 10;
    ctx.fillStyle = `rgba(${35 + Math.floor(random() * 80)},2,8,${.4 + random() * .48})`;
    ctx.beginPath();
    ctx.ellipse(256 + Math.cos(angle) * dist, 256 + Math.sin(angle) * dist * .72, size, size * (1 + random()), angle, 0, 7);
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x = 187 + random() * 133;
    ctx.beginPath();
    ctx.moveTo(x, 207 + random() * 55);
    ctx.quadraticCurveTo(x + 7, 265, x + 16, 325 + random() * 50);
    ctx.lineWidth = 1 + random() * 2;
    ctx.strokeStyle = "rgba(190,57,47,.32)";
    ctx.stroke();
  }
  return canvasTexture(canvas);
}