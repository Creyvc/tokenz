// The page switch, a curtain: a near-black panel rises from the bottom of the window over the
// page you're leaving (which drifts up a touch and dims), the new page's name slides up in big
// white letters in its middle, then the panel lifts off the top and the new page's content rises
// into place under it. One ease throughout (pt-* in styles.css).
// - The rise is the browser's own page-switch animation (@view-transition in styles.css),
//   restyled while it runs (html.pt-switch): the new page, with the panel (.pt-curtain) on top,
//   is uncovered from the bottom up over the old one. The panel then lifts off on the live page.
// - The sidebar's dot doesn't slide here (it would be behind the panel): it's simply on the new
//   link when the page shows.
// - Loaded in each page's <head> without defer, so it's ready for the new page's first frame.
// - With reduced motion, nothing changes: the browser's own animation runs as before.
// - TokenzTransition.go(url) opens a page from a script (Home's COMPARE at the end).
(function () {
  var root = document.documentElement;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Leaving: the old page's picture drifts up and dims under the rising panel
  window.addEventListener("pageswap", function (event) {
    if (still || !event.viewTransition) return;
    root.classList.add("pt-switch");
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

  // Arriving: the panel, with this page's name, over the new page while it's uncovered; then it
  // lifts off and the page's content rises in (not on Home, whose text has its own entrance)
  var CURTAIN_MS = 1250;
  window.addEventListener("pagereveal", function (event) {
    if (still || !event.viewTransition) return;
    revealing = true;
    running = event.viewTransition;
    root.classList.add("pt-switch", "pt-arrive");
    Array.prototype.forEach.call(document.querySelectorAll(".pt-curtain"), function (old) { old.remove(); });
    var curtain = document.createElement("div");
    curtain.className = "pt-curtain";
    curtain.setAttribute("aria-hidden", "true");
    var mask = document.createElement("span");
    mask.className = "pt-curtain-mask";
    var name = document.createElement("span");
    name.className = "pt-curtain-name";
    name.textContent = pageName();
    mask.append(name);
    curtain.append(mask);
    root.append(curtain);
    event.viewTransition.finished.finally(function () {
      root.classList.remove("pt-switch");
      revealing = false;
      running = null;
    });
    setTimeout(function () {
      curtain.remove();
      root.classList.remove("pt-arrive");
    }, CURTAIN_MS);
  });

  // "Compare · Tokenz" → "Compare"; Home's title is just "Tokenz"
  function pageName() {
    var title = document.title.split(" · ")[0].trim();
    return title && title !== "Tokenz" ? title : "Home";
  }

  window.TokenzTransition = {
    go: function (url) { window.location.assign(url); }
  };
})();
