import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Color3, Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { PressureUniforms } from './pressureModel';

const SURFACE_SHADER = 'surfacePressureShader';

function registerShaders() {
  if (Effect.ShadersStore[`${SURFACE_SHADER}VertexShader`]) return;

  Effect.ShadersStore[`${SURFACE_SHADER}VertexShader`] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vNormalW;
void main(void){
  vec4 worldPos = world * vec4(position, 1.0);
  vNormalW = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

  Effect.ShadersStore[`${SURFACE_SHADER}FragmentShader`] = `
precision highp float;
varying vec3 vNormalW;
uniform vec3 flowDir;
uniform float thetaSepRad;
uniform float cpWakeBase;
uniform float contours;

vec3 cpColor(float cp){
  float t = clamp((cp + 1.2) / 2.2, 0.0, 1.0);
  vec3 low = vec3(0.05, 0.18, 0.65);
  vec3 mid = vec3(0.85, 0.9, 0.95);
  vec3 hi = vec3(0.75, 0.08, 0.08);
  vec3 c = t < 0.5 ? mix(low, mid, t * 2.0) : mix(mid, hi, (t - 0.5) * 2.0);
  if (contours > 0.5) {
    float bands = 10.0;
    float q = floor(t * bands) / bands;
    c *= 0.88 + 0.12 * smoothstep(0.0, 0.03, abs(fract(t * bands) - 0.5));
    c = mix(c, vec3(q), 0.08);
  }
  return c;
}

void main(void){
  vec3 n = normalize(vNormalW);
  vec3 upstream = -normalize(flowDir);
  float cosTheta = clamp(dot(n, upstream), -1.0, 1.0);
  float theta = acos(cosTheta);
  float cpIdeal = 1.0 - 2.25 * (1.0 - cosTheta * cosTheta);

  float sepBlend = smoothstep(thetaSepRad - 0.2, min(thetaSepRad + 0.35, 3.14159), theta);
  float cp = mix(cpIdeal, cpWakeBase, sepBlend);
  gl_FragColor = vec4(cpColor(cp), 0.96);
}`;
}

export class SurfacePressureViz {
  material: ShaderMaterial;

  constructor(scene: Scene) {
    registerShaders();
    this.material = new ShaderMaterial('surfacePressureMat', scene, { vertex: SURFACE_SHADER, fragment: SURFACE_SHADER }, {
      attributes: ['position', 'normal'],
      uniforms: ['world', 'worldViewProjection', 'flowDir', 'thetaSepRad', 'cpWakeBase', 'contours'],
      needAlphaBlending: false,
    });
    this.material.backFaceCulling = true;
  }

  attachToSphere(mesh: Mesh) {
    mesh.material = this.material;
  }

  setEnabled(mesh: Mesh, enabled: boolean, fallbackColor?: Color3) {
    if (enabled) {
      mesh.material = this.material;
      return;
    }
    if (fallbackColor && mesh.material && 'albedoColor' in mesh.material) {
      (mesh.material as any).albedoColor = fallbackColor;
    }
  }

  update(uniforms: PressureUniforms) {
    this.material.setVector3('flowDir', uniforms.flowDir);
    this.material.setFloat('thetaSepRad', uniforms.thetaSepRad);
    this.material.setFloat('cpWakeBase', uniforms.cpWakeBase);
    this.material.setFloat('contours', uniforms.contours);
  }
}
