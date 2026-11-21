// The page switch, three soft blinks: the pages stay in view and a blink is a light tint of the
// opposite of the page you're leaving washing over it (old page, old tinted, old page, new
// tinted, new page) (pt-soft-* in styles.css). Between Compare and Results only the white box
// blinks, sharper: the box turns to its negative and back (html.pt-box, pt-box-* in styles.css).
// - It's the browser's own page-switch animation (@view-transition in styles.css), restyled while
//   it runs (html.pt-switch; html.pt-flash-white for a white flash).
// - The old page decides the colour (its background at the middle of the window) and tells the
//   new page, which draws the switch.
// - The sidebar's dot still slides from the old link to the new one, over it.
// - Loaded in each page's <head> without defer, so it's ready for the new page's first frame.
// - With reduced motion, nothing changes: the browser's own animation runs as before.
// - TokenzTransition.go(url) opens a page from a script (Home's COMPARE at the end).
(function () {
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Leaving: is this page dark where you're looking? Then the flash is white, otherwise black
  var FLASH = "tokenz_flash";
  window.addEventListener("pageswap", function (event) {
    if (still || !event.viewTransition) return;
    root.classList.add("pt-switch");
    // Compare to Results or back: only the white box in the middle blinks (html.pt-box)
    var to = event.activation && event.activation.entry && event.activation.entry.url;
    var box = isBoxPage(location.href) && to && isBoxPage(to);
    if (box) root.classList.add("pt-box");
    try { sessionStorage.setItem(FLASH, box ? "box" : looksDark() ? "white" : "black"); } catch (e) {}
  });

  // Opening Compare or Results, from anywhere (each other too) or fresh, after the usual blink:
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
      if (!el || el.closest("textarea, script, style, [hidden]")) return;
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

  // The background under the middle of the window: going down through everything drawn there,
  // the first solid colour. A picture or the moving gradient (a canvas) counts as dark
  function looksDark() {
    var layers = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
      // A page's own background can say how it looks (Compare's and Results' light gradients)
      var toned = el.closest("[data-tone]");
      if (toned) return toned.dataset.tone === "dark";
      if (el.tagName === "CANVAS" || el.tagName === "IMG" || el.tagName === "VIDEO") return true;
      var bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (bg && (bg.length < 4 || Number(bg[3]) > 0.5)) {
        return 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 128;
      }
    }
    return false;
  }

  // Back to a page that was left (the Back button can bring it back as it was): undo that,
  // unless the switch back to it has already begun
  var revealing = false;
  var running = null;  // the switch while it plays

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
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && !revealing) root.classList.remove("pt-switch", "pt-box");
  });

  // Arriving: the blink, in the colour the old page chose
  window.addEventListener("pagereveal", function (event) {
    if (still || !event.viewTransition) return;
    revealing = true;
    running = event.viewTransition;
    root.classList.add("pt-switch");
    try {
      var flash = sessionStorage.getItem(FLASH);
      if (flash === "white") root.classList.add("pt-flash-white");
      if (flash === "box") root.classList.add("pt-box");
      sessionStorage.removeItem(FLASH);
    } catch (e) {}
    event.viewTransition.finished.finally(function () {
      root.classList.remove("pt-switch", "pt-flash-white", "pt-box");
      revealing = false;
      running = null;
    });
  });

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

  window.TokenzTransition = {
    go: function (url) { window.location.assign(url); }
  };
})();
