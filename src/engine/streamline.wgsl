// Streamline line-strip renderer

struct Uniforms {
  domain_min: vec2f,
  domain_max: vec2f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
};

@vertex
fn vs(@location(0) position: vec2f) -> VSOut {
  var out: VSOut;
  // Map world coords to clip space [-1, 1]
  let ndc = (position - u.domain_min) / (u.domain_max - u.domain_min) * 2.0 - 1.0;
  // Flip Y for standard orientation (y up)
  out.pos = vec4f(ndc.x, ndc.y, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4f {
  // Faint guide lines (particles are the main visual)
  return vec4f(0.7, 0.82, 0.92, 0.35);
}
