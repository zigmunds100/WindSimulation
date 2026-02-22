import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR';
import { SolidParticleSystem } from '@babylonjs/core/Particles/solidParticleSystem';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { SolidParticle } from '@babylonjs/core/Particles/solidParticle';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

import { computeStreamlines3D, velocity, DEFAULT_PARAMS, type SimParams, type StreamlineData3D } from '../streamlines/compute';

/** Fixed streamline grid density — always compute this many paths */
const STREAMLINE_GRID = 14; // 14x14 = 196 streamlines

interface PathLookup {
  xs: Float64Array;
  ys: Float64Array;
  zs: Float64Array;
  cumLen: Float64Array;
  totalLen: number;
}

function buildPathLookup(data: StreamlineData3D): PathLookup[] {
  const paths: PathLookup[] = [];
  for (const seg of data.segments) {
    const count = seg.count;
    if (count < 2) continue;
    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    const zs = new Float64Array(count);
    const cumLen = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const idx = (seg.offset + i) * 3;
      xs[i] = data.vertices[idx];
      ys[i] = data.vertices[idx + 1];
      zs[i] = data.vertices[idx + 2];
      if (i > 0) {
        const dx = xs[i] - xs[i - 1];
        const dy = ys[i] - ys[i - 1];
        const dz = zs[i] - zs[i - 1];
        cumLen[i] = cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    paths.push({ xs, ys, zs, cumLen, totalLen: cumLen[count - 1] });
  }
  return paths;
}

function samplePath(path: PathLookup, t: number): [number, number, number] {
  const dist = t * path.totalLen;
  const n = path.cumLen.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.cumLen[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const segLen = path.cumLen[hi] - path.cumLen[lo];
  const frac = segLen > 0 ? (dist - path.cumLen[lo]) / segLen : 0;
  return [
    path.xs[lo] + frac * (path.xs[hi] - path.xs[lo]),
    path.ys[lo] + frac * (path.ys[hi] - path.ys[lo]),
    path.zs[lo] + frac * (path.zs[hi] - path.zs[lo]),
  ];
}

/**
 * Map velocity magnitude to color via Bernoulli pressure.
 * Cp = 1 - (v/U)^2.  Cp=1 → stagnation (high pressure, blue), Cp<0 → acceleration (low pressure, red).
 */
function pressureColor(vMag: number, U: number): [number, number, number] {
  const ratio = vMag / U;
  // Cp in [-∞, 1], but practically [-3, 1] for potential flow around sphere
  const cp = 1 - ratio * ratio;
  // Map cp: 1 (stagnation) → blue, 0 (freestream) → white, <0 (accelerated) → red
  const t = Math.max(0, Math.min(1, (1 - cp) / 2)); // 0=high pressure, 1=low pressure
  // Blue → White → Red
  if (t < 0.5) {
    const s = t * 2; // 0..1
    return [s, s, 1]; // blue to white
  } else {
    const s = (t - 0.5) * 2; // 0..1
    return [1, 1 - s, 1 - s]; // white to red
  }
}

export function createBabylonScene(engine: AbstractEngine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.12, 0.12, 0.14, 1);

  // Camera
  const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 12, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 30;
  camera.wheelPrecision = 20;
  camera.attachControl(canvas, true);

  // Lights
  const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.6;
  hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
  hemiLight.groundColor = new Color3(0.3, 0.3, 0.35);

  const pointLight = new PointLight('point', new Vector3(5, 5, 5), scene);
  pointLight.intensity = 0.8;
  pointLight.diffuse = new Color3(1, 0.95, 0.9);

  // State
  let currentParams = { ...DEFAULT_PARAMS };
  let streamlineData = computeStreamlines3D({ ...currentParams, numStreamlines: STREAMLINE_GRID * STREAMLINE_GRID });
  let paths = buildPathLookup(streamlineData);
  let particlesPerLine = 0;
  let phases: Float64Array;

  // PBR Sphere
  let sphereMesh: Mesh;
  const sphereMat = new PBRMaterial('sphereMat', scene);
  sphereMat.albedoColor = new Color3(0.95, 0.95, 0.95);
  sphereMat.metallic = 0.05;
  sphereMat.roughness = 0.45;

  function createSphere() {
    if (sphereMesh) sphereMesh.dispose();
    sphereMesh = MeshBuilder.CreateSphere('sphere', { diameter: currentParams.sphereRadius * 2, segments: 32 }, scene);
    sphereMesh.material = sphereMat;
  }
  createSphere();

  // SPS particles
  let sps: SolidParticleSystem | null = null;
  let spsMesh: Mesh | null = null;
  const particleMat = new StandardMaterial('particleMat', scene);
  particleMat.diffuseColor = new Color3(1, 1, 1);
  particleMat.emissiveColor = new Color3(0.3, 0.3, 0.3);
  particleMat.disableLighting = false;

  function initParticlePhases() {
    const numPaths = paths.length;
    if (numPaths === 0) { phases = new Float64Array(0); return; }
    particlesPerLine = Math.max(1, Math.round(currentParams.numStreamlines / numPaths));
    const total = numPaths * particlesPerLine;
    phases = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      const lineIdx = Math.floor(i / particlesPerLine);
      const pIdx = i % particlesPerLine;
      phases[i] = (pIdx / particlesPerLine + lineIdx * 0.037) % 1.0;
    }
  }

  function buildSPS() {
    if (sps) {
      sps.dispose();
      sps = null;
    }
    if (spsMesh) {
      spsMesh.dispose();
      spsMesh = null;
    }

    const totalParticles = paths.length * particlesPerLine;
    if (totalParticles === 0) return;

    sps = new SolidParticleSystem('sps', scene, { updatable: true });
    const size = totalParticles > 10000 ? 0.04 : totalParticles > 5000 ? 0.06 : totalParticles > 2000 ? 0.08 : 0.10;
    const model = MeshBuilder.CreateSphere('pModel', { diameter: size, segments: 3 }, scene);
    sps.addShape(model, totalParticles);
    model.dispose();

    spsMesh = sps.buildMesh();
    spsMesh.material = particleMat;
    spsMesh.hasVertexAlpha = true;

    // Initial positions with pressure coloring
    sps.initParticles = () => {
      const U = currentParams.uFreestream;
      for (let i = 0; i < totalParticles; i++) {
        const p = sps!.particles[i];
        const lineIdx = Math.floor(i / particlesPerLine);
        if (lineIdx < paths.length) {
          const t = phases[i];
          const [x, y, z] = samplePath(paths[lineIdx], t);
          p.position.set(x, y, z);
          const [vx, vy, vz] = velocity(x, y, z, currentParams);
          const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);
          const [cr, cg, cb] = pressureColor(vMag, U);
          const fadeIn = Math.min(t * 8.0, 1.0);
          const fadeOut = Math.min((1.0 - t) * 8.0, 1.0);
          p.color = new Color4(cr, cg, cb, fadeIn * fadeOut);
        }
      }
    };

    sps.updateParticle = (particle: SolidParticle) => particle;

    sps.initParticles();
    sps.setParticles();
  }

  initParticlePhases();
  buildSPS();

  // Animation
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (!sps || !spsMesh || paths.length === 0) return;

    const U = currentParams.uFreestream;
    const speed = U * 0.15;
    const totalParticles = paths.length * particlesPerLine;

    for (let i = 0; i < totalParticles; i++) {
      phases[i] = (phases[i] + speed * dt) % 1.0;
      const lineIdx = Math.floor(i / particlesPerLine);
      if (lineIdx >= paths.length) continue;

      const t = phases[i];
      const [x, y, z] = samplePath(paths[lineIdx], t);
      const p = sps.particles[i];
      p.position.set(x, y, z);

      const [vx, vy, vz] = velocity(x, y, z, currentParams);
      const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const [cr, cg, cb] = pressureColor(vMag, U);
      const fadeIn = Math.min(t * 8.0, 1.0);
      const fadeOut = Math.min((1.0 - t) * 8.0, 1.0);
      if (!p.color) {
        p.color = new Color4(cr, cg, cb, fadeIn * fadeOut);
      } else {
        p.color.r = cr; p.color.g = cg; p.color.b = cb;
        p.color.a = fadeIn * fadeOut;
      }
    }

    sps.setParticles();
  });

  function rebuild(params: SimParams) {
    currentParams = { ...params };
    // Always compute streamlines on the fixed dense grid; numStreamlines controls particle count only
    streamlineData = computeStreamlines3D({ ...currentParams, numStreamlines: STREAMLINE_GRID * STREAMLINE_GRID });
    paths = buildPathLookup(streamlineData);
    createSphere();
    initParticlePhases();
    buildSPS();
  }

  return { scene, rebuild };
}
