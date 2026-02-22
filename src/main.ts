import './style.css';
import { createScene } from './scene/createScene';
import { createAxes } from './ui/axes';
import { createEquations } from './ui/equations';
import { createControls } from './ui/controls';
import { DEFAULT_PARAMS } from './streamlines/compute';

declare global {
  interface Window {
    __simReady: boolean;
  }
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const noWebGPU = document.getElementById('no-webgpu')!;

  if (!navigator.gpu) {
    noWebGPU.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    noWebGPU.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (e) {
    console.error('Device failed at creation.', e);
    noWebGPU.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  function configureCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    context.configure({ device, format, alphaMode: 'premultiplied' });
  }
  configureCanvas();

  const scene = createScene(device, format, canvas);

  // Create axes overlay and equations
  createAxes();
  createEquations();

  // Render helper
  function renderFrame(dt: number) {
    const textureView = context.getCurrentTexture().createView();
    scene.render(textureView, dt);
  }

  // Initial render
  renderFrame(0);

  // Mark ready
  window.__simReady = true;

  // --- UI Controls ---
  let paused = false;

  const controls = createControls({ ...DEFAULT_PARAMS }, {
    onParamChange(params) {
      if (!paused) {
        scene.rebuild(params);
      }
    },
    onReset() {
      scene.rebuild({ ...DEFAULT_PARAMS });
    },
    onPauseToggle(p) {
      paused = p;
    },
  });

  // --- Animation loop with FPS tracking ---
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let lastFrameTime = performance.now();

  function animationLoop() {
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // seconds, capped
    lastFrameTime = now;

    frameCount++;
    if (now - lastFpsTime >= 500) {
      const fps = (frameCount / (now - lastFpsTime)) * 1000;
      controls.updateFPS(fps);
      frameCount = 0;
      lastFpsTime = now;
    }

    if (!paused) {
      renderFrame(dt);
    }

    requestAnimationFrame(animationLoop);
  }
  requestAnimationFrame(animationLoop);

  // Re-render on resize
  window.addEventListener('resize', () => {
    configureCanvas();
    renderFrame(0);
  });
}

main().catch(console.error);
