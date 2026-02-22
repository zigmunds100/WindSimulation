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

// Screen-space fluid rendering — register scene.enableFluidRenderer + all GLSL shaders
import '@babylonjs/core/Rendering/fluidRenderer/fluidRenderer';
import '@babylonjs/core/Shaders/fluidRenderingParticleDepth.vertex';
import '@babylonjs/core/Shaders/fluidRenderingParticleDepth.fragment';
import '@babylonjs/core/Shaders/fluidRenderingParticleThickness.vertex';
import '@babylonjs/core/Shaders/fluidRenderingParticleThickness.fragment';
import '@babylonjs/core/Shaders/fluidRenderingParticleDiffuse.vertex';
import '@babylonjs/core/Shaders/fluidRenderingParticleDiffuse.fragment';
import '@babylonjs/core/Shaders/fluidRenderingBilateralBlur.fragment';
import '@babylonjs/core/Shaders/fluidRenderingStandardBlur.fragment';
import '@babylonjs/core/Shaders/fluidRenderingRender.fragment';
import { FluidRenderingObjectCustomParticles } from '@babylonjs/core/Rendering/fluidRenderer/fluidRenderingObjectCustomParticles';
import type { FluidRenderer, IFluidRenderingRenderObject } from '@babylonjs/core/Rendering/fluidRenderer/fluidRenderer';
import { computeStreamlines3D, DEFAULT_PARAMS, type SimParams, type StreamlineData3D } from '../streamlines/compute';
import { buildPressureUniforms } from '../pressureViz/pressureModel';
import { SurfacePressureViz } from '../pressureViz/surfacePressure';
import { PressureSlicesViz } from '../pressureViz/pressureSlices';

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

