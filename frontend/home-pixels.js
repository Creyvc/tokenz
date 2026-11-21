// Home's first screen: a black page with a field of square pixels behind the text, a light mass of
// them (after a pixel-grid site the owner liked, turned to black). It shifts slowly, a square at a
// time; the dark squares along its edges carry a tiny "1"; the light squares under the pointer glow
// blue. It keeps clear of the headline, the sentence and the buttons, so they stay readable, and
// covers about the same share of the window on every visit (the same pattern each time, from a
// fixed seed). Scrolling down, the squares go out one by one in a random order, and the black
// goes once the film has filled the window. With reduced motion it stays still.
(function () {
  var main = document.querySelector(".content.home.is-bare");
  if (!main) return;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canvas = document.createElement("canvas");
  canvas.className = "home-grid";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  var g = canvas.getContext("2d");

  var BG = "#0E0F12", PIXEL = "#E6E6EA", GLOW = "#5B6CFF", GLOW_SOFT = "#B9C0FF";
  var CELLS_ACROSS = 30, SHARE = 0.36;   // about this much of the clear squares is light

  // a fixed seed, so it's the same field every time
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

  var W = 0, H = 0, dpr = 1, size = 0, cols = 0, rows = 0, gone = [], glowX = -1, glowY = -1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    size = Math.ceil(W / CELLS_ACROSS);
    cols = Math.ceil(W / size); rows = Math.ceil(H / size);
    seed = 7; gone = [];
    for (var c = 0; c < cols * rows; c++) gone.push(random());
  }

  // the boxes to keep clear: the headline, the sentence and the buttons, a square around each
  function clearZones() {
    var zones = [];
    [".home-intro:not(.is-copy) .home-headline", ".home-intro:not(.is-copy) .home-lede", ".home-intro:not(.is-copy) .home-actions"].forEach(function (sel) {
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
    var t = still ? 0 : Math.floor(now / 125) * 0.125;          // eight steps a second
    var y = window.scrollY;
    var out = Math.min(1, y / (0.45 * H));                       // the squares going, as the film grows
    var dark = 1 - Math.min(1, Math.max(0, (y - 0.7 * H) / (0.15 * H)));  // the black, once it's full
    var key = t + "|" + out.toFixed(3) + "|" + dark.toFixed(3) + "|" + glowX + "," + glowY;
    if (key !== last) {
      last = key;
      var zones = clearZones();
      // a slow-moving field, heavier towards the bottom right; the lightest SHARE of it is lit
      var value = [], free = [];
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var x = i * size, yy = j * size, clear = true;
        for (var k = 0; k < zones.length; k++) {
          var z = zones[k];
          if (x + size > z.l && x < z.r && yy + size > z.t && yy < z.b) { clear = false; break; }
        }
        var n = 0.65 * noise(i * 0.16 + t * 0.06, j * 0.16 - t * 0.03) + 0.35 * noise(i * 0.4 - t * 0.1, j * 0.4 + 7);
        var v = clear ? n + 0.3 * ((i / cols) * 0.6 + (j / rows) * 0.8) : -1;
        value.push(v);
        if (clear) free.push(v);
      }
      free.sort(function (a, b) { return b - a; });
      var cut = free.length ? free[Math.floor(free.length * SHARE)] : 2;
      var lit = value.map(function (v) { return v > cut; });
      var on = function (i, j) { return i >= 0 && j >= 0 && i < cols && j < rows && lit[j * cols + i]; };

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalAlpha = dark;
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      g.font = "500 9px Inter, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var idx = j * cols + i;
        if (gone[idx] < out * 1.1) continue;                     // scrolling down, they go out one by one
        var px = i * size, py = j * size;
        if (lit[idx]) {
          // light, or blue near the pointer
          var d = glowX < 0 ? 9 : Math.max(Math.abs(i - glowX), Math.abs(j - glowY));
          g.fillStyle = d === 0 ? GLOW : d === 1 ? GLOW_SOFT : PIXEL;
          g.fillRect(px, py, size, size);
        } else if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) {
          // a dark square on the edge of the mass: a tiny "1"
          g.fillStyle = "rgba(255,255,255,0.32)";
          g.fillText("1", px + size / 2, py + size / 2);
        }
      }
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
  document.addEventListener("pointermove", function (e) {
    if (!size) return;
    glowX = Math.floor(e.clientX / size); glowY = Math.floor(e.clientY / size);
  });
  document.documentElement.addEventListener("mouseleave", function () { glowX = glowY = -1; });
  requestAnimationFrame(draw);
})();
