// The page switch, three soft blinks: the pages stay in view and a blink is a light tint of the
// opposite of the page you're leaving washing over it (old page, old tinted, old page, new
// tinted, new page) (pt-soft-* in styles.css).
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
    try { sessionStorage.setItem(FLASH, looksDark() ? "white" : "black"); } catch (e) {}
  });

  // The background under the middle of the window: going down through everything drawn there,
  // the first solid colour. A picture or the moving gradient (a canvas) counts as dark
  function looksDark() {
    var layers = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
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
    if (event.persisted && !revealing) root.classList.remove("pt-switch");
  });

  // Arriving: the blink, in the colour the old page chose
  window.addEventListener("pagereveal", function (event) {
    if (still || !event.viewTransition) return;
    revealing = true;
    running = event.viewTransition;
    root.classList.add("pt-switch");
    try {
      if (sessionStorage.getItem(FLASH) === "white") root.classList.add("pt-flash-white");
      sessionStorage.removeItem(FLASH);
    } catch (e) {}
    event.viewTransition.finished.finally(function () {
      root.classList.remove("pt-switch", "pt-flash-white");
      revealing = false;
      running = null;
    });
  });

  window.TokenzTransition = {
    go: function (url) { window.location.assign(url); }
  };
})();
