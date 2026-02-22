import { createSphereRenderer } from '../engine/render';
import { createStreamlineRenderer } from '../engine/streamlineRenderer';
import { createArrowRenderer } from '../engine/arrowRenderer';
import { createParticleRenderer } from '../engine/particleRenderer';
import { computeStreamlines, DEFAULT_PARAMS, type SimParams, type StreamlineData } from '../streamlines/compute';

const PARTICLES_PER_LINE = 12;

/** Build a lookup table for quick arc-length interpolation along each streamline */
function buildPathLookup(data: StreamlineData) {
  const paths: Array<{ xs: Float64Array; ys: Float64Array; cumLen: Float64Array; totalLen: number }> = [];

  for (const seg of data.segments) {
    const count = seg.count;
    if (count < 2) continue;

    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    const cumLen = new Float64Array(count);

    for (let i = 0; i < count; i++) {
      const idx = (seg.offset + i) * 2;
      xs[i] = data.vertices[idx];
      ys[i] = data.vertices[idx + 1];
      if (i > 0) {
        const dx = xs[i] - xs[i - 1];
        const dy = ys[i] - ys[i - 1];
        cumLen[i] = cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy);
      }
    }

    paths.push({ xs, ys, cumLen, totalLen: cumLen[count - 1] });
  }

  return paths;
}

/** Interpolate position along a path at normalized t (0..1) */
function samplePath(
  path: { xs: Float64Array; ys: Float64Array; cumLen: Float64Array; totalLen: number },
  t: number,
): [number, number] {
  const dist = t * path.totalLen;
  const n = path.cumLen.length;

  // Binary search for the segment
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.cumLen[mid] <= dist) lo = mid;
    else hi = mid;
  }

  const segLen = path.cumLen[hi] - path.cumLen[lo];
  const frac = segLen > 0 ? (dist - path.cumLen[lo]) / segLen : 0;

  const x = path.xs[lo] + frac * (path.xs[hi] - path.xs[lo]);
  const y = path.ys[lo] + frac * (path.ys[hi] - path.ys[lo]);
  return [x, y];
}

export function createScene(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
  canvas: HTMLCanvasElement,
) {
  let currentParams = { ...DEFAULT_PARAMS };

  // Compute streamlines on CPU
  let streamlineData = computeStreamlines(currentParams);

  // Create renderers
  let streamlineRenderer = createStreamlineRenderer(device, canvasFormat, streamlineData);
  let arrowRenderer = createArrowRenderer(device, canvasFormat, streamlineData);
  const particleRenderer = createParticleRenderer(device, canvasFormat);
  const sphere = createSphereRenderer(device, canvasFormat);

  // Particle state: phases[i] ∈ [0,1) for each particle
  let paths = buildPathLookup(streamlineData);
  let phases: Float64Array;
  const instanceData = new Float32Array(4096 * 3); // [x, y, alpha] per particle

  function initParticlePhases() {
    const totalParticles = paths.length * PARTICLES_PER_LINE;
    phases = new Float64Array(totalParticles);
    for (let i = 0; i < totalParticles; i++) {
      // Spread particles evenly with some randomness
      const lineIdx = Math.floor(i / PARTICLES_PER_LINE);
      const pIdx = i % PARTICLES_PER_LINE;
      phases[i] = (pIdx / PARTICLES_PER_LINE + (lineIdx * 0.037)) % 1.0;
    }
  }
  initParticlePhases();

  function rebuild(params: SimParams) {
    currentParams = { ...params };
    streamlineData = computeStreamlines(currentParams);
    streamlineRenderer = createStreamlineRenderer(device, canvasFormat, streamlineData);
    arrowRenderer = createArrowRenderer(device, canvasFormat, streamlineData);
    paths = buildPathLookup(streamlineData);
    initParticlePhases();
  }

  function updateParticles(dt: number) {
    const speed = currentParams.uFreestream * 0.15; // normalized speed
    const count = paths.length * PARTICLES_PER_LINE;
    let written = 0;

    for (let lineIdx = 0; lineIdx < paths.length; lineIdx++) {
      const path = paths[lineIdx];
      for (let p = 0; p < PARTICLES_PER_LINE; p++) {
        const i = lineIdx * PARTICLES_PER_LINE + p;
        phases[i] = (phases[i] + speed * dt) % 1.0;

        const t = phases[i];
        const [x, y] = samplePath(path, t);

        // Fade in at start, fade out at end
        const fadeIn = Math.min(t * 8.0, 1.0);
        const fadeOut = Math.min((1.0 - t) * 8.0, 1.0);
        const alpha = fadeIn * fadeOut;

        instanceData[written * 3] = x;
        instanceData[written * 3 + 1] = y;
        instanceData[written * 3 + 2] = alpha;
        written++;
      }
    }

    particleRenderer.updateInstances(instanceData, written);
  }

  function render(targetView: GPUTextureView, dt: number) {
    // Update particle positions
    updateParticles(dt);

    // Update sphere uniforms with current canvas size
    sphere.updateUniforms({
      resolution: [canvas.width, canvas.height],
      domainMin: [-4, -3],
      domainMax: [8, 3],
      sphereCenter: [0, 0],
      sphereRadius: currentParams.sphereRadius,
    });

    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
      }],
    });

    // Draw animated particles
    particleRenderer.render(pass);

    // Draw sphere on top (white fill occludes everything inside sphere)
    sphere.render(pass);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { render, rebuild };
}
