// Grainient in plain JavaScript: a drifting, wavy gradient with satin folds and film grain. The
// cursor drags the colours like paint and a click twists them into a swirl that unwinds. Same
// shaders and settings as React Bits' <Grainient /> component (reactbits.dev); this site has no
// build step, so the component's React hooks are replaced by a plain function.
//
//   var bg = Grainient(element, { colors: ["#120f17", "#9a3412", "#fed7aa"], angle: 55 });
//   bg.set({ ...any option }) changes options later; bg.destroy() takes it out again.
//   bg.hold(true) pauses it while it's hidden behind something; bg.hold(false) carries on.
// Options are the component's props. Without WebGL2 it returns null and leaves the element as it was.
(function () {
  var MAX_COLORS = 8;
  var MAX_STIRS = 24;
  var MAX_TWIRLS = 4;
  var STIR_LIFE = 1.3;
  var STIR_STEP = 0.06;
  var TWIRL_LIFE = 2.6;
  var INTRO_SECONDS = 1.6;
  var DEFAULT_COLORS = ["#120f17", "#2a0f0a", "#9a3412", "#f97316", "#fed7aa"];
  var TYPES = { linear: 0, radial: 1 };
  var LIFT = 0.2;
  var DEFAULTS = {
    colors: DEFAULT_COLORS, type: "linear", angle: 55, bands: 1, speed: 1, flow: 0.8, scale: 1,
    softness: 1, silk: 0.35, grainAmount: 0.08, grainSize: 1.2, grainAnimated: true, contrast: 1,
    saturation: 1, variation: 0, interactive: true, stir: 1, clickSwirl: true, intro: true,
    lightMode: false, dpr: undefined
  };

  // ---- Shaders, unchanged from the component

  var VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  var FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform vec3 uRamp[8];
uniform int uCount;
uniform int uType;
uniform vec2 uDir;
uniform float uExtent;
uniform float uBands;
uniform float uSoftness;
uniform float uFlow;
uniform float uScale;
uniform float uSilk;
uniform vec4 uStir[24];
uniform float uStirWeight[24];
uniform vec4 uTwirl[4];
uniform vec2 uSeed;
uniform float uContrast;
uniform float uSaturation;
uniform float uSettle;
uniform float uReveal;
in vec2 vUv;
out vec4 outColor;

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 drift(vec2 p, float t) {
  vec2 w1 = vec2(
    noise(p * 0.85 + vec2(t * 0.11, t * 0.07)),
    noise(p * 0.85 + vec2(4.1, 1.7) - vec2(t * 0.08, t * 0.12))
  );
  vec2 w2 = vec2(
    noise(p * 1.55 + w1 * 1.8 + vec2(1.3, 7.1) + t * 0.05),
    noise(p * 1.55 + w1 * 1.8 + vec2(6.4, 2.2) - t * 0.06)
  );
  return (w1 - 0.5) * 1.1 + (w2 - 0.5) * 0.55;
}

vec2 warp(vec2 p) {
  vec2 q = p / uScale;
  if (uType == 1) {
    float turn = uTime * 0.35;
    q = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * q;
  } else {
    q += vec2(-uDir.y, uDir.x) * uTime * 0.45;
  }
  return p + drift(q + uSeed, uTime) * uFlow * uScale * uSettle;
}

float coord(vec2 p) {
  vec2 w = warp(p);
  return uType == 1 ? 1.0 - length(w) * 1.1 : dot(w, uDir) / uExtent + 0.5;
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  for (int i = 0; i < 24; i++) {
    float w = uStirWeight[i];
    if (w <= 0.0) continue;
    vec2 d = p - uStir[i].xy;
    p -= uStir[i].zw * w * exp(-dot(d, d) / 0.045);
  }
  for (int i = 0; i < 4; i++) {
    float angle = uTwirl[i].z;
    if (angle == 0.0) continue;
    vec2 d = p - uTwirl[i].xy;
    float a = angle * exp(-dot(d, d) / (uTwirl[i].w * uTwirl[i].w));
    float c = cos(a);
    float s = sin(a);
    p = uTwirl[i].xy + mat2(c, -s, s, c) * d;
  }
  float raw = coord(p);
  float s = raw;
  if (uBands > 1.0) {
    s *= uBands;
    float cycle = floor(s);
    s = fract(s);
    if (mod(cycle, 2.0) > 0.5) s = 1.0 - s;
  }
  s = clamp(s, 0.0, 1.0);
  float scaled = s * float(uCount - 1);
  int index = int(min(floor(scaled), float(uCount - 2)));
  float f = scaled - float(index);
  float edge = max(uSoftness * 0.5, fwidth(scaled) * 0.75);
  float shaped = smoothstep(0.5 - edge, 0.5 + edge, f);
  vec3 from = uRamp[0];
  vec3 to = uRamp[1];
  for (int i = 0; i < 7; i++) {
    if (i == index) {
      from = uRamp[i];
      to = uRamp[i + 1];
    }
  }
  vec3 lab = mix(from, to, shaped);
  if (uSilk > 0.0) {
    vec2 grad = vec2(coord(p + vec2(0.004, 0.0)) - raw, coord(p + vec2(0.0, 0.004)) - raw) / 0.004;
    vec2 slope = grad * sin(3.14159265 * clamp(raw, 0.0, 1.0) * uBands) * uSilk * 4.0;
    vec3 normal = normalize(vec3(-slope, 1.0));
    vec3 light = normalize(vec3(-uDir.y, uDir.x, 1.2));
    float diffuse = dot(normal, light) - light.z;
    lab = uRamp[0] + (lab - uRamp[0]) * (1.0 + (diffuse * 0.35 + max(diffuse, 0.0) * diffuse * 0.6) * uSilk);
  }
  lab = mix(uRamp[0], lab, smoothstep(0.0, 1.0, uReveal * 1.5 - length(vUv - 0.5) * 0.6));
  lab.x = (lab.x - 0.55) * uContrast + 0.55;
  lab.yz *= uSaturation;
  outColor = vec4(encode(labToRgb(lab)), 1.0);
}`;

  var COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uGrain;
uniform float uGrainSize;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float clump(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 color = texture(uField, vUv).rgb;
  vec2 pixel = gl_FragCoord.xy + uFrame * vec2(17.0, 59.0);
  float fine = hash(pixel) + hash(pixel + 7.13) - 1.0;
  float coarse = (clump(pixel / max(uGrainSize, 1.0)) - 0.5) * 2.0;
  float grain = mix(fine, coarse, clamp(uGrainSize - 1.0, 0.0, 1.0) * 0.8);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color += grain * uGrain * (0.45 + 2.2 * luma * (1.0 - luma));
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function toLinear(value) { return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); }

  // sRGB to OKLab, which the shader mixes in so the blends stay even
  function toLab(rgb) {
    var lr = toLinear(rgb[0]);
    var lg = toLinear(rgb[1]);
    var lb = toLinear(rgb[2]);
    var l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    var m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    var s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  function link(gl, fragmentSource) {
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      if (!info) continue;
      var name = info.name.replace(/\[0\]$/, "");
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program: program, uniforms: uniforms };
  }

  // The options as the component reads them: limited to their ranges, with at least two colours
  function settle(p) {
    var palette = (Array.isArray(p.colors) && p.colors.length ? p.colors : DEFAULT_COLORS).slice(0, MAX_COLORS);
    return {
      colors: palette.length > 1 ? palette : [palette[0], palette[0]],
      type: TYPES[p.type] !== undefined ? TYPES[p.type] : 0,
      angle: p.angle,
      bands: clamp(p.bands, 1, 8),
      speed: Math.max(0, p.speed),
      flow: clamp(p.flow, 0, 3),
      scale: clamp(p.scale, 0.25, 3),
      softness: clamp(p.softness, 0, 1),
      silk: clamp(p.silk, 0, 1),
      grainAmount: clamp(p.grainAmount, 0, 0.5),
      grainSize: clamp(p.grainSize, 0.5, 4),
      grainAnimated: p.grainAnimated,
      contrast: clamp(p.contrast, 0.2, 2),
      saturation: clamp(p.saturation, 0, 2),
      variation: Math.max(0, p.variation),
      interactive: p.interactive,
      stir: clamp(p.stir, 0, 2),
      clickSwirl: p.clickSwirl,
      intro: p.intro,
      lightMode: p.lightMode,
      dpr: p.dpr
    };
  }

  window.Grainient = function (element, options) {
    var props = Object.assign({}, DEFAULTS, options || {});
    var settings = settle(props);

    var container = document.createElement("div");
    container.className = "grainient-container";
    var canvas = document.createElement("canvas");
    canvas.className = "grainient-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    var gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    var field = link(gl, FIELD);
    var composite = link(gl, COMPOSITE);
    if (!field || !composite) return null;
    element.appendChild(container);

    var fu = field.uniforms;
    var cu = composite.uniforms;
    var vao = gl.createVertexArray();
    var target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var buffer = gl.createFramebuffer();
    var fieldSize = { width: 0, height: 0 };

    // Any CSS colour to 0..1 RGB, by painting it on a one-pixel canvas
    var probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    var colorCache = new Map();
    function parse(value) {
      var key = String(value);
      var cached = colorCache.get(key);
      if (cached) return cached;
      var rgb = [0, 0, 0];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000000";
        probe.fillStyle = key;
        probe.fillRect(0, 0, 1, 1);
        var data = probe.getImageData(0, 0, 1, 1).data;
        rgb = [data[0] / 255, data[1] / 255, data[2] / 255];
      }
      colorCache.set(key, rgb);
      return rgb;
    }

    var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    var view = { width: 1, height: 1, ratio: 1 };
    var ramp = new Float32Array(MAX_COLORS * 3);
    var stirs = new Float32Array(MAX_STIRS * 4);
    var stirWeights = new Float32Array(MAX_STIRS);
    var twirls = new Float32Array(MAX_TWIRLS * 4);
    var trail = [];
    var spins = [];
    var pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, vx: 0, inside: false, fresh: true };
    var paletteKey = "";
    var time = 0;
    var introClock = settings.intro && !reduce ? 0 : 1;
    var frameSeed = 0;
    var grainClock = 0;
    var raf = 0;
    var last = 0;
    var visible = true;

    function syncPalette() {
      var s = settings;
      var key = s.colors.join(",") + "|" + s.lightMode;
      if (key === paletteKey) return;
      paletteKey = key;
      var labs = s.colors.map(function (color) { return toLab(parse(color)); });
      if (!s.lightMode) {
        labs.forEach(function (lab, i) { ramp.set(lab, i * 3); });
      } else {
        var blank = labs.map(function (lab) { return Math.abs(lab[0] - labs[0][0]) < 0.1; });
        var tints = labs.filter(function (_, i) { return !blank[i]; }).reverse();
        labs.forEach(function (_, i) {
          var c = blank[i] ? [1, 0, 0] : tints.shift();
          ramp.set([c[0] + (1 - c[0]) * LIFT, c[1] * (1 - LIFT), c[2] * (1 - LIFT)], i * 3);
        });
      }
    }

    function draw() {
      var s = settings;
      var aspect = view.width / view.height;
      syncPalette();
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.viewport(0, 0, fieldSize.width, fieldSize.height);
      gl.useProgram(field.program);
      gl.uniform1f(fu.uAspect, aspect);
      gl.uniform1f(fu.uTime, time);
      gl.uniform3fv(fu.uRamp, ramp);
      gl.uniform1i(fu.uCount, s.colors.length);
      var radians = (s.angle * Math.PI) / 180;
      gl.uniform1i(fu.uType, s.type);
      gl.uniform2f(fu.uDir, Math.sin(radians), Math.cos(radians));
      gl.uniform1f(fu.uExtent, aspect * Math.abs(Math.sin(radians)) + Math.abs(Math.cos(radians)));
      gl.uniform1f(fu.uBands, s.bands);
      gl.uniform1f(fu.uSoftness, s.softness);
      gl.uniform1f(fu.uFlow, s.flow);
      gl.uniform1f(fu.uScale, s.scale);
      gl.uniform1f(fu.uSilk, s.silk);
      gl.uniform4fv(fu.uStir, stirs);
      gl.uniform1fv(fu.uStirWeight, stirWeights);
      gl.uniform4fv(fu.uTwirl, twirls);
      gl.uniform2f(fu.uSeed, s.variation * 3.17, s.variation * 1.91);
      gl.uniform1f(fu.uContrast, s.contrast);
      gl.uniform1f(fu.uSaturation, s.saturation);
      gl.uniform1f(fu.uSettle, introClock * introClock * (3 - 2 * introClock));
      gl.uniform1f(fu.uReveal, introClock);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(cu.uField, 0);
      gl.uniform1f(cu.uGrain, s.grainAmount);
      gl.uniform1f(cu.uGrainSize, s.grainSize * view.ratio);
      gl.uniform1f(cu.uFrame, frameSeed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // The colours are drawn at half resolution, then the grain is added at full resolution
    function resize() {
      var s = settings;
      view.width = Math.max(1, container.clientWidth);
      view.height = Math.max(1, container.clientHeight);
      view.ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      var width = Math.max(1, Math.round(canvas.width / 2));
      var height = Math.max(1, Math.round(canvas.height / 2));
      if (width !== fieldSize.width || height !== fieldSize.height) {
        fieldSize.width = width;
        fieldSize.height = height;
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      draw();
      wake();
    }

    // The cursor's trail of drags and the click swirls, aged and packed for the shader
    function updateTouches(dt, aspect) {
      var s = settings;
      var follow = 1 - Math.exp(-dt / 0.06);
      var px = pointer.sx;
      var py = pointer.sy;
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      var vx = ((pointer.sx - px) / dt) * aspect;
      var vy = (pointer.sy - py) / dt;
      pointer.vx = vx;
      var head = trail[0];
      trail.forEach(function (sample) {
        if (sample.done) sample.age += dt;
      });
      if (s.interactive && pointer.inside && Math.hypot(vx, vy) > 0.02 && !reduce) {
        if (!head || head.done) {
          trail.unshift({ x: 0, y: 0, vx: 0, vy: 0, age: 0, grow: 0, done: false });
          if (trail.length > MAX_STIRS) trail.pop();
        }
        var live = trail[0];
        live.x = (pointer.sx - 0.5) * aspect;
        live.y = pointer.sy - 0.5;
        live.vx = vx;
        live.vy = vy;
        live.grow = Math.min(1, live.grow + dt / STIR_STEP);
        live.done = live.grow >= 1;
      } else if (head) {
        head.done = true;
      }
      while (trail.length && trail[trail.length - 1].age > STIR_LIFE) trail.pop();
      for (var i = 0; i < MAX_STIRS; i++) {
        var sample = trail[i];
        if (!sample) {
          stirWeights[i] = 0;
          continue;
        }
        var fade = 1 - sample.age / STIR_LIFE;
        var cap = Math.min(1, 2.2 / Math.max(Math.hypot(sample.vx, sample.vy), 0.001));
        stirs.set([sample.x, sample.y, sample.vx * cap, sample.vy * cap], i * 4);
        stirWeights[i] = fade * fade * sample.grow * s.stir * 0.05;
      }
      spins.forEach(function (spin) {
        spin.age += dt;
      });
      while (spins.length && spins[spins.length - 1].age > TWIRL_LIFE) spins.pop();
      for (var j = 0; j < MAX_TWIRLS; j++) {
        var spin = spins[j];
        if (!spin) {
          twirls[j * 4 + 2] = 0;
          continue;
        }
        var k = spin.age / TWIRL_LIFE;
        var envelope = Math.min(1, spin.age / 0.18) * (1 - k) * (1 - k);
        twirls.set([spin.x, spin.y, spin.direction * 2.4 * envelope, 0.16 + 0.1 * Math.min(1, spin.age / 0.5)], j * 4);
      }
    }

    function frame(now) {
      raf = 0;
      if (!visible || held || document.hidden) return;
      var s = settings;
      var dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 60;
      last = now;
      if (!reduce) time += dt * s.speed * 0.16;
      if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);
      grainClock += dt;
      if (s.grainAnimated && !reduce && grainClock > 1 / 24) {
        grainClock = 0;
        frameSeed = (frameSeed + 1) % 97;
      }
      updateTouches(dt, view.width / view.height);
      draw();
      var busy = (!reduce && (s.speed > 0 || s.grainAnimated)) || introClock < 1 || trail.length > 0 || spins.length > 0;
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    }

    function wake() {
      if (!raf && visible && !held && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function locate(event) {
      var rect = container.getBoundingClientRect();
      var x = (event.clientX - rect.left) / Math.max(1, rect.width);
      var y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      pointer.x = x;
      pointer.y = y;
      if (pointer.fresh || !pointer.inside) {
        pointer.sx = x;
        pointer.sy = y;
        pointer.fresh = false;
      }
    }

    function onPointerMove(event) {
      locate(event);
      if (pointer.inside || trail.length) wake();
    }

    function onPointerDown(event) {
      locate(event);
      var s = settings;
      if (!pointer.inside || !s.clickSwirl || reduce) return;
      spins.unshift({
        x: (pointer.x - 0.5) * (view.width / view.height),
        y: pointer.y - 0.5,
        age: 0,
        direction: pointer.vx < 0 ? 1 : -1
      });
      if (spins.length > MAX_TWIRLS) spins.pop();
      wake();
    }

    function onPointerLeave() {
      pointer.inside = false;
    }

    function onVisibility() {
      last = 0;
      wake();
    }

    // held: paused by the page (hold), for when it's on screen but covered by something else
    var held = false;
    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    var intersection = new IntersectionObserver(function (entries) {
      visible = entries.some(function (entry) { return entry.isIntersecting; });
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return {
      set: function (next) {
        Object.assign(props, next || {});
        settings = settle(props);
        wake();
      },
      hold: function (on) {
        if (held === !!on) return;
        held = !!on;
        if (!held) {
          last = 0;
          wake();
        }
      },
      destroy: function () {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerdown", onPointerDown);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        gl.deleteTexture(target);
        gl.deleteFramebuffer(buffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(field.program);
        gl.deleteProgram(composite.program);
        var lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        if (container.parentNode) container.parentNode.removeChild(container);
      }
    };
  };
})();
