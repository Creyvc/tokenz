// About: the team as three soft, iridescent balls (after a set of record sleeves with glowing
// spheres on pale grey), one above each person's name, drawn on the graphics card (WebGL2).
// Each ball stays where it is, but it's alive: its outline wobbles like jelly, its colours flow
// slowly round inside it like liquid, and its edge glows, with a thin rainbow fringe and a faint
// halo of its own colour, with a fine film grain on it.
// - Where each ball sits and how big: the empty square above each name (.orb-spot), so the page's
//   CSS lays them out (three across, or one above another on a phone).
// - Each ball's colours: five, from light to dark and back to an accent (PALETTES below).
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

  var gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
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
    "    if (r > 2.6) continue;",
    "    float ang = atan(d.y, d.x);",
    // The jelly outline: a few slow waves round the edge, and a little wandering noise
    "    float wob = 0.026 * sin(3.0 * ang + t * 1.1 + s) + 0.018 * sin(5.0 * ang - t * 1.5 + s * 2.0)",
    "      + 0.015 * sin(2.0 * ang + t * 0.7 + s * 3.0)",
    "      + 0.03 * (fbm(vec2(cos(ang), sin(ang)) * 1.5 + t * 0.25 + s) - 0.5);",
    "    float edge = 1.0 + wob;",
    "    float body = 1.0 - smoothstep(edge - 0.09, edge + 0.06, r);",
    // Inside: its colours flowing round, warped by slow swirls
    "    vec2 q = d + 0.4 * vec2(fbm(d * 1.3 + vec2(t * 0.12, s)), fbm(d * 1.3 + vec2(s, -t * 0.1))) - 0.2;",
    "    vec2 way = vec2(cos(s + t * 0.06), sin(s + t * 0.06));",
    "    float g = dot(q, way) * 0.5 + 0.5 + 0.3 * (fbm(q * 1.8 - t * 0.08 + s) - 0.5);",
    "    vec3 inner = palette(k, g);",
    "    inner = mix(inner, inner * 0.82, smoothstep(0.3, 1.0, r) * 0.35);",
    // Round the edge: a thin rainbow fringe, then a soft halo of its own colour fading out
    "    float ring = exp(-pow((r - edge) / 0.07, 2.0));",
    "    vec3 fringe = 0.55 + 0.45 * cos(6.283 * (ang / 6.283 + t * 0.03 + vec3(0.0, 0.33, 0.67)) + s);",
    "    float glow = exp(-pow(max(r - edge, 0.0) / 0.38, 2.0)) * (1.0 - body);",
    "    vec3 glowCol = palette(k, 0.5 + 0.45 * sin(ang + s + t * 0.1));",
    "    col = mix(col, glowCol, glow * 0.22);",
    "    col = mix(col, fringe, ring * 0.3 * (1.0 - body * 0.6));",
    "    col = mix(col, inner, body);",
    "    cover = max(cover, max(body, glow * 0.6));",
    "  }",
    // A fine film grain over the balls and their glow (not the white round them, which it would grey)
    "  col += (hash(px + fract(t * 7.3) * 100.0) - 0.5) * 0.035 * cover;",
    "  o = vec4(col, 1.0);",
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

  // The balls are soft, so the canvas needn't be sharper than 1.5 pixels per CSS pixel
  var dpr = 1, orbs = new Float32Array(9);
  function layout() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var at = stage.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(at.width * dpr));
    canvas.height = Math.max(1, Math.round(at.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    spots.forEach(function (spot, i) {
      if (i > 2) return;
      var r = spot.getBoundingClientRect();
      orbs[i * 3] = (r.left + r.width / 2 - at.left) * dpr;
      orbs[i * 3 + 1] = canvas.height - (r.top + r.height / 2 - at.top) * dpr;
      orbs[i * 3 + 2] = r.width * SIZE * dpr;
    });
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform3fv(u.orb, orbs);
  }

  var start = performance.now(), running = false, visible = true;
  function draw(now) {
    gl.uniform1f(u.time, still ? 12 : (now - start) / 1000 * SPEED);
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
  new ResizeObserver(function () { layout(); if (still) run(true); }).observe(stage);
  document.addEventListener("visibilitychange", function () { run(visible && !document.hidden); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      run(visible && !document.hidden);
    }).observe(stage);
  }
})();
