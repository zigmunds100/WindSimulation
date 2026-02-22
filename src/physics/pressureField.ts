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

  // Wake correction
  if (wakeEnabled && gamma > 0) {
    const CpBase = -0.4 * gamma;
    const sepX = a * Math.cos(100 * Math.PI / 180); // ~cos(100°) ≈ -0.17a

    if (px > sepX) {
      const s = px; // axial distance
      const rPerp = Math.sqrt(py * py + pz * pz);

      const wakeLength = a * 6;
      const wakeRadius0 = a * 0.8;
      const wakeRadiusSlope = 0.3;

      // smoothstep for axial blending
      const t0 = (s - a) / wakeLength;
      const tClamped = Math.max(0, Math.min(1, t0));
      const axial = tClamped * tClamped * (3 - 2 * tClamped);

      // radial Gaussian mask
      const localRadius = wakeRadius0 + wakeRadiusSlope * Math.max(0, s - a);
      const rNorm = rPerp / localRadius;
      const radial = Math.exp(-rNorm * rNorm);

      const w = Math.max(0, Math.min(1, axial * radial));
      cp = cp * (1 - w) + CpBase * w;
    }
  }

  return cp;
}
