// Arrow (diamond) instanced renderer

struct Uniforms {
  domain_min: vec2f,
  domain_max: vec2f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
};

@vertex
fn vs(
  @location(0) local_pos: vec2f,     // diamond vertex (local space)
  @location(1) instance_pos: vec2f,   // center x, y (world space)
  @location(2) instance_angle: f32,   // rotation angle (radians)
) -> VSOut {
  var out: VSOut;

  // Rotate local vertex by angle
  let c = cos(instance_angle);
  let s = sin(instance_angle);
  let rotated = vec2f(
    local_pos.x * c - local_pos.y * s,
    local_pos.x * s + local_pos.y * c,
  );

  // World position
  let world = instance_pos + rotated;

  // Map to clip space
  let ndc = (world - u.domain_min) / (u.domain_max - u.domain_min) * 2.0 - 1.0;
  out.pos = vec4f(ndc.x, ndc.y, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4f {
  // Same blue as streamlines: #1f77b4
  return vec4f(0.122, 0.467, 0.706, 1.0);
}
