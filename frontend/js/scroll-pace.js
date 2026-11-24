// Paces the mouse wheel and trackpad, so a hard flick can't rush past the animations that follow
// the scroll (Home's text masks, its Three Methods, its measures and FAQ, the pages' entrances).
// The page glides after the wheel instead of jumping, never faster than MAX_SPEED windows a second,
// and a big flick queues up at most LEAD windows ahead, so it stops a moment after the hand does:
// nothing goes on moving by itself.
// - Only the wheel: touch, the keyboard, the scrollbar and links scroll as the browser does.
// - A page can slow the wheel down or hold it still: window.TokenzScrollPace() returns how far a
//   wheel turn goes here (1 as usual, 0.4 is slower, 0 holds), read on every turn and every frame,
//   and the top speed slows down with it (Home sets it).
// - Not when the page itself can't scroll (How it works, a window open over the page), not inside
//   something that scrolls on its own (a text box, a list), and not with reduced motion.
// - TokenzScroll.stop() drops whatever is still queued (a script scrolling the page itself).
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var MAX_SPEED = 1.5;  // windows a second, at most
  // windows the page may still have to go after the wheel stops, at most: little, so the page
  // (and everything that follows it) moves only while the wheel does, settling a moment after
  var LEAD = 0.3;
  var EASE = 120;       // ms: how quickly it catches most of the way up

  var root = document.documentElement;
  var target = null, pos = 0, frame = 0, last = 0;

  function limit() { return Math.max(0, root.scrollHeight - window.innerHeight); }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  function stop() {
    target = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function tick(now) {
    frame = 0;
    if (target == null) return;
    var dt = Math.min(now - (last || now), 50);
    last = now;
    var gap = target - pos;
    var step = gap * (1 - Math.exp(-dt / EASE));
    // (where the page slows the wheel down, the top speed slows with it)
    var pace = typeof window.TokenzScrollPace === "function" ? window.TokenzScrollPace() : 1;
    var most = MAX_SPEED * window.innerHeight * dt / 1000 * (pace > 0 && pace < 1 ? pace : 1);
    pos += clamp(step, -most, most);
    if (Math.abs(target - pos) < 0.5) pos = target;
    window.scrollTo({ top: pos, behavior: "instant" });
    if (pos === target) { target = null; return; }
    frame = requestAnimationFrame(tick);
  }

  function by(distance) {
    if (target == null) {
      pos = window.scrollY;
      target = pos;
      last = 0;
    }
    var reach = LEAD * window.innerHeight;
    target = clamp(target + distance, Math.max(0, pos - reach), Math.min(limit(), pos + reach));
    if (!frame) frame = requestAnimationFrame(tick);
  }

  // The page doesn't scroll at all (How it works on a wide screen, or a window open over it)
  function locked() {
    if (root.classList.contains("modal-open") || document.querySelector(".reel-modal.is-open")) return true;
    var html = getComputedStyle(root).overflowY, body = getComputedStyle(document.body).overflowY;
    return html === "hidden" || body === "hidden" || limit() === 0;
  }

  // Something under the pointer that scrolls on its own, and still can that way
  function scrollsItself(el, down) {
    for (; el && el !== document.body && el !== root; el = el.parentElement) {
      var style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  }

  window.addEventListener("wheel", function (event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    var el = event.target instanceof Element ? event.target : null;
    if (locked() || scrollsItself(el, event.deltaY > 0)) return;
    var pace = typeof window.TokenzScrollPace === "function" ? window.TokenzScrollPace() : 1;
    event.preventDefault();
    if (!pace) { stop(); return; }
    var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    by(event.deltaY * unit * pace);
  }, { passive: false });

  // Anything else that scrolls the page (the scrollbar, the keyboard, a link, a script) wins:
  // whatever the wheel had queued is dropped
  window.addEventListener("scroll", function () {
    if (target != null && Math.abs(window.scrollY - pos) > 2) stop();
  }, { passive: true });
  ["keydown", "mousedown", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function () { if (target != null) stop(); }, { passive: true });
  });

  window.TokenzScroll = { by: by, stop: stop };
})();
