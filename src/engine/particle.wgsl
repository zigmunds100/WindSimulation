// Animated particle instanced renderer (SDF circles)

struct Uniforms {
  domain_min: vec2f,
  domain_max: vec2f,
  particle_size: f32,  // in NDC units
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) alpha: f32,
};

@vertex
fn vs(
  @location(0) quad_pos: vec2f,       // local quad vertex [-1,1]
  @location(1) particle_pos: vec2f,   // world position (instance)
  @location(2) particle_alpha: f32,   // fade (instance)
) -> VSOut {
  var out: VSOut;

  // Map world coords to clip space [-1, 1]
  let ndc = (particle_pos - u.domain_min) / (u.domain_max - u.domain_min) * 2.0 - 1.0;

  // Offset by quad position scaled by particle size
  let final_pos = ndc + quad_pos * u.particle_size;

  out.pos = vec4f(final_pos, 0.0, 1.0);
  out.uv = quad_pos;
  out.alpha = particle_alpha;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let dist = length(in.uv);
  if (dist > 1.0) { discard; }
  // Soft edge
  let edge = smoothstep(1.0, 0.5, dist);
  let a = edge * in.alpha;
  // #1f77b4 blue
  return vec4f(0.122, 0.467, 0.706, a);
}
