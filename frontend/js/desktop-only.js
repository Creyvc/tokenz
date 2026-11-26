// Tokenz is made for desktop computers. A page can't stop being opened on a phone, so there the site
// is covered by a notice (.desk-notice in styles.css). A desktop window of any size shows the site:
// it keeps its desktop layout, whose sizes follow the window (the phone layouts are for touch
// screens only, styles.css), so a smaller window just shows a smaller site, never a notice.
// - Not a computer (a phone or tablet: a touch screen with no mouse, or a screen under MIN_SCREEN
//   wide): "Desktop only", in the academic notice's terminal-style window on its white cover
//   (intro-warning-* in styles.css), blinking in word by word the same way, without its tick box
//   and Continue (there's nothing to continue to).
// - While it shows, the page under it can't be scrolled, clicked or reached with the keyboard.
// Loaded in every page's <head>; the notice is built once the page is read.
(function () {
  // px: narrower screens aren't computers' (phones, small tablets). Not higher: a Windows laptop
  // with its screen scaled up (150% is common) reports a "screen" of only about 900-1000px
  var MIN_SCREEN = 900;
  var root = document.documentElement;
  var notice = null, title = null, text = null, plain = null, device = null, state = "";
  var MARK = '<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><path d="M6 14 H15 L25 32 L15 50 H6 L16 32 Z"/>' +
    '<path d="M58 14 H49 L39 32 L49 50 H58 L48 32 Z"/><path d="M32 27.5 L36.5 32 L32 36.5 L27.5 32 Z"/></svg>';

  function touchOnly() {
    return window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  function check() {
    var screenWide = Math.max(screen.width, screen.availWidth || 0);
    return touchOnly() || screenWide < MIN_SCREEN ? "device" : "";
  }

  // The device notice: the academic notice's window, its words blinking on one after another
  function buildDevice() {
    var wrap = document.createElement("div");
    wrap.className = "intro-warning desk-device";
    wrap.innerHTML =
      '<div class="intro-warning-card">' +
        '<div class="intro-warning-bar"><span class="intro-warning-brand">' + MARK + 'Tokenz</span></div>' +
        '<div class="intro-warning-body">' +
          '<div class="intro-warning-head">' +
            '<h1 id="desk-device-title">Desktop only</h1>' +
            '<span class="intro-warning-badge">Research preview</span>' +
          '</div>' +
          '<div class="intro-warning-box">' +
            '<h2 class="intro-warning-subtitle">Device not supported</h2>' +
            '<p class="intro-warning-text">Tokenz is made for desktop computers and is not available on phones or tablets. ' +
              'Open it on a computer, in a full-size browser window.</p>' +
          '</div>' +
          '<p class="desk-device-status">Screen: <span data-screen></span></p>' +
        '</div>' +
      '</div>';
    wrap.querySelector("[data-screen]").textContent =
      Math.round(screen.width) + " \u00d7 " + Math.round(screen.height) + " px. Needs a desktop.";
    return wrap;
  }

  function blinkIn(wrap) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var card = wrap.querySelector(".intro-warning-card");
    card.classList.add("intro-blink");
    var order = [], walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var extras = [].slice.call(card.querySelectorAll(".intro-warning-brand svg, .intro-warning-box"));
    nodes.forEach(function (node) {
      extras = extras.filter(function (el) {
        if (el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) { order.push(el); return false; }
        return true;
      });
      if (!node.nodeValue.trim()) return;
      var fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (!part.trim()) { fragment.append(part); return; }
        var word = document.createElement("span");
        word.textContent = part;
        fragment.append(word);
        order.push(word);
      });
      node.replaceWith(fragment);
    });
    order.forEach(function (el, i) {
      el.classList.add("intro-blink");
      el.style.animationDelay = (150 + i * 10) + "ms";
    });
  }

  function build() {
    notice = document.createElement("div");
    notice.className = "desk-notice";
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-modal", "true");
    notice.setAttribute("aria-labelledby", "desk-notice-title");
    plain = document.createElement("div");
    plain.className = "desk-plain";
    var mark = document.createElement("img");
    mark.className = "desk-notice-mark";
    mark.src = "assets/images/logo-mark-white.svg";
    mark.alt = "Tokenz";
    var label = document.createElement("p");
    label.className = "desk-notice-label";
    label.textContent = "Desktop only";
    title = document.createElement("h1");
    title.className = "desk-notice-title";
    title.id = "desk-notice-title";
    text = document.createElement("p");
    text.className = "desk-notice-text";
    text.setAttribute("aria-live", "polite");
    plain.append(mark, label, title, text);
    notice.append(plain);
    document.body.append(notice);
  }

  function apply() {
    var next = check();
    if (next === state) return;
    state = next;
    if (!notice) build();
    notice.classList.toggle("is-device", state === "device");
    if (state === "device") {
      if (!device) {
        device = buildDevice();
        notice.append(device);
        blinkIn(device);
      }
      notice.setAttribute("aria-labelledby", "desk-device-title");
    }
    root.classList.toggle("desk-blocked", !!state);
    // (everything else on the page is out of reach while the notice shows)
    // (only what this made inert is let go again: anything inert for its own reasons stays so)
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === notice) return;
      if (state && !el.inert) { el.inert = true; el.dataset.deskInert = "1"; }
      else if (!state && el.dataset.deskInert) { el.inert = false; delete el.dataset.deskInert; }
    });
    if (state) {
      notice.setAttribute("tabindex", "-1");
      notice.focus();
    }
  }

  function start() {
    apply();
    window.addEventListener("resize", apply);
    // (moving the window to another screen changes the screen it's measured against)
    if (window.matchMedia) {
      var touch = window.matchMedia("(hover: none) and (pointer: coarse)");
      if (touch.addEventListener) touch.addEventListener("change", apply);
    }
    setInterval(apply, 1500);
  }

  // Decided before the first paint, so a phone never glimpses the page (the notice's words follow
  // once the page is read)
  if (check()) root.classList.add("desk-blocked");
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