/** Particle color — set per fluid */
let PARTICLE_COLOR: [number, number, number] = [0.122, 0.467, 0.706];

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
  const surfacePressureViz = new SurfacePressureViz(scene);
  const pressureSlicesViz = new PressureSlicesViz(scene);

  function updatePressureViz() {
    const uniforms = buildPressureUniforms(currentParams, sphereMesh?.position ?? Vector3.Zero());
    surfacePressureViz.update(uniforms);
    pressureSlicesViz.update(uniforms);
    pressureSlicesViz.setEnabled(currentParams.pressureSlicesEnabled);

    if (currentParams.pressureSurfaceEnabled) {
      surfacePressureViz.attachToSphere(sphereMesh);
    } else {
      sphereMesh.material = sphereMat;
    }
  }

  function createSphere() {
    if (sphereMesh) sphereMesh.dispose();
    sphereMesh = MeshBuilder.CreateSphere('sphere', { diameter: currentParams.sphereRadius * 2, segments: 32 }, scene);
    updatePressureViz();
  }
  createSphere();

  // ── Fluid theme ──
  function applyFluidTheme() {
    const isWater = currentParams.fluid === 'water';
    if (isWater) {
      scene.clearColor = new Color4(0.53, 0.76, 0.98, 1);  // bright sky blue
      hemiLight.diffuse = new Color3(1.0, 0.97, 0.9);       // warm sunlight
      hemiLight.intensity = 0.9;
      hemiLight.groundColor = new Color3(0.35, 0.45, 0.55);
      pointLight.diffuse = new Color3(1.0, 0.95, 0.85);     // warm sun
      pointLight.intensity = 1.2;
      sphereMat.albedoColor = new Color3(0.9, 0.92, 0.95);
      sphereMat.metallic = 0.1;
      sphereMat.roughness = 0.25;
      PARTICLE_COLOR = [0.15, 0.55, 0.75];
    } else {
      scene.clearColor = new Color4(0.12, 0.12, 0.14, 1);
      hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
      hemiLight.intensity = 0.6;
      hemiLight.groundColor = new Color3(0.3, 0.3, 0.35);
      pointLight.diffuse = new Color3(1, 0.95, 0.9);
      pointLight.intensity = 0.8;
      sphereMat.albedoColor = new Color3(0.95, 0.95, 0.95);
      sphereMat.metallic = 0.05;
      sphereMat.roughness = 0.45;
      PARTICLE_COLOR = [0.122, 0.467, 0.706];
    }
  }
  applyFluidTheme();

  // ── Screen-space fluid renderer state ──
  let fluidRenderer: FluidRenderer | null = null;
  let fluidRenderObject: IFluidRenderingRenderObject | null = null;
  let fluidPositions: Float32Array = new Float32Array(0);
  let fluidCustomParticles: FluidRenderingObjectCustomParticles | null = null;

  function enableFluidRendering(totalParticles: number) {
    disableFluidRendering();

    fluidRenderer = scene.enableFluidRenderer()!;
    if (!fluidRenderer) return;

    fluidPositions = new Float32Array(totalParticles * 3);
    // Initialize positions from current phases so first frame isn't blank
    for (let i = 0; i < totalParticles; i++) {
      const lineIdx = Math.floor(i / particlesPerLine);
      if (lineIdx < paths.length) {
        const t = phases[i];
        const [x, y, z] = samplePath(paths[lineIdx], t);
        fluidPositions[i * 3] = x;
        fluidPositions[i * 3 + 1] = y;
        fluidPositions[i * 3 + 2] = z;
      }
    }

    fluidRenderObject = fluidRenderer.addCustomParticles(
      { position: fluidPositions },
      totalParticles,
      false,
    );

    fluidCustomParticles = fluidRenderObject.object as FluidRenderingObjectCustomParticles;
    fluidCustomParticles.particleSize = 0.6;              // larger so particles overlap → cohesive surface
    fluidCustomParticles.particleThicknessAlpha = 0.1;

    // Configure target renderer for water-like appearance
    const tr = fluidRenderObject.targetRenderer;
    tr.fluidColor = new Color3(0.15, 0.45, 0.75);
    tr.density = 0.8;                                    // lighter opacity — reduce dark halo
    tr.refractionStrength = 0.12;                        // noticeable refraction distortion
    tr.fresnelClamp = 0.7;                              // strong Fresnel edge brightening
    tr.specularPower = 200;                              // focused specular highlight
    tr.minimumThickness = 0.0;
    tr.dirLight = new Vector3(-2, -1, 1).normalize();

    // Depth bilateral blur — makes depth surface smooth
    tr.enableBlurDepth = true;
    tr.blurDepthSizeDivisor = 1;
    tr.blurDepthFilterSize = 20;                        // wider blur to soften sphere edge
    tr.blurDepthNumIterations = 7;                      // more passes → smoother
    tr.blurDepthMaxFilterSize = 200;
    tr.blurDepthDepthScale = 15;

    // Thickness blur — smooth density map
    tr.enableBlurThickness = true;
    tr.blurThicknessSizeDivisor = 1;
    tr.blurThicknessFilterSize = 10;
    tr.blurThicknessNumIterations = 3;

    tr.useFixedThickness = false;
    tr.useVelocity = false;
  }

  function disableFluidRendering() {
    if (fluidRenderObject && fluidRenderer) {
      fluidRenderer.removeRenderObject(fluidRenderObject, true);
      fluidRenderObject = null;
      fluidCustomParticles = null;
    }
    if (fluidRenderer) {
      scene.disableFluidRenderer();
      fluidRenderer = null;
    }
    fluidPositions = new Float32Array(0);
  }

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

    // Initial positions
    sps.initParticles = () => {
      const [cr, cg, cb] = PARTICLE_COLOR;
      for (let i = 0; i < totalParticles; i++) {
        const p = sps!.particles[i];
        const lineIdx = Math.floor(i / particlesPerLine);
        if (lineIdx < paths.length) {
          const t = phases[i];
          const [x, y, z] = samplePath(paths[lineIdx], t);
          p.position.set(x, y, z);
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
  updatePressureViz();

  // Enable fluid rendering if starting in water mode
  if (currentParams.fluid === 'water') {
    const totalParticles = paths.length * particlesPerLine;
    enableFluidRendering(totalParticles);
    if (spsMesh) spsMesh.setEnabled(false);
  }

  // Animation
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (paths.length === 0) return;

    const U = currentParams.uFreestream;
    const speed = U * 0.15;
    const totalParticles = paths.length * particlesPerLine;
    const isWater = currentParams.fluid === 'water';

    for (let i = 0; i < totalParticles; i++) {
      phases[i] = (phases[i] + speed * dt) % 1.0;
      const lineIdx = Math.floor(i / particlesPerLine);
      if (lineIdx >= paths.length) continue;

      const t = phases[i];
      const [x, y, z] = samplePath(paths[lineIdx], t);

      // Update fluid renderer position buffer (water mode)
      if (isWater && fluidPositions.length >= (i + 1) * 3) {
        const off = i * 3;
        fluidPositions[off] = x;
        fluidPositions[off + 1] = y;
        fluidPositions[off + 2] = z;
      }

      // Update SPS particles (air mode)
      if (!isWater && sps && spsMesh) {
        const p = sps.particles[i];
        p.position.set(x, y, z);

        const [cr, cg, cb] = PARTICLE_COLOR;
        const fadeIn = Math.min(t * 8.0, 1.0);
        const fadeOut = Math.min((1.0 - t) * 8.0, 1.0);
        if (!p.color) {
          p.color = new Color4(cr, cg, cb, fadeIn * fadeOut);
        } else {
          p.color.r = cr; p.color.g = cg; p.color.b = cb;
          p.color.a = fadeIn * fadeOut;
        }
      }
    }

    // Update fluid renderer buffers each frame
    if (isWater && fluidCustomParticles) {
      fluidCustomParticles.addBuffers({ position: fluidPositions });
      fluidCustomParticles.setNumParticles(totalParticles);
    }

    if (!isWater && sps && spsMesh) {
      sps.setParticles();
    }
  });

  function rebuild(params: SimParams) {
    currentParams = { ...params };
    applyFluidTheme();
    streamlineData = computeStreamlines3D({ ...currentParams, numStreamlines: STREAMLINE_GRID * STREAMLINE_GRID });
    paths = buildPathLookup(streamlineData);
    createSphere();
    initParticlePhases();
    buildSPS();
    updatePressureViz();

    const isWater = currentParams.fluid === 'water';
    const totalParticles = paths.length * particlesPerLine;

    if (isWater) {
      // Enable fluid rendering, hide SPS and sphere
      enableFluidRendering(totalParticles);
      if (spsMesh) spsMesh.setEnabled(false);
    } else {
      // Disable fluid rendering, show SPS
      disableFluidRendering();
      if (spsMesh) spsMesh.setEnabled(true);
    }
  }

  return { scene, rebuild };
}
