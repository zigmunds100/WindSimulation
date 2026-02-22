// Sphere renderer: white fill + orange outline via fullscreen SDF

struct Uniforms {
  resolution: vec2f,
  domain_min: vec2f,
  domain_max: vec2f,
  sphere_center: vec2f,
  sphere_radius: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Fullscreen triangle
  var out: VSOut;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  out.pos = vec4f(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(x, 1.0 - y);
  return out;
}

@fragment
fn fs(inp: VSOut) -> @location(0) vec4f {
  let world = mix(u.domain_min, u.domain_max, inp.uv);

  // SDF in screen-pixel space for correct aspect ratio
  let px_x = (u.domain_max.x - u.domain_min.x) / u.resolution.x;
  let px_y = (u.domain_max.y - u.domain_min.y) / u.resolution.y;
  let corrected_p = vec2f(
    (world.x - u.sphere_center.x) / px_x,
    (world.y - u.sphere_center.y) / px_y,
  );
  let corrected_r = u.sphere_radius / px_x;
  let d_screen = length(corrected_p) - corrected_r;
  let d = d_screen * px_x;
  let px = px_x;

  // Start transparent - only draw sphere pixels
  // White fill
  let fill = 1.0 - smoothstep(-px, px, d);

  // Orange outline: #ff7f0e
  let outlineWidth = 2.0 * px;
  let outline = (1.0 - smoothstep(-px, px, d - outlineWidth)) * smoothstep(-px, px, d + outlineWidth);
  let orangeColor = vec3f(1.0, 0.498, 0.055);

  var color = vec3f(1.0, 1.0, 1.0); // white fill base
  color = mix(color, orangeColor, outline);
  let alpha = max(fill, outline);

  return vec4f(color * alpha, alpha);
}
