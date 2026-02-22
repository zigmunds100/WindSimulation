import './style.css';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { createBabylonScene } from './scene/createScene';
import { createEquations } from './ui/equations';
import { createControls } from './ui/controls';
import { DEFAULT_PARAMS } from './streamlines/compute';

declare global {
  interface Window {
    __simReady: boolean;
  }
}

function createEngine(canvas: HTMLCanvasElement): AbstractEngine {
  // Use WebGL2 — FluidRenderer WGSL shaders have bugs in Babylon v8.52,
  // so WebGL2/GLSL is more reliable for screen-space fluid rendering.
  const glEngine = new Engine(canvas, true, { adaptToDeviceRatio: true }, true);
  console.log('Using WebGL2 engine');
  return glEngine;
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const noWebGPU = document.getElementById('no-webgpu')!;

  let engine: AbstractEngine;
  try {
    engine = createEngine(canvas);
  } catch {
    noWebGPU.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  const { scene, rebuild } = createBabylonScene(engine, canvas);

  createEquations();

  // Mark ready
  window.__simReady = true;

  // Controls
  let paused = false;

  const controls = createControls({ ...DEFAULT_PARAMS }, {
    onParamChange(params) {
      if (!paused) rebuild(params);
    },
    onReset() {
      rebuild({ ...DEFAULT_PARAMS });
    },
    onPauseToggle(p) {
      paused = p;
    },
  });

  // FPS tracking
  let frameCount = 0;
  let lastFpsTime = performance.now();

  // Render loop
  engine.runRenderLoop(() => {
    if (!paused) {
      scene.render();
    }

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      const fps = (frameCount / (now - lastFpsTime)) * 1000;
      controls.updateFPS(fps);
      frameCount = 0;
      lastFpsTime = now;
    }
  });

  // Resize handling
  window.addEventListener('resize', () => {
    engine.resize();
  });
}

main().catch(console.error);
