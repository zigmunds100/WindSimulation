import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { SimParams } from '../streamlines/compute';

export interface PressureUniforms {
  center: Vector3;
  flowDir: Vector3;
  sphereRadius: number;
  uFreestream: number;
  density: number;
  thetaSepRad: number;
  cpWakeBase: number;
  wakeStrength: number;
  wakeSigma: number;
  wakeLength: number;
  contours: number;
}

export function buildPressureUniforms(params: SimParams, center = Vector3.Zero()): PressureUniforms {
  return {
    center,
    flowDir: new Vector3(1, 0, 0),
    sphereRadius: params.sphereRadius,
    uFreestream: Math.max(0.05, params.uFreestream),
    density: params.density,
    thetaSepRad: (params.thetaSepDeg * Math.PI) / 180,
    cpWakeBase: params.cpWakeBase,
    wakeStrength: params.wakeStrength,
    wakeSigma: params.wakeSigma * params.sphereRadius,
    wakeLength: params.wakeLength * params.sphereRadius,
    contours: params.pressureContours ? 1 : 0,
  };
}
