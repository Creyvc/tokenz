// Home's video cursor and film. Only with a mouse or trackpad, and not with reduced motion: touch
// screens and people who prefer less motion keep the normal cursor and the page as it was.
//
// - The cursor: on the first screen (the headline, Explore and Compare), the pointer is a small
//   rounded box playing the promo (assets/promo-720.mp4, a 1280×720 copy of
//   film/promo/tokenz-promo.mp4), easing after it. Over anything you can click, or close to Explore,
//   Compare or the cookie banner, the box shrinks away and the normal cursor comes back. Not on the
//   warning page or during the intro, and not once the Three Methods page has come up.
// - The film: scrolling down from the top, the sentence, the headline's two lines and the buttons
//   mask out one after another (each slides down behind its own edge), and the box grows from where
//   the cursor was until it fills the window, playing the promo from the start, with sound. The
//   first screen holds while it plays (Home is taller for it, html.home-film in styles.css); scrolling
//   on, the Three Methods page slides up over it and the sound fades away. Scrolling back up plays
//   it all backwards.
// - Sound: browsers only allow it once the page has been clicked, tapped or typed on (scrolling
//   doesn't count). If it hasn't been, the film plays silently with a "Sound on" button.
(function () {
  var root = document.documentElement;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!fine.matches || still.matches) return;

  var CLICKABLE = "a[href], button, [role='button'], summary, label, input, select, textarea";
  // Nearing these, the normal cursor comes back a little before the pointer reaches them, so the
  // box never covers them: Explore and Compare, and the cookie banner (its buttons and link)
  var NEAR = ".home-actions a, .consent";
  var NEAR_PX = 40;
  var BOX_W = 320, BOX_H = 180, RADIUS = 20;

  var box = document.createElement("div");
  box.className = "video-cursor";
  box.setAttribute("aria-hidden", "true");
  var video = document.createElement("video");
  video.src = "assets/promo-720.mp4";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  box.appendChild(video);
  var soundButton = document.createElement("button");
  soundButton.type = "button";
  soundButton.className = "film-sound";
  soundButton.textContent = "Sound on";
  document.body.append(box, soundButton);
  var next = document.querySelector(".home-next");
  root.classList.add("home-film");

  var x = -500, y = -500, shownX = x, shownY = y, inside = false, overClickable = false, frame = 0;
  var filmFrom = null;    // where the box starts growing from (the cursor, or the middle)
  var volume = 0;

  function nearAny() {
    return Array.prototype.some.call(document.querySelectorAll(NEAR), function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      return Math.hypot(dx, dy) < NEAR_PX;
    });
  }

  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
  var ease = function (k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  // ---- the first screen's text masking out, each piece behind its own bottom edge ----
  function maskOut(scrollY, H) {
    var intro = ".content.home .home-intro:not(.is-copy) ";
    var pieces = [];
    var lede = document.querySelector(intro + ".home-lede");
    if (lede) pieces.push({ el: lede, clip: true });
    document.querySelectorAll(intro + ".home-headline .mask-rise").forEach(function (el) { pieces.push({ el: el, clip: false }); });
    var actions = document.querySelector(intro + ".home-actions");
    if (actions) pieces.push({ el: actions, clip: true });
    pieces.forEach(function (p, i) {
      var k = ease(clamp((scrollY - (0.03 + 0.04 * i) * H) / (0.16 * H)));
      if (k <= 0) {
        p.el.style.removeProperty("transform"); p.el.style.removeProperty("clip-path"); p.el.style.removeProperty("transition");
        return;
      }
      p.el.style.transition = "none";
      if (p.clip) {
        // moved down by k of its height and cut off by the same amount from its bottom: it slides
        // down out of sight behind the edge where it stood
        p.el.style.transform = "translateY(" + (k * 100).toFixed(2) + "%)";
        p.el.style.clipPath = "inset(-20% -5% " + (k * 100).toFixed(2) + "% -5%)";
      } else {
        // the headline's lines already sit in masks: each slides down out of its own
        p.el.style.transform = "translateY(" + (k * 135).toFixed(2) + "%)";
      }
    });
  }

  // ---- how far into the film: the box's growth (0 to 1) and how much the next page covers it ----
  function filmState() {
    var H = window.innerHeight, scrollY = window.scrollY;
    var grow = ease(clamp((scrollY - 0.12 * H) / (0.7 * H)));
    var covered = next ? clamp(1 - next.getBoundingClientRect().top / H) : 0;
    return { grow: grow, covered: covered, scrollY: scrollY, H: H };
  }

  function update() {
    var f = filmState();
    maskOut(f.scrollY, f.H);
    var film = f.grow > 0 && f.covered < 1 && !root.classList.contains("intro-play");
    box.classList.toggle("is-film", film);
    if (film) {
      if (!filmFrom) {
        filmFrom = box.classList.contains("is-shown") ? { x: shownX, y: shownY } : { x: window.innerWidth / 2, y: f.H / 2 };
        video.currentTime = 0;
      }
      var W = window.innerWidth, k = f.grow;
      box.style.transform = "none";
      video.style.left = lerp(filmFrom.x - BOX_W / 2, 0, k).toFixed(1) + "px";
      video.style.top = lerp(filmFrom.y - BOX_H / 2, 0, k).toFixed(1) + "px";
      video.style.width = lerp(BOX_W, W, k).toFixed(1) + "px";
      video.style.height = lerp(BOX_H, f.H, k).toFixed(1) + "px";
      video.style.borderRadius = lerp(RADIUS, 0, k).toFixed(1) + "px";
      box.classList.add("is-shown");
      // (toggle, not remove: remove rewrites the class even when it has nothing to take away, and
      // the watcher below would call this again, for ever)
      root.classList.toggle("video-cursor-on", false);
      if (video.paused) video.play().catch(function () {});
      // sound once it fills the window, fading as the next page covers it
      var full = f.grow > 0.98;
      var canSound = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
      if (full && canSound && video.muted) video.muted = false;
      soundButton.classList.toggle("is-shown", full && video.muted && f.covered < 0.5);
      setVolume((full ? 1 : 0) * (1 - f.covered));
      return;
    }
    // back to being the cursor
    if (filmFrom) {
      filmFrom = null;
      ["left", "top", "width", "height", "borderRadius"].forEach(function (p) { video.style[p] = ""; });
      box.style.transform = "translate(" + shownX.toFixed(1) + "px, " + shownY.toFixed(1) + "px)";
    }
    soundButton.classList.remove("is-shown");
    setVolume(0);
    // (the first screen: before the film begins, above the top edge of the Three Methods page)
    var firstScreen = f.grow <= 0 && (!next || y < next.getBoundingClientRect().top);
    var show = inside && firstScreen && !overClickable && !nearAny() && !root.classList.contains("intro-play");
    box.classList.toggle("is-shown", show);
    // the normal cursor is hidden only while the box stands in for it
    root.classList.toggle("video-cursor-on", show);
    if (show && video.paused) video.play().catch(function () {});
    if (!show && !video.paused) video.pause();
  }

  // the volume eases to where it should be, and the film goes back to silent at nothing
  var volumeFrame = 0, volumeTo = 0;
  function setVolume(v) {
    volumeTo = v;
    if (!volumeFrame) volumeFrame = requestAnimationFrame(stepVolume);
  }
  function stepVolume() {
    volume += (volumeTo - volume) * 0.18;
    if (Math.abs(volumeTo - volume) < 0.01) volume = volumeTo;
    video.volume = clamp(volume);
    if (volume === 0 && volumeTo === 0 && !video.muted) video.muted = true;
    volumeFrame = volume !== volumeTo ? requestAnimationFrame(stepVolume) : 0;
  }

  // The box eases after the pointer (a fifth of the way each frame), centred on it
  function follow() {
    shownX += (x - shownX) * 0.22;
    shownY += (y - shownY) * 0.22;
    if (!box.classList.contains("is-film")) box.style.transform = "translate(" + shownX.toFixed(1) + "px, " + shownY.toFixed(1) + "px)";
    frame = Math.abs(x - shownX) + Math.abs(y - shownY) > 0.3 ? requestAnimationFrame(follow) : 0;
  }

  document.addEventListener("pointermove", function (event) {
    if (event.pointerType !== "mouse") return;
    var first = !inside;
    x = event.clientX; y = event.clientY;
    if (first) { shownX = x; shownY = y; }
    inside = true;
    overClickable = !!(event.target instanceof Element && event.target.closest(CLICKABLE));
    update();
    if (!frame) frame = requestAnimationFrame(follow);
  });
  document.addEventListener("pointerdown", function () { box.classList.add("is-pressed"); });
  document.addEventListener("pointerup", function () { box.classList.remove("is-pressed"); });
  document.documentElement.addEventListener("mouseleave", function () { inside = false; update(); });
  window.addEventListener("blur", function () { inside = false; update(); });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  soundButton.addEventListener("click", function () {
    video.muted = false;
    soundButton.classList.remove("is-shown");
    update();
  });

  // (the intro ends by removing a class from <html>: show the box then, if the pointer's in)
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["class"] });
  update();
})();
