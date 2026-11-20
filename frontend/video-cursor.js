// Home's first screen only (the headline, Explore and Compare): the cursor is a small rounded box
// playing the promo (assets/cursor-reel.mp4, a silent 480×270 copy of film/promo/tokenz-promo.mp4),
// following the pointer with a slight lag. Over anything you can click (Explore, Compare, links,
// buttons) the box shrinks away and the normal cursor comes back. Not on the warning page and the
// intro, and not once the Three Methods page has come up over the first screen: the normal cursor
// shows there. Only with a mouse or trackpad, and not with reduced motion: touch screens
// and people who prefer less motion keep the normal cursor.
(function () {
  var root = document.documentElement;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!fine.matches || still.matches) return;

  var CLICKABLE = "a[href], button, [role='button'], summary, label, input, select, textarea";
  // Nearing these, the normal cursor comes back a little before the pointer reaches them, so the
  // box never covers them: Explore and Compare, and the cookie banner (its buttons and link)
  var NEAR = ".home-actions a, .consent";
  var NEAR_PX = 90;
  function nearAny() {
    return Array.prototype.some.call(document.querySelectorAll(NEAR), function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      return Math.hypot(dx, dy) < NEAR_PX;
    });
  }
  var box = document.createElement("div");
  box.className = "video-cursor";
  box.setAttribute("aria-hidden", "true");
  var video = document.createElement("video");
  video.src = "assets/cursor-reel.mp4";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  box.appendChild(video);
  document.body.appendChild(box);
  var next = document.querySelector(".home-next");

  var x = -500, y = -500, shownX = x, shownY = y, inside = false, overClickable = false, frame = 0;

  // Shown while the pointer is in the window, not over something clickable, and not during the intro
  function update() {
    // (the first screen: above the top edge of the Three Methods page as it scrolls up over it)
    var firstScreen = !next || y < next.getBoundingClientRect().top;
    var show = inside && firstScreen && !overClickable && !nearAny() && !root.classList.contains("intro-play");
    box.classList.toggle("is-shown", show);
    // the normal cursor is hidden only while the box stands in for it
    root.classList.toggle("video-cursor-on", show);
    if (show && video.paused) video.play().catch(function () {});
    if (!show && !video.paused) video.pause();
  }

  // The box eases after the pointer (a fifth of the way each frame), centred on it
  function follow() {
    shownX += (x - shownX) * 0.22;
    shownY += (y - shownY) * 0.22;
    box.style.transform = "translate(" + shownX.toFixed(1) + "px, " + shownY.toFixed(1) + "px)";
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
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("blur", function () { inside = false; update(); });

  // (the intro ends by removing a class from <html>: show the box then, if the pointer's in)
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["class"] });
})();
