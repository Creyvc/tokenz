// The page switch, a wipe of pixel tiles (in the squares of Home's pixels): dark tiles fill the
// page from left to right, a few of them landing violet first, and the next page opens under them
// and they clear the same way, so it reads as one sweep. The sidebar stays where it is (the tiles
// only cover the page beside it) and its dot slides from the old link to the new one.
// - Leaving: a click on a link to another page (or TokenzTransition.go) covers this page, then
//   opens the next. Back and Forward open the next page at once and it clears the same way.
// - The tiles are a canvas laid over the page (.pt-tiles in styles.css); the browser's own
//   page-switch animation (@view-transition) only carries the sidebar's dot, the pages themselves
//   swap at once under the tiles (html.pt-switch).
// - Loaded in each page's <head> without defer, so it's ready for the new page's first frame.
// - With reduced motion, nothing changes: the browser's own animation runs as before.
(function () {
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TILES = "tokenz_tiles";   // set by the page that covered itself, read by the next one
  var COVER_MS = 420, CLEAR_MS = 560;
  var INK = "#0b0b0c", VIOLET = "#8B7FF2";

  // The tiles cover the page beside the sidebar (on a phone, where the sidebar is a bar across
  // the top, the whole window)
  function coverLeft() {
    var nav = document.querySelector("header.nav");
    if (!nav) return 0;
    var box = nav.getBoundingClientRect();
    return box.left <= 1 && box.height >= 0.6 * window.innerHeight ? Math.round(box.right) : 0;
  }

  // One square per tile, each with its own moment in the sweep: mostly left to right, a little
  // from the bottom up, and shuffled a little, so the edge is ragged like pixels, not a line
  function makeTiles(left) {
    var width = window.innerWidth - left, height = window.innerHeight;
    var size = Math.max(28, Math.round(Math.min(width, height) / 18));
    var cols = Math.ceil(width / size), rows = Math.ceil(height / size);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var canvas = document.createElement("canvas");
    canvas.className = "pt-tiles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.left = left + "px";
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    var tiles = [];
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        var at = 0.72 * (cols > 1 ? c / (cols - 1) : 0) + 0.28 * (rows > 1 ? 1 - r / (rows - 1) : 0);
        tiles.push({ x: c * size, y: r * size, at: 0.7 * at + 0.3 * Math.random(), violet: Math.random() < 0.25 });
      }
    }
    root.append(canvas);
    return { canvas: canvas, g: g, tiles: tiles, size: size, width: width, height: height };
  }

  // Draws the tiles at `p` (0 to 1) of covering (each comes in, violet for a moment if it's one
  // of the violet ones, then dark) or of clearing (each goes, violet for a moment before it does)
  var HOLD = 0.16, FLASH_SPAN = 0.12;
  function draw(set, p, clearing) {
    var g = set.g;
    g.clearRect(0, 0, set.width, set.height);
    set.tiles.forEach(function (tile) {
      var turn = tile.at * (1 - HOLD);
      var colour;
      if (!clearing) {
        if (p < turn) return;
        colour = tile.violet && p < turn + FLASH_SPAN ? VIOLET : INK;
      } else {
        if (p >= turn + FLASH_SPAN) return;
        colour = tile.violet && p >= turn ? VIOLET : INK;
      }
      g.fillStyle = colour;
      // (a hair over size, so no seam shows between neighbours)
      g.fillRect(tile.x, tile.y, set.size + 0.5, set.size + 0.5);
    });
  }

  function play(set, ms, clearing, done) {
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / ms);
      draw(set, p, clearing);
      if (p < 1) requestAnimationFrame(frame);
      else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  // Leaving: cover this page, then open the next
  var leaving = false;
  function go(url) {
    if (still || leaving) { window.location.assign(url); return; }
    leaving = true;
    var set = makeTiles(coverLeft());
    play(set, COVER_MS, false, function () {
      // (with where the tiles start, so the next page covers the same part before its sidebar is
      // even there to measure)
      try { sessionStorage.setItem(TILES, String(parseFloat(set.canvas.style.left))); } catch (e) {}
      window.location.assign(url);
    });
  }

  // Which clicks are a switch to another of the site's pages: a plain click (no new tab or
  // window) on a link to another page here. Listened for on the window, so anything on the page
  // that handles the click itself (the windows, Home's buttons) has had its turn first
  window.addEventListener("click", function (event) {
    if (still || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    if (!/\.html$|\/$/.test(url.pathname)) return;
    event.preventDefault();
    go(url.href);
  });

  // Back to a page that was left (the Back button can bring it back as it was, still covered):
  // take the tiles away
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    leaving = false;
    Array.prototype.forEach.call(document.querySelectorAll(".pt-tiles"), function (el) { el.remove(); });
    root.classList.remove("pt-switch");
  });

  // Arriving: start covered and clear, when the last page covered itself, or for Back and
  // Forward (the browser's own page switch)
  function clearIn(transition) {
    var left = null;
    try { left = sessionStorage.getItem(TILES); sessionStorage.removeItem(TILES); } catch (e) {}
    if (still || left === null && !transition) return;
    var set = makeTiles(left === null ? coverLeft() : Number(left));
    draw(set, 0, true);
    play(set, CLEAR_MS, true, function () { set.canvas.remove(); });
  }

  // Opening Compare or Results, from anywhere (each other too) or fresh, as the tiles clear:
  // an empty white box the size of the real one(s) grows from its top-right corner, then each
  // part inside rises into place in turn (html.wb-arrive and .wb-skin, styles.css). Decided
  // before the first frame; the stand-in is made once the page's own script has filled it, and
  // when it's all done, the real boxes take over again
  if (!still && isBoxPage(location.href)) {
    root.classList.add("wb-arrive");
    document.addEventListener("DOMContentLoaded", arrive);
  }

  function isShape(el) {
    var style = getComputedStyle(el);
    var fill = style.backgroundColor.match(/[\d.]+/g);
    var filled = fill && (fill.length < 4 || Number(fill[3]) > 0);
    var lined = ["Top", "Right", "Bottom", "Left"].some(function (side) {
      return parseFloat(style["border" + side + "Width"]) > 0 && style["border" + side + "Style"] !== "none";
    });
    return filled || lined;
  }

  function arrive() {
    var main = document.querySelector(".content.workbench, .content.results-page");
    var boxes = main ? main.querySelectorAll(":scope > :is(.engine-notice, .wb, .wb-result, [data-results]):not([hidden])") : [];
    if (!boxes.length) { root.classList.remove("wb-arrive"); return; }
    var area = main.getBoundingClientRect();
    var top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    boxes.forEach(function (box) {
      var r = box.getBoundingClientRect();
      top = Math.min(top, r.top); left = Math.min(left, r.left);
      right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
    });
    var skin = document.createElement("div");
    skin.className = "wb-skin";
    skin.setAttribute("aria-hidden", "true");
    skin.style.top = (top - area.top) + "px";
    skin.style.left = (left - area.left) + "px";
    skin.style.width = (right - left) + "px";
    skin.style.height = (bottom - top) + "px";
    main.prepend(skin);
    var parts = [], texts = [];
    boxes.forEach(function (box) {
      Array.prototype.forEach.call(box.children, function (part) {
        if (part.hidden) return;
        part.style.setProperty("--rise", parts.length);
        parts.push(part);
        texts = texts.concat(textsIn(part));
      });
    });
    texts.forEach(function (text) { text.classList.add("wb-text-rise"); });
    setTimeout(function () {
      root.classList.remove("wb-arrive");
      skin.remove();
      parts.forEach(function (part) { part.style.removeProperty("--rise"); });
      texts.forEach(function (text) {
        text.classList.remove("wb-text-rise");
        if (!text.className) text.removeAttribute("class");
      });
    }, 1300 + parts.length * 75 + 800);
  }

  // The pieces of text in a part, each whole (a label, a title, a sentence with its link), not
  // word by word: for every bit of words, the nearest box around it that isn't a plain run of
  // inline text (the page's own boxes, which can move), the outermost where they nest. Words in a
  // button (a button, a link, a tab or tile to pick, or any box with a fill or an outline of its
  // own) don't rise by themselves: the button slides up with its part, and its words and icons
  // with it, all at once, the same way
  function textsIn(part) {
    var found = [], nodes = [];
    var walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    for (var node = walk.nextNode(); node; node = walk.nextNode()) nodes.push(node);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var el = node.parentElement;
      // (text drawn for show only, hidden from screen readers, like the rolling digits of Results'
      // numbers, rises with the box around it, not piece by piece)
      if (!el || el.closest("textarea, script, style, [hidden], [aria-hidden='true']")) return;
      while (el !== part && /^(inline|contents)$/.test(getComputedStyle(el).display)) el = el.parentElement;
      var button = el.closest("button, a, [role=tab], label:has(input[type=radio], input[type=checkbox])");
      if (button && button !== part && part.contains(button)) return;
      if (el !== part && isShape(el)) return;
      if (el === part || !el.getClientRects().length || found.indexOf(el) >= 0) return;
      found.push(el);
    });
    // A box to type in with no shape of its own (Compare's protected phrases, whose box is
    // around its title too): its grey hint rises with the title instead of being there already
    Array.prototype.forEach.call(part.querySelectorAll("textarea[placeholder], input[placeholder]"), function (field) {
      if (!field.value && !isShape(field) && field.getClientRects().length) found.push(field);
    });
    return found.filter(function (el) {
      return !found.some(function (other) { return other !== el && other.contains(el); });
    });
  }

  function isBoxPage(url) {
    return /\/(compare|results)\.html$/.test(new URL(url, location.href).pathname);
  }

  var running = null;  // the browser's page switch while it plays

  // While a switch plays, the browser draws it on a layer over the whole page, which takes every
  // click, so a link clicked then would do nothing. Instead: find what's under the pointer, end
  // the switch at once, and then click it (a link goes on to its page, with its own switch)
  var CONTROLS = "a[href], button, summary, label, input, select, textarea, [role='radio'], [role='tab']";
  document.addEventListener("click", function (event) {
    if (!running || event.target !== root) return;
    var x = event.clientX, y = event.clientY;
    var hit = null;
    Array.prototype.some.call(document.querySelectorAll(CONTROLS), function (el) {
      if (el.closest("[inert], [aria-hidden='true']")) return false;
      var style = getComputedStyle(el);
      if (style.pointerEvents === "none" || style.visibility === "hidden") return false;
      var box = el.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom && box.width && box.height) hit = el;
      return !!hit;
    });
    if (!hit) return;
    event.preventDefault();
    var transition = running;
    transition.skipTransition();
    transition.finished.finally(function () {
      if (hit.matches("input, select, textarea")) hit.focus();
      else hit.click();
    });
  }, true);
  // (pagereveal: Chrome, Edge, Safari. Elsewhere the page clears once it's read)
  if ("onpagereveal" in window) {
    window.addEventListener("pagereveal", function (event) {
      if (event.viewTransition && !still) {
        running = event.viewTransition;
        root.classList.add("pt-switch");
        event.viewTransition.finished.finally(function () {
          root.classList.remove("pt-switch");
          running = null;
        });
      }
      clearIn(event.viewTransition);
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () { clearIn(null); });
  }

  // On every page, any button pressed flashes, like the box when switching between Compare and
  // Results: it turns to its negative and back, twice (.wb-flash in styles.css). Button-looking
  // links (Results' "Go to Compare"), Compare's method tabs and Strength tiles count too; the
  // flash goes on the part you see. Not with reduced motion (styles.css)
  var PRESSABLE = "button, [role='button'], a.wb-primary, a.wb-secondary, .wb-segmented label, .wb-steps label";
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    // (clicking a label also clicks its radio button: one flash is enough)
    if (target.matches("input")) return;
    var pressed = target.closest(PRESSABLE);
    if (!pressed || pressed.disabled) return;
    var face = pressed.matches("label") ? pressed.querySelector(":scope > span") || pressed : pressed;
    face.classList.remove("wb-flash");
    void face.offsetWidth;  // starts it again on a quick second press
    face.classList.add("wb-flash");
  });
  // (also when it's cut short, as when switching method hides the Strength tiles mid-flash)
  ["animationend", "animationcancel"].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (/^wb-flash/.test(event.animationName)) event.target.classList.remove("wb-flash");
    });
  });

  window.TokenzTransition = { go: go };
})();
