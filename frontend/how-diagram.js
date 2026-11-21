// How it works: an exploded diagram of what happens to a prompt (after architectural exploded
// axonometrics the owner liked): six isometric slabs in thin white line, one under another,
// joined by dashed guides, each with a numbered callout on a leader line, the site's violet the
// only colour. Top to bottom: the prompt, cut into tokens, the tokens' numbers, the three methods
// (in a violet orbit), the fewer tokens left, and the vectors a model makes of them.
// - Scrolling it into view, the slabs come apart from a tight stack into their places, and the
//   callouts draw in one after another; a violet dot keeps travelling down the middle line.
// - With reduced motion it's drawn in its places, still.
// The same six steps are in the page as a list (.hw-layers): read out instead of the drawing, and
// shown under it on a phone, where the callouts would be too small.
(function () {
  var stage = document.querySelector(".hw-diagram");
  if (!stage) return;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";
  var W = 1200, H = 1720, CX = 600;
  var VIOLET = "#8B7FF2", LINE = "rgba(255,255,255,0.82)", DIM = "rgba(255,255,255,0.34)";
  var C = 0.866, S = 0.5;   // the isometric axes

  // Where each slab sits once apart, and its half-size and thickness
  var LAYERS = [
    { y: 220, a: 130, t: 14, num: "01", name: "Your prompt", side: -1,
      text: ["The prompt you'd send to an AI,", "pasted on Compare."] },
    { y: 475, a: 130, t: 14, num: "02", name: "Tokenizer", side: 1,
      text: ["Cut into tokens, the pieces a model", "reads, and counted (o200k_base)."] },
    { y: 730, a: 130, t: 14, num: "03", name: "Token IDs", side: -1,
      text: ["Each token is a number in the", "model's vocabulary."] },
    { y: 1005, a: 160, t: 24, num: "04", name: "Three methods", side: 1, lift: 120,
      text: ["NLP trims filler, TF-IDF drops off-topic", "sentences; AI rewrite asks Groq and", "Google for a shorter version."] },
    { y: 1285, a: 130, t: 14, num: "05", name: "Fewer tokens", side: -1,
      text: ["Checked: numbers, limits and “not”s", "must survive, or the original is kept."] },
    { y: 1530, a: 130, t: 14, num: "06", name: "Embeddings", side: 1,
      text: ["The model turns each token into a", "vector: fewer to make, less to pay."] }
  ];

  function el(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }
  // a point on a slab's top face (local x, y from -a to a), raised by z
  function P(x, y, z) { return [(x - y) * C, (x + y) * S - (z || 0)]; }
  function pts(list) { return list.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
  function rect(g, x0, y0, x1, y1, attrs) {
    return el("polygon", Object.assign({ points: pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]) }, attrs), g);
  }
  function line(g, a, b, attrs) {
    return el("line", Object.assign({ x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) }, attrs), g);
  }

  // A slab: its top face, and the two sides that show, in thin line over the black
  function slab(g, a, t) {
    var top = [P(-a, -a), P(a, -a), P(a, a), P(-a, a)];
    var down = function (p) { return [p[0], p[1] + t]; };
    el("polygon", { points: pts([top[3], top[2], down(top[2]), down(top[3])]), fill: "#0d0d10", stroke: LINE, "stroke-width": 1 }, g);
    el("polygon", { points: pts([top[2], top[1], down(top[1]), down(top[2])]), fill: "#121216", stroke: LINE, "stroke-width": 1 }, g);
    el("polygon", { points: pts(top), fill: "#0b0b0e", stroke: LINE, "stroke-width": 1.2 }, g);
  }

  // A deterministic shuffle, so the drawing is the same every time
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  // Rows of token tiles; with `cut`, the filler ones (violet on the tokenizer) are gone
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

  function details(g, i, a) {
    if (i === 0) {
      // lines of text and a caret
      [180, 150, 200, 105, 175, 130].forEach(function (len, k) {
        var y = -86 + k * 33;
        line(g, P(-100, y), P(-100 + len, y), { stroke: k === 0 ? LINE : DIM, "stroke-width": 1.4, "stroke-linecap": "round" });
      });
      rect(g, 34, 74, 41, 88, { fill: VIOLET, stroke: "none" });
    } else if (i === 1 || i === 4) {
      TILES.forEach(function (tile) {
        if (i === 4 && tile.filler) {
          rect(g, tile.x, tile.y, tile.x + tile.w, tile.y + 21, { fill: "none", stroke: "rgba(255,255,255,0.12)", "stroke-dasharray": "2 3" });
          return;
        }
        rect(g, tile.x, tile.y, tile.x + tile.w, tile.y + 21, i === 1 && tile.filler ?
          { fill: "rgba(139,127,242,0.28)", stroke: VIOLET, "stroke-width": 1 } :
          { fill: "none", stroke: LINE, "stroke-width": 0.9 });
      });
    } else if (i === 2) {
      // the numbers, written on the face
      var ids = ["15900 259 79007 11", "2684 2616 13 17951", "89 180721 290 5018", "6391 842 328 261", "15226 2254 481 4952", "480 316 448 20837"];
      var face = el("g", { transform: "matrix(" + C + " " + S + " " + -C + " " + S + " 0 0)" }, g);
      ids.forEach(function (row, k) {
        var text = el("text", { x: -104, y: -74 + k * 34, fill: k % 2 ? DIM : LINE, "font-size": 15, "letter-spacing": 1.3 }, face);
        text.textContent = row;
      });
    } else if (i === 3) {
      // the three methods: a module each, with its name on a pill over it
      [["NLP", -85], ["TF-IDF", 0], ["AI REWRITE", 85]].forEach(function (m, k) {
        var x = m[1], y = -m[1] * 0.35, b = 30, h = 30;
        var top = [P(x - b, y - b, h), P(x + b, y - b, h), P(x + b, y + b, h), P(x - b, y + b, h)];
        var base = [P(x - b, y + b), P(x + b, y + b), P(x + b, y - b)];
        el("polygon", { points: pts([top[3], top[2], base[1], base[0]]), fill: "#0e0e12", stroke: LINE, "stroke-width": 1 }, g);
        el("polygon", { points: pts([top[2], top[1], base[2], base[1]]), fill: "#141419", stroke: LINE, "stroke-width": 1 }, g);
        el("polygon", { points: pts(top), fill: k === 2 ? "rgba(139,127,242,0.22)" : "#0b0b0e", stroke: k === 2 ? VIOLET : LINE, "stroke-width": 1.1 }, g);
        var mid = P(x, y, h);
        var pill = el("g", { transform: "translate(" + mid[0].toFixed(1) + "," + (mid[1] - 46).toFixed(1) + ")" }, g);
        var wide = m[0].length * 8.4 + 22;
        el("rect", { x: -wide / 2, y: -12, width: wide, height: 24, rx: 12, fill: "#0b0b0e", stroke: LINE, "stroke-width": 1 }, pill);
        var label = el("text", { x: 0, y: 4.5, fill: "#ffffff", "font-size": 11, "letter-spacing": 1.6, "text-anchor": "middle" }, pill);
        label.textContent = m[0];
        line(g, [mid[0], mid[1] - 34], [mid[0], mid[1] - 4], { stroke: DIM, "stroke-width": 1 });
      });
    } else if (i === 5) {
      // a vector for each token: a row of bars standing up off the face
      for (var gx = 0; gx < 6; gx++) for (var gy = 0; gy < 4; gy++) {
        var x0 = -95 + gx * 38, y0 = -78 + gy * 52, hgt = 12 + Math.round(rnd() * 40);
        line(g, P(x0, y0), P(x0, y0, hgt), { stroke: (gx + gy) % 5 === 0 ? VIOLET : LINE, "stroke-width": 1.4, "stroke-linecap": "round" });
        el("circle", { cx: P(x0, y0, hgt)[0].toFixed(1), cy: P(x0, y0, hgt)[1].toFixed(1), r: 2.2, fill: (gx + gy) % 5 === 0 ? VIOLET : "#ffffff" }, g);
      }
    }
  }

  var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "hw-diagram-svg", "aria-hidden": "true", focusable: "false" });
  var guides = el("g", { class: "hw-guides" }, svg);
  var orbitBack = el("g", {}, svg);
  // (made bottom first, so each slab covers the one under it, as seen from above)
  var layerGroups = [];
  var slabs = el("g", {}, svg);
  for (var n = LAYERS.length - 1; n >= 0; n--) {
    var g = el("g", { class: "hw-layer" }, slabs);
    slab(g, LAYERS[n].a, LAYERS[n].t);
    details(g, n, LAYERS[n].a);
    layerGroups[n] = g;
  }
  var orbitFront = el("g", {}, svg);
  var dot = el("circle", { r: 4.5, fill: VIOLET, class: "hw-flow" });
  var callouts = LAYERS.map(function (layer) {
    var g = el("g", { class: "hw-callout" }, svg);
    var lead = el("path", { fill: "none", stroke: DIM, "stroke-width": 1, pathLength: 1, class: "hw-lead" }, g);
    var pin = el("circle", { r: 3.5, fill: "#0b0b0e", stroke: "#ffffff", "stroke-width": 1.3 }, g);
    var right = layer.side > 0, x = right ? 905 : 295;
    var anchor = right ? "start" : "end";
    var head = el("text", { x: x, y: 0, fill: "#ffffff", "font-size": 13, "letter-spacing": 2.2, "text-anchor": anchor, "font-weight": 600 }, g);
    var num = el("tspan", { fill: VIOLET }, head);
    num.textContent = layer.num + "  ";
    var nm = el("tspan", {}, head);
    nm.textContent = layer.name.toUpperCase();
    layer.text.forEach(function (lineText, k) {
      var t = el("text", { x: x, y: 26 + k * 21, fill: "rgba(255,255,255,0.56)", "font-size": 15, "text-anchor": anchor }, g);
      t.textContent = lineText;
    });
    return { g: g, lead: lead, pin: pin };
  });
  stage.appendChild(svg);

  // The violet orbit round the methods: an ellipse behind the slab and its front half over it
  function orbit(cy) {
    orbitBack.innerHTML = orbitFront.innerHTML = "";
    var attrs = { cx: CX, cy: cy + 6, fill: "none" };
    el("ellipse", Object.assign({ rx: 370, ry: 104, stroke: VIOLET, "stroke-width": 1.1, opacity: 0.8 }, attrs), orbitBack);
    el("ellipse", Object.assign({ rx: 300, ry: 78, stroke: VIOLET, "stroke-width": 1, "stroke-dasharray": "5 7", opacity: 0.7, class: "hw-orbit-dash" }, attrs), orbitBack);
    // (the near half, in front of the slab)
    el("path", { d: "M " + (CX - 370) + " " + (cy + 6) + " A 370 104 0 0 0 " + (CX + 370) + " " + (cy + 6), stroke: VIOLET, "stroke-width": 1.1, fill: "none", opacity: 0.8 }, orbitFront);
  }

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  var MID = (LAYERS[0].y + LAYERS[LAYERS.length - 1].y) / 2;
  var current = [];
  function place(p) {
    // apart by p: from a tight stack around the middle to their places
    current = LAYERS.map(function (layer, i) {
      var stacked = MID + (i - (LAYERS.length - 1) / 2) * 58;
      return stacked + (layer.y - stacked) * ease(p);
    });
    layerGroups.forEach(function (g, i) { g.setAttribute("transform", "translate(" + CX + "," + current[i].toFixed(1) + ")"); });
    orbit(current[3]);
    // the guides: dashed uprights at the slabs' side corners, and the middle line they hang on
    guides.innerHTML = "";
    var top = current[0], bottom = current[current.length - 1] + 130;
    [-225, 225].forEach(function (dx) {
      el("line", { x1: CX + dx, y1: top, x2: CX + dx, y2: current[current.length - 1], stroke: "rgba(255,255,255,0.28)", "stroke-dasharray": "4 6" }, guides);
    });
    el("line", { x1: CX, y1: top + 130, x2: CX, y2: bottom, stroke: "rgba(255,255,255,0.22)" }, guides);
    guides.appendChild(dot);  // (the dot travels the middle line, behind the slabs)
    // the callouts: a leader from the slab's outer corner out to its words, drawn in turn
    callouts.forEach(function (c, i) {
      var layer = LAYERS[i], y = current[i];
      var cornerX = CX + layer.side * (layer.a * 2 * C - 40), cornerY = y + 10;
      var endX = layer.side > 0 ? 890 : 310;
      var labelY = y - 30 - (layer.lift || 0);
      c.lead.setAttribute("d", "M " + cornerX.toFixed(1) + " " + cornerY.toFixed(1) + " L " + (endX - layer.side * 40) + " " + labelY.toFixed(1) + " L " + endX + " " + labelY.toFixed(1));
      c.pin.setAttribute("cx", cornerX.toFixed(1));
      c.pin.setAttribute("cy", cornerY.toFixed(1));
      c.g.querySelectorAll("text").forEach(function (t, k) {
        t.setAttribute("y", (labelY + 4 + (k ? 24 + (k - 1) * 21 : 0)).toFixed(1));
      });
      var show = still ? 1 : clamp((p - 0.45 - i * 0.07) / 0.25);
      c.g.style.opacity = show.toFixed(3);
      c.lead.style.strokeDasharray = "1 1";
      c.lead.style.strokeDashoffset = (1 - show).toFixed(3);
    });
  }

  var shown = -1, target = 0, at = still ? 1 : 0, last = 0;
  function progress() {
    var r = stage.getBoundingClientRect(), vh = window.innerHeight;
    return clamp((vh - r.top) / (vh * 1.1));
  }
  function frame(now) {
    target = still ? 1 : progress();
    at += (target - at) * Math.min(1, (now - (last || now)) / 160);
    last = now;
    if (Math.abs(at - shown) > 0.0005) { place(at); shown = at; }
    // the dot: down the middle line, again and again
    var top = current[0] + 130, bottom = current[current.length - 1];
    var k = still ? 0.5 : (now / 5200) % 1;
    dot.setAttribute("cx", CX);
    dot.setAttribute("cy", (top + (bottom - top) * k).toFixed(1));
    if (!still) requestAnimationFrame(frame);
  }
  place(at);
  requestAnimationFrame(frame);
})();
