// The page switch, after zajno.com: the new page is laid on top of the old one. It starts as a
// thin line near the bottom of the window, which thickens into a black bar and grows up and out
// into a box until it fills the window, on top of the old page, which stays still underneath. The
// black is a cover over the new page's top: as the box grows, its bottom edge rises and the new
// page shows under it, and once the box fills the window the cover slides up off the top while the
// page's text rises in behind masks, a line at a time from the top (not on Home, whose text has
// its own entrance).
// - It's the browser's own page-switch animation (@view-transition in styles.css), restyled while
//   this runs (html.pt-switch): the old page is held as a still picture, the new one is live.
// - The sidebar's dot and thin line usually animate on their own between pages; here they stay part
//   of each page, so they don't float over the box.
// - Loaded in each page's <head> without defer, so it's ready for the new page's first frame.
// - With reduced motion, nothing changes: the browser's own animation runs as before.
// - TokenzTransition.go(url) opens a page from a script (Home's COMPARE at the end).
(function () {
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Leaving: the dot and the line go into the old page's picture. Leaving a dark page (the end
  // of Home), the next page is told, so its cover is light: a black line on black wouldn't show
  var DARK = "tokenz_page_dark";
  window.addEventListener("pageswap", function (event) {
    if (still || !event.viewTransition) return;
    root.classList.add("pt-switch");
    try { sessionStorage.setItem(DARK, root.classList.contains("home-dark") ? "1" : ""); } catch (e) {}
  });

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
    if (event.persisted && !revealing) root.classList.remove("pt-switch");
  });

  // Arriving: the black cover, for as long as the switch runs, and the text rising in
  window.addEventListener("pagereveal", function (event) {
    if (still || !event.viewTransition) return;
    revealing = true;
    running = event.viewTransition;
    root.classList.add("pt-switch");
    // (one cover only: two of them would make the browser refuse the whole switch)
    Array.prototype.forEach.call(document.querySelectorAll(".pt-cover"), function (old) { old.remove(); });
    var cover = document.createElement("div");
    cover.className = "pt-cover";
    try {
      if (sessionStorage.getItem(DARK) === "1") cover.classList.add("is-light");
      sessionStorage.removeItem(DARK);
    } catch (e) {}
    cover.setAttribute("aria-hidden", "true");
    root.append(cover);
    var undo = riseText();
    // If the browser refuses the switch for any reason, the text goes back to plain at once
    event.viewTransition.ready.catch(function () { undo(); });
    event.viewTransition.finished.finally(function () {
      cover.remove();
      root.classList.remove("pt-switch");
      revealing = false;
      running = null;
    });
    setTimeout(undo, TEXT_DONE);
  });

  var TEXT_START = 1200;  // ms into the switch: as the cover starts to leave
  var TEXT_SPREAD = 350;  // ms from the top of the window to its bottom
  var TEXT_DONE = TEXT_START + TEXT_SPREAD + 900;
  // Only ordinary text rises: headings, paragraphs, list items, table cells. Nothing inside a
  // control (tabs, labels, links, buttons, sliders) is ever touched, so their layouts and scripts
  // stay as they are, even when the Back button brings a page back already built
  var TEXT = "h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, blockquote, th, td, caption";
  var SKIP = "button, input, textarea, select, option, label, a, svg, script, style, pre, code, " +
    "[role], [contenteditable], .wake-slider";

  // The pieces of text to rise: the outermost blocks in the page's main area with text of their
  // own, in sight. Plain text is split into its lines as the browser wrapped them; text with links
  // or other tags inside rises as one, so nothing a page's script holds on to is rebuilt. Returns
  // a function that puts it all back as it was
  function riseText() {
    var main = document.querySelector("main.content");
    if (!main || main.classList.contains("home")) return function () {};
    var undos = [];
    var height = window.innerHeight;
    function delay(top) {
      return TEXT_START + Math.round(Math.min(1, Math.max(0, top / height)) * TEXT_SPREAD) + "ms";
    }
    function ownText(el) {
      return Array.prototype.some.call(el.childNodes, function (node) {
        return node.nodeType === 3 && node.textContent.trim();
      });
    }
    function visit(el) {
      if (el.matches(SKIP)) return;
      var style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      if (el.matches(TEXT) && ownText(el) && style.display !== "inline" && !/pre/.test(style.whiteSpace)) {
        var box = el.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= height) return;
        var plain = Array.prototype.every.call(el.childNodes, function (node) { return node.nodeType === 3; });
        // (a row or grid of its own would be laid out differently inside a wrapper: look inside)
        var arranged = /flex|grid/.test(style.display);
        if (plain || !arranged) {
          undos.push(plain ? riseLines(el) : riseWhole(el, box.top));
          return;
        }
      }
      Array.prototype.forEach.call(el.children, visit);
    }
    Array.prototype.forEach.call(main.children, visit);
    return function () { undos.forEach(function (undo) { undo(); }); };

    function riseLines(el) {
      var text = el.textContent;
      var words = text.trim().split(/\s+/);
      el.textContent = "";
      var spans = words.map(function (word, i) {
        var span = document.createElement("span");
        span.textContent = word;
        el.append(span, i < words.length - 1 ? " " : "");
        return span;
      });
      var lines = [], top = null;
      spans.forEach(function (span) {
        if (top === null || Math.abs(span.offsetTop - top) > 2) { lines.push([]); top = span.offsetTop; }
        lines[lines.length - 1].push(span.textContent);
      });
      var first = el.getBoundingClientRect().top;
      var lineHeight = lines.length ? el.getBoundingClientRect().height / lines.length : 0;
      el.textContent = "";
      var masks = lines.map(function (line, i) {
        var mask = document.createElement("span");
        mask.className = "pt-line";
        var rise = document.createElement("span");
        rise.className = "pt-rise";
        rise.textContent = line.join(" ");
        rise.style.animationDelay = delay(first + i * lineHeight);
        mask.append(rise);
        el.append(mask);
        return mask;
      });
      return function () {
        // Only if nothing else has changed it meanwhile
        if (el.firstChild === masks[0]) el.textContent = text;
      };
    }

    function riseWhole(el, top) {
      var rise = document.createElement("span");
      rise.className = "pt-rise is-whole";
      rise.style.animationDelay = delay(top);
      while (el.firstChild) rise.append(el.firstChild);
      el.append(rise);
      el.classList.add("pt-mask");
      return function () {
        if (rise.parentNode !== el) return;
        while (rise.firstChild) el.insertBefore(rise.firstChild, rise);
        rise.remove();
        el.classList.remove("pt-mask");
      };
    }
  }

  window.TokenzTransition = {
    go: function (url) { window.location.assign(url); }
  };
})();
