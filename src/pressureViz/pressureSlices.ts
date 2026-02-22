import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { PressureUniforms } from './pressureModel';

const SLICES_SHADER = 'pressureSliceShader';

function registerShaders() {
  if (Effect.ShadersStore[`${SLICES_SHADER}VertexShader`]) return;

  Effect.ShadersStore[`${SLICES_SHADER}VertexShader`] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
void main(void){
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

  Effect.ShadersStore[`${SLICES_SHADER}FragmentShader`] = `
precision highp float;
varying vec3 vWorldPos;
uniform vec3 center;
uniform vec3 flowDir;
uniform float sphereRadius;
uniform float uFreestream;
uniform float thetaSepRad;
uniform float cpWakeBase;
uniform float wakeStrength;
uniform float wakeSigma;
uniform float wakeLength;
uniform float contours;

vec3 cpColor(float cp){
  float t = clamp((cp + 1.1) / 2.1, 0.0, 1.0);
  vec3 low = vec3(0.03, 0.2, 0.7);
  vec3 mid = vec3(0.92, 0.92, 0.95);
  vec3 high = vec3(0.8, 0.15, 0.1);
  vec3 c = t < 0.5 ? mix(low, mid, t * 2.0) : mix(mid, high, (t - 0.5) * 2.0);

  if (contours > 0.5) {
    float bands = 13.0;
    float edge = abs(fract(t * bands) - 0.5);
    c *= 0.88 + 0.25 * smoothstep(0.48, 0.5, edge);
  }
  return c;
}

vec3 potentialVelocity(vec3 rel){
  float r2 = dot(rel, rel);
  float r = sqrt(r2);
  if (r < sphereRadius * 1.001) return vec3(0.0);

  vec3 e = normalize(flowDir);
  float cosTheta = dot(rel, e) / max(r, 1e-5);
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));

  float a3r3 = pow(sphereRadius / r, 3.0);
  float ur = uFreestream * cosTheta * (1.0 - a3r3);
  float ut = -uFreestream * sinTheta * (1.0 + 0.5 * a3r3);

  vec3 er = rel / r;
  vec3 et = normalize(e - cosTheta * er);
  if (length(et) < 1e-4) et = vec3(0.0);

  return ur * er + ut * et;
}

float cpWakeDeficit(vec3 rel){
  float z = dot(rel, flowDir);
  vec3 perp = rel - z * flowDir;
  float rPerp = length(perp);
  if (z <= sphereRadius) return 0.0;

  float core = exp(-(rPerp * rPerp) / (2.0 * wakeSigma * wakeSigma));
  float axial = exp(-(z - sphereRadius) / max(wakeLength, 1e-3));

  float theta = atan(perp.z, perp.y);
  float vort = 0.08 * sin(theta * 2.0 + 2.8 * z / sphereRadius) * core * axial;
  return -wakeStrength * core * axial + vort;
}

void main(void){
  vec3 rel = vWorldPos - center;
  float r = length(rel);
  if (r < sphereRadius * 1.001) discard;

  vec3 vel = potentialVelocity(rel);
  float cp = 1.0 - dot(vel, vel) / max(uFreestream * uFreestream, 1e-5);

  float z = dot(rel, flowDir);
  float cosTheta = clamp(dot(normalize(rel), -flowDir), -1.0, 1.0);
  float theta = acos(cosTheta);
  float rearBlend = smoothstep(thetaSepRad - 0.2, min(thetaSepRad + 0.45, 3.14159), theta);
  cp = mix(cp, cpWakeBase, rearBlend * smoothstep(0.0, sphereRadius * 0.75, z + sphereRadius * 0.2));

  cp += cpWakeDeficit(rel);

  float alpha = 0.42;
  gl_FragColor = vec4(cpColor(cp), alpha);
}`;
}

export class PressureSlicesViz {
  private material: ShaderMaterial;
  private slices: Mesh[] = [];

  constructor(scene: Scene) {
    registerShaders();
    this.material = new ShaderMaterial('pressureSlicesMat', scene, { vertex: SLICES_SHADER, fragment: SLICES_SHADER }, {
      attributes: ['position'],
      uniforms: ['world', 'worldViewProjection', 'center', 'flowDir', 'sphereRadius', 'uFreestream', 'thetaSepRad', 'cpWakeBase', 'wakeStrength', 'wakeSigma', 'wakeLength', 'contours'],
      needAlphaBlending: true,
    });
    this.material.backFaceCulling = false;
    this.material.alpha = 0.55;

    this.slices = this.createSlices(scene);
    this.setEnabled(true);
  }

  private createSlices(scene: Scene): Mesh[] {
    const size = 10;
    const yz = MeshBuilder.CreatePlane('pressureSliceYZ', { size }, scene);
    yz.rotation.y = Math.PI / 2;

    const xz = MeshBuilder.CreatePlane('pressureSliceXZ', { size }, scene);
    xz.rotation.x = Math.PI / 2;

    const xzOffset = MeshBuilder.CreatePlane('pressureSliceXZOffset', { size }, scene);
    xzOffset.rotation.x = Math.PI / 2;
    xzOffset.position.y = 1.2;

    return [yz, xz, xzOffset].map((m) => {
      m.material = this.material;
      m.isPickable = false;
      return m;
    });
  }

  setEnabled(enabled: boolean) {
    for (const s of this.slices) s.setEnabled(enabled);
  }

  update(uniforms: PressureUniforms) {
    this.material.setVector3('center', uniforms.center);
    this.material.setVector3('flowDir', uniforms.flowDir);
    this.material.setFloat('sphereRadius', uniforms.sphereRadius);
    this.material.setFloat('uFreestream', uniforms.uFreestream);
    this.material.setFloat('thetaSepRad', uniforms.thetaSepRad);
    this.material.setFloat('cpWakeBase', uniforms.cpWakeBase);
    this.material.setFloat('wakeStrength', uniforms.wakeStrength);
    this.material.setFloat('wakeSigma', uniforms.wakeSigma);
    this.material.setFloat('wakeLength', uniforms.wakeLength);
    this.material.setFloat('contours', uniforms.contours);

    const offset = this.slices[2];
    if (offset) offset.position.y = uniforms.sphereRadius * 0.9;
  }
}
