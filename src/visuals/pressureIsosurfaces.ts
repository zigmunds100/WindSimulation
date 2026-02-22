/**
 * Generates translucent Babylon.js meshes for pressure coefficient isosurfaces
 * around a sphere using analytic potential flow + optional wake correction.
 */

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { SimParams, ZoneMode } from '../streamlines/compute';
import { sampleCp } from '../physics/pressureField';
import { marchingCubes } from '../meshing/marchingCubes';

interface IsoLevel {
  value: number;
  pressureColor: [number, number, number]; // [r, g, b]
  speedColor: [number, number, number];
  alpha: number;
  emissiveFactor: number;
}

const ISO_LEVELS: IsoLevel[] = [
  // Pressure mode uses aerodynamic convention: high pressure = warm colors,
  // suction/low pressure = cool colors.
  { value:  0.6, pressureColor: [0.95, 0.2, 0.15], speedColor: [0.0, 0.8, 0.9], alpha: 0.26, emissiveFactor: 0.45 },
  { value:  0.0, pressureColor: [0.95, 0.75, 0.25], speedColor: [1.0, 0.7, 0.2], alpha: 0.22, emissiveFactor: 0.35 },
  { value: -0.8, pressureColor: [0.2, 0.45, 1.0], speedColor: [1.0, 0.45, 0.0], alpha: 0.30, emissiveFactor: 0.5 },
];

const GRID_RES = 60;

export interface PressureIsosurfaceSystem {
  dispose(): void;
  rebuild(params: SimParams): void;
}

export function createPressureIsosurfaces(scene: Scene, params: SimParams): PressureIsosurfaceSystem {
  let meshes: Mesh[] = [];
  let materials: StandardMaterial[] = [];

  // Create materials (reused across rebuilds)
  for (let i = 0; i < ISO_LEVELS.length; i++) {
    const mat = new StandardMaterial(`pressureZoneMat_${i}`, scene);
    mat.backFaceCulling = false;
    mat.alpha = ISO_LEVELS[i].alpha;
    mat.specularPower = 64;
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    materials.push(mat);
  }

  function applyColors(mode: ZoneMode) {
    for (let i = 0; i < ISO_LEVELS.length; i++) {
      const level = ISO_LEVELS[i];
      const c = mode === 'speed' ? level.speedColor : level.pressureColor;
      const ef = level.emissiveFactor;
      materials[i].diffuseColor = new Color3(c[0], c[1], c[2]);
      materials[i].emissiveColor = new Color3(c[0] * ef, c[1] * ef, c[2] * ef);
    }
  }

  function build(params: SimParams) {
    // Dispose old meshes
    for (const m of meshes) m.dispose();
    meshes = [];

    if (params.zoneMode === 'off') return;

    applyColors(params.zoneMode);

    const a = params.sphereRadius;
    const extentR = a * 2.5; // radial extent (Y, Z)
    const extentFront = a * 3; // upstream (negative X)
    const extentBack = a * (params.wakeEnabled ? 5 : 3); // downstream — larger if wake
    const bounds = {
      min: [-extentFront, -extentR, -extentR] as [number, number, number],
      max: [extentBack, extentR, extentR] as [number, number, number],
    };
    const dims: [number, number, number] = [GRID_RES, GRID_RES, GRID_RES];

    // Build scalar field
    const totalSamples = GRID_RES * GRID_RES * GRID_RES;
    const field = new Float32Array(totalSamples);

    const dx = (bounds.max[0] - bounds.min[0]) / (GRID_RES - 1);
    const dy = (bounds.max[1] - bounds.min[1]) / (GRID_RES - 1);
    const dz = (bounds.max[2] - bounds.min[2]) / (GRID_RES - 1);

    for (let iz = 0; iz < GRID_RES; iz++) {
      const pz = bounds.min[2] + iz * dz;
      for (let iy = 0; iy < GRID_RES; iy++) {
        const py = bounds.min[1] + iy * dy;
        for (let ix = 0; ix < GRID_RES; ix++) {
          const px = bounds.min[0] + ix * dx;
          field[iz * GRID_RES * GRID_RES + iy * GRID_RES + ix] = sampleCp(px, py, pz, params);
        }
      }
    }

    // Run marching cubes for each iso level and create meshes
    for (let i = 0; i < ISO_LEVELS.length; i++) {
      const level = ISO_LEVELS[i];
      const result = marchingCubes(field, dims, level.value, bounds);

      if (result.indices.length === 0) continue;

      const mesh = new Mesh(`pressureZone_Cp${level.value}`, scene);

      const vertexData = new VertexData();
      vertexData.positions = result.positions;
      vertexData.indices = result.indices;
      vertexData.normals = result.normals;
      vertexData.applyToMesh(mesh);

      mesh.material = materials[i];
      meshes.push(mesh);
    }
  }

  build(params);

  return {
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of materials) m.dispose();
      meshes = [];
      materials = [];
    },
    rebuild(params: SimParams) {
      build(params);
    },
  };
}
