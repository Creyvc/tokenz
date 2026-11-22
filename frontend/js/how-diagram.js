// How it works: an exploded diagram of what happens to a prompt (after architectural exploded
// axonometrics the owner liked), drawn in 3D on a canvas so the camera can move round it: six chips
// in thin white line, one under another, joined by dashed guides, each with a numbered callout,
// the site's violet the only colour. Top to bottom, in the order things really happen: the prompt
// (its filler marked), the three methods that shorten its words (in a violet orbit), the shorter
// prompt, the tokenizer that cuts both versions into tokens and counts them (the tokens saved left
// as dashed outlines), the tokens' numbers, and the vectors the AI model it's sent to makes of them.
// The page doesn't scroll (styles.css): the wheel (a swipe, the arrow keys) plays a camera path,
// and back again scrolling up:
//   0 to 1  the stack, still closed, twists: each chip spins a whole turn, every other one the
//           other way
//   1 to 2  it comes apart; the callouts draw in
//   2 to 3  the camera swings round low to the side, turning the other way
//   3 to 4  up over the top, looking straight down, and in close to the top chip, the chips
//           turning see-through (x-ray) to the circuitry inside them
//   4 on    the dive: down through the stack a chip at a time to the last, each one passed
//           swelling and fading as if flown through, the view turning slowly; the x-ray is only
//           for the view from the top, so diving the chips are solid again; the chip in front
//           has its number, name and words on the left
//   then    back out, turning round to where it started; the chips and the callouts come back
//   last    the stack closes up again, as at the start, and it all goes round again: a loop, both
//           ways, with no end
// The callouts only show while the camera is at its first angle. On a phone, where the page
// scrolls to the list of steps (.hw-layers, also what screen readers read), it's drawn open and
// still; with reduced motion too.
(function () {
  var stage = document.querySelector(".hw-diagram");
  if (!stage) return;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = window.matchMedia("(max-width: 800px)").matches;
  var VIOLET = "#8B7FF2", LINE = "rgba(255,255,255,0.82)", DIM = "rgba(255,255,255,0.34)";
  var DEG = Math.PI / 180, ISO = Math.atan(Math.SQRT1_2), SCALE = 1 / Math.cos(ISO);
  var W0 = 1200, H0 = 1370;   // the drawing's own size at the first angle, in its units
  var FONT = "Inter, system-ui, sans-serif";

  // Each chip once apart (y: its top's height on screen at the first angle), its half-size and
  // thickness
  var LAYERS = [
    { kind: "prompt", y: 140, a: 130, t: 26, num: "01", name: "Your prompt", side: -1,
      text: ["The prompt you'd send to an AI,", "pasted on Compare."] },
    { kind: "methods", y: 405, a: 160, t: 34, num: "02", name: "Three methods", side: 1, lift: 120,
      text: ["They work on your words: NLP trims", "filler, TF-IDF drops off-topic sentences,", "AI rewrite asks Groq and Google."] },
    { kind: "shorter", y: 605, a: 130, t: 26, num: "03", name: "Shorter prompt", side: -1,
      text: ["Checked: numbers, limits and “not”s", "must survive, or the original is kept."] },
    { kind: "tokens", y: 800, a: 130, t: 26, num: "04", name: "Tokenizer", side: 1,
      text: ["Both versions cut into tokens and", "counted (o200k_base): the difference", "is what you save."] },
    { kind: "ids", y: 993, a: 130, t: 26, num: "05", name: "Token IDs", side: -1,
      text: ["Each token is a number in the", "AI model's vocabulary."] },
    { kind: "vectors", y: 1182, a: 130, t: 26, num: "06", name: "Embeddings", side: 1,
      text: ["In the AI model you send it to: each", "token becomes a vector, and you pay", "per token."] }
  ];
  var METHODS = 1;

  // At first the chips sit right on top of each other: each one's top is its own thickness above
  // the one under it
  var STACK_BASE = 740, STACKED = [];
  (function () {
    var y = STACK_BASE;
    for (var n = LAYERS.length - 1; n >= 0; n--) {
      STACKED[n] = y;
      if (n) y -= LAYERS[n - 1].t;
    }
  })();
  var MID = 674;  // the middle of the drawing at the first angle (a height, on screen)

  // A deterministic shuffle, so the drawing is the same every time
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var TILES = [];
  (function () {
    for (var row = 0; row < 7; row++) {
      var x = -110, y = -104 + row * 31;
      while (x < 104) {
        var w = 20 + Math.round(rnd() * 34);
        if (x + w > 110) w = 110 - x;
        if (w > 12) TILES.push({ x: x, y: y, w: w, filler: rnd() < 0.3 });
        x += w + 6;
      }
    }
  })();
  var VECTORS = [];
  for (var gx = 0; gx < 6; gx++) for (var gy = 0; gy < 4; gy++) {
    VECTORS.push({ x: -95 + gx * 38, y: -78 + gy * 52, h: 12 + Math.round(rnd() * 40), violet: (gx + gy) % 5 === 0 });
  }
  var PROSE = [[180, 120], [150, 150], [200, 140], [105, 60], [175, 175], [130, 80]];
  var IDS = ["15900 259 79007 11", "2684 2616 13 17951", "89 180721 290 5018", "6391 842 328 261", "15226 2254 481 4952", "480 316 448 20837"];

  // how strongly the chip being drawn shows (in x-ray, the ones round the methods' chip recede)
  var layerAlpha = 1;
  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function smooth(x) { return x * x * (3 - 2 * x); }
  function mix(a, b, k) { return a + (b - a) * k; }
  function spaced(text) { return text.split("").join(" "); }  // (letter-spaced capitals)

  // The camera's path, step by step of the wheel (see the top): each step a pose, eased into
  // from the one before. A pose: which way round (yaw), how high (pitch), how close (zoom), what
  // it looks at (a height on screen at the first angle, or a chip by its place, fractions between
  // two), how see-through the chips are (xray), and how far down the dive has got (dive: which
  // chip, 0 to 5) and how much it shows (diveW)
  var ISO_POSE = { yaw: 45, pitch: ISO / DEG, zoom: 1, focus: MID, xray: 0, dive: 0, diveW: 0 };
  var SIDE_POSE = { yaw: -28, pitch: 9, zoom: 0.9, focus: MID, xray: 0, dive: 0, diveW: 0 };   // turning the other way
  var TOP_POSE = { yaw: 135, pitch: 86, zoom: 2.1, focus: { chip: 0 }, xray: 1, dive: 0, diveW: 1 };
  var DIVE_LEN = 3.5;                          // steps of the wheel to dive from the top chip to the last
  var DIVE_TURN = 120;                         // degrees the view turns on the way down
  var OUT_AT = 4 + DIVE_LEN, END = OUT_AT + 1;
  var LOOP = END + 1;                          // then the stack closes again: back to the start
  var DONE_POSE = { yaw: 405, pitch: ISO / DEG, zoom: 1, focus: MID, xray: 0, dive: 5, diveW: 0 };

  // The canvas, filling the stage (on a phone, the drawing's own shape)
  var canvas = document.createElement("canvas");
  canvas.className = "hw-diagram-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.appendChild(canvas);
  var g = canvas.getContext("2d");
  var dpr = 1, CW = 0, CH = 0;
  function fit() {
    var r = stage.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(phone ? r.width * H0 / W0 : r.height);
    if (w === CW && h === CH) return;
    CW = w; CH = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
  }

  // The camera for this frame (orthographic: at the first angle exactly the isometric drawing),
  // and where a point in the world lands on the canvas: [x, y, how near the camera it is]
  var cam = { cy: 1, sy: 0, sp: 0, cp: 1, k: 1, base: 1, fx: 0, fy: 0 };
  function raw(x, y, z) {
    var xr = x * cam.cy - y * cam.sy, yr = x * cam.sy + y * cam.cy;
    return [SCALE * xr, SCALE * (cam.sp * yr - cam.cp * z), yr];
  }
  function setCamera(c, focusZ) {
    cam.cy = Math.cos(c.yaw * DEG); cam.sy = Math.sin(c.yaw * DEG);
    cam.sp = Math.sin(c.pitch * DEG); cam.cp = Math.cos(c.pitch * DEG);
    cam.base = Math.min(CW / W0, CH / H0) * 0.98;
    cam.k = cam.base * c.zoom;
    var f = raw(0, 0, focusZ);
    cam.fx = f[0]; cam.fy = f[1];
  }
  // (the chip being drawn can be turned on its own: about its upright middle)
  var turn = { c: 1, s: 0 };
  function P(x, y, z) {
    if (turn.s) { var tx = x * turn.c - y * turn.s; y = x * turn.s + y * turn.c; x = tx; }
    var r = raw(x, y, z);
    return [CW / 2 + cam.k * (r[0] - cam.fx), CH / 2 + cam.k * (r[1] - cam.fy), r[2]];
  }
  // how much a side faces the camera (more than 0: it shows)
  function facing(nx, ny) {
    var tx = nx * turn.c - ny * turn.s, ty = nx * turn.s + ny * turn.c;
    return tx * cam.sy + ty * cam.cy;
  }

  function path(points) {
    g.beginPath();
    points.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
  }
  function poly(points, fill, stroke, width, dash) {
    path(points);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) {
      g.strokeStyle = stroke; g.lineWidth = width || 1;
      g.setLineDash(dash || []);
      g.stroke();
      g.setLineDash([]);
    }
  }
  function seg(a, b, stroke, width, dash) {
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.strokeStyle = stroke; g.lineWidth = width || 1;
    g.setLineDash(dash || []);
    g.stroke();
    g.setLineDash([]);
  }
  function dot(p, r, fill) { g.beginPath(); g.arc(p[0], p[1], r, 0, 2 * Math.PI); g.fillStyle = fill; g.fill(); }

  // A box (a chip, or a module on one): the sides that face the camera, shaded as if lit from the
  // right, with vents, then its top; see-through by xray
  var SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function box(x, y, z, a, t, xray, topFill, topStroke, vents) {
    var solid = 1 - 0.86 * xray;
    var corner = function (sx, sy, zz) { return P(x + sx * a, y + sy * a, zz); };
    SIDES.forEach(function (n) {
      if (facing(n[0], n[1]) <= 0.001) return;
      var q = n[0] ? [[n[0], -1], [n[0], 1]] : [[-1, n[1]], [1, n[1]]];
      var face = [corner(q[0][0], q[0][1], z), corner(q[1][0], q[1][1], z), corner(q[1][0], q[1][1], z - t), corner(q[0][0], q[0][1], z - t)];
      var light = 12 + Math.round(20 * (0.5 + 0.5 * (n[0] * 0.8 - n[1] * 0.6)));
      poly(face, "rgba(" + light + "," + light + "," + (light + 5) + "," + solid + ")", LINE, 1);
      if (vents) {
        for (var k = 0; k < 9; k++) {
          var s = -1 + (22 + k * 9) / a;
          var px = n[0] ? n[0] : s, py = n[0] ? -s : n[1];
          seg(corner(px, py, z - t * 0.32), corner(px, py, z - t * 0.72), "rgba(255,255,255," + (0.34 * (1 - 0.5 * xray)).toFixed(3) + ")", 1);
        }
      }
    });
    if (cam.sp > 0.02) {
      poly([corner(-1, -1, z), corner(1, -1, z), corner(1, 1, z), corner(-1, 1, z)],
        topFill || "rgba(15,15,19," + solid + ")", topStroke || LINE, 1.2);
    }
  }

  // The inside of a chip, seen in x-ray: rings, traces out to the edges ending in vias, a core,
  // half-way down
  function bones(z, a, t, xray) {
    if (xray < 0.02) return;
    var zz = z - t / 2;
    g.globalAlpha = xray * layerAlpha;
    [0.28, 0.52, 0.76].forEach(function (r, i) {
      var q = r * a;
      poly([P(-q, -q, zz), P(q, -q, zz), P(q, q, zz), P(-q, q, zz)], null, i === 1 ? VIOLET : "rgba(255,255,255,0.4)", 1);
    });
    for (var k = 0; k < 12; k++) {
      var side = k % 4, s = -0.7 + Math.floor(k / 4) * 0.7;
      var from = [[0.28, s * 0.28], [-0.28, s * 0.28], [s * 0.28, 0.28], [s * 0.28, -0.28]][side];
      var to = [[0.95, s * 0.9], [-0.95, s * 0.9], [s * 0.9, 0.95], [s * 0.9, -0.95]][side];
      seg(P(from[0] * a, from[1] * a, zz), P(to[0] * a, to[1] * a, zz), k % 3 ? "rgba(139,127,242,0.75)" : "rgba(255,255,255,0.45)", 1);
      var v = P(to[0] * a, to[1] * a, zz);
      g.fillStyle = VIOLET; g.fillRect(v[0] - 2, v[1] - 2, 4, 4);
    }
    dot(P(0, 0, zz), 4, VIOLET);
    g.globalAlpha = layerAlpha;
  }

  // Every edge of a chip, dashed over it in x-ray
  function wire(z, a, t, xray) {
    if (xray < 0.02) return;
    var c = [[-1, -1], [1, -1], [1, 1], [-1, 1]], colour = "rgba(255,255,255," + (0.4 * xray).toFixed(3) + ")";
    for (var i = 0; i < 4; i++) {
      var p = c[i], q = c[(i + 1) % 4];
      seg(P(p[0] * a, p[1] * a, z - t), P(q[0] * a, q[1] * a, z - t), colour, 1, [3, 4]);
      seg(P(p[0] * a, p[1] * a, z), P(p[0] * a, p[1] * a, z - t), colour, 1, [3, 4]);
    }
  }

  // What's on a chip's top: lines of text, token tiles, token numbers, the method modules or the
  // vectors, then its inner rim and corner dots. Text is drawn flat on the face (the camera is
  // orthographic, so a face's picture is just a slant of it)
  function onTop(layer, z, raised, xray) {
    var kind = layer.kind, flat = cam.sp > 0.05;
    var fade = (1 - 0.45 * xray) * layerAlpha;
    g.globalAlpha = fade;
    if ((kind === "prompt" || kind === "shorter") && flat) {
      PROSE.forEach(function (row, k) {
        var y = -86 + k * 33, len = row[0], keep = row[1];
        seg(P(-100, y, z), P(-100 + keep, y, z), k === 0 ? LINE : DIM, 1.4);
        if (keep < len) {
          if (kind === "prompt") seg(P(-100 + keep + 6, y, z), P(-100 + len, y, z), VIOLET, 1.4);
          else seg(P(-100 + keep + 6, y, z), P(-100 + len, y, z), "rgba(255,255,255,0.16)", 1, [2, 4]);
        }
      });
      if (kind === "prompt") poly([P(34, 74, z), P(41, 74, z), P(41, 88, z), P(34, 88, z)], VIOLET);
    } else if (kind === "tokens" && flat) {
      TILES.forEach(function (tile) {
        var pts = [P(tile.x, tile.y, z), P(tile.x + tile.w, tile.y, z), P(tile.x + tile.w, tile.y + 21, z), P(tile.x, tile.y + 21, z)];
        if (tile.filler) poly(pts, null, "rgba(139,127,242,0.8)", 0.9, [2, 3]);
        else poly(pts, null, LINE, 0.9);
      });
    } else if (kind === "ids" && flat) {
      var o = P(0, 0, z), ux = P(1, 0, z), vy = P(0, 1, z);
      g.save();
      g.setTransform(dpr * (ux[0] - o[0]), dpr * (ux[1] - o[1]), dpr * (vy[0] - o[0]), dpr * (vy[1] - o[1]), dpr * o[0], dpr * o[1]);
      g.font = "400 15px " + FONT;
      IDS.forEach(function (row, k) {
        g.fillStyle = k % 2 ? DIM : LINE;
        g.fillText(spaced(row), -104, -74 + k * 34);
      });
      g.restore();
    } else if (kind === "methods" && raised > 0) {
      g.globalAlpha = raised * fade;
      [["NLP", -85], ["TF-IDF", 0], ["AI REWRITE", 85]].forEach(function (m, k) {
        var x = m[1], y = -m[1] * 0.35;
        box(x, y, z + 30, 30, 30, xray, k === 2 ? "rgba(139,127,242,0.25)" : null, k === 2 ? VIOLET : null, false);
        // its name on a pill over it, upright to the camera (only when looking down on it)
        if (cam.sp > 0.3) {
          var top = P(x, y, z + 30), unit = cam.k;
          var wide = (m[0].length * 8.4 + 22) * unit, py = top[1] - 46 * unit;
          seg([top[0], py + 12 * unit], [top[0], top[1] - 4 * unit], DIM, 1);
          g.beginPath();
          g.roundRect(top[0] - wide / 2, py - 12 * unit, wide, 24 * unit, 12 * unit);
          g.fillStyle = "#0b0b0e"; g.fill();
          g.strokeStyle = LINE; g.lineWidth = 1; g.stroke();
          g.fillStyle = "#ffffff";
          g.font = "500 " + (11 * unit).toFixed(1) + "px " + FONT;
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(spaced(m[0]), top[0], py + 0.5);
          g.textAlign = "start"; g.textBaseline = "alphabetic";
        }
      });
    } else if (kind === "vectors" && raised > 0) {
      g.globalAlpha = raised * fade;
      VECTORS.forEach(function (v) {
        var foot = P(v.x, v.y, z), head = P(v.x, v.y, z + v.h);
        seg(foot, head, v.violet ? VIOLET : LINE, 1.4);
        dot(head, 2.2, v.violet ? VIOLET : "#ffffff");
      });
    }
    g.globalAlpha = layerAlpha;
    if (flat) {
      var r = layer.a - 12;
      poly([P(-r, -r, z), P(r, -r, z), P(r, r, z), P(-r, r, z)], null, "rgba(255,255,255,0.12)", 1);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        dot(P(c[0] * (layer.a - 6), c[1] * (layer.a - 6), z), 2.1, "rgba(255,255,255,0.85)");
      });
    }
  }

  // The violet orbit round the methods' chip: a ring and a dashed one inside it, level with it;
  // the far half drawn before the chip, the near half after the whole stack
  function orbit(z, near, alpha, time) {
    if (alpha < 0.01) return;
    [[300, 1.1, null, 0.8], [240, 1, [5, 7], 0.7]].forEach(function (ring) {
      g.beginPath();
      var started = false;
      for (var k = 0; k <= 180; k++) {
        var th = k / 180 * 2 * Math.PI;
        var p = P(ring[0] * Math.cos(th), ring[0] * Math.sin(th), z);
        if ((p[2] >= 0) === near) {
          if (started) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); started = true; }
        } else started = false;
      }
      g.strokeStyle = VIOLET; g.globalAlpha = ring[3] * alpha; g.lineWidth = ring[1];
      if (ring[2]) { g.setLineDash(ring[2]); g.lineDashOffset = -time / 60; }
      g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0; g.globalAlpha = 1;
    });
  }

  // A callout: a pin near the chip's outer corner, a leader out to the side, the number and name
  // and a few words; only at the first angle, and not on a phone (the list is there instead)
  function callout(layer, z, alpha) {
    if (alpha < 0.01 || phone) return;
    var anchor = P(layer.side * 0.82 * layer.a, -layer.side * 0.82 * layer.a, z);
    var base = cam.base, side = layer.side;
    var endX = CW / 2 + side * 290 * base;
    var labelY = anchor[1] - (30 + (layer.lift || 0)) * base;
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(anchor[0], anchor[1]);
    g.lineTo(endX - side * 40 * base, labelY);
    g.lineTo(endX, labelY);
    g.strokeStyle = DIM; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.arc(anchor[0], anchor[1], 3.5, 0, 2 * Math.PI);
    g.fillStyle = "#0b0b0e"; g.fill(); g.strokeStyle = "#ffffff"; g.lineWidth = 1.3; g.stroke();
    var x = endX + side * 15 * base, y = labelY + 6 * base;
    g.font = "600 " + (18 * base).toFixed(1) + "px " + FONT;
    var name = spaced(layer.name.toUpperCase()), num = spaced(layer.num) + "   ";
    var numW = g.measureText(num).width, nameW = g.measureText(name).width;
    var from = side > 0 ? x : x - numW - nameW;
    g.fillStyle = VIOLET; g.fillText(num, from, y);
    g.fillStyle = "#ffffff"; g.fillText(name, from + numW, y);
    g.font = "400 " + (20 * base).toFixed(1) + "px " + FONT;
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.textAlign = side > 0 ? "left" : "right";
    layer.text.forEach(function (line, k) { g.fillText(line, x, y + (34 + k * 27) * base); });
    g.textAlign = "start";
    g.globalAlpha = 1;
  }

  // In the dive, the chip in front of the camera has its caption on the left: number and name,
  // then its words; it rises in as the camera gets to it and slides up and away as it passes
  function caption(layer, alpha, shift) {
    if (alpha < 0.01 || phone) return;
    var x = 32, y = CH / 2 - 40 + shift;
    g.globalAlpha = alpha;
    g.textAlign = "left";
    // (on a soft dark backing, so lines behind it never cross the words)
    g.font = "400 16px " + FONT;
    var wide = Math.max.apply(null, layer.text.map(function (line) { return g.measureText(line).width; })) + 40;
    g.fillStyle = "rgba(11,11,12,0.82)";
    g.beginPath();
    g.roundRect(x - 20, y - 34, wide, 64 + layer.text.length * 24, 6);
    g.fill();
    g.font = "600 16px " + FONT;
    var num = spaced(layer.num) + "   ";
    g.fillStyle = VIOLET; g.fillText(num, x, y);
    g.fillStyle = "#ffffff"; g.fillText(spaced(layer.name.toUpperCase()), x + g.measureText(num).width, y);
    g.font = "400 16px " + FONT;
    g.fillStyle = "rgba(255,255,255,0.6)";
    layer.text.forEach(function (line, k) { g.fillText(line, x, y + 32 + k * 24); });
    g.globalAlpha = 1;
  }

  // Where the wheel has got to, round and round the loop (on a phone or with reduced motion, 2:
  // open, still)
  var fixed = phone || still;
  var wanted = fixed ? 2 : 0, at = wanted, last = 0;
  var hint = document.querySelector(".hw-hint");
  // (no ends: past the last step it carries on round from the first, and back again)
  var moved = false;
  // A hard flick can't rush the camera past a stage: it goes at most MAX_PACE steps a second, and
  // the wheel can be at most LEAD steps ahead of it, so it never runs on long after the hand stops.
  // WHEEL is how far (px of wheel) makes one step, EASE how gently the camera catches up: together
  // a slow, unhurried camera that takes its time over each stage
  var MAX_PACE = 0.8, LEAD = 0.9, WHEEL = 1600, EASE = 280;
  function nudge(by) {
    wanted = Math.min(at + LEAD, Math.max(at - LEAD, wanted + by));
    moved = true;
  }
  if (!fixed) {
    window.addEventListener("wheel", function (event) {
      event.preventDefault();
      nudge((event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY) / WHEEL);
    }, { passive: false });
    var touchY = null;
    window.addEventListener("touchstart", function (event) { touchY = event.touches[0].clientY; }, { passive: true });
    window.addEventListener("touchmove", function (event) {
      if (touchY == null) return;
      event.preventDefault();
      nudge((touchY - event.touches[0].clientY) / (WHEEL / 2));
      touchY = event.touches[0].clientY;
    }, { passive: false });
    window.addEventListener("keydown", function (event) {
      var step = { ArrowDown: 0.1, PageDown: 0.35, " ": 0.35, ArrowUp: -0.1, PageUp: -0.35, End: LOOP, Home: -LOOP }[event.key];
      if (step == null || /^(INPUT|TEXTAREA|SELECT)$/.test((event.target || {}).tagName || "")) return;
      event.preventDefault();
      nudge(step);
    });
  }

  // The pose at any point of the wheel
  function blend(a, b, k) {
    var out = { focusA: a.focus, focusB: b.focus, k: k };
    ["yaw", "pitch", "zoom", "xray", "dive", "diveW"].forEach(function (key) { out[key] = mix(a[key], b[key], k); });
    return out;
  }
  function pose(w) {
    // the closed stack's chips spin (each on its own, frame() turns them), then it opens
    if (w <= 1) return blend(ISO_POSE, ISO_POSE, 0);
    if (w <= 2) return blend(ISO_POSE, ISO_POSE, 0);
    if (w <= 3) return blend(ISO_POSE, SIDE_POSE, smooth(w - 2));
    if (w <= 4) return blend(SIDE_POSE, TOP_POSE, smooth(w - 3));
    if (w <= OUT_AT) {
      // the dive: down from chip to chip, easing to a stop on each; the view turning slowly
      var d = (w - 4) / DIVE_LEN * 5, n = Math.min(4, Math.floor(d));
      var chip = n + smooth(clamp(d - n));
      // (the x-ray is only for the view from the top: diving, the chips are solid again)
      return blend(TOP_POSE, Object.assign({}, TOP_POSE, { yaw: TOP_POSE.yaw + DIVE_TURN * (w - 4) / DIVE_LEN,
        focus: { chip: chip }, dive: chip, xray: 1 - smooth(clamp((w - 4) / 0.35)) }), 1);
    }
    var bottom = Object.assign({}, TOP_POSE, { yaw: TOP_POSE.yaw + DIVE_TURN, focus: { chip: 5 }, dive: 5, xray: 0 });
    return blend(bottom, DONE_POSE, smooth(clamp(w - OUT_AT)));
  }

  function frame(now) {
    fit();
    var dt = Math.min(now - (last || now), 50), most = MAX_PACE * dt / 1000;
    at += Math.min(most, Math.max(-most, (wanted - at) * Math.min(1, dt / EASE)));
    if (Math.abs(wanted - at) < 0.0005) at = wanted;
    last = now;
    if (hint) hint.classList.toggle("is-gone", moved);
    // where in the loop: the open stack closes again over the last step, so it ends as it began
    var w = ((at % LOOP) + LOOP) % LOOP;
    var opening = w >= END ? 1 - clamp(w - END) : clamp(w - 1), open = ease(opening);
    var tops = LAYERS.map(function (layer, i) { return -(STACKED[i] + (layer.y - STACKED[i]) * open); });
    var middle = function (i) { return tops[i] - LAYERS[i].t / 2; };
    var focusOf = function (f) {
      if (typeof f === "number") return -f;
      var lo = Math.floor(f.chip), hi = Math.min(LAYERS.length - 1, lo + 1);
      return mix(middle(lo), middle(hi), f.chip - lo);
    };
    var c = pose(Math.min(w, END));
    setCamera(c, mix(focusOf(c.focusA), focusOf(c.focusB), c.k));
    var xray = c.xray, kBase = cam.k;
    var opened = clamp((opening - 0.3) / 0.3), raised = clamp((opening - 0.42) / 0.2);
    // the callouts: in turn as it opens, gone once the camera moves, back at the very end
    var first = w >= END ? 0 : 1 - clamp((w - 2) / 0.18);
    var back = clamp((w - (END - 0.25)) / 0.25) * (1 - clamp((w - END) / 0.3));
    // each chip in the dive: the ones passed swell and fade, as if flown through; the ones still
    // below look smaller, further off; the one in focus stands out, the others recede in x-ray
    var focusChip = Math.round(c.dive);
    var scale = [], alpha = [];
    LAYERS.forEach(function (layer, i) {
      var rel = (c.dive - i) * c.diveW;
      scale[i] = rel > 0 ? 1 + 4 * rel * rel : 1 / (1 + 0.18 * -rel);
      var passed = rel > 0 ? 1 - clamp(rel / 0.55) : 1;
      alpha[i] = passed * (i === focusChip ? 1 : 1 - 0.72 * xray);
    });

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, CW, CH);
    g.lineJoin = "round"; g.lineCap = "round";
    // the guides: dashed uprights at the chips' corners, the middle line, the dot going down it
    var top = tops[0], bottom = tops[tops.length - 1];
    // (none in the dive: there's only the chip in front of the camera)
    g.globalAlpha = opened * (1 - c.diveW);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
      seg(P(s[0] * 130, s[1] * 130, top), P(s[0] * 130, s[1] * 130, bottom), "rgba(255,255,255,0.28)", 1, [4, 6]);
    });
    seg(P(0, 0, top - LAYERS[0].t), P(0, 0, bottom), "rgba(255,255,255,0.22)", 1);
    var flow = fixed ? 0.5 : (now / 5200) % 1;
    dot(P(0, 0, mix(top - LAYERS[0].t, bottom, flow)), 4.5, VIOLET);
    g.globalAlpha = 1;
    // the chips, bottom first, so each covers the one under it
    for (var i = LAYERS.length - 1; i >= 0; i--) {
      var layer = LAYERS[i], z = tops[i];
      if (alpha[i] < 0.01) continue;
      cam.k = kBase * scale[i];
      // the first stretch of the wheel: each chip a whole turn, every other one the other way
      var spin = fixed || w >= END ? 0 : smooth(clamp((w - i * 0.04) / 0.8)) * 2 * Math.PI * (i % 2 ? -1 : 1);
      turn.c = Math.cos(spin); turn.s = Math.abs(Math.sin(spin)) < 1e-9 ? 0 : Math.sin(spin);
      if (i === METHODS) { g.globalAlpha = alpha[i]; orbit(z - layer.t / 2, false, opened * alpha[i], now); }
      layerAlpha = alpha[i];
      g.globalAlpha = layerAlpha;
      box(0, 0, z, layer.a, layer.t, xray, null, null, true);
      bones(z, layer.a, layer.t, xray);
      onTop(layer, z, raised, xray);
      wire(z, layer.a, layer.t, xray);
      g.globalAlpha = 1;
      turn.c = 1; turn.s = 0;
    }
    layerAlpha = 1;
    cam.k = kBase * scale[METHODS];
    orbit(tops[METHODS] - LAYERS[METHODS].t / 2, true, opened * alpha[METHODS], now);
    cam.k = kBase;
    if (c.diveW > 0.01) {
      LAYERS.forEach(function (layer, i) {
        var off = c.dive - i;
        caption(layer, (1 - clamp(Math.abs(off) / 0.4)) * c.diveW, -off * 60);
      });
    }
    LAYERS.forEach(function (layer, i) {
      var drawIn = fixed ? 1 : w >= END ? 0 : clamp((opening - 0.45 - i * 0.07) / 0.25);
      callout(layer, tops[i], Math.max(drawIn * first, back));
    });
    if (!fixed) requestAnimationFrame(frame);
  }
  // (drawn once fonts are in, and again on resizing when it's still)
  if (fixed) window.addEventListener("resize", function () { requestAnimationFrame(frame); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { requestAnimationFrame(frame); });
})();
