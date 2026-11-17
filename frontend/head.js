// About: the head, a 3D cloud of very fine points drawn on the graphics card (WebGL2), after
// gather.be-of-dao.com's Gather, made our own way.
// - The points: a few hundred thousand, scattered at random over the picture
//   (assets/about-head.jpg, full size) in its own colours, round and soft-edged, as sharp as the
//   screen allows. The white around the head is left out.
// - The shape: each point's depth comes from a depth map of the picture
//   (assets/about-head-depth.png, made once with the Depth Anything V2 model), blended with a
//   dome from the head's outline so its edges curve away. A fainter shell of points behind makes
//   the back of the head. Points hide the ones behind them.
// - Scrolling turns it: the head stays pinned while the page scrolls and turns one full way
//   round, eased. Nearer points are stronger, further ones paler.
// - On arrival the points fly in from all over and gather into the head.
// - Loose dots drift down to the bottom of the window, swaying, and fade back into place.
// - The pointer pushes the points aside, easing in and out.
// - From the neck down it melts: it sags, and drips run down to the bottom of the window.
// - The team are tracker labels beside it (the HTML list), each with a line to a point on the
//   head (drawn on a second, flat canvas over the first), following it round and fading when
//   it's behind, with corner brackets and its coordinates. On a phone the labels sit under it.
// Each point's movement is worked out on the graphics card from the time, the scroll and the
// pointer, so nothing is stepped point by point here.
// Reduced motion: no turning, gathering, falling, pointer or sway; it stands still.
// Without WebGL2 the picture itself is shown instead.
(function () {
  var stage = document.querySelector("[data-head]");
  if (!stage) return;
  var canvas = stage.querySelector(".head-canvas");
  var lines = stage.querySelector(".head-lines");
  var track = stage.closest(".head-scroll") || document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia("(max-width: 800px)");

  var FRONT = 300000;      // points on the face (fewer on a phone)
  var BACK = 0.4;          // and this many more again for the back of the head
  var POINT = 1.15;        // CSS px across each point, at the head's middle depth
  var DEPTH = 0.42;        // how far the head comes towards you, as a share of its width
  var FROM_MAP = 0.7;      // how much of the depth is the depth map (the rest is the dome)
  var TURNS = 1;           // full turns over the whole scroll
  var CONTRAST = 1.18;     // a touch more than the picture, as the white between points softens it
  var HEAD_SHARE = 0.72;   // of the stage's height the picture takes; below it, the drips
  var MELT_FROM = 0.68;    // where down the picture the sagging starts
  var SAG = 0.22;          // how far the lowest points sag, as a share of the room below
  var GROW = 2.6;          // seconds for the drips to run down, once the head has gathered
  var GATHER_AT = 0.6;     // seconds in, when the drips start
  var FALL_AT = 1.6;       // seconds in, when dots start coming loose
  var FALLING = 0.05;      // share of the points that come loose now and then (more low down)
  var PUSH = 70;           // CSS px around the pointer that the points move away from
  var DRIP_EVERY = 2;      // mask pixels between drips
  var DRIP_POINTS = 140;   // points along each drip

  var picture = new Image(), depthMap = new Image();
  picture.src = stage.getAttribute("data-src");
  depthMap.src = stage.getAttribute("data-depth");

  var gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
  var lctx = lines.getContext("2d");
  var W = 0, H = 0, dpr = 1, box = null, count = 0, program = null, uni = {};
  var tags = [], depthAt = null, start = 0, running = false, visible = true;
  var angle = 0, push = { x: -1e4, y: -1e4, s: 0 }, pointer = { x: -1e4, y: -1e4, on: false };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function tone(v) { return clamp((v - 128) * CONTRAST + 128 - 8, 0, 255) / 255; }

  if (!gl) {
    // No WebGL2: the picture as it is, in the head's place
    var still_img = document.createElement("img");
    still_img.src = picture.src;
    still_img.alt = "";
    still_img.className = "head-fallback";
    canvas.replaceWith(still_img);
    return;
  }

  // ---- The graphics card's part: where each point goes, and how it looks

  var VERTEX = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 a_uv; in float a_z; in vec3 a_col; in vec4 a_seed; in vec3 a_drip;",
    "uniform vec2 u_view; uniform vec4 u_box; uniform vec2 u_turn; uniform float u_time;",
    "uniform float u_grow; uniform float u_dpr; uniform vec3 u_push; uniform float u_fall;",
    "uniform float u_point; uniform float u_still;",
    "out vec3 v_col; out float v_alpha;",
    "const float SAG = " + SAG.toFixed(3) + ";",
    "const float MELT = " + MELT_FROM.toFixed(3) + ";",
    "const float DEPTH = " + DEPTH.toFixed(3) + ";",
    "const float PUSH = " + PUSH.toFixed(1) + ";",
    "float ease3(float t) { return 1.0 - pow(1.0 - t, 3.0); }",
    // A point of the head on screen: turned round the middle, with perspective
    "vec4 project(vec3 p) {",
    "  float rx = p.x * u_turn.x + p.z * u_turn.y;",
    "  float rz = -p.x * u_turn.y + p.z * u_turn.x;",
    "  float focal = u_box.z * 3.0;",
    "  float scale = focal / (focal - rz);",
    "  float cy = u_box.y + u_box.w * 0.5;",
    "  float mid = u_box.x + u_box.z * 0.5;",
    "  return vec4(mid + rx * scale, cy + (p.y - cy) * scale, rz, scale);",
    "}",
    "void main() {",
    "  float room = u_view.y - (u_box.y + u_box.w);",
    "  float isDrip = step(0.5, a_drip.z);",
    "  float sagging = a_uv.y > MELT ? pow((a_uv.y - MELT) / (1.0 - MELT), 2.0) : 0.0;",
    "  vec3 p = vec3((a_uv.x - 0.5) * u_box.z, u_box.y + a_uv.y * u_box.w + mix(sagging, 1.0, isDrip) * SAG * room * u_grow, a_z * u_box.z);",
    "  vec4 s = project(p);",
    "  float near = clamp(0.5 + s.z / (DEPTH * u_box.z * 2.0), 0.0, 1.0);",
    "  vec2 at = s.xy;",
    "  float alpha = 1.0;",
    "  float size = u_point * s.w;",
    "  if (isDrip > 0.5) {",
    // Down from its column's lowest point, wavering, thinner and fainter towards the tip
    "    float swing = 1.0 + 0.05 * sin(u_time * 0.7 + a_seed.x * 6.283) * (1.0 - u_still);",
    "    float length = a_drip.y * max(0.0, u_view.y - at.y) * 0.97 * u_grow * swing;",
    "    at.y += a_drip.x * length;",
    "    at.x += 0.6 * sin(a_drip.x * 40.0 + u_time * 1.3 + a_seed.x * 6.283) * (1.0 - u_still);",
    "    alpha = 1.0 - 0.45 * a_drip.x;",
    "    size *= mix(1.0, 0.5, a_drip.x) * (a_drip.x > 0.985 ? 1.7 : 1.0);",
    "  } else {",
    // Pushed aside by the pointer
    "    vec2 away = at - u_push.xy;",
    "    float d = length(away);",
    "    if (d < PUSH && d > 0.01) at += away / d * PUSH * pow(1.0 - d / PUSH, 2.0) * 0.55 * u_push.z;",
    // Now and then some come loose and drift to the bottom, then fade back into place
    "    float share = 0.05 * (0.25 + 0.75 * a_uv.y * a_uv.y) * u_fall;",
    "    if (a_seed.w < share) {",
    "      float period = 5.0 + 5.0 * fract(a_seed.x * 7.31);",
    "      float ph = fract(u_time / period + a_seed.y * 3.17);",
    "      if (ph < 0.75) {",
    "        float f = ph / 0.75;",
    "        at.y += (u_view.y + 4.0 - at.y) * f * f;",
    "        at.x += sin(u_time * 2.0 + a_seed.z * 6.283) * 4.0 * f;",
    "        alpha *= 1.0 - smoothstep(0.8, 1.0, f) * 0.8;",
    "      } else {",
    "        alpha *= (ph - 0.75) / 0.25;",
    "      }",
    "    }",
    "  }",
    // Gathering: from a random spot on the screen to its place
    "  float gathered = u_still > 0.5 ? 1.0 : ease3(clamp((u_time - a_seed.z * 0.5) / 1.4, 0.0, 1.0));",
    "  at = mix(a_seed.xy * u_view, at, gathered);",
    "  v_col = mix(a_col, vec3(1.0), (1.0 - near) * 0.6);",
    "  v_alpha = alpha * (0.4 + 0.6 * near);",
    "  gl_PointSize = max(1.0, size * u_dpr);",
    "  gl_Position = vec4(at.x / u_view.x * 2.0 - 1.0, 1.0 - at.y / u_view.y * 2.0, clamp(-s.z / (u_box.z * 1.5), -1.0, 1.0), 1.0);",
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
    // The outline and depth, at half size (plenty for a shape)
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

    // How far each kept pixel is inside the outline, for the dome (two passes)
    var far = new Float32Array(cols * rows), most = 1;
    for (var y1 = 0; y1 < rows; y1++) for (var x1 = 0; x1 < cols; x1++) {
      var j = y1 * cols + x1;
      if (!kept(x1, y1)) continue;
      var best = 1e6;
      if (x1 > 0) best = Math.min(best, far[j - 1] + 1);
      if (y1 > 0) best = Math.min(best, far[j - cols] + 1, x1 > 0 ? far[j - cols - 1] + 1.414 : 1e6, x1 < cols - 1 ? far[j - cols + 1] + 1.414 : 1e6);
      far[j] = x1 === 0 || y1 === 0 ? 1 : best;
    }
    for (var y2 = rows - 1; y2 >= 0; y2--) for (var x2 = cols - 1; x2 >= 0; x2--) {
      var k = y2 * cols + x2;
      if (!far[k]) continue;
      var b = far[k];
      if (x2 < cols - 1) b = Math.min(b, far[k + 1] + 1);
      if (y2 < rows - 1) b = Math.min(b, far[k + cols] + 1, x2 < cols - 1 ? far[k + cols + 1] + 1.414 : 1e6, x2 > 0 ? far[k + cols - 1] + 1.414 : 1e6);
      far[k] = b;
      if (b > most) most = b;
    }
    // The depth map stretched over the head only (its own light and dark), ignoring the extremes
    var values = [];
    for (var q = 0; q < cols * rows; q += 7) if (far[q]) values.push(deep[q * 4]);
    values.sort(function (a, b) { return a - b; });
    var lo = values[Math.floor(values.length * 0.03)] || 0, hi = values[Math.floor(values.length * 0.97)] || 255;
    depthAt = function (u, v) {
      var x = clamp((u * cols) | 0, 0, cols - 1), y = clamp((v * rows) | 0, 0, rows - 1), k = y * cols + x;
      var dome = Math.sqrt(Math.max(0, 1 - Math.pow(1 - far[k] / most, 2)));
      var map = clamp((deep[k * 4] - lo) / Math.max(1, hi - lo), 0, 1);
      return { front: DEPTH * ((1 - FROM_MAP) * dome + FROM_MAP * map * dome), dome: dome };
    };

    // The points: the face, then the back of the head, then the drips
    var front = narrow.matches ? Math.round(FRONT * 0.45) : FRONT;
    var back = Math.round(front * BACK);
    var dripCols = [];
    var lowest = new Int32Array(Math.ceil(cols / DRIP_EVERY)).fill(-1);
    for (var xx = 0; xx < cols; xx += DRIP_EVERY) {
      for (var yy = rows - 1; yy >= 0; yy--) if (kept(xx, yy)) { lowest[xx / DRIP_EVERY] = yy; break; }
    }
    var noise = Array.prototype.map.call(lowest, function () { return Math.random(); });
    for (var pass = 0; pass < 4; pass++) noise = noise.map(function (v, i) { return (noise[Math.max(0, i - 1)] + v + noise[Math.min(noise.length - 1, i + 1)]) / 3; });
    var nlo = Math.min.apply(null, noise), nhi = Math.max.apply(null, noise);
    lowest.forEach(function (row, i) {
      if (row < 0) return;
      var m = nhi > nlo ? (noise[i] - nlo) / (nhi - nlo) : 0.5;
      dripCols.push({ x: i * DRIP_EVERY, y: row, length: (row >= rows - 4 ? 1 : 0.1) * (0.3 + 0.7 * Math.pow(m, 1.2)), seed: Math.random() });
    });
    var drips = dripCols.length * DRIP_POINTS;

    count = front + back + drips;
    var STRIDE = 13;
    var data = new Float32Array(count * STRIDE);
    var n = 0;
    function put(u, v, z, r, g, bl, dripAt, dripLength, isDrip, s0) {
      var o = n * STRIDE;
      data[o] = u; data[o + 1] = v; data[o + 2] = z;
      data[o + 3] = r; data[o + 4] = g; data[o + 5] = bl;
      data[o + 6] = s0 != null ? s0 : Math.random(); data[o + 7] = Math.random(); data[o + 8] = Math.random(); data[o + 9] = Math.random();
      data[o + 10] = dripAt; data[o + 11] = dripLength; data[o + 12] = isDrip;
      n++;
    }
    for (var tries = 0; n < front + back && tries < (front + back) * 8; tries++) {
      var u = Math.random(), v = Math.random();
      if (!kept((u * cols) | 0, (v * rows) | 0)) continue;
      var pk = (((v * ph) | 0) * pw + ((u * pw) | 0)) * 4;
      var isBack = n >= front;
      var dim = isBack ? 0.55 : 1;
      var shape = depthAt(u, v);
      // Right at the outline the picture fades to white; those pale points would all line up into
      // a light band when the head is side on, so they're left out
      if (shape.dome < 0.22 && (pic[pk] + pic[pk + 1] + pic[pk + 2]) > 3 * 175) continue;
      // The back's points fill the head from just inside the face to its back, so turned side on
      // there's no gap where the face and the back meet; every depth is spread a hair, so the depth map's
      // steps don't show as rings
      var spread = (Math.random() - 0.5) * 0.008;
      put(u, v, (isBack ? -shape.dome * DEPTH * 0.85 * (-0.35 + 1.35 * Math.sqrt(Math.random())) : shape.front) + spread,
        tone(pic[pk]) * dim, tone(pic[pk + 1]) * dim, tone(pic[pk + 2]) * dim, 0, 0, 0);
    }
    dripCols.forEach(function (drip) {
      var u = (drip.x + 0.5) / cols, v = drip.y / rows;
      var pk = (((v * ph) | 0) * pw + ((u * pw) | 0)) * 4;
      var z = depthAt(u, v).front;
      for (var d = 1; d <= DRIP_POINTS; d++) {
        put(u, v, z, tone(pic[pk]), tone(pic[pk + 1]), tone(pic[pk + 2]), d / DRIP_POINTS, drip.length, 1, drip.seed);
      }
    });
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
    [["a_uv", 2, 0], ["a_z", 1, 2], ["a_col", 3, 3], ["a_seed", 4, 6], ["a_drip", 3, 10]].forEach(function (attr) {
      var loc = gl.getAttribLocation(program, attr[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, attr[1], gl.FLOAT, false, STRIDE * 4, attr[2] * 4);
    });
    ["u_view", "u_box", "u_turn", "u_time", "u_grow", "u_dpr", "u_push", "u_fall", "u_point", "u_still"].forEach(function (name) {
      uni[name] = gl.getUniformLocation(program, name);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  // ---- Size, labels, scroll

  function layout() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    [canvas, lines].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    gl.viewport(0, 0, canvas.width, canvas.height);
    var ih = H * HEAD_SHARE;
    var iw = ih * picture.naturalWidth / picture.naturalHeight;
    var most = narrow.matches ? W : W * 0.6;
    if (iw > most) { iw = most; ih = iw * picture.naturalHeight / picture.naturalWidth; }
    box = { x: (W - iw) / 2, y: 0, w: iw, h: ih };
    placeTags();
  }

  // The same turn and perspective as the graphics card, for the labels' lines
  function project(x, y, z) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var rx = x * c + z * s, rz = -x * s + z * c;
    var focal = box.w * 3, scale = focal / (focal - rz), cy = box.y + box.h * 0.5;
    return { x: box.x + box.w / 2 + rx * scale, y: cy + (y - cy) * scale, near: clamp(0.5 + rz / (DEPTH * box.w * 2), 0, 1) };
  }

  // Where each label's line starts (beside its text), the spot it points to, and that spot's
  // coordinates from the middle of the picture (-1 to +1, +1 at the top)
  function placeTags() {
    tags = [];
    if (narrow.matches) return;
    var at = stage.getBoundingClientRect();
    stage.querySelectorAll("[data-point]").forEach(function (li) {
      var point = li.getAttribute("data-point").split(",").map(Number);
      var name = li.querySelector(".head-name").getBoundingClientRect();
      var left = li.classList.contains("is-left");
      function sign(v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2); }
      tags.push({
        left: left, u: point[0], v: point[1], z: depthAt(point[0], point[1]).front,
        from: { x: (left ? name.right + 12 : name.left - 12) - at.left, y: name.top + name.height / 2 - at.top },
        text: sign(point[0] * 2 - 1) + " " + sign(1 - point[1] * 2)
      });
    });
  }

  function scrolled() {
    var r = track.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
  }

  function drawTags() {
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    if (!tags.length) return;
    lctx.lineWidth = 1;
    lctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    lctx.textBaseline = "middle";
    tags.forEach(function (tag) {
      var spot = project((tag.u - 0.5) * box.w, box.y + tag.v * box.h, tag.z * box.w);
      var x = spot.x, y = spot.y, r = 9, k = 4;
      lctx.globalAlpha = spot.near > 0.45 ? 1 : 0.3;
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
      // The coordinates on a small white backing, so the points behind don't swallow them
      var tx = x + (tag.left ? -r - 6 : r + 6), ty = y - r - 6, tw = lctx.measureText(tag.text).width;
      lctx.fillStyle = "#ffffff";
      lctx.fillRect(tag.left ? tx - tw - 4 : tx - 4, ty - 7, tw + 8, 14);
      lctx.fillStyle = "#16171A";
      lctx.textAlign = tag.left ? "right" : "left";
      lctx.fillText(tag.text, tx, ty);
    });
    lctx.globalAlpha = 1;
  }

  // ---- Each frame

  function draw(now) {
    var t = still ? 1e4 : (now - start) / 1000;
    var gone = scrolled();
    document.documentElement.classList.toggle("head-turned", gone > 0.02);
    var aim = still ? 0 : gone * TURNS * Math.PI * 2;
    angle += (aim - angle) * (still ? 1 : 0.08);
    // The pointer's push eases in where it is, and out when it leaves
    if (pointer.on) { push.x += (pointer.x - push.x) * 0.25; push.y += (pointer.y - push.y) * 0.25; }
    push.s += ((pointer.on && !still ? 1 : 0) - push.s) * 0.12;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uni.u_view, W, H);
    gl.uniform4f(uni.u_box, box.x, box.y, box.w, box.h);
    gl.uniform2f(uni.u_turn, Math.cos(angle), Math.sin(angle));
    gl.uniform1f(uni.u_time, t);
    gl.uniform1f(uni.u_grow, still ? 1 : 1 - Math.pow(1 - clamp((t - GATHER_AT) / GROW, 0, 1), 2));
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
    if (still) window.addEventListener("scroll", function () { run(true); }, { passive: true });
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
