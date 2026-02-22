import shaderCode from './streamline.wgsl?raw';
import type { StreamlineData } from '../streamlines/compute';

export function createStreamlineRenderer(
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
      buffers: [{
        arrayStride: 8, // 2 x f32
        attributes: [
          { format: 'float32x2' as GPUVertexFormat, offset: 0, shaderLocation: 0 },
        ],
      }],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs',
      targets: [{
        format: canvasFormat,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        },
      }],
    },
    primitive: { topology: 'line-strip' },
  });

  // Upload vertex data
  const vertexBuffer = device.createBuffer({
    size: data.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, data.vertices.buffer);

  function render(pass: GPURenderPassEncoder) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);

    // Draw each streamline segment separately (line-strip needs separate draws)
    for (const seg of data.segments) {
      pass.draw(seg.count, 1, seg.offset, 0);
    }
  }

  return { render };
}
