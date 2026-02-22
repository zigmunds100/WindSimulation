import shaderCode from './arrow.wgsl?raw';
import type { StreamlineData } from '../streamlines/compute';

const ARROW_SIZE = 0.08;

export function createArrowRenderer(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
  data: StreamlineData,
) {
  const shaderModule = device.createShaderModule({ code: shaderCode });

  // Uniform buffer: domain_min (2f), domain_max (2f) = 16 bytes
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array([-4, -3, 8, 3]);
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs',
      buffers: [
        // Diamond geometry (per-vertex)
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [
            { format: 'float32x2' as GPUVertexFormat, offset: 0, shaderLocation: 0 },
          ],
        },
        // Instance data: [cx, cy, angle] - split into two attributes
        {
          arrayStride: 12, // 3 x f32
          stepMode: 'instance',
          attributes: [
            { format: 'float32x2' as GPUVertexFormat, offset: 0, shaderLocation: 1 }, // pos
            { format: 'float32' as GPUVertexFormat, offset: 8, shaderLocation: 2 },   // angle
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs',
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Diamond geometry: 4 points, 2 triangles (6 indices as triangle-list)
  // Diamond shape: top, right, bottom, left
  const s = ARROW_SIZE;
  const diamondVerts = new Float32Array([
    // Triangle 1: top, right, bottom
    0, s,     // top
    s * 0.5, 0,   // right
    0, -s,    // bottom
    // Triangle 2: top, bottom, left
    0, s,     // top
    0, -s,    // bottom
    -s * 0.5, 0,  // left
  ]);

  const vertexBuffer = device.createBuffer({
    size: diamondVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, diamondVerts);

  // Instance buffer from arrow data
  const instanceCount = data.arrows.length / 3;
  const instanceBuffer = device.createBuffer({
    size: Math.max(data.arrows.byteLength, 12), // at least 12 bytes
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  if (data.arrows.length > 0) {
    device.queue.writeBuffer(instanceBuffer, 0, data.arrows.buffer);
  }

  function render(pass: GPURenderPassEncoder) {
    if (instanceCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.draw(6, instanceCount); // 6 vertices per diamond, N instances
  }

  return { render };
}
