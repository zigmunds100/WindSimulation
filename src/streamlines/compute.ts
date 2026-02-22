/**
 * CPU-side streamline computation using RK4 integration
 * for 3D potential flow around a sphere.
 */

export type ZoneMode = 'off' | 'pressure' | 'speed';

export interface SimParams {
  uFreestream: number;
  sphereRadius: number;
  gamma: number;
  numStreamlines: number;
  wakeEnabled: boolean;
  zoneMode: ZoneMode;
}

export const DEFAULT_PARAMS: SimParams = {
  uFreestream: 1.0,
  sphereRadius: 1.0,
  gamma: 0.5,
  numStreamlines: 5000,
  wakeEnabled: true,
  zoneMode: 'pressure',
};

const DOMAIN_MIN: [number, number, number] = [-4, -3, -3];
const DOMAIN_MAX: [number, number, number] = [8, 3, 3];

const RK4_DT = 0.02;
const MAX_STEPS = 2000;

type Vec3 = [number, number, number];

/** 3D potential flow velocity around a sphere + optional wake */
export function velocity(x: number, y: number, z: number, params: SimParams): Vec3 {
  const { uFreestream: U, sphereRadius: R, gamma, wakeEnabled } = params;
  const r2 = x * x + y * y + z * z;

  if (r2 < 0.01) return [U, 0, 0]; // avoid singularity at origin

  const r5 = r2 * r2 * Math.sqrt(r2);
  const R3 = R * R * R;
  const coeff = U * R3 / (2 * r5);

  let vx = U + coeff * (2 * x * x - y * y - z * z);
  let vy = coeff * 3 * x * y;
  let vz = coeff * 3 * x * z;

  // Wake perturbation behind sphere — three components:
  // 1) Recirculation bubble (reversed flow immediately behind)
  // 2) Vortex ring shedding (periodic toroidal vortices)
  // 3) Helical instability (swirl around wake axis)
  if (wakeEnabled && gamma > 0 && x > R * 0.5) {
    const xi = (x - R) / R; // distance behind sphere surface, in radii
    const rho = Math.sqrt(y * y + z * z);
    const rhoN = rho / R; // normalized radial distance

    // 1) Recirculation bubble: reversed flow in a narrow region behind sphere
    if (xi < 2.5 && rhoN < 1.2) {
      const axialEnv = Math.sin(Math.PI * xi / 2.5); // peaks at xi≈1.25
      const radEnv = Math.exp(-2.0 * rhoN * rhoN);
      const recirc = -gamma * U * 0.8 * axialEnv * radEnv;
      vx += recirc;
      // Recirculation pushes flow outward at the back
      if (rho > 0.001) {
        const outward = gamma * U * 0.3 * Math.cos(Math.PI * xi / 2.5) * radEnv;
        vy += outward * (y / rho);
        vz += outward * (z / rho);
      }
    }

    // 2) Vortex ring shedding: periodic toroidal vortices convecting downstream
    if (xi > 0.5) {
      const shedFreq = 1.8; // Strouhal-like frequency
      const phase = 2 * Math.PI * shedFreq * xi;
      const ringDecay = Math.exp(-0.12 * xi); // slow decay downstream
      const ringRadial = Math.exp(-0.8 * (rhoN - 1.0) * (rhoN - 1.0)); // peaks at rho≈R
      const ringStrength = gamma * U * 0.6 * ringDecay * ringRadial;

      // Toroidal rotation: alternating inward/outward + axial oscillation
      vx += ringStrength * Math.cos(phase) * 0.4;
      if (rho > 0.001) {
        const radialRing = ringStrength * Math.sin(phase) * 0.8;
        vy += radialRing * (y / rho);
        vz += radialRing * (z / rho);
      }
    }

    // 3) Helical instability: swirl around the wake axis
    if (xi > 1.0 && rho > 0.001) {
      const helixDecay = Math.exp(-0.1 * xi);
      const helixEnv = Math.exp(-0.5 * rhoN * rhoN);
      const helixPhase = 2 * Math.PI * 0.7 * xi; // slow spiral
      const swirl = gamma * U * 0.35 * helixDecay * helixEnv;

      // Tangential velocity (perpendicular to radial direction in yz plane)
      const tanY = -z / rho; // tangent direction
      const tanZ = y / rho;
      vy += swirl * Math.sin(helixPhase) * tanY;
      vz += swirl * Math.sin(helixPhase) * tanZ;

      // Helical wobble of the wake centerline
      vy += swirl * 0.3 * Math.cos(helixPhase);
      vz += swirl * 0.3 * Math.sin(helixPhase);
    }
  }

  return [vx, vy, vz];
}

