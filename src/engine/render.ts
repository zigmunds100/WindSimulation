import shaderCode from './render.wgsl?raw';

export interface RenderUniforms {
  resolution: [number, number];
  domainMin: [number, number];
  domainMax: [number, number];
  sphereCenter: [number, number];
  sphereRadius: number;
}

export function createSphereRenderer(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
) {
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const uniformBuffer = device.createBuffer({
    size: 48, // 10 floats + padding → 48 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
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
    vertex: { module: shaderModule, entryPoint: 'vs' },
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

  function updateUniforms(u: RenderUniforms) {
    const data = new Float32Array([
      u.resolution[0], u.resolution[1],
      u.domainMin[0], u.domainMin[1],
      u.domainMax[0], u.domainMax[1],
      u.sphereCenter[0], u.sphereCenter[1],
      u.sphereRadius, 0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function render(pass: GPURenderPassEncoder) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
  }

  return { updateUniforms, render };
}
