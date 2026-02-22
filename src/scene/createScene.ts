import { createSphereRenderer } from '../engine/render';
import { createStreamlineRenderer } from '../engine/streamlineRenderer';
import { createArrowRenderer } from '../engine/arrowRenderer';
import { computeStreamlines } from '../streamlines/compute';

export function createScene(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
  canvas: HTMLCanvasElement,
) {
  // Compute streamlines on CPU
  const streamlineData = computeStreamlines();

  // Create renderers
  const streamlines = createStreamlineRenderer(device, canvasFormat, streamlineData);
  const arrows = createArrowRenderer(device, canvasFormat, streamlineData);
  const sphere = createSphereRenderer(device, canvasFormat);

  function render(targetView: GPUTextureView) {
    // Update sphere uniforms with current canvas size
    sphere.updateUniforms({
      resolution: [canvas.width, canvas.height],
      domainMin: [-4, -3],
      domainMax: [8, 3],
      sphereCenter: [0, 0],
      sphereRadius: 1.0,
    });

    const encoder = device.createCommandEncoder();

    // Single render pass: white background, then streamlines, arrows, sphere on top
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 1, g: 1, b: 1, a: 1 }, // white background
      }],
    });

    // Draw streamlines first
    streamlines.render(pass);

    // Draw arrow markers
    arrows.render(pass);

    // Draw sphere on top (white fill occludes streamlines inside sphere)
    sphere.render(pass);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { render };
}
