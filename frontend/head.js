// About: the head, made of particles (after gather.be-of-dao.com's Gather, drawn our own way).
// The picture (assets/about-head.jpg, a head built from pages and parts) is sampled into a grid
// of small squares in its own colours; the white around it is left out. On arrival the squares
// fly in from all over and gather into the head; the pointer pushes them aside and they spring
// back. From the neck down the head melts: it sags, and drips run from its lower edge down to
// the bottom of the window, each column its own length, slowly swaying.
// The team are tracker labels beside it (the HTML list), each with a thin line to a point on the
// head, like the labels round the picture. On a phone the labels sit under it, with no lines.
// Reduced motion: no gathering, no pointer, no sway; the head stands still, already melted.
(function () {
  var stage = document.querySelector("[data-head]");
  if (!stage) return;
  var canvas = stage.querySelector(".head-canvas");
  var ctx = canvas.getContext("2d");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia("(max-width: 800px)");

  var STEP = 4;            // CSS px between squares
  var HEAD_SHARE = 0.72;   // of the stage's height the picture takes; below it, the drips
  var MELT_FROM = 0.68;    // where down the picture the sagging starts
  var SAG = 0.22;          // how far the lowest row sags, as a share of the room below
  var GROW = 2.6;          // seconds for the drips to run down, once the head has gathered
  var GATHER_AT = 0.6;     // seconds in, when the drips start
  var PUSH = 70;           // CSS px around the pointer that the squares move away from

  var img = new Image();
  img.src = stage.getAttribute("data-src");

  var W = 0, H = 0, dpr = 1, frame = null, data32 = null, box = null;
  var parts = [], columns = [], tags = [];
  var start = 0, running = false, visible = true;
  var pointer = { x: -1e4, y: -1e4 };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // Lay the stage out: the canvas fills it; the picture sits in the middle at the top, as tall
  // as HEAD_SHARE of it (narrower on a wide stage, so the labels have room either side)
  function layout(fresh) {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    frame = ctx.createImageData(canvas.width, canvas.height);
    data32 = new Uint32Array(frame.data.buffer);
    var ih = H * HEAD_SHARE;
    var iw = ih * img.naturalWidth / img.naturalHeight;
    var most = narrow.matches ? W : W * 0.6;
    if (iw > most) { iw = most; ih = iw * img.naturalHeight / img.naturalWidth; }
    box = { x: (W - iw) / 2, y: 0, w: iw, h: ih };
    sample(fresh);
    placeTags();
  }

  // The picture at one pixel per square; the white connected to its edges is the background
  function sample(fresh) {
    var cols = Math.max(2, Math.floor(box.w / STEP));
    var rows = Math.max(2, Math.floor(box.h / STEP));
    var off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    var octx = off.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, 0, 0, cols, rows);
    var px = octx.getImageData(0, 0, cols, rows).data;

    var bg = new Uint8Array(cols * rows);
    var queue = [];
    function light(i) { return px[i * 4] > 232 && px[i * 4 + 1] > 232 && px[i * 4 + 2] > 232; }
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

    var old = parts;
    parts = [];
    columns = [];
    var meltTop = MELT_FROM * rows;
    for (var cc = 0; cc < cols; cc++) columns.push({ bottom: -1, colour: 0, x: 0 });
    for (var y2 = 0; y2 < rows; y2++) {
      for (var x2 = 0; x2 < cols; x2++) {
        var k = y2 * cols + x2;
        // Leave out the picture's own corner captions and the faint notes round its edge
        var u = x2 / cols, v = y2 / rows;
        if (bg[k] || v < 0.04 || u < 0.08 || u > 0.94 || (v > 0.92 && (u < 0.3 || u > 0.7))) continue;
        var R = px[k * 4], G = px[k * 4 + 1], B = px[k * 4 + 2];
        var hx = box.x + (x2 + 0.5) * STEP;
        var hy = box.y + (y2 + 0.5) * STEP;
        var sag = y2 > meltTop ? Math.pow((y2 - meltTop) / (rows - meltTop), 2) : 0;
        var p = {
          hx: hx, hy: hy, x: hx, y: hy, vx: 0, vy: 0, col: x2, sag: sag,
          c: (255 << 24) | (B << 16) | (G << 8) | R,
          k: 0.05 + Math.random() * 0.04
        };
        if (fresh && !still) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
        }
        parts.push(p);
        var column = columns[x2];
        if (hy > column.bottom) { column.bottom = hy; column.colour = p.c; column.x = hx; column.row = y2; }
      }
    }
    // Each column's drip: a smooth random length, longer where the head reaches the picture's
    // bottom edge (the neck), short where its lowest square is higher up (the ears, the chin)
    var noise = columns.map(function () { return Math.random(); });
    for (var pass = 0; pass < 3; pass++) {
      noise = noise.map(function (n, i) { return (noise[Math.max(0, i - 1)] + n + noise[Math.min(noise.length - 1, i + 1)]) / 3; });
    }
    var lo = Math.min.apply(null, noise), hi = Math.max.apply(null, noise);
    columns.forEach(function (column, i) {
      var n = hi > lo ? (noise[i] - lo) / (hi - lo) : 0.5;
      var reach = column.row >= rows - 2 ? 1 : 0.12;
      column.length = reach * (0.3 + 0.7 * Math.pow(n, 1.2));
      column.phase = Math.random() * Math.PI * 2;
    });
    if (!fresh && old.length) start = performance.now() - 1e5;
  }

  // The team's labels: where each one's line starts (beside its text) and ends (on the head)
  function placeTags() {
    tags = [];
    if (narrow.matches) return;
    var at = stage.getBoundingClientRect();
    stage.querySelectorAll("[data-point]").forEach(function (li) {
      var point = li.getAttribute("data-point").split(",").map(Number);
      var name = li.querySelector(".head-name").getBoundingClientRect();
      var left = li.classList.contains("is-left");
      tags.push({
        from: { x: (left ? name.right + 12 : name.left - 12) - at.left, y: name.top + name.height / 2 - at.top },
        to: { x: box.x + point[0] * box.w, y: box.y + point[1] * box.h }
      });
    });
  }

  function square(x, y, size, colour) {
    var cw = canvas.width, ch = canvas.height;
    var x0 = Math.round(x * dpr - size / 2), y0 = Math.round(y * dpr - size / 2);
    var x1 = Math.min(cw, x0 + size), y1 = Math.min(ch, y0 + size);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    for (var yy = y0; yy < y1; yy++) {
      var row = yy * cw;
      for (var xx = x0; xx < x1; xx++) data32[row + xx] = colour;
    }
  }

  function draw(now) {
    var t = (now - start) / 1000;
    var room = H - (box.y + box.h);
    var grow = still ? 1 : ease(clamp((t - GATHER_AT) / GROW, 0, 1));
    var size = Math.max(1, Math.round((STEP - 1) * dpr));
    data32.fill(0);

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var tx = p.hx, ty = p.hy + p.sag * SAG * room * grow;
      if (still) {
        p.x = tx; p.y = ty;
      } else {
        var dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < PUSH * PUSH && d2 > 0.01) {
          var d = Math.sqrt(d2), f = Math.pow(1 - d / PUSH, 2) * 3.2;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx = (p.vx + (tx - p.x) * p.k) * 0.84;
        p.vy = (p.vy + (ty - p.y) * p.k) * 0.84;
        p.x += p.vx;
        p.y += p.vy;
      }
      square(p.x, p.y, size, p.c);
    }

    // The drips: from each column's lowest square (after its sag) down towards the bottom,
    // thinning as they go, with a slightly fuller drop at the end
    for (var c = 0; c < columns.length; c++) {
      var col = columns[c];
      if (col.bottom < 0 || !col.length) continue;
      var y0 = col.bottom + SAG * room * grow;
      var sway = still ? 1 : 1 + 0.05 * Math.sin(t * 0.7 + col.phase);
      var length = col.length * (room - SAG * room) * grow * sway;
      var bits = Math.floor(length / STEP);
      for (var b = 1; b <= bits; b++) {
        var thin = Math.max(1, Math.round(size * (1 - 0.55 * b / Math.max(bits, 1))));
        square(col.x, y0 + b * STEP, b === bits ? thin + Math.round(dpr) : thin, col.colour);
      }
    }
    ctx.putImageData(frame, 0, 0);

    // The labels' lines, with a small square where each meets the head
    if (tags.length) {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "rgba(22, 23, 26, 0.55)";
      ctx.fillStyle = "#16171A";
      ctx.lineWidth = 1;
      tags.forEach(function (tag) {
        ctx.beginPath();
        ctx.moveTo(tag.from.x, tag.from.y);
        ctx.lineTo(tag.to.x, tag.from.y);
        ctx.lineTo(tag.to.x, tag.to.y);
        ctx.stroke();
        ctx.fillRect(tag.to.x - 3, tag.to.y - 3, 6, 6);
      });
      ctx.restore();
    }
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
    start = performance.now();
    layout(true);
    run(true);
    new ResizeObserver(function () { layout(false); if (still) run(true); }).observe(stage);
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
    });
    stage.addEventListener("pointerleave", function () { pointer.x = pointer.y = -1e4; });
    if (document.fonts) document.fonts.ready.then(placeTags);
  }

  if (img.complete && img.naturalWidth) begin();
  else img.addEventListener("load", begin);
})();
