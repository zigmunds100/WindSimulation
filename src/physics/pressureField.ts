/**
 * Analytic pressure coefficient (Cp) for potential flow around a sphere,
 * with optional viscous wake correction.
 */

import type { SimParams } from '../streamlines/compute';

const FLUID_WAKE_SCALE: Record<string, number> = { air: 1.0, water: 3.0 };

/**
 * Sample the pressure coefficient Cp at point (px, py, pz).
 * Sphere centered at origin, flow in +X direction.
 *
 * Returns NaN for points inside the sphere.
 */
export function sampleCp(
  px: number, py: number, pz: number,
  params: SimParams,
): number {
  const { sphereRadius: a, uFreestream: U, wakeEnabled, fluid } = params;
  const gamma = params.gamma * FLUID_WAKE_SCALE[fluid];

  const r2 = px * px + py * py + pz * pz;
  const r = Math.sqrt(r2);

  // Inside sphere — sentinel
  if (r < a) return NaN;

  const r3 = r2 * r;
  const a3 = a * a * a;
  const ratio = a3 / r3;

  const cosTheta = px / r; // dot((px,py,pz), (1,0,0)) / r
  const sin2Theta = Math.max(0, 1 - cosTheta * cosTheta);
  const sinTheta = Math.sqrt(sin2Theta);

  // Potential flow velocity components (spherical)
  const Vr = U * (1 - ratio) * cosTheta;
  const Vt = -U * (1 + ratio / 2) * sinTheta;

  const V2 = Vr * Vr + Vt * Vt;
  let cp = 1 - V2 / (U * U);

  // Wake correction:
  // For a bluff body, separated wake lowers base pressure mainly in the
  // downstream region. We blend toward a negative Cp core behind the sphere
  // and recover gradually downstream/radially.
  if (wakeEnabled && gamma > 0) {
    const cpBase = -0.45 * gamma;
    // Separation on a sphere is typically around 75–85° from the rear
    // stagnation direction for moderate/high Reynolds number.
    const sepX = a * Math.cos(80 * Math.PI / 180); // ~ +0.17a (downstream hemisphere)

    if (px > sepX) {
      const s = px - sepX; // downstream distance from separation plane
      const rPerp = Math.sqrt(py * py + pz * pz);

      const wakeLength = a * 6;
      const wakeRadius0 = a * 0.75;
      const wakeRadiusSlope = 0.22;

      // smoothstep for axial blending
      const t0 = s / wakeLength;
      const tClamped = Math.max(0, Math.min(1, t0));
      const axialBuild = tClamped * tClamped * (3 - 2 * tClamped);
      const axialDecay = Math.exp(-1.5 * tClamped);
      const axial = axialBuild * axialDecay;

      // radial Gaussian mask
      const localRadius = wakeRadius0 + wakeRadiusSlope * Math.max(0, s - a);
      const rNorm = rPerp / localRadius;
      const radial = Math.exp(-rNorm * rNorm);

      const w = Math.max(0, Math.min(1, axial * radial));
      cp = cp * (1 - w) + cpBase * w;
    }
  }

  return cp;
}
