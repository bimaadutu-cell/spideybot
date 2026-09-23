// Three.js cameras face local -Z; keep movement, aiming and AI on that basis.
export function forwardAt(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightAt(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function movementAt(yaw: number, forward: number, strafe: number): { x: number; z: number } {
  const magnitude = Math.max(1, Math.hypot(forward, strafe));
  const facing = forwardAt(yaw);
  const right = rightAt(yaw);
  return {
    x: (facing.x * forward + right.x * strafe) / magnitude,
    z: (facing.z * forward + right.z * strafe) / magnitude,
  };
}

export function yawToward(x: number, z: number): number {
  return Math.atan2(-x, -z);
}