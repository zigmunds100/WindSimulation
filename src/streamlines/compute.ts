/**
 * CPU-side streamline computation using RK4 integration
 * for potential flow around a cylinder (2D cross-section of sphere).
 */

export interface SimParams {
  uFreestream: number;
  sphereRadius: number;
  gamma: number;
  numStreamlines: number;
  wakeEnabled: boolean;
}

export const DEFAULT_PARAMS: SimParams = {
  uFreestream: 1.0,
  sphereRadius: 1.0,
  gamma: 0.5,
  numStreamlines: 40,
  wakeEnabled: true,
};

const DOMAIN_MIN: [number, number] = [-4, -3];
const DOMAIN_MAX: [number, number] = [8, 3];
const SPHERE_CENTER: [number, number] = [0, 0];

const RK4_DT = 0.02;
const MAX_STEPS = 2000;
const ARROW_ARC_SPACING = 1.5; // world units between arrow markers

/** Potential flow velocity field with optional wake */
function velocity(x: number, y: number, params: SimParams): [number, number] {
  const { uFreestream, sphereRadius, gamma, wakeEnabled } = params;
  const dx = x - SPHERE_CENTER[0];
  const dy = y - SPHERE_CENTER[1];
  const r2 = dx * dx + dy * dy;
  const R2 = sphereRadius * sphereRadius;

  if (r2 < 0.01) return [0, 0]; // avoid singularity

  const r4 = r2 * r2;
  let vx = uFreestream * (1.0 - R2 * (dx * dx - dy * dy) / r4);
  let vy = uFreestream * (-2.0 * R2 * dx * dy / r4);

  // Wake vortex field: sinusoidal von-Karman-like perturbation behind sphere
  if (wakeEnabled && gamma > 0 && dx > 0) {
    const xBehind = dx / sphereRadius;
    const yNorm = dy / sphereRadius;
    const decay = Math.exp(-0.15 * xBehind); // slower decay for wider wake
    const yEnv = Math.exp(-0.5 * yNorm * yNorm); // broader transverse envelope
    const perturbation = gamma * decay * yEnv;
    // Sinusoidal cross-flow perturbation
    const freq = 2.0 * Math.PI * 0.5; // ~0.5 cycles per radius — wider oscillation
    vx += perturbation * Math.sin(freq * xBehind) * 0.5;
    vy += perturbation * Math.cos(freq * xBehind) * 1.5;
  }

  return [vx, vy];
}

/** Check if point is inside sphere (with small buffer) */
function insideSphere(x: number, y: number, params: SimParams, buffer = 0.0): boolean {
  const dx = x - SPHERE_CENTER[0];
  const dy = y - SPHERE_CENTER[1];
  return dx * dx + dy * dy < (params.sphereRadius + buffer) * (params.sphereRadius + buffer);
}

/** Project point outside sphere if it enters */
function projectOutside(x: number, y: number, params: SimParams): [number, number] {
  const dx = x - SPHERE_CENTER[0];
  const dy = y - SPHERE_CENTER[1];
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r < params.sphereRadius * 1.01) {
    const scale = (params.sphereRadius * 1.01) / r;
    return [SPHERE_CENTER[0] + dx * scale, SPHERE_CENTER[1] + dy * scale];
  }
  return [x, y];
}

/** RK4 step */
function rk4Step(x: number, y: number, dt: number, params: SimParams): [number, number] {
  const [k1x, k1y] = velocity(x, y, params);
  const [k2x, k2y] = velocity(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y, params);
  const [k3x, k3y] = velocity(x + 0.5 * dt * k2x, y + 0.5 * dt * k2y, params);
  const [k4x, k4y] = velocity(x + dt * k3x, y + dt * k3y, params);

  const nx = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  const ny = y + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
  return [nx, ny];
}

export interface StreamlineData {
  /** Packed float32 array of [x, y, x, y, ...] for all streamlines */
  vertices: Float32Array;
  /** Per-streamline: { offset (in floats), count (number of vertices) } */
  segments: Array<{ offset: number; count: number }>;
  /** Arrow marker instances: [cx, cy, angle] per arrow */
  arrows: Float32Array;
}

export function computeStreamlines(params: SimParams = DEFAULT_PARAMS): StreamlineData {
  const allVertices: number[] = [];
  const segments: Array<{ offset: number; count: number }> = [];
  const allArrows: number[] = [];

  // Seed streamlines evenly at x = DOMAIN_MIN[0], spread across y
  const yMin = DOMAIN_MIN[1];
  const yMax = DOMAIN_MAX[1];

  for (let i = 0; i < params.numStreamlines; i++) {
    const yStart = yMin + (i + 0.5) * (yMax - yMin) / params.numStreamlines;
    const xStart = DOMAIN_MIN[0];

    const offset = allVertices.length;
    let x = xStart;
    let y = yStart;
    let stepCount = 0;
    let arcLength = 0;
    let lastArrowArc = 0;

    // Add initial point
    allVertices.push(x, y);
    stepCount++;

    for (let s = 0; s < MAX_STEPS; s++) {
      // Adaptive step size near sphere
      const dx = x - SPHERE_CENTER[0];
      const dy = y - SPHERE_CENTER[1];
      const distToSphere = Math.sqrt(dx * dx + dy * dy) - params.sphereRadius;
      const dt = distToSphere < 0.5 ? RK4_DT * 0.5 : RK4_DT;

      const [nx, ny] = rk4Step(x, y, dt, params);

      // Check bounds
      if (nx < DOMAIN_MIN[0] || nx > DOMAIN_MAX[0] || ny < DOMAIN_MIN[1] || ny > DOMAIN_MAX[1]) {
        break;
      }

      // Project outside sphere if needed
      const [px, py] = projectOutside(nx, ny, params);

      // If stuck inside sphere, stop this streamline
      if (insideSphere(px, py, params, 0.005)) {
        break;
      }

      // Accumulate arc length
      const segDx = px - x;
      const segDy = py - y;
      const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
      arcLength += segLen;

      x = px;
      y = py;
      allVertices.push(x, y);
      stepCount++;

      // Place arrow markers at arc-length intervals
      if (arcLength - lastArrowArc >= ARROW_ARC_SPACING) {
        const [vx, vy] = velocity(x, y, params);
        const angle = Math.atan2(vy, vx);
        allArrows.push(x, y, angle);
        lastArrowArc = arcLength;
      }
    }

    segments.push({ offset: offset / 2, count: stepCount });
  }

  return {
    vertices: new Float32Array(allVertices),
    segments,
    arrows: new Float32Array(allArrows),
  };
}
