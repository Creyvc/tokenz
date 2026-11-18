// About: the team as three balls of coloured liquid glass (after a set of record sleeves with
// glowing spheres on pale grey), one above each person's name, drawn on the graphics card (WebGL2).
// Each ball stays where it is, but it's alive: its outline wobbles like jelly, drops pull away
// from it, drift out and flow back in to merge, and its colours flow round inside it like
// liquid, in marbled bands, bent towards the rim as through glass. It's lit like a glass sphere by
// a light that wanders freely round it, so its sheen, highlight and coloured glint glide over the
// glass; with a crisp edge, a thin rainbow fringe and a faint shadow of its colour. Its surface has
// texture: fine ripples drifting over it that catch the light, and tiny air bubbles inside.
// Hovering a ball breaks it into a cloud of tiny glass beads, each keeping its piece of the
// colours, which spring outwards, overshoot and bounce back a little, then float round it. When
// the pointer leaves, it pulls itself back together like a living goo: a small core forms in the
// middle, shoots a thin, sticky strand out to every bead, and reels them all in, slowly at first
// and then faster, until they splat back into one wobbling ball.
// - Where each ball lives and how big: the empty square above each name (.orb-spot), so the page's
//   CSS lays them out (three across, or one above another on a phone). Each stays in its place,
//   but its shape never rests: big lobes swell and sink round its edge, and it squashes and
//   stretches like jelly along a slowly turning line.
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
  var TEXTURE = 1;         // how strong the glass's ripples and bubbles are (0 = smooth glass)
  var BREAK_TIME = 0.22;   // seconds for a ball to break into beads on hover
  var MERGE_TIME = 0.6;    // seconds for the beads to be reeled back in and merge after
  var DRAMA = 1;          // how wildly each ball changes shape where it sits (0 = a calm wobble)
  var BOUNCE = 0.33;       // how springy the beads are flying out (lower bounces more; 1 = none)

  var gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) { stage.classList.add("is-flat"); return; }

  var FRAGMENT = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 u_res; uniform float u_time; uniform vec3 u_orb[3]; uniform vec3 u_pal[15]; uniform float u_tex; uniform float u_burst[3];",
    "uniform vec4 u_bead[144]; uniform vec2 u_home[48]; uniform vec2 u_goo[3]; uniform float u_talk[3]; uniform float u_drama;",
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
    // Rounded join of two shapes (the drops flowing into the ball), carrying along each piece's
    // own size and where its colours come from, blended the same way
    "vec4 join(vec4 a, vec4 b, float k) {",
    "  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);",
    "  vec4 m = mix(b, a, h); m.x -= k * h * (1.0 - h); return m;",
    "}",
    // The glass's surface: a slowly drifting, folded ripple, like the skin of a liquid
    "float ripple(vec2 p, float t) {",
    "  vec2 w = vec2(fbm(p * 0.5 + vec2(t * 0.12, 0.0)), fbm(p * 0.5 + vec2(3.1, -t * 0.1)));",
    "  return fbm(p + 1.6 * w);",
    "}",
    // Tiny air bubbles caught in the glass: a few cells hold one, a thin bright ring with a glint
    "float bubble(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  float keep = step(0.74, hash(i + 4.7));",
    "  vec2 c = 0.3 + 0.4 * vec2(hash(i), hash(i + 9.1));",
    "  float rb = 0.07 + 0.09 * hash(i + 2.3);",
    "  vec2 e = (f - c) / rb;",
    "  float dd = length(e);",
    "  float edge = smoothstep(1.0, 0.8, dd) * smoothstep(0.45, 0.85, dd);",
    "  float glint = smoothstep(0.4, 0.0, length(e - vec2(-0.35, 0.35)));",
    "  return keep * (edge * 0.5 + glint * 0.9);",
    "}",
    // A ball's shape, as distance to its surface (in its own radius): the jelly-edged ball, and
    // three drops that pull away from it, drift out, and flow back in to merge. Hovered (burst
    // towards 1), it gives itself up into 48 tiny beads that spread out round it and float
    // (where each bead is, how big, and how firmly it joins, are worked out in JavaScript below).
    // Also gives the nearest piece's size, and how far that piece has moved from where its
    // colours were in the whole ball.
    "vec4 shape(vec2 d, float s, float t, float burst, int k) {",
    "  float e = burst * burst * (3.0 - 2.0 * burst);",
    "  float r = length(d), ang = atan(d.y, d.x);",
    // (big lobes that swell and sink as they travel round the edge, and a restless finer ripple)
    "  float wob = 0.026 * sin(3.0 * ang + t * 1.1 + s) + 0.018 * sin(5.0 * ang - t * 1.5 + s * 2.0)",
    "    + 0.015 * sin(2.0 * ang + t * 0.7 + s * 3.0)",
    "    + 0.03 * (fbm(vec2(cos(ang), sin(ang)) * 1.5 + t * 0.25 + s) - 0.5)",
    "    + u_drama * (0.07 * sin(2.0 * ang - t * 0.9 + s) * (0.6 + 0.4 * sin(t * 0.7 + s))",
    "      + 0.055 * sin(3.0 * ang + t * 1.3 + s * 2.0) * sin(t * 0.55 + s * 3.0)",
    "      + 0.035 * sin(5.0 * ang - t * 2.1 + s) * (0.5 + 0.5 * sin(t * 1.1 + s * 1.7))",
    "      + 0.06 * (fbm(vec2(cos(ang), sin(ang)) * 2.2 - t * 0.45 + s * 2.0) - 0.5));",
    // (as it breaks, what's left of the ball shrinks away, lit as the smaller ball it now is)
    "  float core = (1.0 + wob * (1.0 - e)) * (1.0 - e) - 0.15 * e;",
    "  vec4 m = vec4(r - core, max(core, 0.05), 0.0, 0.0);",
    // talking (hello.js saying this person's hello): the edge ripples and swells with the voice
    "  float tk = u_talk[k];",
    "  if (tk > 0.0) m.x -= tk * (0.05 + 0.045 * sin(6.0 * ang - t * 14.0 + s) + 0.035 * sin(4.0 * ang + t * 11.0) + 0.025 * sin(9.0 * ang - t * 19.0)) * (1.0 - e);",
    "  for (int j = 0; j < 3; j++) {",
    "    float fj = float(j);",
    "    float a = s * 3.0 + fj * 2.1 + t * 0.15 + 0.5 * sin(t * 0.3 + fj * 1.7 + s);",
    "    float out_ = 0.5 - 0.5 * cos(t * (0.45 + 0.13 * fj) + fj * 2.4 + s * 1.3);",
    "    out_ = out_ * out_ * (3.0 - 2.0 * out_);",
    "    float size = (0.1 + 0.05 * sin(t * 0.7 + fj * 3.1 + s)) * (1.0 - e);",
    "    vec2 at = vec2(cos(a), sin(a)) * (0.82 + 0.78 * out_);",
    "    m = join(m, vec4(length(d - at) - size, 1.0, 0.0, 0.0), 0.22);",
    "  }",
    "  if (burst > 0.001) {",
    "    vec2 goo = u_goo[k];",
    "    for (int j = 0; j < 48; j++) {",
    "      vec4 bd = u_bead[k * 48 + j];",
    "      m = join(m, vec4(length(d - bd.xy) - bd.z, max(bd.z, 0.02) * 1.2, u_home[j] - bd.xy), bd.w);",
    // merging: a thin, sticky strand from the middle out to every other bead (as far as it has
    // reached so far), thicker at both ends than in the middle, bowing gently like something
    // alive, flowing into the bead and the core
    "      if (goo.x > 0.0 && j - (j / 2) * 2 == 0) {",
    "        vec2 tip = bd.xy * goo.y;",
    "        float hh = clamp(dot(d, tip) / max(dot(tip, tip), 1e-4), 0.0, 1.0);",
    "        float fj = float(j), arc = sin(3.14159 * hh);",
    "        vec2 side = vec2(-tip.y, tip.x) * (0.08 * sin(t * 4.0 + fj * 1.7) + 0.025 * sin(hh * 9.0 - t * 7.0 + fj));",
    "        float w = goo.x * (0.022 - 0.011 * arc);",
    "        m = join(m, vec4(length(d - tip * hh - side * arc) - w, 0.06, 0.0, 0.0), 0.05);",
    "      }",
    "    }",
    "  }",
    "  return m;",
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
    // squashed and stretched like jelly, in turn, along a line that slowly turns (not once it
    // breaks into beads, which stay perfectly round)
    "    float sa = t * 0.35 + s * 1.9;",
    "    vec2 axis = vec2(cos(sa), sin(sa));",
    "    float st = u_drama * (0.15 * sin(t * 1.25 + s * 2.0) + 0.06 * sin(t * 2.3 + s)) * (1.0 - smoothstep(0.0, 0.3, u_burst[k]));",
    "    float along = dot(d, axis);",
    "    d = (d - axis * along) * (1.0 + st * 0.5) + axis * along / (1.0 + st);",
    "    float r = length(d);",
    "    if (r > 2.4) continue;",
    "    float ang = atan(d.y, d.x);",
    "    float b = u_burst[k];",
    "    vec4 m = shape(d, s, t, b, k);",
    "    float sd = m.x;",
    // A crisp, smooth edge: about a pixel and a half of softening, whatever the ball's size
    "    float aa = 1.5 / orb.z;",
    "    float body = 1.0 - smoothstep(-aa, aa, sd);",
    // Which way the surface faces, from how the shape changes nearby; deeper inside faces you more
    "    float eps = 2.0 / orb.z;",
    "    vec2 grad = vec2(shape(d + vec2(eps, 0.0), s, t, b, k).x - sd, shape(d + vec2(0.0, eps), s, t, b, k).x - sd) / eps;",
    "    float depth = 1.0 + min(sd, 0.0) / m.y;",
    "    float z = sqrt(max(0.0, 1.0 - depth * depth));",
    // (towards the middle, the plain sphere's way out; near the edge, the wobbling shape's and the
    // drops', which near the very middle would swing wildly; and the beads' own, once it breaks)
    "    float edgeward = max(smoothstep(0.55, 0.9, r), smoothstep(0.0, 0.15, b));",
    "    vec2 out_ = normalize(mix(d + 1e-5, normalize(grad + 1e-5), edgeward));",
    "    vec3 n = normalize(vec3(out_ * sqrt(1.0 - z * z), z));",
    // Texture: the surface ripples, which tilt the glass a little here and there, so the light,
    // the highlight and the colours behind catch on them (only worked out inside the ball)
    "    if (body > 0.0 && u_tex > 0.0) {",
    "      vec2 tp = d * 5.5 / (0.55 + 0.45 * z) + s * 7.0;",
    "      float he = 0.05, h = ripple(tp, t);",
    "      vec2 bump = vec2(ripple(tp + vec2(he, 0.0), t) - h, ripple(tp + vec2(0.0, he), t) - h) / he;",
    "      n = normalize(n - vec3(bump * 0.1 * u_tex, 0.0));",
    "    }",
    // The light wanders freely round each ball, so its sheen and highlight glide over the glass
    "    vec3 light = normalize(vec3(",
    "      0.85 * sin(t * 0.37 + s * 1.3) + 0.3 * sin(t * 0.91 + s),",
    "      0.85 * cos(t * 0.29 + s * 2.1) + 0.3 * cos(t * 0.73 + s * 0.5),",
    "      0.7 + 0.25 * sin(t * 0.5 + s)));",
    // Inside: the colours flowing round like liquid, bent more towards the rim as through glass,
    // with marbled bands winding through them
    // (each bead keeps the colours of the piece of the ball it came from)
    "    vec2 bent = d + m.zw + n.xy * 0.35 * (1.0 - z);",
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
    // The ripples' own fine sparkle where they face the light, and the bubbles drifting slowly up
    "    inner += vec3(pow(max(mirror.z, 0.0), 90.0) * 0.35 * u_tex);",
    "    float bub = bubble(bent * 4.2 / (0.6 + 0.4 * z) + vec2(s * 3.0, -t * 0.12));",
    "    inner = mix(inner, vec3(1.0), bub * 0.55 * u_tex * smoothstep(0.1, 0.5, z) * (1.0 - b));",
    // Round the edge: a thin rainbow fringe just outside, and a faint shadow of its own colour
    "    float ring = exp(-pow((sd - aa) / 0.025, 2.0)) * (1.0 - body);",
    "    float glow = exp(-pow(max(sd, 0.0) / (0.22 * (1.0 - 0.5 * b)), 2.0)) * (1.0 - body);",
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
    pal: gl.getUniformLocation(program, "u_pal"),
    tex: gl.getUniformLocation(program, "u_tex"),
    burst: gl.getUniformLocation(program, "u_burst"),
    bead: gl.getUniformLocation(program, "u_bead"),
    home: gl.getUniformLocation(program, "u_home"),
    goo: gl.getUniformLocation(program, "u_goo"),
    talk: gl.getUniformLocation(program, "u_talk"),
    drama: gl.getUniformLocation(program, "u_drama")
  };
  var colours = [];
  PALETTES.forEach(function (list) {
    list.forEach(function (hex) {
      var n = parseInt(hex.slice(1), 16);
      colours.push((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
    });
  });
  gl.uniform3fv(u.pal, colours);
  gl.uniform1f(u.tex, TEXTURE);
  gl.uniform1f(u.drama, DRAMA);

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
  var centres = [{}, {}, {}];
  // Each ball's place (the middle of its square) and size, read every frame, so scrolling on a
  // phone carries them along
  function place() {
    spots.forEach(function (spot, i) {
      if (i > 2) return;
      var r = spot.getBoundingClientRect();
      var c = centres[i] = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width * SIZE };
      orbs[i * 3] = c.x * dpr;
      orbs[i * 3 + 1] = canvas.height - c.y * dpr;
      orbs[i * 3 + 2] = c.R * dpr;
    });
    gl.uniform3fv(u.orb, orbs);
  }

  // Hover: a ball breaks while the pointer is over it, and stays broken while the pointer is
  // among its beads (up to almost twice its radius), so moving round the cloud doesn't flicker
  var pointer = null, burst = new Float32Array(3), hovered = [false, false, false], last = 0;
  function aim(e) { pointer = { x: e.clientX, y: e.clientY }; }
  window.addEventListener("pointermove", aim, { passive: true });
  window.addEventListener("pointerdown", aim, { passive: true });
  window.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") pointer = null; });
  document.addEventListener("pointerleave", function () { pointer = null; });
  window.addEventListener("blur", function () { pointer = null; });
  // The beads: each one's place inside the whole ball (spread evenly through it, in a sunflower
  // pattern) and its own random delay, distance and size, fixed once
  var BEADS = 48, beadInfo = [], homes = new Float32Array(BEADS * 2), beads = new Float32Array(3 * BEADS * 4);
  function rand(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  for (var j = 0; j < BEADS; j++) {
    var a = j * 2.39996, rr = Math.sqrt((j + 0.5) / BEADS);
    homes[j * 2] = Math.cos(a) * rr * 0.78;
    homes[j * 2 + 1] = Math.sin(a) * rr * 0.78;
    for (var k = 0; k < 3; k++) {
      var n = k * 100 + j;
      beadInfo.push({ cos: Math.cos(a), sin: Math.sin(a), rr: rr, delay: rand(n) * 0.35,
        far: rand(n + 0.31), size: rand(n + 0.57), wob: rand(n + 0.83), x: 0, v: 0 });
    }
  }
  gl.uniform2fv(u.home, homes);
  function smooth(a, b, x) { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
  // How far out each bead is (0 home inside the ball, 1 out in the cloud). Breaking, it's a
  // spring: once the ball has broken far enough for it (each goes a little after the last) it
  // flies out, shoots past its place and bounces back a few times.
  var OUT_SPRING = 520;
  function spring(k, dt) {
    for (var j = 0; j < BEADS; j++) {
      var info = beadInfo[j * 3 + k];
      var target = burst[k] > info.delay * 0.6 ? 1 : 0;
      var damp = 2 * Math.sqrt(OUT_SPRING) * BOUNCE;
      for (var n = 0, steps = Math.ceil(dt / 0.008); n < steps; n++) {
        var h = dt / steps;
        info.v += (OUT_SPRING * (target - info.x) - damp * info.v) * h;
        info.x += info.v * h;
      }
    }
  }
  // Merging, it's reeled in (mt, 0 to 1 over MERGE_TIME): first a small core forms in the middle
  // and the strands shoot out to every bead; then each bead is pulled in, slowly at first and
  // faster as it comes (each starting a touch after the last), while the core swells with them
  // into the whole ball. Gives what the ball's breaking (burst) looks like at that moment.
  var mergeT = [-1, -1, -1], goo = new Float32Array(6);
  function reel(k, mt) {
    for (var j = 0; j < BEADS; j++) {
      var info = beadInfo[j * 3 + k];
      var go = 0.2 + info.delay * 0.3;
      var p = Math.max(0, Math.min(1, (mt - go) / (0.9 - go)));
      info.x = info.from * (1 - p * p);
      info.v = 0;
    }
    goo[k * 2] = smooth(0.02, 0.18, mt) * (1 - smooth(0.6, 0.9, mt));
    goo[k * 2 + 1] = smooth(0, 0.22, mt);
    // the core's radius: from nothing, to a small blob, to the whole ball
    var core = -0.15 + 0.45 * smooth(0, 0.2, mt);
    core += (1 - core) * smooth(0.3, 1, mt);
    return Math.max(0, Math.min(1, (1 - core) / 1.15));
  }
  // Where each bead is now: out along its spring towards its place in the cloud, drifting there,
  // and joining less firmly the further it has gone
  function moveBeads(t) {
    for (var k = 0; k < 3; k++) {
      for (var j = 0; j < BEADS; j++) {
        var info = beadInfo[j * 3 + k], i = (k * BEADS + j) * 4;
        var e = info.x;
        var reach = 0.15 + info.rr * 1.45 + 0.15 * info.far;
        var ax = info.cos * reach + 0.07 * Math.sin(t * (0.8 + info.size) + j);
        var ay = info.sin * reach + 0.07 * Math.cos(t * (0.7 + info.far) + j * 1.3);
        if (ay < 0) ay *= 0.8;   // a little less far downwards, to keep clear of the name below
        var hx = homes[j * 2], hy = homes[j * 2 + 1];
        beads[i] = hx + (ax - hx) * e;
        beads[i + 1] = hy + (ay - hy) * e;
        // (and while the voice speaks, they throb with it)
        beads[i + 2] = (0.045 + 0.055 * info.size) * smooth(0, 0.3, e) * (1 + 0.7 * talk[k]);
        beads[i + 3] = Math.max(0.03, 0.25 - 0.22 * e);
      }
    }
    gl.uniform4fv(u.bead, beads);
  }
  function breakApart(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    centres.forEach(function (c, i) {
      var on = false;
      if (pointer && c.R) {
        var dist = Math.hypot(pointer.x - c.x, pointer.y - c.y);
        on = dist < c.R * (hovered[i] ? 1.9 : 1.05);
      }
      // (just hovered: hello.js says this person's hello)
      if (on && !hovered[i]) window.dispatchEvent(new CustomEvent("tokenz:ball-hover", { detail: { index: i } }));
      if (!on && hovered[i]) window.dispatchEvent(new CustomEvent("tokenz:ball-leave", { detail: { index: i } }));
      hovered[i] = on;
    });
    var busy = false;
    for (var k = 0; k < 3; k++) {
      if (hovered[k]) {
        // breaking (or breaking again, from wherever a merge had got to)
        mergeT[k] = -1;
        goo[k * 2] = goo[k * 2 + 1] = 0;
        burst[k] = Math.min(1, burst[k] + dt / BREAK_TIME);
        spring(k, dt);
      } else if (burst[k] > 0) {
        if (mergeT[k] < 0) {
          mergeT[k] = 0;
          for (var j = 0; j < BEADS; j++) beadInfo[j * 3 + k].from = beadInfo[j * 3 + k].x;
        }
        mergeT[k] += dt / MERGE_TIME;
        if (mergeT[k] >= 1) {
          mergeT[k] = -1; burst[k] = 0; goo[k * 2] = goo[k * 2 + 1] = 0;
          for (var j2 = 0; j2 < BEADS; j2++) { beadInfo[j2 * 3 + k].x = 0; beadInfo[j2 * 3 + k].v = 0; }
        } else {
          burst[k] = Math.max(0.002, reel(k, mergeT[k]));
        }
      }
      if (burst[k] > 0) busy = true;
    }
    gl.uniform1fv(u.burst, burst);
    gl.uniform2fv(u.goo, goo);
    return busy;
  }

  // Talking: while hello.js says a person's hello, their ball moves with the voice: with the
  // recording's real loudness (window.tokenzVoice), or, for the browser's own voice (which a page
  // can't hear), a made-up level: a quick, uneven flutter like syllables, kicking at every word
  var talk = new Float32Array(3), speaking = [false, false, false], kick = [0, 0, 0];
  window.addEventListener("tokenz:speaking", function (e) {
    var i = e.detail && e.detail.index;
    if (i >= 0 && i < 3) speaking[i] = !!e.detail.on;
  });
  window.addEventListener("tokenz:word", function (e) {
    var i = e.detail && e.detail.index;
    if (i >= 0 && i < 3) kick[i] = 1;
  });
  function voice(t, dt) {
    for (var k = 0; k < 3; k++) {
      kick[k] *= Math.exp(-dt * 7);
      var heard = window.tokenzVoice;
      var level = heard && heard.index === k
        ? 0.15 + 1.3 * heard.level   // a recording playing: its real loudness
        : speaking[k]
          ? 0.45 + 0.35 * Math.abs(Math.sin(t * 17 + k) * Math.sin(t * 6.3 + k * 2)) + 0.5 * kick[k]
          : 0;
      // rises fast with the voice, settles a little slower when it stops
      talk[k] += (level - talk[k]) * (1 - Math.exp(-dt * (level > talk[k] ? 30 : 10)));
      if (talk[k] < 0.001) talk[k] = 0;
    }
    gl.uniform1fv(u.talk, talk);
  }

  var start = performance.now(), running = false, visible = true, lastVoice = 0;
  function draw(now) {
    var t = still ? 12 : (now - start) / 1000 * SPEED;
    place();
    var busy = still ? false : breakApart(now);
    if (still) gl.uniform1fv(u.burst, burst);
    gl.uniform1f(u.time, t);
    if (busy) moveBeads(t);
    if (!still) { voice(t, lastVoice ? Math.min(0.05, (now - lastVoice) / 1000) : 0); lastVoice = now; }
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
