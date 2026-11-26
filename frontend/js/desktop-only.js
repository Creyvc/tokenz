// Tokenz is shown only in a full-size desktop window. A page can't stop a window being resized or
// opened on a phone, so otherwise the site is covered by a notice, in the academic notice's
// terminal-style window on its white cover (intro-warning-* and .desk-notice in styles.css),
// blinking in piece by piece the same way, without a tick box or Continue. Nothing underneath
// changes: once the window is full size again the notice goes and the page carries on where it was.
// - Not a computer (a phone or tablet: a touch screen with no mouse, or a screen under MIN_SCREEN
//   wide): "Desktop only".
// - A desktop window clearly smaller than its screen (under WIDE of the screen's width or TALL of
//   its height): "Full window only". Measured with the window's own size against the screen's
//   (outerWidth, screen.availWidth), so zooming the page in or out doesn't count.
// - While it shows, the page under it can't be scrolled, clicked or reached with the keyboard.
// Loaded in every page's <head>; the notice is built once the page is read.
(function () {
  // px: narrower screens aren't computers' (phones, small tablets). Not higher: a Windows laptop
  // with its screen scaled up (150% is common) reports a "screen" of only about 900-1000px
  var MIN_SCREEN = 900;
  var WIDE = 0.85, TALL = 0.8;
  var root = document.documentElement;
  var notice = null, card = null, state = "";
  var MARK = '<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><path d="M6 14 H15 L25 32 L15 50 H6 L16 32 Z"/>' +
    '<path d="M58 14 H49 L39 32 L49 50 H58 L48 32 Z"/><path d="M32 27.5 L36.5 32 L32 36.5 L27.5 32 Z"/></svg>';
  var WORDS = {
    device: {
      title: "Desktop only", box: "Device not supported",
      text: "Tokenz is made for desktop computers and is not available on phones or tablets. " +
        "Open it on a computer, in a full-size browser window."
    },
    window: {
      title: "Full window only", box: "Window too small",
      text: "Tokenz is made for a full-size desktop window. Maximise this window or go full screen, " +
        "and the page carries on where you were."
    }
  };

  function touchOnly() {
    return window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  function check() {
    var screenWide = Math.max(screen.width, screen.availWidth || 0);
    if (touchOnly() || screenWide < MIN_SCREEN) return "device";
    var outerW = window.outerWidth || window.innerWidth, outerH = window.outerHeight || window.innerHeight;
    var availW = screen.availWidth || screen.width, availH = screen.availHeight || screen.height;
    if (outerW < WIDE * availW || outerH < TALL * availH) return "window";
    return "";
  }

  // The last, dim line: the screen (a phone) or the window (too small), and what's needed
  function status() {
    return state === "device"
      ? "Screen: " + Math.round(screen.width) + " × " + Math.round(screen.height) + " px. Needs a desktop."
      : "Window: " + Math.round(window.innerWidth) + " × " + Math.round(window.innerHeight) + " px. Needs full size.";
  }

  // The academic notice's window, with this notice's words
  function build() {
    notice = document.createElement("div");
    notice.className = "desk-notice is-device";
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-modal", "true");
    notice.setAttribute("aria-labelledby", "desk-notice-title");
    var wrap = document.createElement("div");
    wrap.className = "intro-warning desk-device";
    wrap.innerHTML =
      '<div class="intro-warning-card">' +
        '<div class="intro-warning-bar"><span class="intro-warning-brand">' + MARK + 'Tokenz</span></div>' +
        '<div class="intro-warning-body">' +
          '<div class="intro-warning-head">' +
            '<h1 id="desk-notice-title"></h1>' +
            '<span class="intro-warning-badge">Research preview</span>' +
          '</div>' +
          '<div class="intro-warning-box">' +
            '<h2 class="intro-warning-subtitle"></h2>' +
            '<p class="intro-warning-text"></p>' +
          '</div>' +
          '<p class="desk-device-status" aria-live="polite"><span data-status></span></p>' +
        '</div>' +
      '</div>';
    card = wrap.querySelector(".intro-warning-card");
    fill(WORDS[state]);
    notice.append(wrap);
    document.body.append(notice);
    blinkIn(card);
  }

  function fill(w) {
    card.querySelector("h1").textContent = w.title;
    card.querySelector(".intro-warning-subtitle").textContent = w.box;
    card.querySelector(".intro-warning-text").textContent = w.text;
    card.querySelector("[data-status]").textContent = status();
  }

  // The window, then each piece, blinking on one after another (as the academic notice does)
  function blinkIn(el) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("intro-blink");
    var order = [].slice.call(el.querySelectorAll(".intro-warning-brand, h1, .intro-warning-badge, .intro-warning-box, .intro-warning-subtitle, .intro-warning-text, .desk-device-status"));
    order.forEach(function (piece, i) {
      piece.classList.add("intro-blink");
      piece.style.animationDelay = (150 + i * 60) + "ms";
    });
  }

  function apply() {
    var next = check();
    if (next === state) {
      // (the window being resized while too small: its size in the last line follows)
      if (state && card) card.querySelector("[data-status]").textContent = status();
      return;
    }
    state = next;
    if (state) {
      if (!notice) build();
      else fill(WORDS[state]);
    }
    root.classList.toggle("desk-blocked", !!state);
    // (everything else on the page is out of reach while the notice shows; only what this made
    // inert is let go again: anything inert for its own reasons stays so)
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
    if (window.matchMedia) {
      var touch = window.matchMedia("(hover: none) and (pointer: coarse)");
      if (touch.addEventListener) touch.addEventListener("change", apply);
    }
    // (moving the window to another screen changes the screen it's measured against)
    setInterval(apply, 1500);
  }

  // Decided before the first paint, so the page is never glimpsed behind it (the notice's words
  // follow once the page is read)
  if (check()) root.classList.add("desk-blocked");
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
