// Intro animation on the front page, once per visit (and again after Cmd+R, see reload.js):
// six boxes become T O K E N Z, the T and Z become wide O's, everything merges into one O,
// and that O grows until its hole uncovers the whole page.
//
// Every shape is an outline of the same number of points, so any shape can turn into any
// other by sliding each point towards its partner.
(function () {
  var KEY = "tokenz_intro_played";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var played;
  try {
    played = sessionStorage.getItem(KEY) === "1";
    sessionStorage.setItem(KEY, "1");
  } catch (e) {
    played = true;
  }
  if (played || reduceMotion) return;

  // Set before the page paints, so the white cover is there from the very first frame
  document.documentElement.classList.add("intro-play");
  document.addEventListener("DOMContentLoaded", run);

  var N_OUTER = 160; // points around each shape's outside
  var N_INNER = 64;  // points around its hole
  var INK = "#16171A";
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ---- Shapes ----
  // Every shape has an outside outline (clockwise) and a hole (anticlockwise). Shapes without
  // a hole get one shrunk to a single point in their middle, so when a letter becomes an O
  // its hole simply grows open from the centre.

  function solid(outline, cx, cy) {
    var hole = [];
    for (var k = 0; k < N_INNER; k++) hole.push([cx, cy]);
    return { outer: outline, inner: hole };
  }

  function box(x, y, w, h) {
    return solid([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], x + w / 2, y + h / 2);
  }

  function ellipse(cx, cy, rx, ry, count, backwards) {
    var points = [];
    for (var k = 0; k < count; k++) {
      var a = -Math.PI / 2 + (backwards ? -1 : 1) * (2 * Math.PI * k) / count;
      points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return points;
  }

  function ring(cx, cy, rx, ry, thick) {
    return {
      outer: ellipse(cx, cy, rx, ry, 64, false),
      inner: ellipse(cx, cy, rx - thick, ry - thick, N_INNER, true)
    };
  }

  // Blocky capitals inside a w × h box at (x, y), with strokes s thick
  function letter(ch, x, y, w, h, s) {
    var p;
    if (ch === "T") {
      p = [[0, 0], [w, 0], [w, s], [w / 2 + s / 2, s], [w / 2 + s / 2, h], [w / 2 - s / 2, h], [w / 2 - s / 2, s], [0, s]];
    } else if (ch === "O") {
      return ring(x + w / 2, y + h / 2, w / 2, h / 2, s);
    } else if (ch === "K") {
      p = [[0, 0], [s, 0], [s, 0.36 * h], [w - 1.6 * s, 0], [w, 0], [1.5 * s, 0.5 * h], [w, h], [w - 1.6 * s, h], [s, 0.64 * h], [s, h], [0, h]];
    } else if (ch === "E") {
      p = [[0, 0], [w, 0], [w, s], [s, s], [s, h / 2 - s / 2], [0.85 * w, h / 2 - s / 2], [0.85 * w, h / 2 + s / 2], [s, h / 2 + s / 2], [s, h - s], [w, h - s], [w, h], [0, h]];
    } else if (ch === "N") {
      var k = 1.2 * s; // keeps the diagonal as thick as the uprights
      p = [[0, 0], [1.35 * s, 0], [w - s, h - k], [w - s, 0], [w, 0], [w, h], [w - 1.35 * s, h], [s, k], [s, h], [0, h]];
    } else if (ch === "Z") {
      var a = 1.6 * s;
      p = [[0, 0], [w, 0], [w, s], [a, h - s], [w, h - s], [w, h], [0, h], [0, h - s], [w - a, s], [0, s]];
    }
    return solid(p.map(function (pt) { return [x + pt[0], y + pt[1]]; }), x + w / 2, y + h / 2);
  }

  // ---- Making two shapes blendable ----

  // Spread exactly N points along an outline, keeping every original corner sharp
  function resample(poly, N) {
    var lengths = poly.map(function (p, i) {
      var q = poly[(i + 1) % poly.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    var total = lengths.reduce(function (a, b) { return a + b; }, 0);
    if (total === 0) return poly.slice(0, N); // a hole shrunk to a point
    var spare = N - poly.length;
    var counts = lengths.map(function (len) { return 1 + Math.floor((spare * len) / total); });
    var left = N - counts.reduce(function (a, b) { return a + b; }, 0);
    var longest = lengths.map(function (_, i) { return i; }).sort(function (a, b) { return lengths[b] - lengths[a]; });
    for (var k = 0; k < left; k++) counts[longest[k % longest.length]]++;

    var out = [];
    poly.forEach(function (p, i) {
      var q = poly[(i + 1) % poly.length];
      for (var j = 0; j < counts[i]; j++) {
        var t = j / counts[i];
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    return out;
  }

  // Rotate the target outline's point order so each point travels as short a way as possible
  function alignOutline(target, source) {
    var N = target.length;
    var best = 0;
    var bestCost = Infinity;
    for (var offset = 0; offset < N; offset++) {
      var cost = 0;
      for (var i = 0; i < N && cost < bestCost; i++) {
        var a = target[(i + offset) % N];
        var b = source[i];
        cost += (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
      }
      if (cost < bestCost) { bestCost = cost; best = offset; }
    }
    return target.slice(best).concat(target.slice(0, best));
  }

  // Resample a shape and line it up with the shape it will turn into (or come from)
  function prepare(shape, source) {
    var outer = resample(shape.outer, N_OUTER);
    var inner = resample(shape.inner, N_INNER);
    return source
      ? { outer: alignOutline(outer, source.outer), inner: alignOutline(inner, source.inner) }
      : { outer: outer, inner: inner };
  }

  function blendOutline(a, b, t) {
    return a.map(function (p, i) {
      return [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t];
    });
  }

  function blend(a, b, t) {
    return { outer: blendOutline(a.outer, b.outer, t), inner: blendOutline(a.inner, b.inner, t) };
  }

  function outlinePath(points) {
    return "M" + points.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") + "Z";
  }

  function toPath(shape) {
    return outlinePath(shape.outer) + outlinePath(shape.inner);
  }

  // ---- Timing ----

  // Gentle ease in and out: never lingers long at either end, so motions hand over smoothly
  function easeInOut(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t; }
  function progress(now, start, duration) { return Math.min(1, Math.max(0, (now - start) / duration)); }

  // Opening: the logo builds itself, then opens out into the row of boxes in one motion.
  // The steps overlap, so something is always moving.
  var SPLIT = 250;       // the two chevrons, growing in together as "><", start sliding apart
  var DIAMOND = 550;     // the middle square spins in from nothing and keeps spinning, without
                         // stopping, until it stands upright at box size...
  var SPREAD = 1450;     // ...then fans straight out into all six boxes, the chevrons riding ahead
  var SPREAD_TIME = 650;
  var FLY_TIME = 600;    // once the row is open, the chevrons whoosh off the screen
  var PAUSE = -150;      // the letters start forming this long before the row has fully settled
  var OPENING_PACE = 1.25; // stretches just the opening above (1 = as written, bigger = slower)

  // Each stage below starts slightly before the one before it finishes (BEAT is negative), so
  // the whole thing flows without stopping. Change a duration and everything after it moves
  // along with it.
  var BEAT = -80;
  var TO_LETTERS = 750;  // boxes become T O K E N Z with square corners, from the middle outwards
  var LETTER_STAGGER = 80;
  var MORPH_TIME = 650;
  var ROUND = TO_LETTERS + 2 * LETTER_STAGGER + MORPH_TIME + BEAT; // all the letters soften into a rounded font together
  var ROUND_TIME = 1000;
  var TO_OS = ROUND + ROUND_TIME + BEAT; // T and Z become wide O's
  var MERGE = TO_OS + MORPH_TIME;        // Venom-style merge: tendrils shoot out from every letter to the middle...
  var REACH_TIME = 350;
  var PULL = MERGE + 250;                // ...then drag the letters in, from the outside first, and they melt into one O
  var MERGE_TIME = 800;
  var SETTLE = PULL + 150 + MERGE_TIME;  // the O wobbles like jelly as it settles
  var GROW = SETTLE + 150;               // the O grows until its hole uncovers the page, while still wobbling
  var GROW_TIME = 1200;
  var SPEED = 1.8;   // plays the whole timeline above this much faster (1 = as written)

  function run() {
    var cover = document.querySelector(".intro");
    if (!cover) return;

    var W = window.innerWidth;
    var H = window.innerHeight;

    // Letter size follows the window, so the row fits on phones too
    var h = Math.min(W * 0.1, H * 0.18, 120);
    var w = h; // boxes and letters are the same size: an h × h square
    var gap = 0.42 * h;
    var s = 0.24 * h;
    var rowWidth = 6 * w + 5 * gap;
    var x0 = (W - rowWidth) / 2;
    var y0 = (H - h) / 2;
    var cx = W / 2;
    var cy = H / 2;

    // The wide, thick O: wider than it is tall
    var bigRx = 0.7 * h;
    var bigRy = 0.5 * h;
    var bigThick = 0.26 * h;
    var holeRx = bigRx - bigThick;
    var holeRy = bigRy - bigThick;
    var centerO = ring(cx, cy, bigRx, bigRy, bigThick);

    // How far to grow so the hole is bigger than the whole window
    var grow = 1.05 * Math.sqrt(Math.pow(W / 2 / holeRx, 2) + Math.pow(H / 2 / holeRy, 2));

    var items = "TOKENZ".split("").map(function (ch, i) {
      var x = x0 + i * (w + gap);
      var boxShape = prepare(box(x, y0, w, h));
      var letterShape = prepare(letter(ch, x, y0, w, h, s), boxShape);
      var beforeMerge = letterShape;
      // Only the T and Z turn into wide O's before the merge
      if (ch === "T" || ch === "Z") {
        beforeMerge = prepare(ring(x + w / 2, cy, bigRx, bigRy, bigThick), letterShape);
      }
      return {
        index: i,
        home: x + w / 2,
        becomesO: ch === "T" || ch === "Z",
        box: boxShape,
        letter: letterShape,
        beforeMerge: beforeMerge,
        merged: prepare(centerO, beforeMerge)
      };
    });

    // While being dragged in, a shape stretches towards the middle and its edge ripples,
    // like something alive. Strongest halfway, gone by the time it arrives.
    function squirm(shape, p, seed, now) {
      var amount = Math.sin(Math.PI * p);
      if (amount <= 0) return shape;
      var mid = [0, 0];
      shape.outer.forEach(function (pt) { mid[0] += pt[0] / N_OUTER; mid[1] += pt[1] / N_OUTER; });
      var stretchX = 1 + 0.35 * amount;
      var squashY = 1 - 0.15 * amount;
      var ripple = 0.05 * h * amount;
      function move(points, rippling) {
        return points.map(function (pt, k) {
          var a = (2 * Math.PI * k) / points.length;
          return [
            mid[0] + (pt[0] - mid[0]) * stretchX + (rippling ? ripple * Math.sin(5 * a + now / 70 + seed) : 0),
            mid[1] + (pt[1] - mid[1]) * squashY + (rippling ? ripple * Math.cos(4 * a + now / 90 + seed * 2) : 0)
          ];
        });
      }
      // Only the outside ripples; rippling a hole that's shrunk to a point would open it
      return { outer: move(shape.outer, true), inner: move(shape.inner, false) };
    }

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    // "Goo" filter: blur, then snap the blur back to a hard edge. This rounds corners and
    // smooths over the awkward in-between bumps while a shape changes, so it flows like liquid.
    // There's one per letter, plus one shared by everything for the merge, so that letters and
    // tendrils fuse wherever they touch. Only the band around the row is filtered.
    function gooFilter(id) {
      return '<filter id="' + id + '" filterUnits="userSpaceOnUse" x="0" y="' + (cy - 1.2 * h) + '" width="' + W + '" height="' + 2.4 * h + '">' +
          '<feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur"/>' +
          '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"/>' +
        '</filter>';
    }
    var defs = gooFilter("intro-goo-all");
    items.forEach(function (item) { defs += gooFilter("intro-goo-" + item.index); });
    svg.innerHTML = "<defs>" + defs + "</defs>";
    items.forEach(function (item) {
      item.blur = svg.querySelector("#intro-goo-" + item.index + " feGaussianBlur");
    });
    var mergeBlur = svg.querySelector("#intro-goo-all feGaussianBlur");

    var background = document.createElementNS(SVG_NS, "path");
    background.setAttribute("fill", "#ffffff");
    background.setAttribute("fill-rule", "evenodd");
    background.setAttribute("d", "M0,0H" + W + "V" + H + "H0Z");
    // group: zooms at the end. blob: inside it, melts together and jiggles during the merge
    var group = document.createElementNS(SVG_NS, "g");
    var blob = document.createElementNS(SVG_NS, "g");
    items.forEach(function (item) {
      // Two tendrils per letter: one arching over, one under
      item.strands = [-1, 1].map(function (side) {
        var strand = document.createElementNS(SVG_NS, "path");
        strand.setAttribute("fill", "none");
        strand.setAttribute("stroke", INK);
        strand.setAttribute("stroke-width", (0.16 * h).toFixed(1));
        strand.setAttribute("stroke-linecap", "round");
        blob.appendChild(strand);
        return { el: strand, side: side };
      });
      item.el = document.createElementNS(SVG_NS, "path");
      item.el.setAttribute("fill", INK);
      blob.appendChild(item.el);
    });
    group.appendChild(blob);
    svg.appendChild(background);
    svg.appendChild(group);

    // The logo mark, drawn in its own 64 × 64 units and centred on the screen
    var logo = document.createElementNS(SVG_NS, "g");
    logo.setAttribute("fill", INK);
    logo.innerHTML =
      '<path d="M6 14 H15 L25 32 L15 50 H6 L16 32 Z"/>' +
      '<path d="M58 14 H49 L39 32 L49 50 H58 L48 32 Z"/>' +
      '<path d="M32 27.5 L36.5 32 L32 36.5 L27.5 32 Z"/>';
    var logoParts = logo.querySelectorAll("path");
    var logoScale = (2.4 * h) / 64;
    // Inside the blob, so the logo shares its goo filter with the boxes during the opening
    blob.appendChild(logo);

    // Sticky tethers from each chevron's point to whatever is between them
    var tethers = [-1, 1].map(function (side) {
      var tether = document.createElementNS(SVG_NS, "path");
      tether.setAttribute("fill", "none");
      tether.setAttribute("stroke", INK);
      tether.setAttribute("stroke-linecap", "round");
      blob.appendChild(tether);
      return { el: tether, side: side };
    });
    var openingGoo = 0; // how gooey the opening is right now, 0 to 1

    // How far each chevron flies out at the end (in logo units) to get well off its side of
    // the screen. It speeds up as it goes: distance travelled = flyDistance × progress².
    var flyDistance = cx / logoScale + 30;

    // How much the logo's middle square (sides of 4.5√2 logo units) must grow to match a box
    var boxSize = w / (4.5 * Math.SQRT2 * logoScale);

    var spreadEnd = SPREAD + SPREAD_TIME;
    // The letters start forming just after the row has opened, while the chevrons fly off
    var lettersStart = (spreadEnd + PAUSE) * OPENING_PACE - TO_LETTERS;
    var gapToChevron = 0.15 * h;

    function drawLogo(t) {
      var flying = progress(t, spreadEnd, FLY_TIME);
      if (flying >= 1) {
        logo.style.display = "none";
        tethers.forEach(function (tether) { tether.el.removeAttribute("d"); });
        openingGoo = 0;
        return;
      }
      var growing = easeOut(progress(t, 0, 400));
      var split = easeInOut(progress(t, SPLIT, 400));
      var spread = easeOut(progress(t, SPREAD, SPREAD_TIME));

      // The "><" grows out of the centre point between the two chevrons
      var size = logoScale * Math.max(growing, 0.001);
      logo.setAttribute("transform", "translate(" + cx + "," + cy + ") scale(" + size + ") translate(-32,-32)");

      // The square spins in one unbroken motion: fast at first, slowing all the way, five turns
      // in total, ending upright (the extra 45°) just as it reaches box size. It grows quickly
      // to its size in the logo, then on to exactly box size, speeding up into the fan-out.
      // From there the six boxes take over from it.
      var spinning = progress(t, DIAMOND, SPREAD - DIAMOND);
      var turn = -1080 + 1845 * easeOut(spinning);
      var squareSize = easeOut(Math.min(spinning / 0.4, 1)) + (boxSize - 1) * easeIn(Math.max(0, (spinning - 0.4) / 0.6));
      if (t >= SPREAD) {
        logoParts[2].style.display = "none";
      } else {
        logoParts[2].setAttribute("transform", "translate(32,32) rotate(" + turn + ") scale(" + Math.max(squareSize, 0.001) + ") translate(-32,-32)");
      }

      // How far out from the centre the shapes between the chevrons reach, in pixels: the
      // spinning square (wider when tilted), then the outermost boxes as the row fans open
      var tilt = ((turn + 45) * Math.PI) / 180;
      var reachOut = ((4.5 * Math.SQRT2) / 2) * squareSize * logoScale * (Math.abs(Math.cos(tilt)) + Math.abs(Math.sin(tilt)));
      if (t >= SPREAD) reachOut = (cx - items[0].home) * spread + w / 2;

      // The chevrons start with their points almost touching and part a little. After that they
      // stay just outside whatever is between them, so they're pushed open by the growing square
      // and ride ahead of the boxes as the row fans out. Then they whoosh off.
      var out = Math.max(-6.5 * (1 - split), (reachOut + gapToChevron) / logoScale - 7) + flyDistance * flying * flying;
      logoParts[0].setAttribute("transform", "translate(" + -out + ",0)");
      logoParts[1].setAttribute("transform", "translate(" + out + ",0)");

      // Venom-style: everything is gooey from the start (scaled with the logo, so it grows out
      // of an ink drop), then hardens into crisp boxes just after the row has opened
      openingGoo = growing * (1 - easeInOut(progress(t, spreadEnd, 200)));

      // Each chevron's point is tethered to whatever is between them: the other chevron's point
      // at first (so "><" starts fused by a sticky neck), then the spinning square, then the end
      // box. A tether thins as it stretches and snaps once it's too thin to hold.
      var tipOut = (7 + out) * size; // pixels from the centre to each chevron's point
      tethers.forEach(function (tether) {
        var from = cx + tether.side * tipOut;
        var to = cx + tether.side * Math.min(reachOut, tipOut);
        var stretch = Math.abs(from - to);
        var thick = 0.13 * h * growing * openingGoo * Math.max(0, 1 - stretch / (1.1 * h));
        if (thick < 0.5) {
          tether.el.removeAttribute("d");
          return;
        }
        var sag = 0.08 * h * Math.sin(t / 50 + tether.side);
        tether.el.setAttribute("stroke-width", thick.toFixed(1));
        tether.el.setAttribute("d", "M" + from.toFixed(1) + "," + cy + "Q" + ((from + to) / 2).toFixed(1) + "," + (cy + sag).toFixed(1) + " " + to.toFixed(1) + "," + cy);
      });
    }
    cover.appendChild(svg);
    // From here the white comes from the drawing, so its hole can show the page through
    cover.style.background = "transparent";

    var startTime = null;

    function frame(time) {
      if (startTime === null) startTime = time;
      var clock = (time - startTime) * SPEED;
      var openingClock = clock / OPENING_PACE;
      drawLogo(openingClock);
      // The letters' timeline starts once the logo has played
      var now = clock - lettersStart;

      items.forEach(function (item) {
        var i = item.index;
        var shape = item.box;
        // Middle letters first, carrying on the outward motion of the row opening
        var lettering = progress(now, TO_LETTERS + (Math.abs(i - 2.5) - 0.5) * LETTER_STAGGER, MORPH_TIME);
        if (lettering > 0) shape = blend(item.box, item.letter, easeInOut(lettering));
        var toO = item.becomesO ? progress(now, TO_OS, MORPH_TIME) : 0;
        if (toO > 0) shape = blend(item.letter, item.beforeMerge, easeInOut(toO));
        // The outside letters get dragged first, so the row folds in towards the middle
        var merging = progress(now, PULL + Math.abs(2.5 - i) * 60, MERGE_TIME);
        if (merging > 0) shape = squirm(blend(item.beforeMerge, item.merged, easeInOut(merging)), merging, i, now);
        item.el.setAttribute("d", toPath(shape));

        // Tendrils from the letter towards the middle: they shoot out arching over and under,
        // wriggle, and are reeled in with the letter. The shared goo filter makes them sticky.
        var reach = easeOut(progress(now, MERGE + i * 25, REACH_TIME));
        item.strands.forEach(function (strand) {
          if (reach > 0 && merging < 1) {
            var startX = item.home + (cx - item.home) * easeInOut(merging);
            var endX = startX + (cx - startX) * reach;
            var arch = strand.side * (0.9 + 0.3 * Math.sin(now / 80 + i * 1.9 + strand.side)) * h * (1 - merging);
            strand.el.setAttribute("d", "M" + startX.toFixed(1) + "," + cy + "Q" + ((startX + endX) / 2).toFixed(1) + "," + (cy + arch).toFixed(1) + " " + endX.toFixed(1) + "," + cy);
          } else {
            strand.el.removeAttribute("d");
          }
        });

        // All six boxes start stacked as the logo's grown square and fan out into the row
        var spreading = progress(openingClock, SPREAD, SPREAD_TIME);
        item.el.setAttribute("opacity", openingClock >= SPREAD ? "1" : "0");
        if (spreading < 1) {
          item.el.setAttribute("transform", "translate(" + ((cx - item.home) * (1 - easeOut(spreading))).toFixed(1) + ",0)");
        } else {
          item.el.removeAttribute("transform");
        }

        // Square boxes become square-cornered letters, then all the letters round off together
        // and stay round. The T and Z melt a little extra while turning into O's so they flow.
        // It all fades out just before the zoom, when only the smooth O is left.
        // From the merge on, the shared filter on the blob takes over.
        var rounding = easeInOut(progress(now, ROUND, ROUND_TIME)) + Math.sin(Math.PI * toO);
        if (rounding > 0.02 && now < MERGE) {
          item.blur.setAttribute("stdDeviation", (rounding * 0.05 * h).toFixed(2));
          item.el.setAttribute("filter", "url(#intro-goo-" + i + ")");
        } else {
          item.el.removeAttribute("filter");
        }
      });

      // Shared goo for the merge: a little gloopier in the middle of it, then fading out
      // just before the zoom, when only the smooth O is left
      if (now >= MERGE && now < GROW) {
        var gloop = Math.sin(Math.PI * progress(now, MERGE, SETTLE - MERGE));
        var fade = 1 - progress(now, GROW - 300, 300);
        mergeBlur.setAttribute("stdDeviation", ((0.05 + 0.03 * gloop) * h * fade).toFixed(2));
        blob.setAttribute("filter", "url(#intro-goo-all)");
      } else if (openingGoo > 0.02) {
        // The same shared goo for the opening, so the logo and boxes stick together and stretch
        mergeBlur.setAttribute("stdDeviation", (openingGoo * 0.025 * h).toFixed(2));
        blob.setAttribute("filter", "url(#intro-goo-all)");
      } else {
        blob.removeAttribute("filter");
      }

      // Jelly wobble once everything has arrived: wider-and-flatter, then taller, dying away
      // naturally (it carries on into the start of the zoom rather than being cut off)
      var settling = now - SETTLE;
      if (settling > 0 && settling < 700) {
        var jiggle = 0.08 * Math.exp(-settling / 150) * Math.sin(settling / 45);
        blob.setAttribute("transform", "translate(" + cx + "," + cy + ") scale(" + (1 + jiggle) + "," + (1 - jiggle) + ") translate(" + -cx + "," + -cy + ")");
      } else {
        blob.removeAttribute("transform");
      }

      // Growing by the same ratio each moment reads as a steady zoom, eased at both ends
      var growing = easeInOut(progress(now, GROW, GROW_TIME));
      if (growing > 0) {
        var scale = Math.pow(grow, growing);
        group.setAttribute("transform", "translate(" + cx + "," + cy + ") scale(" + scale + ") translate(" + -cx + "," + -cy + ")");
        var rx = holeRx * scale;
        var ry = holeRy * scale;
        background.setAttribute("d", "M0,0H" + W + "V" + H + "H0Z" +
          "M" + (cx - rx) + "," + cy + "a" + rx + "," + ry + " 0 1,0 " + 2 * rx + ",0a" + rx + "," + ry + " 0 1,0 " + -2 * rx + ",0Z");
      }

      if (now < GROW + GROW_TIME) {
        requestAnimationFrame(frame);
      } else {
        cover.remove();
        document.documentElement.classList.remove("intro-play");
      }
    }

    requestAnimationFrame(frame);
  }
})();
