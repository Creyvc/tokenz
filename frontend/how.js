// How it works: the jump. A real 3D surface like the inside of a cave, a funnel of uneven,
// lobed ridges of different widths and heights, drawn live with WebGL2 (after topology.vc, made
// Tokenz's own): they slowly drift inwards, squeezed towards the middle, where they turn into the
// diamond at the centre of the logo. It's lit like an object: a key light with soft shadows, sky
// light, a matte plaster finish and an oil-slick sheen that turns colour with the viewing angle,
// leaning violet; deeper in, it darkens. As sharp as the screen allows: the surface is worked out
// once per frame into a 2048 by 2048 height map, and each pixel then just reads it.
// - Scrolling: the camera swings from a low angle round to looking straight down into the funnel
//   and drops towards it, while "Long prompts…" and then "…fall through." rise in and out (each
//   timed, so a fast scroll still sees it). Then the centre opens into a black hole that grows
//   until it fills the window, and the page carries on in black with the three steps.
// - The scroll is eased (like the slide on Home), and the scene only draws while it's in sight.
// - With reduced motion: one still frame, the first line shown, no scroll effect.
// - Without WebGL2: plain rings in CSS instead (styles.css, .hw-stage.is-flat).
(function () {
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLIDE = 140;  // ms the scene takes to catch most of the way up with the scroll

  var VERTEX = "#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n";

  // Shared by both passes: the shape of the cave's surface
  var SHAPE = [
    "const float FREQ = 4.0;",
    "uniform float uTime;",
    "float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }",
    // A smooth, slowly drifting wobble: layered sines
    "float wob(vec2 q) { return sin(q.x * 0.9 + sin(q.y * 0.73 + uTime * 0.05) * 1.3) * cos(q.y * 1.07 + sin(q.x * 0.61 - uTime * 0.04) * 1.2); }",
    // The ground, like the inside of a cave: bent by two layers of wobble, its rings pulled into
    // uneven lobes rather than circles; the logo's diamond only at the very middle
    "float field(vec2 q) {",
    "  vec2 w = q + 0.5 * vec2(wob(q * 0.6 + 3.1), wob(q.yx * 0.6 - 1.7)) + 0.16 * vec2(wob(q * 1.5 + 7.0), wob(q.yx * 1.4 + 2.0));",
    "  float rr = length(w);",
    "  float a = atan(w.y, w.x);",
    "  float lobes = 1.0 + 0.17 * sin(2.0 * a + 0.8 + rr * 0.3) + 0.09 * sin(3.0 * a + 2.1 + rr * 0.6) + 0.05 * sin(5.0 * a - rr);",
    "  return mix((abs(w.x) + abs(w.y)) * 0.78, rr * lobes, smoothstep(0.12, 0.9, rr));",
    "}",
    // Where along the rings a point is: their spacing changes across the surface, so some bands
    // are wide and some narrow, and they drift inwards
    "float phase(vec2 q, float F) { return F * FREQ + 0.9 * wob(q * 0.45 + 5.0) + 0.35 * wob(q * 1.1 - 2.0) + uTime * 0.12; }"
  ].join("\n");

  // Pass 1, once per frame: the surface worked out into a height map around the camera. Each
  // texel: its height, where it is along its ring (as a cosine and sine, so it blends smoothly
  // between texels), how far from the middle, and in a second map which way it slopes
  var MAP = [
    "#version 300 es",
    "precision highp float;",
    SHAPE,
    "uniform vec2 uCenter, uSize;",
    "uniform float uL, uPix, uHoleR;",
    "uniform vec3 uRo;",
    "layout(location = 0) out vec4 o0;",
    "layout(location = 1) out vec4 o1;",
    // Rounded ridges with sharp grooves between them, each its own height and roundness, on a
    // funnel. They fade out where they'd be finer than a pixel on screen, and near the map's edge
    "float heightAt(vec2 q, out float F, out float ph, out float amp) {",
    "  F = field(q);",
    "  ph = phase(q, F);",
    "  float id = floor(ph), r = fract(ph);",
    "  float footprint = length(vec3(q.x, -0.5, q.y) - uRo) * uPix;",
    "  vec2 edge = abs(q - uCenter) / uL;",
    "  amp = 0.13 * (1.0 - smoothstep(0.06, 0.22, footprint * FREQ)) * (1.0 - smoothstep(0.82, 1.0, max(edge.x, edge.y)));",
    "  float ridge = pow(sin(3.14159 * r), mix(0.45, 0.9, hash1(id)));",
    "  float h = -1.15 * exp(-F * F * 0.4) + ridge * amp * mix(0.55, 1.45, hash1(id + 7.0));",
    "  return h - 0.12 * smoothstep(uHoleR + 0.05, uHoleR - 0.05, F);",
    "}",
    "void main() {",
    "  vec2 q = uCenter + (gl_FragCoord.xy / uSize * 2.0 - 1.0) * uL;",
    "  float F, ph, amp, f2, p2, a2;",
    "  float h = heightAt(q, F, ph, amp);",
    "  float e = uL / uSize.x;",
    "  float hx = heightAt(q + vec2(e, 0.0), f2, p2, a2) - h;",
    "  float hz = heightAt(q + vec2(0.0, e), f2, p2, a2) - h;",
    "  o0 = vec4(h, cos(6.28318 * ph), sin(6.28318 * ph), F);",
    "  o1 = vec4(hx / e, hz / e, amp, 0.0);",
    "}"
  ].join("\n");

  // Pass 2, per pixel: a ray from the camera marched down onto the surface (reading the map),
  // then lit: a key light with soft shadows, light from the sky, a matte plaster finish, and an
  // oil-slick sheen whose colour turns with the angle it's seen from; deeper in it darkens, like
  // looking down into a cave, and the opening in the middle is the black of the section below
  var LOOK = [
    "#version 300 es",
    "precision highp float;",
    "QUALITY",
    "uniform sampler2D uMap0, uMap1;",
    "uniform vec2 uRes, uCenter;",
    "uniform float uL, uTime, uHoleR, uPix;",
    "uniform vec3 uLand;",
    "uniform vec3 uRo, uFw, uRt, uUp;",
    "out vec4 o;",
    "float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    // Value noise and four layers of it, for the material's grain
    "float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }",
    "float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }",
    "vec3 noised(vec2 x) { vec2 i = floor(x), f = fract(x); vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx)); }",
    "vec3 fbmd(vec2 p) { vec3 s = vec3(0.0); float a = 0.5, k = 1.0; for (int i = 0; i < OCT; i++) { vec3 n = noised(p); s += a * vec3(n.x, n.yz * k); p = p * 2.03 + vec2(1.7, 9.2); k *= 2.03; a *= 0.5; } return s; }",
    "const vec3 SUN = vec3(-0.3634, 0.0785, -0.9283);",
    "vec2 mapUV(vec2 q) { return (q - uCenter) / (2.0 * uL) + 0.5; }",
    "float H(vec2 q) { vec2 m = mapUV(q); if (m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0) return 0.0; return texture(uMap0, m).r; }",
    "vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "  vec3 ro = uRo;",
    "  vec3 rd = normalize(uFw * 1.7 + uv.x * uRt + uv.y * uUp);",
    // The haze: cool violet, warming towards the sun
    "  vec3 fogCol = mix(vec3(0.6, 0.58, 0.78), vec3(1.15, 0.98, 0.82), pow(max(dot(rd, SUN), 0.0), 10.0));",
    "  float t = max(0.0, (ro.y - 0.25) / max(-rd.y, 1e-4));",
    "  float lastT = t; bool hit = false;",
    "  for (int i = 0; i < MARCH; i++) {",
    "    vec3 p = ro + rd * t;",
    "    float d = p.y - H(p.xz);",
    "    if (d < 0.0) { hit = true; break; }",
    "    lastT = t;",
    "    t += max(STEP_GROW * t + 0.0015, d * 0.5);",
    "    if (t > 40.0 || p.y < -2.0) break;",
    "  }",
    "  vec3 col = fogCol;",
    "  float pit = 0.0;",
    "  if (hit) {",
    "    float a = lastT, b = t;",
    "    for (int k = 0; k < BISECT; k++) { float m = 0.5 * (a + b); vec3 pm = ro + rd * m; if (pm.y - H(pm.xz) < 0.0) b = m; else a = m; }",
    "    t = b;",
    "    vec3 p = ro + rd * t;",
    "    vec2 m = mapUV(p.xz);",
    "    vec4 s0 = texture(uMap0, m);",
    "    vec4 s1 = texture(uMap1, m);",
    "    float F = s0.a;",
    "    float r = fract(atan(s0.b, s0.g) / 6.28318 + 1.0);",
    "    float amp = s1.b / 0.13;",
    "    vec3 n = normalize(vec3(-s1.r, 1.0, -s1.g));",
    // The material: a fine grain that catches the light, faint strata running along the ridges like
    // eroded rock, and patches a little darker or glossier than others. All of it fades where it
    // would be finer than a pixel, so the distance stays calm
    "    float footprint = t * uPix;",
    "    float grainFade = 1.0 - smoothstep(0.0025, 0.012, footprint);",
    "    float strataFade = 1.0 - smoothstep(0.01, 0.05, footprint);",
    // (seen from above on the flatter parts, from the side on the steep walls, blended, so it
    // doesn't stretch into streaks where the surface stands up)
    "    float steep = 1.0 - smoothstep(0.35, 0.8, n.y);",
    "    float coarseFade = 1.0 - smoothstep(0.008, 0.035, footprint);",
    "    vec3 gt = fbmd(p.xz * 60.0) + 0.6 * vec3(1.0, 0.25, 0.25) * fbmd(p.xz * 15.0 + 3.0) * coarseFade;",
    "    vec3 bump = vec3(-gt.y, 0.0, -gt.z) * 0.35;",
    "    float g0 = gt.x / 1.6;",
    "    vec2 side = normalize(vec2(-n.z, n.x) + 1e-4);",
    "    if (steep > 0.01) {",
    "      vec2 sp = vec2(dot(p.xz, side), p.y);",
    "      vec3 gs = fbmd(sp * 60.0) + 0.6 * vec3(1.0, 0.25, 0.25) * fbmd(sp * 15.0 + 3.0) * coarseFade;",
    "      vec3 bumpSide = (vec3(side.x, 0.0, side.y) * -gs.y + vec3(0.0, -gs.z, 0.0)) * 0.35;",
    "      bump = mix(bump, bumpSide, steep);",
    "      g0 = mix(g0, gs.x / 1.6, steep);",
    "    }",
    "    n = normalize(n + bump * 1.3 * grainFade);",
    "    float patches = fbm(p.xz * 2.2 + 4.0);",
    "    float strata = sin(6.28318 * (r * 8.0 + fbm(p.xz * 4.0) * 0.9));",
    "    strata = smoothstep(0.55, 1.0, strata) * strataFade;",
    "    vec3 v = -rd;",
    // A low sun ahead, near the horizon: long shadows, dark valleys
    "    vec3 l = SUN;",
    "    float sh = 1.0, st = 0.012;",
    "    for (int i = 0; i < SHADOW; i++) {",
    "      vec3 q = p + n * 0.006 + l * st;",
    "      float dd = q.y - H(q.xz);",
    "      sh = min(sh, 18.0 * dd / st);",
    "      st += 0.02 + st * SHADOW_GROW;",
    "      if (sh < 0.0 || st > 3.5) break;",
    "    }",
    "    sh = clamp(sh, 0.0, 1.0);",
    "    sh = sh * sh * (3.0 - 2.0 * sh);",
    "    float groove = min(r, 1.0 - r);",
    // Ambient occlusion: how much of the sky the ground nearby hides, looked for in eight
    // directions at three distances, so grooves and inner bends darken as they would for real
    "    float occ = 0.0;",
    "    for (int i = 0; i < AO_DIRS; i++) {",
    "      float ang = float(i) * 6.28318 / float(AO_DIRS) + 0.3;",
    "      vec2 dir = vec2(cos(ang), sin(ang));",
    "      for (int j = 1; j <= AO_STEPS; j++) {",
    "        float rad = 0.03 * float(j * j);",
    "        occ += clamp((H(p.xz + dir * rad) - p.y) / rad, 0.0, 1.0) / float(j);",
    "      }",
    "    }",
    "    float ao = 1.0 - clamp(occ / (float(AO_DIRS) * AO_NORM), 0.0, 1.0);",
    "    ao *= mix(1.0, mix(0.5, 1.0, smoothstep(0.0, 0.2, groove)), amp);",
    // the crevices of the grain hold a little shadow of their own
    "    ao *= mix(1.0, 0.62 + 0.55 * g0, grainFade);",
    // Light as real materials take it: plaster lets a little wrap round the ridges; the
    // highlights follow a rough, physically based reflection (GGX), stronger at grazing angles
    "    float rough = mix(0.3, 0.62, patches);",
    "    float nl = dot(n, l);",
    "    float dif = clamp((nl + 0.03) / 1.03, 0.0, 1.0);",
    "    float nv = max(dot(n, v), 1e-3);",
    "    vec3 hv = normalize(l + v);",
    "    float nh = max(dot(n, hv), 0.0), vh = max(dot(v, hv), 0.0), nlc = max(nl, 0.0);",
    "    float a2 = pow(rough, 4.0);",
    "    float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));",
    "    float kg = (rough + 1.0) * (rough + 1.0) / 8.0;",
    "    float G = (nv / (nv * (1.0 - kg) + kg)) * (nlc / (nlc * (1.0 - kg) + kg));",
    // The coating: a film a few hundred nanometres thick, thicker in some places than others;
    // light reflected off its top and its bottom interferes, differently for red, green and
    // blue, which is where the oil-slick colours come from
    "    float thick = mix(260.0, 620.0, fbm(p.xz * 1.3 + uTime * 0.02)) + F * 40.0;",
    "    float cosT = sqrt(max(0.0, 1.0 - (1.0 - nv * nv) / (1.45 * 1.45)));",
    "    vec3 film = 0.5 + 0.5 * cos(4.0 * 3.14159 * 1.45 * thick * cosT / vec3(650.0, 532.0, 450.0));",
    // soft pastels, not neon: the coat's colours lean towards white, and a touch of violet
    "    film = mix(mix(film, vec3(1.0), 0.52), vec3(0.8, 0.72, 1.0), 0.1);",
    "    float coat = 0.75 + 0.25 * smoothstep(0.6, 3.5, F);",
    "    vec3 F0 = mix(vec3(0.04), film * 0.85, coat);",
    "    vec3 Fh = F0 + (1.0 - F0) * pow(1.0 - vh, 5.0);",
    "    vec3 Fv = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);",
    "    vec3 spec = D * G * Fh / max(4.0 * nv * nlc, 1e-3) * nlc * sh * smoothstep(0.03, 0.12, groove);",
    "    vec3 albedo = vec3(0.86, 0.86, 0.85) * (0.9 + 0.16 * patches) * (1.0 - 0.07 * strata) * mix(1.0, 0.76 + 0.42 * g0, grainFade);",
    "    vec3 sun = vec3(1.0, 0.9, 0.78) * 1.25;",
    "    float skyAmt = 0.55 + 0.45 * n.y;",
    // In shadow, only a cool violet sky light: the alien dark of the valleys
    "    col = albedo * (1.0 - Fv * 0.5) * (sun * dif * sh + vec3(0.42, 0.40, 0.62) * skyAmt * 0.36 * ao + vec3(0.9, 0.8, 0.75) * 0.08 * (1.0 - n.y) * ao);",
    // The coating seen against the bright sky, and the sun's highlights in it
    "    col += film * Fv * coat * skyAmt * 0.6 * ao + film * coat * (0.05 + 0.1 * sh * dif) * ao + spec * sun * 1.1;",
    // Glitter: tiny facets in the grain that catch the sun
    "    float spark = step(0.982, hash(floor(p.xz * 240.0))) * grainFade;",
    "    col += spark * sh * pow(max(dot(n, hv), 0.0), 18.0) * sun * 1.6;",
    "    col *= mix(0.3, 1.0, smoothstep(-1.1, -0.15, p.y));",
    "    float aaF = fwidth(F) * 1.5 + 0.004;",
    "    pit = 1.0 - smoothstep(uHoleR - aaF, uHoleR + aaF, F);",
    "    float rim = exp(-abs(F - uHoleR) * 22.0) * (1.0 - pit);",
    "    col += vec3(0.55, 0.50, 0.95) * rim * 0.55;",
    "    col = mix(col, fogCol, 1.0 - exp(-max(t - 1.0, 0.0) * 0.065));",
    "  }",
    // The glow round the sun, over everything
    "  float toSun = max(dot(rd, SUN), 0.0);",
    "  col += vec3(1.0, 0.86, 0.72) * (pow(toSun, 400.0) * 1.6 + pow(toSun, 40.0) * 0.55 + pow(toSun, 8.0) * 0.2) * (1.0 - pit);",
    "  col = aces(col * 1.18);",
    // A soft vignette, as a lens would give
    "  col *= 1.0 - 0.3 * dot(uv * vec2(0.75, 1.0), uv * vec2(0.75, 1.0));",
    "  col += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * 0.012 * (1.0 - pit);",
    // The opening: exactly the colour of what comes after it on the page, so they meet without a seam
    "  col = mix(col, uLand, pit);",
    "  o = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }

  // The camera for a point in the jump: low and to the side at first, then round to straight
  // down, and closer
  function camera(p, time) {
    var tilt = smooth(0, 0.62, p);
    var pitch = mix(0.15, 1.54, tilt);
    var dist = mix(7.0, 1.75, smooth(0.08, 0.9, p));
    var yaw = 0.6 + Math.sin(time * 0.05) * 0.06 + p * 1.3;
    var target = [mix(-1.2, 0, tilt), -0.55 * tilt, 0];
    var ro = [target[0] + dist * Math.cos(pitch) * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
    var fw = norm([target[0] - ro[0], target[1] - ro[1], target[2] - ro[2]]);
    var rt = norm([-fw[2], 0, fw[0]]);
    var up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    return { ro: ro, fw: fw, rt: rt, up: up, dist: dist, target: target };
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  // The colour the opening shows: the canvas's data-land ("light" for a white page after it)
  function landColour(canvas) {
    return canvas.getAttribute("data-land") === "light" ? [1, 1, 1] : [0.043, 0.043, 0.047];
  }

  // The two quality levels: the same picture, the light one with fewer steps in its marching,
  // shadows and shading, a smaller height map, and at most the screen's own pixels (not 2x)
  var QUALITY = {
    full: { defines: "#define MARCH 110\n#define STEP_GROW 0.002\n#define BISECT 7\n#define SHADOW 24\n#define SHADOW_GROW 0.22\n#define AO_DIRS 8\n#define AO_STEPS 3\n#define AO_NORM 1.833\n#define OCT 4", map: 2048, most: 2, least: 0.6 },
    light: { defines: "#define MARCH 72\n#define STEP_GROW 0.0035\n#define BISECT 5\n#define SHADOW 14\n#define SHADOW_GROW 0.34\n#define AO_DIRS 5\n#define AO_STEPS 2\n#define AO_NORM 1.5\n#define OCT 3", map: 1024, most: 1, least: 0.5 }
  };

  // A phone, or few cores or little memory, or a graphics chip known to be modest
  function lowEnd(gl) {
    var cores = navigator.hardwareConcurrency || 8, memory = navigator.deviceMemory || 8;
    if (cores <= 4 || memory <= 4 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return true;
    var info = gl.getExtension("WEBGL_debug_renderer_info");
    var chip = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    return /SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Intel\(R\) (HD|UHD) Graphics [1-6]/i.test(chip);
  }

  function makeScene(canvas) {
    var land = landColour(canvas);
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    var level = lowEnd(gl) ? QUALITY.light : QUALITY.full;
    function program(source) {
      function shader(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      var prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, source));
      gl.bindAttribLocation(prog, 0, "a");
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      var u = {};
      var count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < count; i++) {
        var name = gl.getActiveUniform(prog, i).name;
        u[name] = gl.getUniformLocation(prog, name);
      }
      return { prog: prog, u: u };
    }
    var mapPass, lookPass;
    try {
      mapPass = program(MAP);
      lookPass = program(LOOK.replace("QUALITY", level.defines));
    } catch (e) {
      return null;
    }
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // The two maps, half floats, smoothly blended between texels
    var MAP_SIZE = level.map;
    function texture() {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, MAP_SIZE, MAP_SIZE, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }
    var map0, map1, fbo = gl.createFramebuffer();
    function maps() {
      if (map0) { gl.deleteTexture(map0); gl.deleteTexture(map1); }
      map0 = texture();
      map1 = texture();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map0, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, map1, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok;
    }
    if (!maps()) return null;
    var mapFresh = false, mapTick = 0;

    return {
      // As sharp as the screen (up to 2x on Retina), unless it can't keep up: the detail drops a
      // step when frames run slow, and comes back when there's room again
      scale: Math.min(window.devicePixelRatio || 1, level.most),
      size: function () {
        var w = Math.max(1, Math.round(canvas.clientWidth * this.scale));
        var h = Math.max(1, Math.round(canvas.clientHeight * this.scale));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      },
      // Slow means slower than the screen's own pace (the quickest frames seen lately), not a
      // fixed number: a screen or power setting that runs at 30 frames a second isn't a reason to
      // blur the picture
      pace: function (ms) {
        this.base = Math.min((this.base || ms) * 1.002, ms);
        this.slow = (this.slow || 0) * 0.92 + (ms > this.base * 1.35 ? 1 : 0) * 0.08;
        this.fast = (this.fast || 0) * 0.92 + (ms < this.base * 1.1 ? 1 : 0) * 0.08;
        var most = Math.min(window.devicePixelRatio || 1, level.most);
        if (this.slow > 0.6 && this.scale > level.least) { this.scale = Math.max(level.least, this.scale * 0.85); this.slow = 0; }
        else if (this.slow > 0.6 && level === QUALITY.full) this.lighten();
        else if (this.fast > 0.9 && this.scale < most) { this.scale = Math.min(most, this.scale * 1.1); this.fast = 0; }
      },
      // Still too slow at the least sharpness: over to the light level for good
      lighten: function () {
        try {
          var next = program(LOOK.replace("QUALITY", QUALITY.light.defines));
          gl.deleteProgram(lookPass.prog);
          lookPass = next;
          level = QUALITY.light;
          MAP_SIZE = level.map;
          maps();
          mapFresh = false;
          this.scale = Math.min(this.scale, level.most);
        } catch (e) {}
        this.slow = 0;
      },
      draw: function (time, p, hole, resting) {
        var cam = camera(p, time);
        var holeR = 0.07 + hole * hole * 2.6;
        // The map covers the ground the camera can see: wide while it looks out across the cave,
        // tight once it looks straight down, so it gets finer as it dives (about one map point
        // per screen pixel by the end)
        var L = Math.max(1.2, cam.dist * mix(3.0, 0.78, smooth(0, 0.62, p)));
        var center = [cam.target[0], cam.target[2]];
        var pix = 1.6 / (canvas.height * 1.7);
        var u;
        if (!resting || !mapFresh || ++mapTick % 2 === 0) {
        mapFresh = true;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, MAP_SIZE, MAP_SIZE);
        gl.useProgram(mapPass.prog);
        u = mapPass.u;
        gl.uniform1f(u.uTime, time);
        gl.uniform2f(u.uCenter, center[0], center[1]);
        gl.uniform2f(u.uSize, MAP_SIZE, MAP_SIZE);
        gl.uniform1f(u.uL, L);
        gl.uniform1f(u.uPix, pix);
        gl.uniform1f(u.uHoleR, holeR);
        gl.uniform3fv(u.uRo, cam.ro);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(lookPass.prog);
        u = lookPass.u;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, map0);
        gl.uniform1i(u.uMap0, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, map1);
        gl.uniform1i(u.uMap1, 1);
        gl.uniform2f(u.uRes, canvas.width, canvas.height);
        gl.uniform2f(u.uCenter, center[0], center[1]);
        gl.uniform1f(u.uL, L);
        gl.uniform1f(u.uTime, time);
        gl.uniform1f(u.uHoleR, holeR);
        gl.uniform1f(u.uPix, pix);
        gl.uniform3fv(u.uLand, land);
        gl.uniform3fv(u.uRo, cam.ro);
        gl.uniform3fv(u.uFw, cam.fw);
        gl.uniform3fv(u.uRt, cam.rt);
        gl.uniform3fv(u.uUp, cam.up);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

  function setUp() {
    var jump = document.querySelector(".hw-jump");
    var stage = document.querySelector(".hw-stage");
    var canvas = document.querySelector(".hw-canvas");
    if (!jump || !stage || !canvas) return;
    var first = stage.querySelector(".hw-word.is-first");
    var second = stage.querySelector(".hw-word.is-second");
    var hint = stage.querySelector(".hw-hint");
    var frameBar = stage.querySelector(".hw-frame");
    var scene = makeScene(canvas);
    if (!scene) stage.classList.add("is-flat");
    if (still) root.classList.add("hw-still");

    var shown = null, shownAt = 0, inSight = true, frame = 0, lastDraw = 0, skipped = false;
    var start = performance.now();

    // How far through the jump the scroll is (0 to 1): the section's height less one window
    function target() {
      if (still) return 0.3;
      var room = jump.offsetHeight - window.innerHeight;
      return room > 0 ? clamp(-jump.getBoundingClientRect().top / room) : 0;
    }

    // A word is in while the jump is between its two points; it leaves upwards once past them
    function word(el, from, to, p) {
      if (!el) return;
      el.classList.toggle("is-on", p >= from && p < to);
      el.classList.toggle("is-gone", p >= to);
    }

    function tick(now) {
      frame = 0;
      var goal = target();
      if (shown == null) shown = goal;
      else shown += (goal - shown) * (1 - Math.exp(-Math.min(now - shownAt, 34) / GLIDE));
      if (Math.abs(goal - shown) < 0.0005) shown = goal;
      shownAt = now;
      var p = shown;
      var hole = smooth(0.72, 0.97, p);
      root.style.setProperty("--hw-open", hole.toFixed(4));
      word(first, 0.1, 0.44, p);
      word(second, 0.48, 0.8, p);
      if (hint) hint.classList.toggle("is-gone", p > 0.03);
      if (frameBar) frameBar.classList.toggle("is-gone", hole > 0.05);
      // At rest the ridges only drift slowly, so it's drawn at about half the pace then (the
      // detail is only judged from frames drawn back to back)
      var resting = shown === goal;
      if (scene && !(resting && now - lastDraw < 30)) {
        if (lastDraw && !skipped) scene.pace(now - lastDraw);
        lastDraw = now;
        skipped = false;
        scene.size();
        scene.draw((now - start) / 1000, p, hole, resting);
      } else skipped = true;
      // Keeps going while in sight (the rings drift), unless it's a still frame
      if (scene && inSight && !still) frame = requestAnimationFrame(tick);
    }

    function soon() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inSight = entries[0].isIntersecting;
        if (inSight) soon();
      }).observe(stage);
    }
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    soon();
  }

  document.addEventListener("DOMContentLoaded", setUp);
})();
