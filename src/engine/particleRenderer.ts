import shaderCode from './particle.wgsl?raw';

const MAX_PARTICLES = 4096;

export function createParticleRenderer(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
) {
  const shaderModule = device.createShaderModule({ code: shaderCode });

  // Uniform buffer: domain_min(2f), domain_max(2f), particle_size(1f), pad(1f) = 24 bytes
  const uniformBuffer = device.createBuffer({
    size: 32, // round up to 32 for alignment
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new Float32Array([-4, -3, 8, 3, 0.012, 0]);
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
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
        // Quad geometry (per-vertex)
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [
            { format: 'float32x2' as GPUVertexFormat, offset: 0, shaderLocation: 0 },
          ],
        },
        // Instance data: [x, y, alpha] per particle
        {
          arrayStride: 12, // 3 x f32
          stepMode: 'instance',
          attributes: [
            { format: 'float32x2' as GPUVertexFormat, offset: 0, shaderLocation: 1 }, // pos
            { format: 'float32' as GPUVertexFormat, offset: 8, shaderLocation: 2 },   // alpha
          ],
        },
      ],
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
    primitive: { topology: 'triangle-list' },
  });

  // Quad geometry: two triangles forming a [-1,1] square
  const quadVerts = new Float32Array([
    -1, -1,   1, -1,   1,  1,
    -1, -1,   1,  1,  -1,  1,
  ]);

  const vertexBuffer = device.createBuffer({
    size: quadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, quadVerts);

  // Instance buffer — large enough for MAX_PARTICLES * 3 floats
  const instanceBuffer = device.createBuffer({
    size: MAX_PARTICLES * 12,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  let instanceCount = 0;

  function updateInstances(data: Float32Array, count: number) {
    instanceCount = count;
    if (count > 0) {
      device.queue.writeBuffer(instanceBuffer, 0, data, 0, count * 3);
    }
  }

  function render(pass: GPURenderPassEncoder) {
    if (instanceCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.draw(6, instanceCount);
  }

  return { render, updateInstances };
}
