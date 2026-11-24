// Home's first screen, after the owner's sketch and a pixel-grid site they liked: a black page
// crossed by a broad band of square pixels, rising in steps from the bottom-left corner to the
// top-right one. The band isn't white: it's a muted, grainy glow in the site's violet (a silvery
// lavender at the top through periwinkle to a deep indigo at the bottom) whose light drifts slowly about, written over
// with columns of token indexes (real o200k_base ids of the page's own words, read downwards) in
// white, streaming up or down, each at its own pace, with a bright head and a fading trail; the
// characters come through ASCII (@ % # * + = - : .) as they decode, in sweeps that pass across
// every few seconds, and a few glitch at random (after an AI site the owner liked). The headline sits in the black above it, the sentence in a
// black corner cut out of it at the bottom right, and the buttons on the band itself. The band's
// edges are ragged (stray squares out in the black, holes in the band, thinning out away from the
// edge) and shift slowly, a square at a time; along them the squares break down smaller, into tiny
// squares (half a square) and micro ones (a quarter), out in the black and as holes in the band's
// edge, coming and going one at a time too. All the while, letters of the headline and the
// sentence decrypt freely: one here, one there, at random moments and in no order, each running
// through its own few symbols at its own pace and settling back, so only a few change at once (the letter itself stays in
// the page, unseen, so nothing moves and screen readers read it as ever; the buttons are left be). Scrolling down, the
// squares go out one by one in a random order, and the black goes once the film has filled the
// window. With reduced motion it all stays still.
(function () {
  var main = document.querySelector(".content.home.is-bare");
  if (!main) return;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canvas = document.createElement("canvas");
  canvas.className = "home-grid";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  var g = canvas.getContext("2d");

  var BG = "#0E0F12";
  var GLOW = [[0, "#D7D6E4"], [0.3, "#BDBADB"], [0.52, "#9993CC"], [0.7, "#6D64B5"], [0.86, "#38317A"], [1, "#16132C"]];
  var CH_W = 10, CH_H = 13; // the token indexes' character grid, in pixels
  var TRAIL = 16;           // a column's bright head and its fading trail, in characters
  var RAMP = "@%#*+=-:.";   // what a character passes through as it decodes, densest first
  var DECODE_EVERY = 4.5;   // a sweep of decoding passes across this often, in seconds
  var TOKENS = [15900, 259, 79007, 11, 2684, 2616, 13, 17951, 89, 180721, 290, 5018, 6391, 842, 328,
                261, 15226, 2254, 481, 4952, 480, 316, 448, 20837, 11, 813, 480, 8844, 30732, 20290, 13,
                30456, 481, 4843, 1652, 668, 5067, 261, 65701, 3719, 316, 922, 21642, 16054, 395, 261,
                9176, 402, 9377, 30];
  var STREAM = TOKENS.join("  ") + "   ";
  var CELLS_ACROSS = 48;   // the squares' size: the window's width over this
  var WOBBLE = 1.1;        // how far the edges wander, in squares
  var RAGGED = 3.2;        // how far from the edge stray squares and holes reach, in squares
  var STRAY = 0.42;        // how likely a square right at the edge is to flip

  // The band's two edges, from the sketch, as fractions of the window [across, down]: its top edge,
  // from the bottom left up to the top right (with a dip in the middle), and the edge of the
  // bottom-right corner it leaves black for the sentence
  var TOP = [[0, 0.80], [0.05, 0.74], [0.11, 0.70], [0.12, 0.54], [0.18, 0.54], [0.20, 0.59],
             [0.24, 0.59], [0.25, 0.47], [0.31, 0.45], [0.32, 0.38], [0.38, 0.38], [0.39, 0.30],
             [0.47, 0.29], [0.48, 0.10], [0.52, 0.10], [0.53, 0.18], [0.56, 0.19], [0.58, 0.26],
             [0.58, 0.34], [0.62, 0.34], [0.64, 0.12], [0.66, 0.06], [0.71, 0.08], [0.71, 0.13],
             [0.78, 0.14], [0.78, 0.06], [0.84, 0.06], [0.85, 0.11], [0.91, 0.10], [0.94, 0.12],
             [0.97, 0.07], [1, 0.02]];
  var LOW = [[0.57, 1.02], [0.58, 0.90], [0.62, 0.90], [0.63, 0.83], [0.70, 0.80], [0.70, 0.76],
             [0.76, 0.74], [0.76, 0.67], [0.82, 0.66], [0.83, 0.76], [0.87, 0.77], [0.87, 0.73],
             [0.89, 0.73], [0.89, 0.79], [0.93, 0.79], [0.93, 0.71], [1, 0.71]];
  function edge(points, x) {
    for (var k = 1; k < points.length; k++) {
      var a = points[k - 1], b = points[k];
      if (x <= b[0]) return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return points[points.length - 1][1];
  }

  // a fixed seed, so it's the same every time
  var seed = 20261121;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var R = [];
  for (var i = 0; i < 4096; i++) R.push(random());
  function rnd(x, y) { return R[(((x * 73856093) ^ (y * 19349663)) >>> 0) & 4095]; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  // value noise; with a period, it wraps around across (so a row of text joins up end to end)
  function noise(x, y, period) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    var x1 = x0 + 1;
    if (period) { x0 = ((x0 % period) + period) % period; x1 = (x0 + 1) % period; }
    var a = rnd(x0, y0), b = rnd(x1, y0), c = rnd(x0, y0 + 1), d = rnd(x1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // a small tile of grain, laid over the glow
  var grain = document.createElement("canvas");
  grain.width = grain.height = 160;
  (function () {
    var gg = grain.getContext("2d"), img = gg.createImageData(160, 160);
    for (var p = 0; p < img.data.length; p += 4) {
      var v = Math.random() < 0.5 ? 0 : 255;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = Math.random() * 38;
    }
    gg.putImageData(img, 0, 0);
  })();

  // The token indexes are drawn into a sheet of columns a little taller than the window (whole
  // trails, and the text and its gaps wrap around it), redrawn ten times a second as characters
  // decode; each frame slides every column up or down it by its own amount
  var text = document.createElement("canvas"), tg = text.getContext("2d");
  var W = 0, H = 0, dpr = 1, size = 0, cols = 0, rows = 0, gone = [], grainFill = null;
  var across = 0, down = 0, stripH = 0, bumps = 0, speeds = [];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    size = Math.ceil(W / CELLS_ACROSS);
    cols = Math.ceil(W / size); rows = Math.ceil(H / size);
    seed = 7; gone = [];
    for (var c = 0; c < cols * rows; c++) gone.push(random());
    grainFill = g.createPattern(grain, "repeat");
    across = Math.ceil(W / CH_W);
    down = (Math.ceil(Math.ceil(H / CH_H) / TRAIL) + 1) * TRAIL;   // whole trails, a little over the window
    stripH = down * CH_H;
    bumps = Math.max(1, Math.round(down * 0.06));               // the thick and thin patches per column
    text.width = Math.round(across * CH_W * dpr); text.height = Math.round(stripH * dpr);
    speeds = [];
    for (var c = 0; c < across; c++) speeds.push((10 + rnd(c, 21) * 34) * (rnd(c, 22) < 0.5 ? -1 : 1));  // px a second
    textStep = -1;
  }

  var textStep = -1;
  function drawText(step, secs) {
    if (step === textStep) return;
    textStep = step;
    tg.setTransform(dpr, 0, 0, dpr, 0, 0);
    tg.clearRect(0, 0, across * CH_W, stripH);
    tg.font = "500 11px Inter, sans-serif";
    tg.textAlign = "center"; tg.textBaseline = "middle";
    tg.fillStyle = "#FFFFFF";
    var sweep = secs / DECODE_EVERY;
    for (var c = 0; c < across; c++) {
      var start = Math.floor(rnd(c, 9) * STREAM.length), up = speeds[c] < 0;
      var head = Math.floor(rnd(c, 13) * TRAIL);
      for (var r = 0; r < down; r++) {
        var ch = STREAM[(start + r) % STREAM.length];
        if (ch === " " || noise(r * bumps / down, c * 0.13, bumps) < 0.36) continue;
        // the trail: brightest at the head (the leading end, whichever way the column runs)
        var behind = ((up ? r - head : head - r) % TRAIL + TRAIL) % TRAIL;
        var a = 0.12 + 0.6 * Math.pow(1 - behind / TRAIL, 1.6);
        // decoding: a sweep crosses the screen at a slant; just behind its front a character runs
        // down the ramp to its digit, brighter while it does
        var phase = ((sweep - c / across * 0.6 - r / down * 0.25 - rnd(c, r) * 0.05) % 1 + 1) % 1;
        if (!still && phase < 0.07) {
          ch = RAMP[Math.min(RAMP.length - 1, Math.floor(phase / 0.07 * RAMP.length))];
          a = Math.min(1, a + 0.35);
        } else if (!still && rnd(c * 31 + step, r * 17 - step) < 0.006) {
          ch = RAMP[Math.floor(rnd(c + step, r) * RAMP.length)];   // a stray glitch
          a = Math.min(1, a + 0.25);
        }
        if (behind === 0) a = 0.95;
        tg.globalAlpha = a;
        tg.fillText(ch, c * CH_W + CH_W / 2, r * CH_H + CH_H / 2);
      }
    }
    tg.globalAlpha = 1;
  }

  // the boxes kept black whatever the band does: the headline and the sentence, a square around each
  function clearZones() {
    var zones = [];
    [".home-intro:not(.is-copy) .home-headline", ".home-intro:not(.is-copy) .home-lede"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.width) zones.push({ l: r.left - size, t: r.top - size, r: r.right + size, b: r.bottom + size });
    });
    return zones;
  }

  // which squares are lit: worked out four times a second (the edges move a square at a time)
  var lit = [], litKey = "", bits = [], holes = [];
  function workOut(t) {
    var zones = clearZones();
    lit = [];
    var clearCell = [];
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var x = i * size, yy = j * size, clear = true;
      for (var k = 0; k < zones.length; k++) {
        var z = zones[k];
        if (x + size > z.l && x < z.r && yy + size > z.t && yy < z.b) { clear = false; break; }
      }
      // the square's middle against the two edges, each nudged by a slow wobble of its own
      var mx = (i + 0.5) / cols, my = (j + 0.5) * size;
      var top = edge(TOP, mx) * H + (noise(i * 0.35 + t * 0.04, 3) - 0.5) * 2 * WOBBLE * size;
      var low = edge(LOW, mx) * H + (noise(i * 0.35 - t * 0.035, 11) - 0.5) * 2 * WOBBLE * size;
      var inside = my > top && my < low;
      // ragged: near an edge, a square may flip (a stray out in the black, or a hole in the band),
      // likelier the closer it is; each square rolls again at its own moments, so they change
      // one at a time
      var near = Math.min(Math.abs(my - top), Math.abs(my - low)) / size;
      if (near < RAGGED) {
        var roll = still ? 0 : Math.floor(t * 0.1 + rnd(i, j) * 16);
        if (rnd(i * 7 + roll, j * 13 - roll) < STRAY * (1 - near / RAGGED)) inside = !inside;
      }
      lit.push(clear && inside);
      clearCell.push(clear);
    }
    breakDown(t, clearCell);
  }

  // The smaller squares, along the band's edges: each is [cell, x, y, side]. Out in the black, a
  // square touching the band (corners too) may hold tiny squares, or a micro one in a tiny one's
  // place; one a square further out, the odd micro square. In the band, a square on its edge may
  // lose a tiny or micro square, a hole. Each rolls again at its own moments, a little more often
  // than the big squares, so they flicker one at a time
  var TINY = 0.2, MICRO = 0.16, FAR_MICRO = 0.05, TINY_HOLE = 0.1, MICRO_HOLE = 0.1;
  function breakDown(t, clearCell) {
    bits = []; holes = [];
    var half = size / 2, quarter = size / 4;
    function at(i, j) { return i >= 0 && j >= 0 && i < cols && j < rows && lit[j * cols + i]; }
    function roll(a, b) {
      var turn = still ? 0 : Math.floor(t * 0.16 + rnd(a, b) * 16);
      return rnd(a * 5 + turn, b * 11 - turn * 3);
    }
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var idx = j * cols + i, x = i * size, y = j * size;
      if (!clearCell[idx]) continue;
      // how near the band: 1 touching it, 2 one square out, 0 further
      var near = 0;
      if (!lit[idx]) {
        for (var d = 1; d <= 2 && !near; d++) {
          for (var dj = -d; dj <= d && !near; dj++) for (var di = -d; di <= d; di++) {
            if (at(i + di, j + dj)) { near = d; break; }
          }
        }
      }
      for (var q = 0; q < 4; q++) {
        var qx = x + (q % 2) * half, qy = y + Math.floor(q / 2) * half;
        var a = roll(i * 4 + q, j * 4 + 1), m = Math.floor(roll(i * 4 + q, j * 4 + 3) * 4);
        var mx = qx + (m % 2) * quarter, my = qy + Math.floor(m / 2) * quarter;
        if (lit[idx]) {
          // on the band's edge (a side touching the black): holes
          if (at(i - 1, j) && at(i + 1, j) && at(i, j - 1) && at(i, j + 1)) break;
          if (a < TINY_HOLE) holes.push([idx, qx, qy, half]);
          else if (a < TINY_HOLE + MICRO_HOLE) holes.push([idx, mx, my, quarter]);
        } else if (near === 1) {
          if (a < TINY) bits.push([idx, qx, qy, half]);
          else if (a < TINY + MICRO) bits.push([idx, mx, my, quarter]);
        } else if (near === 2) {
          if (a < FAR_MICRO) bits.push([idx, mx, my, quarter]);
        }
      }
    }
  }

  function draw(now) {
    if (!W) resize();
    var secs = still ? 0 : now / 1000;
    var t = still ? 0 : Math.floor(now / 250) * 0.25;           // four steps a second
    var y = window.scrollY;
    var out = Math.min(1, y / (0.45 * H));                       // the squares going, as the film grows
    var dark = 1 - Math.min(1, Math.max(0, (y - 0.7 * H) / (0.15 * H)));  // the black, once it's full
    if (litKey !== t + "|" + W) { litKey = t + "|" + W; workOut(t); }
    drawText(still ? 0 : Math.floor(now / 100), secs);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalAlpha = dark;
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    // the band's squares (scrolling down, they go out one by one), as a shape to paint inside
    g.save();
    g.beginPath();
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var idx = j * cols + i;
      if (lit[idx] && gone[idx] >= out * 1.1) g.rect(i * size, j * size, size, size);
    }
    for (var b = 0; b < bits.length; b++) {
      if (gone[bits[b][0]] >= out * 1.1) g.rect(bits[b][1], bits[b][2], bits[b][3], bits[b][3]);
    }
    g.clip();
    // the glow, its slope swaying slowly, and a soft light wandering over it
    var sway = Math.sin(secs * 0.11) * 0.35, lift = Math.sin(secs * 0.07) * 0.08;
    var glow = g.createLinearGradient(W * (0.5 - sway), H * (lift - 0.05), W * (0.5 + sway), H * (1.05 + lift));
    GLOW.forEach(function (s) { glow.addColorStop(s[0], s[1]); });
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    var lx = W * (0.5 + 0.38 * Math.sin(secs * 0.09)), ly = H * (0.45 + 0.3 * Math.sin(secs * 0.13 + 1));
    var light = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.45);
    light.addColorStop(0, "rgba(255,255,255,0.16)"); light.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = light; g.fillRect(0, 0, W, H);
    g.fillStyle = grainFill; g.fillRect(0, 0, W, H);
    // the token indexes, each column slid up or down by its own pace, wrapping round
    for (var c = 0; c < across; c++) {
      var shift = ((-secs * speeds[c]) % stripH + stripH) % stripH;
      var sx = c * CH_W * dpr, sw = CH_W * dpr;
      // the column from "shift" on, then its top again after it
      g.drawImage(text, sx, shift * dpr, sw, (stripH - shift) * dpr, c * CH_W, 0, CH_W, stripH - shift);
      g.drawImage(text, sx, 0, sw, shift * dpr, c * CH_W, stripH - shift, CH_W, shift);
    }
    g.restore();
    // the holes in the band's edge
    g.fillStyle = BG;
    for (var h = 0; h < holes.length; h++) {
      if (gone[holes[h][0]] >= out * 1.1) g.fillRect(holes[h][1], holes[h][2], holes[h][3], holes[h][3]);
    }
    g.globalAlpha = 1;

    if (still) { stillWait(); return; }
    if (window.scrollY < H) requestAnimationFrame(draw);
    else waiting = true;
  }
  // with reduced motion: drawn again only when scrolling or resizing
  var stillQueued = false;
  function stillWait() { stillQueued = false; }
  function redrawStill() { if (!stillQueued) { stillQueued = true; requestAnimationFrame(draw); } }

  var waiting = false;
  window.addEventListener("scroll", function () {
    if (still) { if (window.scrollY < H) redrawStill(); return; }
    if (waiting && window.scrollY < H) { waiting = false; requestAnimationFrame(draw); }
  }, { passive: true });
  window.addEventListener("resize", function () { resize(); litKey = ""; if (still) redrawStill(); });
  requestAnimationFrame(draw);

  // The letters decrypting, freely: every GAP_MIN to GAP_MAX ms a letter picked at random from the
  // headline and the sentence (one already changing is skipped) runs through TURNS_MIN to
  // TURNS_MAX symbols, each shown TURN_MIN to TURN_MAX ms, then settles (styles.css, .dec-letter).
  // So letters come and go one by one, at different times, in no order, never all at once
  var GLYPHS = "@%#*+=-:.0123456789";
  var BLOCKS = [".home-intro:not(.is-copy) .home-headline", ".home-intro:not(.is-copy) .home-lede"];
  var GAP_MIN = 90, GAP_MAX = 380, TURNS_MIN = 2, TURNS_MAX = 6, TURN_MIN = 45, TURN_MAX = 95;
  function between(lo, hi) { return lo + Math.random() * (hi - lo); }
  // a block's letters in reading order, as [text node, index]; one already going counts (busy), so
  // the order holds while letters are wrapped and unwrapped
  function letters(el) {
    var found = [];
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var n = walk.nextNode(); n; n = walk.nextNode()) {
      var busy = !!n.parentNode.closest(".dec-letter");
      for (var k = 0; k < n.data.length; k++) if (/[A-Za-z0-9]/.test(n.data[k])) found.push([n, k, busy]);
    }
    return found;
  }
  function decrypt(pick) {
    var node = pick[0], at = pick[1];
    var host = node.parentNode;
    // (the gradient word's letters are painted by their gradient, so the symbol there is its violet)
    var inGradient = !!host.closest(".hl-serif");
    var color = inGradient ? "#A99DFF" : getComputedStyle(host).color;
    var letter = node.splitText(at);
    letter.splitText(1);
    var span = document.createElement("span");
    span.className = "dec-letter" + (inGradient ? " is-clip" : "");
    span.style.setProperty("--dec-color", color);
    letter.parentNode.replaceChild(span, letter);
    span.appendChild(letter);
    var turns = 0, many = Math.round(between(TURNS_MIN, TURNS_MAX));
    (function turn() {
      if (turns++ < many) {
        span.setAttribute("data-glyph", GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
        setTimeout(turn, between(TURN_MIN, TURN_MAX));
        return;
      }
      var up = span.parentNode;
      if (!up) return;                                           // (the line was rebuilt meanwhile)
      up.replaceChild(letter, span);
      up.normalize();
    })();
  }
  // One letter, picked at random from both blocks, that isn't already changing
  function pickLetter() {
    var all = [];
    BLOCKS.forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) all = all.concat(letters(el));
    });
    var free = all.filter(function (pick) { return !pick[2]; });
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }
  if (!still) {
    // (only while the text is in, the page is at its top and showing; otherwise it checks again in
    // a moment)
    (function next() {
      var root = document.documentElement;
      var on = root.classList.contains("home-text-on") || !root.classList.contains("home-text-waiting");
      if (on && window.scrollY < 4 && !document.hidden) {
        var pick = pickLetter();
        if (pick) decrypt(pick);
        setTimeout(next, between(GAP_MIN, GAP_MAX));
      } else {
        setTimeout(next, 600);
      }
    })();
  }
})();