/** Check if point is inside sphere */
function insideSphere(x: number, y: number, z: number, R: number, buffer = 0.0): boolean {
  const rBound = R + buffer;
  return x * x + y * y + z * z < rBound * rBound;
}

/** Project point outside sphere if it entered */
function projectOutside(x: number, y: number, z: number, R: number): Vec3 {
  const r = Math.sqrt(x * x + y * y + z * z);
  const minR = R * 1.01;
  if (r < minR) {
    const scale = minR / r;
    return [x * scale, y * scale, z * scale];
  }
  return [x, y, z];
}

/** RK4 step in 3D */
function rk4Step(x: number, y: number, z: number, dt: number, params: SimParams): Vec3 {
  const [k1x, k1y, k1z] = velocity(x, y, z, params);
  const [k2x, k2y, k2z] = velocity(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y, z + 0.5 * dt * k1z, params);
  const [k3x, k3y, k3z] = velocity(x + 0.5 * dt * k2x, y + 0.5 * dt * k2y, z + 0.5 * dt * k2z, params);
  const [k4x, k4y, k4z] = velocity(x + dt * k3x, y + dt * k3y, z + dt * k3z, params);

  return [
    x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x),
    y + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y),
    z + (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z),
  ];
}

export interface StreamlineData3D {
  /** Packed [x,y,z, x,y,z, ...] for all streamlines */
  vertices: Float32Array;
  /** Per-streamline: { offset (vertex index), count (number of vertices) } */
  segments: Array<{ offset: number; count: number }>;
}

export function computeStreamlines3D(params: SimParams = DEFAULT_PARAMS): StreamlineData3D {
  const allVertices: number[] = [];
  const segments: Array<{ offset: number; count: number }> = [];

  // Seed points on upstream plane x = DOMAIN_MIN[0]
  // Grid: sqrt(N) x sqrt(N) in (y, z)
  const gridN = Math.max(2, Math.round(Math.sqrt(params.numStreamlines)));
  const yMin = DOMAIN_MIN[1];
  const yMax = DOMAIN_MAX[1];
  const zMin = DOMAIN_MIN[2];
  const zMax = DOMAIN_MAX[2];
  const xStart = DOMAIN_MIN[0];

  for (let iy = 0; iy < gridN; iy++) {
    for (let iz = 0; iz < gridN; iz++) {
      const yStart = yMin + (iy + 0.5) * (yMax - yMin) / gridN;
      const zStart = zMin + (iz + 0.5) * (zMax - zMin) / gridN;

      const vertexOffset = allVertices.length / 3;
      let x = xStart;
      let y = yStart;
      let z = zStart;
      let stepCount = 0;

      allVertices.push(x, y, z);
      stepCount++;

      for (let s = 0; s < MAX_STEPS; s++) {
        const distToSphere = Math.sqrt(x * x + y * y + z * z) - params.sphereRadius;
        const dt = distToSphere < 0.5 ? RK4_DT * 0.5 : RK4_DT;

        const [nx, ny, nz] = rk4Step(x, y, z, dt, params);

        // Check bounds
        if (nx < DOMAIN_MIN[0] || nx > DOMAIN_MAX[0] ||
            ny < DOMAIN_MIN[1] || ny > DOMAIN_MAX[1] ||
            nz < DOMAIN_MIN[2] || nz > DOMAIN_MAX[2]) {
          break;
        }

        const [px, py, pz] = projectOutside(nx, ny, nz, params.sphereRadius);

        if (insideSphere(px, py, pz, params.sphereRadius, 0.005)) {
          break;
        }

        x = px;
        y = py;
        z = pz;
        allVertices.push(x, y, z);
        stepCount++;
      }

      if (stepCount >= 2) {
        segments.push({ offset: vertexOffset, count: stepCount });
      }
    }
  }

  return {
    vertices: new Float32Array(allVertices),
    segments,
  };
}
