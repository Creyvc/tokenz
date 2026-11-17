// About: the head, a cloud of very fine points drawn on the graphics card (WebGL2), after
// gather.be-of-dao.com's Gather, made our own way. It fills the stage from just under the top
// to the bottom of the window, where its neck ends; it doesn't turn, and the page doesn't scroll.
// - The points: a few hundred thousand, scattered at random over the picture
//   (assets/about-head.jpg, full size) in its own colours, round and soft-edged, as sharp as the
//   screen allows. The white around the head is left out.
// - The shape: each point has a depth, following a human face (forehead, brow, nose, lips, chin)
//   and curving away to the head's outline, with the small ups and downs of the depth map
//   (assets/about-head-depth.png, made once with the Depth Anything V2 model). Facing you, it shows
//   as the nearer middle being stronger and the edges paler, and in how the pointer parts it.
// - On arrival the points fly in from all over and gather into the head.
// - Loose dots drift down to the bottom of the window, swaying, and fade back into place.
// - The pointer pushes the points aside, easing in and out.
// - The team are tracker labels beside it (the HTML list), each with a line to a point on the
//   face (drawn on a second, flat canvas over the first), framed by corner brackets. On a phone
//   the labels sit under it.
// Each point's movement is worked out on the graphics card from the time and the pointer, so
// nothing is stepped point by point here.
// Reduced motion: no gathering, falling or pointer; it stands still.
// Without WebGL2 the picture itself is shown instead.
(function () {
  var stage = document.querySelector("[data-head]");
  if (!stage) return;
  var canvas = stage.querySelector(".head-canvas");
  var lines = stage.querySelector(".head-lines");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia("(max-width: 800px)");

  var FRONT = 380000;      // points on the face (fewer on a phone)
  var POINT = 1.15;        // CSS px across each point, at the head's middle depth
  var RELIEF = 0.05;       // how much the depth map moves the surface, as a share of the width
  var CONTRAST = 1.18;     // a touch more than the picture, as the white between points softens it
  var HEAD_SHARE = 1;      // of the stage's height the picture takes: all of it, so the neck ends
                           // at the bottom of the window
  var FALL_AT = 1.6;       // seconds in, when dots start coming loose
  var PUSH = 70;           // CSS px around the pointer that the points move away from

  // The face's depth down its middle, from the head's centre line, as a share of the head's
  // width; [how far down the picture, depth]. Between the marks it's smoothly joined
  var FACE = [[0.04, 0], [0.1, 0.3], [0.2, 0.45], [0.33, 0.5], [0.4, 0.49], [0.45, 0.45], [0.52, 0.5],
    [0.6, 0.47], [0.66, 0.5], [0.72, 0.46], [0.76, 0.3], [0.79, 0.1], [0.86, 0.08], [1.0, 0.1]];

  var picture = new Image(), depthMap = new Image();
  picture.src = stage.getAttribute("data-src");
  depthMap.src = stage.getAttribute("data-depth");

  var gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
  var lctx = lines.getContext("2d");
  var W = 0, H = 0, dpr = 1, box = null, count = 0, program = null, uni = {};
  var tags = [], faceAt = null, start = 0, running = false, visible = true;
  var push = { x: -1e4, y: -1e4, s: 0 }, pointer = { x: -1e4, y: -1e4, on: false };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function tone(v) { return clamp((v - 128) * CONTRAST + 128 - 8, 0, 255) / 255; }
  function along(marks, v) {
    if (v <= marks[0][0]) return marks[0][1];
    for (var i = 1; i < marks.length; i++) {
      if (v <= marks[i][0]) {
        var a = marks[i - 1], b = marks[i], t = (v - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * (1 - Math.cos(t * Math.PI)) / 2;
      }
    }
    return marks[marks.length - 1][1];
  }

  if (!gl) {
    // No WebGL2: the picture as it is, in the head's place
    var plain = document.createElement("img");
    plain.src = picture.src;
    plain.alt = "";
    plain.className = "head-fallback";
    canvas.replaceWith(plain);
    return;
  }

  // ---- The graphics card's part: where each point goes, and how it looks

  var VERTEX = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 a_uv; in float a_z; in vec3 a_col; in vec4 a_seed;",
    "uniform vec2 u_view; uniform vec4 u_box; uniform float u_time;",
    "uniform float u_dpr; uniform vec3 u_push; uniform float u_fall; uniform float u_point; uniform float u_still;",
    "out vec3 v_col; out float v_alpha;",
    "const float PUSH = " + PUSH.toFixed(1) + ";",
    "float ease3(float t) { return 1.0 - pow(1.0 - t, 3.0); }",
    "void main() {",
    // Facing you, with perspective: nearer points a touch further out from the middle, and bigger
    "  vec3 p = vec3((a_uv.x - 0.5) * u_box.z, u_box.y + a_uv.y * u_box.w, a_z * u_box.z);",
    "  float rx = p.x;",
    "  float rz = p.z;",
    "  float focal = u_box.z * 3.0;",
    "  float scale = focal / (focal - rz);",
    "  float cy = u_box.y + u_box.w * 0.5;",
    "  vec2 at = vec2(u_box.x + u_box.z * 0.5 + rx * scale, cy + (p.y - cy) * scale);",
    "  float near = clamp(0.5 + rz / u_box.z, 0.0, 1.0);",
    "  float alpha = 1.0;",
    // Pushed aside by the pointer
    "  vec2 away = at - u_push.xy;",
    "  float d = length(away);",
    "  if (d < PUSH && d > 0.01) at += away / d * PUSH * pow(1.0 - d / PUSH, 2.0) * 0.55 * u_push.z;",
    // Now and then some come loose and drift to the bottom, then fade back into place; more from
    // low down
    "  float low = clamp(a_uv.y, 0.0, 1.0);",
    "  float share = (0.012 + 0.03 * low * low) * u_fall;",
    "  if (a_seed.w < share) {",
    "    float period = 5.0 + 5.0 * fract(a_seed.x * 7.31);",
    "    float ph = fract(u_time / period + a_seed.y * 3.17);",
    "    if (ph < 0.75) {",
    "      float f = ph / 0.75;",
    "      at.y += (u_view.y + 4.0 - at.y) * f * f;",
    "      at.x += sin(u_time * 2.0 + a_seed.z * 6.283) * 4.0 * f;",
    "      alpha *= 1.0 - smoothstep(0.8, 1.0, f) * 0.8;",
    "    } else {",
    "      alpha *= (ph - 0.75) / 0.25;",
    "    }",
    "  }",
    // Gathering: from a random spot on the screen to its place
    "  float gathered = u_still > 0.5 ? 1.0 : ease3(clamp((u_time - a_seed.z * 0.5) / 1.4, 0.0, 1.0));",
    "  at = mix(a_seed.xy * u_view, at, gathered);",
    "  v_col = mix(a_col, vec3(1.0), (1.0 - near) * 0.6);",
    "  v_alpha = alpha * (0.4 + 0.6 * near);",
    "  gl_PointSize = max(1.0, u_point * scale * u_dpr);",
    "  gl_Position = vec4(at.x / u_view.x * 2.0 - 1.0, 1.0 - at.y / u_view.y * 2.0, clamp(-rz / (u_box.z * 2.0), -1.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 v_col; in float v_alpha; out vec4 o;",
    "void main() {",
    // Round, with a soft edge
    "  float r = length(gl_PointCoord - 0.5);",
    "  float a = smoothstep(0.5, 0.32, r) * v_alpha;",
    "  if (a < 0.04) discard;",
    "  o = vec4(v_col * a, a);",
    "}"
  ].join("\n");

  function shader(type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  // ---- The points, worked out once from the picture and its depth map

  function build() {
    var pw = picture.naturalWidth, ph = picture.naturalHeight;
    function pixels(image, w, h) {
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var x = c.getContext("2d", { willReadFrequently: true });
      x.imageSmoothingQuality = "high";
      x.drawImage(image, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    }
    var pic = pixels(picture, pw, ph);
    // The outline and the depth map, at half size (plenty for a shape)
    var cols = pw >> 1, rows = ph >> 1;
    var small = pixels(picture, cols, rows);
    var deep = pixels(depthMap, cols, rows);

    var bg = new Uint8Array(cols * rows), queue = [];
    function light(i) { return small[i * 4] > 232 && small[i * 4 + 1] > 232 && small[i * 4 + 2] > 232; }
    function seed(c, r) { var i = r * cols + c; if (!bg[i] && light(i)) { bg[i] = 1; queue.push(i); } }
    for (var c = 0; c < cols; c++) { seed(c, 0); seed(c, rows - 1); }
    for (var r = 0; r < rows; r++) { seed(0, r); seed(cols - 1, r); }
    while (queue.length) {
      var i = queue.pop(), x = i % cols, y = (i - x) / cols;
      if (x > 0) seed(x - 1, y);
      if (x < cols - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1);
      if (y < rows - 1) seed(x, y + 1);
    }
    // Leave out the picture's own corner captions and the faint notes round its edge
    function kept(x, y) {
      var u = x / cols, v = y / rows;
      return !bg[y * cols + x] && v >= 0.04 && u >= 0.08 && u <= 0.94 && !(v > 0.92 && (u < 0.3 || u > 0.7));
    }

    // Each row's left and right edge (its longest unbroken stretch, so stray bits beside the head
    // don't count), smoothed over neighbouring rows so the head curves evenly, without streaks;
    // and the head's widest, for scaling its depth
    var left = new Float32Array(rows), right = new Float32Array(rows), widest = 0;
    for (var ry = 0; ry < rows; ry++) {
      var bestStart = -1, bestLength = 0, runStart = -1;
      for (var rx = 0; rx <= cols; rx++) {
        var inside = rx < cols && kept(rx, ry);
        if (inside && runStart < 0) runStart = rx;
        if (!inside && runStart >= 0) {
          if (rx - runStart > bestLength) { bestLength = rx - runStart; bestStart = runStart; }
          runStart = -1;
        }
      }
      left[ry] = bestLength > 4 ? bestStart : -1;
      right[ry] = bestLength > 4 ? bestStart + bestLength - 1 : -1;
    }
    var rawLeft = left.slice(), rawRight = right.slice(), REACH = 12;
    for (var sy = 0; sy < rows; sy++) {
      if (rawRight[sy] < 0) continue;
      var sl = 0, sr = 0, sn = 0;
      for (var dy = -REACH; dy <= REACH; dy++) {
        var yy = sy + dy;
        if (yy < 0 || yy >= rows || rawRight[yy] < 0) continue;
        sl += rawLeft[yy]; sr += rawRight[yy]; sn++;
      }
      left[sy] = sl / sn; right[sy] = sr / sn;
      if (sy < rows * 0.8) widest = Math.max(widest, (right[sy] - left[sy]) / cols);
    }
    var middle = 0.5;
    for (var mr = (rows * 0.3) | 0, sum = 0, n0 = 0; mr < rows * 0.6; mr++) if (right[mr] >= 0) { sum += (left[mr] + right[mr]) / 2 / cols; n0++; }
    if (n0) middle = sum / n0;

    // The depth map's light and dark over the head only, ignoring the extremes
    var values = [];
    for (var q = 0; q < cols * rows; q += 7) if (kept(q % cols, (q / cols) | 0)) values.push(deep[q * 4]);
    values.sort(function (a, b) { return a - b; });
    var lo = values[Math.floor(values.length * 0.03)] || 0, hi = values[Math.floor(values.length * 0.97)] || 255;

    // A point of the head: how far across its row (-1 to +1), so the row curves away to the
    // outline, and its depth in front (the face) or behind (the skull), as a share of the width
    function across(u, v) {
      var y = clamp((v * rows) | 0, 0, rows - 1);
      if (right[y] < 0) return 0;
      var l = left[y] / cols, rr = (right[y] + 1) / cols, c = (l + rr) / 2;
      return clamp((u - c) / ((rr - l) / 2), -1, 1);
    }
    faceAt = function (u, v) {
      var xn = across(u, v), curve = Math.sqrt(Math.max(0, 1 - xn * xn));
      // The nose: a ridge down the middle, rising to its tip, then back in under it
      var nose = 0.09 * smooth(0.42, 0.56, v) * (1 - smooth(0.56, 0.63, v)) * Math.exp(-Math.pow(xn / 0.2, 2));
      var lips = 0.02 * Math.exp(-Math.pow((v - 0.66) / 0.025, 2)) * Math.exp(-Math.pow(xn / 0.3, 2));
      var k = (clamp((v * rows) | 0, 0, rows - 1) * cols + clamp((u * cols) | 0, 0, cols - 1)) * 4;
      var relief = (clamp((deep[k] - lo) / Math.max(1, hi - lo), 0, 1) - 0.5) * RELIEF * curve;
      return (along(FACE, v) * curve + nose + lips) * widest + relief;
    };

    var front = narrow.matches ? Math.round(FRONT * 0.45) : FRONT;
    var STRIDE = 10;
    var data = new Float32Array(front * STRIDE);
    var n = 0;
    function put(u, v, z, r, g, b) {
      var o = n * STRIDE;
      data[o] = u; data[o + 1] = v; data[o + 2] = z + (Math.random() - 0.5) * 0.006;
      data[o + 3] = r; data[o + 4] = g; data[o + 5] = b;
      data[o + 6] = Math.random(); data[o + 7] = Math.random(); data[o + 8] = Math.random(); data[o + 9] = Math.random();
      n++;
    }
    function colourAt(u, v, dim) {
      var k = ((clamp(v, 0, 0.999) * ph | 0) * pw + (clamp(u, 0, 0.999) * pw | 0)) * 4;
      return [tone(pic[k]) * dim, tone(pic[k + 1]) * dim, tone(pic[k + 2]) * dim];
    }

    // The face
    for (var tries = 0; n < front && tries < front * 8; tries++) {
      var u = Math.random(), v = Math.random();
      if (!kept((u * cols) | 0, (v * rows) | 0)) continue;
      var k2 = (((v * ph) | 0) * pw + ((u * pw) | 0)) * 4;
      // Right at the outline the picture fades to white; those pale points are left out
      if (Math.abs(across(u, v)) > 0.94 && pic[k2] + pic[k2 + 1] + pic[k2 + 2] > 3 * 175) continue;
      var col = colourAt(u, v, 1);
      put(u - middle + 0.5, v, faceAt(u, v), col[0], col[1], col[2]);
    }
    count = n;

    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STRIDE), gl.STATIC_DRAW);
    [["a_uv", 2, 0], ["a_z", 1, 2], ["a_col", 3, 3], ["a_seed", 4, 6]].forEach(function (attr) {
      var loc = gl.getAttribLocation(program, attr[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, attr[1], gl.FLOAT, false, STRIDE * 4, attr[2] * 4);
    });
    ["u_view", "u_box", "u_time", "u_dpr", "u_push", "u_fall", "u_point", "u_still"].forEach(function (name) {
      uni[name] = gl.getUniformLocation(program, name);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    faceAt.middle = middle;
  }

  // ---- Size and labels

  function layout() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    [canvas, lines].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    gl.viewport(0, 0, canvas.width, canvas.height);
    var ih = H * HEAD_SHARE;
    var iw = ih * picture.naturalWidth / picture.naturalHeight;
    var most = narrow.matches ? W : W * 0.7;
    if (iw > most) { iw = most; ih = iw * picture.naturalHeight / picture.naturalWidth; }
    box = { x: (W - iw) / 2, y: 0, w: iw, h: ih };
    placeTags();
  }

  // The same perspective as the graphics card, for the labels' lines
  function project(x, y, z) {
    var rx = x, rz = z;
    var focal = box.w * 3, scale = focal / (focal - rz), cy = box.y + box.h * 0.5;
    return { x: box.x + box.w / 2 + rx * scale, y: cy + (y - cy) * scale, near: clamp(0.5 + rz / box.w, 0, 1) };
  }

  // Where each label's line starts (beside its text), and the spot on the face it points to
  function placeTags() {
    tags = [];
    if (narrow.matches) return;
    var at = stage.getBoundingClientRect();
    stage.querySelectorAll("[data-point]").forEach(function (li) {
      var point = li.getAttribute("data-point").split(",").map(Number);
      var name = li.querySelector(".head-name").getBoundingClientRect();
      var left = li.classList.contains("is-left");
      tags.push({
        left: left, u: point[0] - faceAt.middle + 0.5, v: point[1], z: faceAt(point[0], point[1]),
        from: { x: (left ? name.right + 12 : name.left - 12) - at.left, y: name.top + name.height / 2 - at.top }
      });
    });
  }

  function drawTags() {
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    if (!tags.length) return;
    lctx.lineWidth = 1;
    tags.forEach(function (tag) {
      var spot = project((tag.u - 0.5) * box.w, box.y + tag.v * box.h, tag.z * box.w);
      var x = spot.x, y = spot.y, r = 9, k = 4;
      lctx.strokeStyle = "rgba(22, 23, 26, 0.55)";
      lctx.beginPath();
      lctx.moveTo(tag.from.x, tag.from.y);
      lctx.lineTo(x, tag.from.y);
      lctx.lineTo(x, y + (tag.from.y < y ? -r : r));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner) {
        var cx = x + corner[0] * r, cy = y + corner[1] * r;
        lctx.moveTo(cx - corner[0] * k, cy);
        lctx.lineTo(cx, cy);
        lctx.lineTo(cx, cy - corner[1] * k);
      });
      lctx.stroke();
      lctx.fillStyle = "#16171A";
      lctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
  }

  // ---- Each frame

  function draw(now) {
    var t = still ? 1e4 : (now - start) / 1000;
    // The pointer's push eases in where it is, and out when it leaves
    if (pointer.on) { push.x += (pointer.x - push.x) * 0.25; push.y += (pointer.y - push.y) * 0.25; }
    push.s += ((pointer.on && !still ? 1 : 0) - push.s) * 0.12;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uni.u_view, W, H);
    gl.uniform4f(uni.u_box, box.x, box.y, box.w, box.h);
    gl.uniform1f(uni.u_time, t);
    gl.uniform1f(uni.u_dpr, dpr);
    gl.uniform3f(uni.u_push, push.x, push.y, push.s);
    gl.uniform1f(uni.u_fall, still ? 0 : clamp((t - FALL_AT) / 1.5, 0, 1));
    gl.uniform1f(uni.u_point, POINT);
    gl.uniform1f(uni.u_still, still ? 1 : 0);
    gl.drawArrays(gl.POINTS, 0, count);
    drawTags();
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

  function begin() {
    build();
    layout();
    start = performance.now();
    run(true);
    new ResizeObserver(function () { layout(); if (still) run(true); }).observe(stage);
    document.addEventListener("visibilitychange", function () { run(visible && !document.hidden); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        run(visible && !document.hidden);
      }).observe(stage);
    }
    stage.addEventListener("pointermove", function (event) {
      var at = stage.getBoundingClientRect();
      pointer.x = event.clientX - at.left;
      pointer.y = event.clientY - at.top;
      if (!pointer.on) { push.x = pointer.x; push.y = pointer.y; }
      pointer.on = true;
    });
    stage.addEventListener("pointerleave", function () { pointer.on = false; });
    if (document.fonts) document.fonts.ready.then(placeTags);
  }

  var loaded = 0;
  function ready() { if (++loaded === 2) begin(); }
  [picture, depthMap].forEach(function (image) {
    if (image.complete && image.naturalWidth) ready();
    else image.addEventListener("load", ready);
  });
})();
