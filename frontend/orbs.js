// About: the team as three balls of coloured liquid glass (after a set of record sleeves with
// glowing spheres on pale grey), one above each person's name, drawn on the graphics card (WebGL2).
// Each ball stays where it is, but it's alive: its outline wobbles like jelly, drops pull away
// from it, drift out and flow back in to merge, and its colours flow round inside it like
// liquid, in marbled bands, bent towards the rim as through glass. It's lit like a glass sphere by
// a light that wanders freely round it, so its sheen, highlight and coloured glint glide over the
// glass; with a crisp edge, a thin rainbow fringe and a faint shadow of its colour.
// - Where each ball sits and how big: the empty square above each name (.orb-spot), so the page's
//   CSS lays them out (three across, or one above another on a phone).
// - Each ball's colours: five, from light to dark and back to an accent (PALETTES below).
// - The canvas covers the whole window and is see-through: only the balls and their glow are
//   drawn, so the page's own white shows everywhere else, and no glow is cut off at an edge.
// - As sharp as the screen allows (up to 2 pixels per CSS pixel).
// - Reduced motion: the balls stand still. Without WebGL2: still CSS gradients (styles.css).
(function () {
  var stage = document.querySelector("[data-orbs]");
  if (!stage) return;
  var canvas = stage.querySelector(".orbs-canvas");
  var spots = stage.querySelectorAll(".orb-spot");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Navy, teal and purple; orange, red and purple; blue and violet
  var PALETTES = [
    ["#e6e1f0", "#3f8f95", "#0e2433", "#45307e", "#c06fb0"],
    ["#ffd8a0", "#ff9a3c", "#ff4e1f", "#b0204f", "#5a2aa0"],
    ["#f3eeff", "#b9a6ff", "#6f86ff", "#3d3dd8", "#d07bff"]
  ];
  var SIZE = 0.36;         // each ball's radius, as a share of its square
  var SPEED = 1;           // how fast it all moves (1 = as written)

  var gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) { stage.classList.add("is-flat"); return; }

  var FRAGMENT = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 u_res; uniform float u_time; uniform vec3 u_orb[3]; uniform vec3 u_pal[15];",
    "out vec4 o;",
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);",
    "}",
    "float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }",
    // A ball's colours: its five, joined smoothly
    "vec3 palette(int k, float x) {",
    "  x = clamp(x, 0.0, 1.0) * 4.0;",
    "  int i = int(floor(x)); float f = fract(x); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(u_pal[k * 5 + min(i, 4)], u_pal[k * 5 + min(i + 1, 4)], f);",
    "}",
    // Rounded join of two shapes (the drops flowing into the ball)
    "float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }",
    // A ball's shape, as distance to its surface (in its own radius): the jelly-edged ball, and
    // three drops that pull away from it, drift out, and flow back in to merge
    "float shape(vec2 d, float s, float t) {",
    "  float r = length(d), ang = atan(d.y, d.x);",
    "  float wob = 0.026 * sin(3.0 * ang + t * 1.1 + s) + 0.018 * sin(5.0 * ang - t * 1.5 + s * 2.0)",
    "    + 0.015 * sin(2.0 * ang + t * 0.7 + s * 3.0)",
    "    + 0.03 * (fbm(vec2(cos(ang), sin(ang)) * 1.5 + t * 0.25 + s) - 0.5);",
    "  float sd = r - (1.0 + wob);",
    "  for (int j = 0; j < 3; j++) {",
    "    float fj = float(j);",
    "    float a = s * 3.0 + fj * 2.1 + t * 0.15 + 0.5 * sin(t * 0.3 + fj * 1.7 + s);",
    "    float out_ = 0.5 - 0.5 * cos(t * (0.45 + 0.13 * fj) + fj * 2.4 + s * 1.3);",
    "    out_ = out_ * out_ * (3.0 - 2.0 * out_);",
    "    float size = 0.1 + 0.05 * sin(t * 0.7 + fj * 3.1 + s);",
    "    vec2 at = vec2(cos(a), sin(a)) * (0.82 + 0.78 * out_);",
    "    sd = smin(sd, length(d - at) - size, 0.22);",
    "  }",
    "  return sd;",
    "}",
    "void main() {",
    "  vec2 px = gl_FragCoord.xy;",
    "  vec3 col = vec3(1.0);",
    "  float cover = 0.0;",
    "  float t = u_time;",
    "  for (int k = 0; k < 3; k++) {",
    "    vec3 orb = u_orb[k];",
    "    float s = float(k) * 2.17 + 0.7;",
    "    vec2 d = (px - orb.xy) / orb.z;",
    "    float r = length(d);",
    "    if (r > 2.4) continue;",
    "    float ang = atan(d.y, d.x);",
    "    float sd = shape(d, s, t);",
    // A crisp, smooth edge: about a pixel and a half of softening, whatever the ball's size
    "    float aa = 1.5 / orb.z;",
    "    float body = 1.0 - smoothstep(-aa, aa, sd);",
    // Which way the surface faces, from how the shape changes nearby; deeper inside faces you more
    "    float eps = 2.0 / orb.z;",
    "    vec2 grad = vec2(shape(d + vec2(eps, 0.0), s, t) - sd, shape(d + vec2(0.0, eps), s, t) - sd) / eps;",
    "    float depth = 1.0 + min(sd, 0.0);",
    "    float z = sqrt(max(0.0, 1.0 - depth * depth));",
    // (towards the middle, the plain sphere's way out; near the edge, the wobbling shape's and the
    // drops', which near the very middle would swing wildly)
    "    vec2 out_ = normalize(mix(d + 1e-5, normalize(grad + 1e-5), smoothstep(0.55, 0.9, r)));",
    "    vec3 n = normalize(vec3(out_ * sqrt(1.0 - z * z), z));",
    // The light wanders freely round each ball, so its sheen and highlight glide over the glass
    "    vec3 light = normalize(vec3(",
    "      0.85 * sin(t * 0.37 + s * 1.3) + 0.3 * sin(t * 0.91 + s),",
    "      0.85 * cos(t * 0.29 + s * 2.1) + 0.3 * cos(t * 0.73 + s * 0.5),",
    "      0.7 + 0.25 * sin(t * 0.5 + s)));",
    // Inside: the colours flowing round like liquid, bent more towards the rim as through glass,
    // with marbled bands winding through them
    "    vec2 bent = d + n.xy * 0.35 * (1.0 - z);",
    "    vec2 q = bent + 0.45 * vec2(fbm(bent * 0.8 + vec2(t * 0.1, s)), fbm(bent * 0.8 + vec2(s, -t * 0.08))) - 0.225;",
    "    vec2 way = vec2(cos(s + t * 0.06), sin(s + t * 0.06));",
    "    float swirl = fbm(q * 1.4 + vec2(-t * 0.07, t * 0.05) + s);",
    "    float g = dot(q, way) * 0.5 + 0.5 + 0.16 * (swirl - 0.5) + 0.05 * sin(swirl * 18.0 + t * 0.6);",
    "    vec3 inner = palette(k, g);",
    "    float bands = 0.5 + 0.5 * sin(swirl * 26.0 - t * 0.5 + dot(q, way) * 6.0);",
    "    inner *= 0.9 + 0.12 * bands;",
    // Lit like glass by that moving light: shaded away from it, a bright rim, a coloured glint
    // on the side opposite the light, a broad sheen and a softer highlight
    "    inner *= 0.8 + 0.26 * max(dot(n, light), 0.0);",
    "    float rim = pow(1.0 - z, 3.0);",
    "    inner = mix(inner, vec3(1.0), rim * 0.4);",
    "    vec3 fringe = 0.55 + 0.45 * cos(6.283 * (ang / 6.283 + t * 0.03 + vec3(0.0, 0.33, 0.67)) + s);",
    "    inner += fringe * pow(1.0 - z, 2.0) * max(dot(n.xy, -light.xy), 0.0) * 0.3;",
    "    vec3 mirror = reflect(-light, n);",
    "    float sheen = pow(max(mirror.z, 0.0), 5.0) * 0.2;",
    "    float spark = pow(max(mirror.z, 0.0), 36.0) * 0.55;",
    "    inner += vec3(sheen + spark);",
    // Round the edge: a thin rainbow fringe just outside, and a faint shadow of its own colour
    "    float ring = exp(-pow((sd - aa) / 0.025, 2.0)) * (1.0 - body);",
    "    float glow = exp(-pow(max(sd, 0.0) / 0.22, 2.0)) * (1.0 - body);",
    "    vec3 glowCol = palette(k, 0.5 + 0.45 * sin(ang + s + t * 0.1));",
    "    col = mix(col, glowCol, glow * 0.12);",
    "    col = mix(col, fringe, ring * 0.35);",
    "    col = mix(col, clamp(inner, 0.0, 1.0), body);",
    "    cover = max(cover, max(body, glow * 0.4));",
    "  }",
    // A light film grain over the balls and their glow
    "  col += (hash(px + fract(t * 7.3) * 100.0) - 0.5) * 0.02 * cover;",
    "  col = clamp(col, 0.0, 1.0);",
    // See-through: what's drawn is this colour laid over white, given as the least coverage that
    // gives it, so where it's white nothing is drawn at all and the page shows through
    "  float a = 1.0 - min(min(col.r, col.g), col.b);",
    "  o = vec4(col - (1.0 - a), a);",
    "}"
  ].join("\n");

  var VERTEX = "#version 300 es\nin vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }";

  function shader(type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  // One triangle that covers the whole canvas
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var where = gl.getAttribLocation(program, "a");
  gl.enableVertexAttribArray(where);
  gl.vertexAttribPointer(where, 2, gl.FLOAT, false, 0, 0);
  var u = {
    res: gl.getUniformLocation(program, "u_res"),
    time: gl.getUniformLocation(program, "u_time"),
    orb: gl.getUniformLocation(program, "u_orb"),
    pal: gl.getUniformLocation(program, "u_pal")
  };
  var colours = [];
  PALETTES.forEach(function (list) {
    list.forEach(function (hex) {
      var n = parseInt(hex.slice(1), 16);
      colours.push((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
    });
  });
  gl.uniform3fv(u.pal, colours);

  // The canvas is the window; the balls follow their squares (each frame, so scrolling on a phone
  // carries them along)
  var dpr = 1, orbs = new Float32Array(9);
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.res, canvas.width, canvas.height);
  }
  function place() {
    spots.forEach(function (spot, i) {
      if (i > 2) return;
      var r = spot.getBoundingClientRect();
      orbs[i * 3] = (r.left + r.width / 2) * dpr;
      orbs[i * 3 + 1] = canvas.height - (r.top + r.height / 2) * dpr;
      orbs[i * 3 + 2] = r.width * SIZE * dpr;
    });
    gl.uniform3fv(u.orb, orbs);
  }

  var start = performance.now(), running = false, visible = true;
  function draw(now) {
    place();
    gl.uniform1f(u.time, still ? 12 : (now - start) / 1000 * SPEED);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    if (!running) return;
    draw(now);
    requestAnimationFrame(loop);
  }
  function run(on) {
    if (still) { if (on) requestAnimationFrame(draw); return; }
    if (on === running) return;
    running = on;
    if (on) requestAnimationFrame(loop);
  }

  layout();
  run(true);
  window.addEventListener("resize", function () { layout(); if (still) run(true); });
  if (still) window.addEventListener("scroll", function () { run(true); }, { passive: true });
  document.addEventListener("visibilitychange", function () { run(visible && !document.hidden); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      run(visible && !document.hidden);
    }).observe(stage);
  }
})();
