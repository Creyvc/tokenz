// Home's video cursor and film. Only with a mouse or trackpad, and not with reduced motion: touch
// screens and people who prefer less motion keep the normal cursor and the page as it was.
//
// - The cursor: on the first screen (the headline, Explore and Compare), the pointer is a small
//   rounded box playing the promo (assets/promo-720.mp4, a silent 1280×720 copy of
//   film/promo/tokenz-promo.mp4), easing after it. Over anything you can click, or close to Explore,
//   Compare or the cookie banner, the box shrinks away and the normal cursor comes back. Not on the
//   warning page or during the intro, and not once the Three Methods page has come up. Dashed
//   lines cross the whole window through the box's middle (after
//   roshan-sahu.com).
// - The film: scrolling down from the top, the sentence, the headline's two lines and the buttons
//   mask out one after another (each slides down behind its own edge), and the box grows from where
//   the cursor was until it fills the window, playing the promo from the start, silently. The
//   first screen holds while it plays (Home is taller for it, html.home-film in styles.css); scrolling
//   on, the Three Methods page slides up over it. Scrolling back up plays it all backwards. Once it
//   is half the window's width, a small thick plus marks each of its corners, like a viewfinder,
//   moving with it as it grows. The film and the next page
//   dissolve into each other (after lukebaffait.fr): the page comes up with a soft edge, the film
//   fades out from the bottom up.
// - The tile (on every page with the sidebar: Home from Three Methods on, the other pages always),
//   once the sidebar is in, the video sits as a small tile just right
//   of the sidebar's black Tokenz badge (bottom left, a little gap between), about a third of the badge's height,
//   moving with the badge; it slides out from behind the badge only once the badge has slid in, and
//   going back up it stays with the badge and slides out of the window with it,
//   still playing but pixelated, a mosaic you can't make out. Clicking it opens the showreel in a
//   window over the page (16:9, at most 80% of the screen, on a dimmed page), playing from the
//   start with its sound (assets/showreel.mp4; everything else is silent), with a close button (Esc or a click on the dimmed page close it too). Over the tile the
//   cursor becomes a small black box reading "Show reel".
// - Sharp corners throughout.
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
  var BOX_W = 240, BOX_H = 135, RADIUS = 0;
  var MOSAIC_W = 24, MOSAIC_H = 14;   // the pixelated tile is drawn this small, then scaled up
  var TILE_GAP = 12;                  // the space between the badge and the tile
  var TILE_OF_BADGE = 0.42;           // the tile's height, as a share of the badge's
  var LINE_PAST_NAV = 8;              // the thin line beside the sidebar sits this far past its edge

  var box = document.createElement("div");
  box.className = "video-cursor";
  box.setAttribute("aria-hidden", "true");
  var video = document.createElement("video");
  video.src = "assets/promo-720.mp4";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  var mosaic = document.createElement("canvas");
  mosaic.width = MOSAIC_W; mosaic.height = MOSAIC_H;
  mosaic.className = "video-mosaic";
  var mosaicCtx = mosaic.getContext("2d");
  box.append(video, mosaic);
  // the cursor over the tile: a small box that reads "Show reel"
  var reelLabel = document.createElement("div");
  reelLabel.className = "reel-cursor";
  reelLabel.setAttribute("aria-hidden", "true");
  reelLabel.textContent = "Show reel";
  // the film's corner marks: a thin plus at each corner, like a viewfinder, once it fills the window
  var marks = document.createElement("div");
  marks.className = "film-marks";
  marks.setAttribute("aria-hidden", "true");
  ["tl", "tr", "bl", "br"].forEach(function (corner) {
    var plus = document.createElement("span");
    plus.className = "film-mark is-" + corner;
    marks.appendChild(plus);
  });
  // with the cursor box (after roshan-sahu.com): dashed lines across the whole window through its
  // middle, passing behind it
  var lineH = document.createElement("div"), lineV = document.createElement("div");
  lineH.className = "vc-line is-h"; lineV.className = "vc-line is-v";
  lineH.setAttribute("aria-hidden", "true"); lineV.setAttribute("aria-hidden", "true");
  // the dark behind the film as it dissolves into Three Methods (under the film, over the page)
  var dim = document.createElement("div");
  dim.className = "film-dim";
  dim.setAttribute("aria-hidden", "true");
  document.body.append(lineH, lineV, dim, box, marks, reelLabel);
  function placeLines() {
    lineH.style.transform = "translateY(" + shownY.toFixed(1) + "px)";
    lineV.style.transform = "translateX(" + shownX.toFixed(1) + "px)";
  }
  var revealed = false, mosaicFrame = 0;
  // the mosaic copies the playing video, a few blocks across, every frame while the tile is pixelated
  function drawMosaic() {
    mosaicFrame = 0;
    if (!box.classList.contains("is-dock") || revealed) return;
    if (video.readyState >= 2) mosaicCtx.drawImage(video, 0, 0, MOSAIC_W, MOSAIC_H);
    mosaicFrame = requestAnimationFrame(drawMosaic);
  }
  var next = document.querySelector(".home-next");
  // Home has the cursor and the film; the other pages only the tile beside the sidebar's badge
  var onHome = !!document.querySelector(".content.home");
  if (onHome) root.classList.add("home-film");

  var x = -500, y = -500, shownX = x, shownY = y, inside = false, overClickable = false, frame = 0;
  var filmFrom = null;    // where the box starts growing from (the cursor, or the middle)

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
    // (another page: no film, and the sidebar is always in)
    if (!onHome) return { grow: 0, covered: 1, scrollY: scrollY, H: H };
    var grow = ease(clamp((scrollY - 0.12 * H) / (0.7 * H)));
    var covered = next ? clamp(1 - next.getBoundingClientRect().top / H) : 0;
    return { grow: grow, covered: covered, scrollY: scrollY, H: H };
  }

  function update() {
    var f = filmState();
    maskOut(f.scrollY, f.H);
    // Going back up, the tile stays with the badge and slides out with it, the film only taking over
    // once the badge has gone (or the page has scrolled well back)
    var badgeNow = document.querySelector("header.nav:not(.nav-copy) .tz-lockup");
    var badgeRect = badgeNow ? badgeNow.getBoundingClientRect() : null;
    var leavingWithBadge = box.classList.contains("is-dock") && tileIn !== null && badgeRect && badgeRect.right > 1 && f.covered > 0.3;
    var film = !leavingWithBadge && f.grow > 0 && f.covered < 1 && !root.classList.contains("intro-play");
    box.classList.toggle("is-film", film);
    // (the film taking over from the tile: the tile's mosaic and its place go)
    if (film && box.classList.contains("is-dock")) {
      box.classList.remove("is-dock", "is-revealed");
      revealed = false; tileIn = null; badgeLast = null;
      ["left", "top", "width", "height", "borderRadius", "transform", "clipPath", "transition", "opacity"].forEach(function (p) { mosaic.style[p] = ""; video.style[p] = ""; });
    }
    if (film) { lineH.classList.toggle("is-shown", false); lineV.classList.toggle("is-shown", false); }
    if (!film) { marks.style.opacity = "0"; dim.style.opacity = "0"; video.style.filter = ""; }
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
      // The corner marks sit inside the video's own corners and grow with it: they appear once it's
      // half the window's width, and go first as it dissolves into the next page
      var vw = lerp(BOX_W, W, k), vh = lerp(BOX_H, f.H, k);
      marks.style.left = lerp(filmFrom.x - BOX_W / 2, 0, k).toFixed(1) + "px";
      marks.style.top = lerp(filmFrom.y - BOX_H / 2, 0, k).toFixed(1) + "px";
      marks.style.width = vw.toFixed(1) + "px";
      marks.style.height = vh.toFixed(1) + "px";
      marks.style.opacity = (clamp((vw / W - 0.45) / 0.1) * (1 - clamp(f.covered * 2.5))).toFixed(3);
      // Dissolving into the next page (after lukebaffait.fr): as it comes up, the film fades out
      // from the bottom upwards and darkens as a whole, over a dark ground that comes in as soon as
      // it starts (so it fades through dark, not white)
      var c = f.covered;
      if (c > 0) {
        // (an eased edge, many stops along a smooth curve rather than a straight ramp, so no line
        // shows where the fade starts or ends)
        var edge = 100 - c * 150, stops = [];
        for (var q = 0; q <= 10; q++) {
          var u = q / 10, a = 1 - u * u * (3 - 2 * u);
          stops.push("rgba(0,0,0," + a.toFixed(3) + ") " + (edge + u * 60).toFixed(1) + "%");
        }
        video.style.webkitMaskImage = video.style.maskImage = "linear-gradient(to bottom, " + stops.join(", ") + ")";
        video.style.opacity = (1 - c * c).toFixed(3);
        // (both easing in and out of their change, not starting and stopping sharply)
        var d = clamp(c / 0.45), ease2 = d * d * (3 - 2 * d);
        video.style.filter = "brightness(" + (1 - 0.45 * ease2).toFixed(3) + ")";
        dim.style.opacity = (0.6 * ease2).toFixed(3);
      } else {
        video.style.webkitMaskImage = video.style.maskImage = "";
        video.style.opacity = "";
        video.style.filter = "";
        dim.style.opacity = "0";
      }
      box.classList.add("is-shown");
      // (toggle, not remove: remove rewrites the class even when it has nothing to take away, and
      // the watcher below would call this again, for ever)
      root.classList.toggle("video-cursor-on", false);
      if (video.paused) video.play().catch(function () {});
      return;
    }
    // past the first screen, with the sidebar in: the tile beside the badge
    var badge = document.querySelector("header.nav:not(.nav-copy) .tz-lockup");
    var r = badge ? badge.getBoundingClientRect() : null;
    var docked = leavingWithBadge || (f.covered >= 1 && r && r.width > 0 && !root.classList.contains("home-nav-hidden") && !root.classList.contains("intro-play"));
    box.classList.toggle("is-dock", !!docked);
    if (docked) { lineH.classList.toggle("is-shown", false); lineV.classList.toggle("is-shown", false); }
    if (!docked && revealed) { revealed = false; box.classList.remove("is-revealed"); }
    if (docked) {
      filmFrom = null;
      box.style.transform = "none";
      if (!tileFrame) tileFrame = requestAnimationFrame(trackTile);
      if (!revealed && !mosaicFrame) mosaicFrame = requestAnimationFrame(drawMosaic);
      box.classList.add("is-shown");
      root.classList.toggle("video-cursor-on", false);
      if (video.paused) video.play().catch(function () {});
      return;
    }
    // back to being the cursor
    tileIn = null; badgeLast = null;
    if (filmFrom || video.style.width) {
      filmFrom = null;
      [video, mosaic].forEach(function (el) {
        ["left", "top", "width", "height", "borderRadius", "transform", "clipPath", "transition", "opacity", "maskImage", "webkitMaskImage"].forEach(function (p) { el.style[p] = ""; });
      });
      box.style.transform = "translate(" + shownX.toFixed(1) + "px, " + shownY.toFixed(1) + "px)";
    }
    // (the first screen: before the film begins, above the top edge of the Three Methods page)
    var firstScreen = f.grow <= 0 && (!next || y < next.getBoundingClientRect().top);
    var show = onHome && inside && firstScreen && !overClickable && !nearAny() && !root.classList.contains("intro-play");
    box.classList.toggle("is-shown", show);
    lineH.classList.toggle("is-shown", show); lineV.classList.toggle("is-shown", show);
    if (show) placeLines();
    // the normal cursor is hidden only while the box stands in for it
    root.classList.toggle("video-cursor-on", show);
    if (show && video.paused) video.play().catch(function () {});
    if (!show && !video.paused) video.pause();
  }

  // The tile follows the badge every frame (so it moves with the sidebar as it slides in or out),
  // and only once the badge has come to rest does the tile slide out from behind its right edge
  var tileFrame = 0, tileIn = null, badgeLast = null, badgeStill = 0;
  var TILE_IN = 450;   // ms for the tile to slide out
  function trackTile(now) {
    tileFrame = 0;
    if (!box.classList.contains("is-dock")) return;
    var badge = document.querySelector("header.nav:not(.nav-copy) .tz-lockup");
    if (!badge) return;
    var r = badge.getBoundingClientRect();
    // (leaving with the sidebar: once the badge is out of the window, let the page decide what's next)
    if (tileIn !== null && r.right <= 1 && filmState().covered < 1) { update(); return; }
    var tileH = Math.round(r.height * TILE_OF_BADGE), tileW = Math.round(tileH * 16 / 9);
    // it fills the space between the badge and the thin line just right of the sidebar (at its edge
    // plus 8px), with the same gap on both sides
    var nav = badge.closest("header.nav");
    if (nav) { tileW = Math.round(nav.getBoundingClientRect().right + LINE_PAST_NAV - TILE_GAP - (r.right + TILE_GAP)); tileH = Math.round(tileW * 9 / 16); }
    // the badge is at rest once it hasn't moved for a few frames, fully in view
    var moved = !badgeLast || Math.abs(r.left - badgeLast.left) > 0.2 || Math.abs(r.top - badgeLast.top) > 0.2;
    badgeStill = moved ? 0 : badgeStill + 1;
    badgeLast = { left: r.left, top: r.top };
    if (tileIn === null && badgeStill >= 3 && r.left >= -0.5 && r.width > 0) tileIn = now;
    var k = tileIn === null ? 0 : Math.min(1, (now - tileIn) / TILE_IN);
    var e = 1 - Math.pow(1 - k, 3);
    // going out, the tile draws back behind the badge as far as the badge has left the window
    var out = tileIn === null ? 0 : clamp(-r.left / Math.max(1, r.width));
    e = Math.min(e, 1 - out);
    [video, mosaic].forEach(function (el) {
      el.style.transition = "none";
      el.style.left = (r.right + TILE_GAP).toFixed(1) + "px";
      el.style.top = (r.bottom - tileH).toFixed(1) + "px";
      el.style.width = tileW + "px";
      el.style.height = tileH + "px";
      el.style.borderRadius = "0px";
      // slid left by what's still hidden, and cut off at its own left edge: it comes out from the badge's side
      el.style.transform = "translateX(" + (-(1 - e) * tileW).toFixed(1) + "px)";
      el.style.clipPath = "inset(0 0 0 " + ((1 - e) * tileW).toFixed(1) + "px)";
      el.style.opacity = k > 0 ? "1" : "0";
    });
    tileFrame = requestAnimationFrame(trackTile);
  }

  // The box eases after the pointer (a fifth of the way each frame), centred on it
  function follow() {
    shownX += (x - shownX) * 0.22;
    shownY += (y - shownY) * 0.22;
    if (!box.classList.contains("is-film") && !box.classList.contains("is-dock")) {
      box.style.transform = "translate(" + shownX.toFixed(1) + "px, " + shownY.toFixed(1) + "px)";
      placeLines();
    }
    frame = Math.abs(x - shownX) + Math.abs(y - shownY) > 0.3 ? requestAnimationFrame(follow) : 0;
  }

  document.addEventListener("pointermove", function (event) {
    if (event.pointerType !== "mouse") return;
    var first = !inside;
    x = event.clientX; y = event.clientY;
    if (first) { shownX = x; shownY = y; }
    inside = true;
    overClickable = !!(event.target instanceof Element && event.target.closest(CLICKABLE));
    var overTile = box.classList.contains("is-dock") && (event.target === video || event.target === mosaic);
    reelLabel.classList.toggle("is-shown", overTile);
    reelLabel.style.transform = "translate(" + x + "px, " + y + "px) translate(-50%, -50%)";
    update();
    if (!frame) frame = requestAnimationFrame(follow);
  });
  document.addEventListener("pointerdown", function () { box.classList.add("is-pressed"); });
  document.addEventListener("pointerup", function () { box.classList.remove("is-pressed"); });
  document.documentElement.addEventListener("mouseleave", function () { inside = false; reelLabel.classList.remove("is-shown"); update(); });
  window.addEventListener("blur", function () { inside = false; update(); });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  // the tile: a click shows the video clearly, another click pixelates it again
  // ---- the showreel window, opened from the tile ----
  var reel = document.createElement("div");
  reel.className = "reel-modal";
  reel.hidden = true;
  reel.setAttribute("role", "dialog");
  reel.setAttribute("aria-modal", "true");
  reel.setAttribute("aria-label", "Showreel");
  var reelBack = document.createElement("div");
  reelBack.className = "reel-modal-back";
  var reelFrame = document.createElement("div");
  reelFrame.className = "reel-modal-frame";
  var reelVideo = document.createElement("video");
  // (its own copy, with the sound: only this window ever plays sound, and only after a click)
  reelVideo.src = "assets/showreel.mp4";
  reelVideo.muted = false;
  reelVideo.loop = true;
  reelVideo.playsInline = true;
  reelVideo.controls = true;
  reelVideo.preload = "none";
  var reelClose = document.createElement("button");
  reelClose.type = "button";
  reelClose.className = "reel-modal-close";
  reelClose.setAttribute("aria-label", "Close the showreel");
  reelClose.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>';
  reelFrame.append(reelVideo, reelClose);
  reel.append(reelBack, reelFrame);
  document.body.appendChild(reel);
  var reelFrom = null;
  function openReel() {
    reelFrom = document.activeElement;
    reel.hidden = false;
    reelLabel.classList.remove("is-shown");
    reelVideo.currentTime = 0;
    reelVideo.play().catch(function () {});
    // (shown on the next frame, so it fades and grows in)
    requestAnimationFrame(function () { requestAnimationFrame(function () { reel.classList.add("is-open"); }); });
    reelClose.focus({ preventScroll: true, focusVisible: false });
  }
  function closeReel() {
    if (reel.hidden) return;
    reel.classList.remove("is-open");
    setTimeout(function () { reel.hidden = true; reelVideo.pause(); }, 300);
    if (reelFrom && reelFrom.focus) reelFrom.focus({ preventScroll: true });
  }
  box.addEventListener("click", function () {
    if (box.classList.contains("is-dock")) openReel();
  });
  reelClose.addEventListener("click", closeReel);
  reelBack.addEventListener("click", closeReel);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeReel();
  });

  // (the intro ends by removing a class from <html>: show the box then, if the pointer's in)
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["class"] });
  update();
})();
