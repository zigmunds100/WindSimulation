import './style.css';
import { createScene } from './scene/createScene';
import { createAxes } from './ui/axes';

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

  // Create axes overlay
  createAxes();

  // Initial render
  function renderFrame() {
    const textureView = context.getCurrentTexture().createView();
    scene.render(textureView);
  }
  renderFrame();

  // Mark ready immediately (static render, no animation needed)
  window.__simReady = true;

  // Re-render on resize
  window.addEventListener('resize', () => {
    configureCanvas();
    renderFrame();
  });
}

main().catch(console.error);
