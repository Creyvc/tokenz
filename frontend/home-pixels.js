// Home's first screen, after the owner's sketch and a pixel-grid site they liked: a black page
// crossed by a broad band of square pixels, rising in steps from the bottom-left corner to the
// top-right one. The band isn't white: it's a grainy glow, lavender at the top through pink to a
// deep plum at the bottom, written over with rows of token indexes (real o200k_base ids of the
// page's own words) in faint white, thicker in some places than others; a few digits flicker, and
// each row slips along by a character now and then (after an AI site the owner liked). The headline sits in the black above it, the sentence in a black corner cut out of
// it at the bottom right, and the buttons on the band itself. The band's edges are ragged (stray
// squares out in the black, holes in the band, thinning out away from the edge) and shift slowly,
// a square at a time. Scrolling down, the squares go out one by one in a random order, and
// the black goes once the film has filled the window. With reduced motion it stays still.
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
  var GLOW = [[0, "#C9C5E8"], [0.28, "#DCC1DD"], [0.5, "#E6AEBF"], [0.68, "#CF8790"], [0.85, "#7A4260"], [1, "#2E1726"]];
  var CH_W = 9, CH_H = 14;  // the token indexes' character grid, in pixels
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
  function noise(x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    var a = rnd(x0, y0), b = rnd(x0 + 1, y0), c = rnd(x0, y0 + 1), d = rnd(x0 + 1, y0 + 1);
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

  var W = 0, H = 0, dpr = 1, size = 0, cols = 0, rows = 0, gone = [], glow = null, grainFill = null;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    size = Math.ceil(W / CELLS_ACROSS);
    cols = Math.ceil(W / size); rows = Math.ceil(H / size);
    seed = 7; gone = [];
    for (var c = 0; c < cols * rows; c++) gone.push(random());
    glow = g.createLinearGradient(0, 0, W * 0.15, H);
    GLOW.forEach(function (s) { glow.addColorStop(s[0], s[1]); });
    grainFill = g.createPattern(grain, "repeat");
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

  var last = "";
  function draw(now) {
    if (!W) resize();
    var t = still ? 0 : Math.floor(now / 250) * 0.25;           // four steps a second
    var y = window.scrollY;
    var out = Math.min(1, y / (0.45 * H));                       // the squares going, as the film grows
    var dark = 1 - Math.min(1, Math.max(0, (y - 0.7 * H) / (0.15 * H)));  // the black, once it's full
    var key = t + "|" + out.toFixed(3) + "|" + dark.toFixed(3);
    if (key !== last) {
      last = key;
      var zones = clearZones();
      var lit = [];
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
          var roll = still ? 0 : Math.floor(t * 0.06 + rnd(i, j) * 16);
          if (rnd(i * 7 + roll, j * 13 - roll) < STRAY * (1 - near / RAGGED)) inside = !inside;
        }
        lit.push(clear && inside);
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalAlpha = dark;
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      // the band's squares (scrolling down, they go out one by one), as a shape to paint inside
      var shown = [];
      g.save();
      g.beginPath();
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var idx = j * cols + i;
        var here = lit[idx] && gone[idx] >= out * 1.1;
        shown.push(here);
        if (here) g.rect(i * size, j * size, size, size);
      }
      g.clip();
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      g.fillStyle = grainFill; g.fillRect(0, 0, W, H);
      // the token indexes: each row reads along the stream from its own place, slipping on by a
      // character now and then; thicker in some places, brighter in others; a few digits flicker
      g.font = "500 11px Inter, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#FFFFFF";
      var step = Math.round(t * 4), across = Math.ceil(W / CH_W), down = Math.ceil(H / CH_H);
      for (var r = 0; r < down; r++) {
        var start = Math.floor(rnd(r, 9) * STREAM.length) + Math.floor(t / 6 + rnd(r, 4) * 6);
        var cy = r * CH_H + CH_H / 2, sj = Math.floor(cy / size);
        for (var c = 0; c < across; c++) {
          var cx = c * CH_W + CH_W / 2;
          if (!shown[sj * cols + Math.floor(cx / size)]) continue;
          var ch = STREAM[(start + c) % STREAM.length];
          if (!still && rnd(c * 31 + step, r * 17 - step) < 0.012) ch = String(Math.floor(rnd(c + step, r) * 10));
          if (ch === " " || noise(c * 0.07, r * 0.2) < 0.34) continue;
          g.globalAlpha = dark * (0.22 + 0.55 * noise(c * 0.04 + 40, r * 0.09 + 40));
          g.fillText(ch, cx, cy);
        }
      }
      g.restore();
      g.globalAlpha = 1;
    }
    if (window.scrollY < H) requestAnimationFrame(draw);
    else waiting = true;
  }
  var waiting = false;
  window.addEventListener("scroll", function () {
    if (waiting && window.scrollY < H) { waiting = false; requestAnimationFrame(draw); }
  }, { passive: true });
  window.addEventListener("resize", function () { resize(); last = ""; });
  requestAnimationFrame(draw);
})();
