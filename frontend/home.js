// Home. Loaded in <head> without defer, so the headline and sentence can be hidden before the
// first paint; everything else waits for the page.
//
// - The Grainient background fills the rounded panel on the right. On a first visit it waits for
//   the intro to finish, so its own bloom from the middle is seen rather than hidden under the
//   intro's cover. Without WebGL2 the panel just stays plain grey.
// - The sentence, then the headline, rise into place line by line from behind a mask: the text
//   mask animation from olivierlarose/text-mask-animation (each line slides up from 100%, 0.75s,
//   ease [0.33, 1, 0.68, 1], 0.075s apart). It starts a quarter of a second after the intro uncovers the
//   page, or straight away on a later visit. People who prefer less motion just see the text.
// - Scrolling (wider screens, not for reduced motion): TOKENZ slides up out of its mask, then
//   the box grows until the gradient fills the whole window, while the sentence and headline
//   turn white above it, draw closer together and move to the middle of the window. Scrolling a
//   little further, they mask out line by line, like their entrance played backwards. Then a
//   white page scrolls up over the gradient, and the sidebar turns dark again where it covers
//   it. Then it holds still while its title and the three methods slide past sideways (the
//   horizontal section from olivierlarose.com). All of it follows the scroll, both ways.
(function () {
  var root = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STEP = 75;          // ms between lines
  var RISE = 750;         // ms for one line
  var AFTER_INTRO = 250;  // ms to wait once the intro has uncovered the page
  var REVISIT = 150;      // ms to wait when there's no intro

  if (!still) root.classList.add("home-text-waiting");

  // is-lit turns the title in the panel white once the gradient is behind it. heroBackground is
  // kept so the scroll effect can pause it while the white page covers it
  var heroBackground = null;
  function mountBackground() {
    var panel = document.querySelector(".home-panel");
    if (!panel || !window.Grainient) return;
    var background = heroBackground = window.Grainient(panel, {
      colors: ["#120f17", "#2a0f0a", "#9a3412", "#f97316", "#fed7aa"],
      angle: 55,
      speed: 6,
      flow: 1.1,
      silk: 0.35,
      grainAmount: 0.08
    });
    if (background) panel.classList.add("is-lit");
  }

  // The same moving gradient in each method's panel, in its own colours and direction, over its
  // still CSS gradient (which stays as it is without WebGL2). Each pauses while it's out of sight
  var METHOD_COLORS = {
    "is-nlp": { colors: ["#1d232c", "#34404d", "#5d6c7c", "#a9b8c8", "#dfe8f1"], angle: 128 },
    "is-tfidf": { colors: ["#071b1c", "#0f3a3b", "#1f5f5b", "#4fa596", "#c8eadf"], angle: 35 },
    "is-ai": { colors: ["#2a1f8f", "#5B4FD6", "#8B7FF2", "#b4aaff", "#f1edff"], angle: 75 }
  };

  function mountMethodBackgrounds() {
    if (!window.Grainient) return;
    Object.keys(METHOD_COLORS).forEach(function (name) {
      var box = document.querySelector(".home-method." + name);
      if (!box) return;
      var look = METHOD_COLORS[name];
      var background = window.Grainient(box, {
        colors: look.colors,
        angle: look.angle,
        // Much livelier than the big gradient: faster, with deeper swirls
        speed: 16,
        flow: 2.6,
        silk: 0.35,
        grainAmount: 0.08,
        intro: false,
        // Soft colours under a CSS grain: a quarter of the pixels of a Retina canvas looks the same
        dpr: 1
      });
      if (background) box.classList.add("is-lit");
    });
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // The sentence's lines as the browser wrapped them: each word in a span, grouped by its top
  function wrappedLines(block) {
    var words = block.textContent.trim().split(/\s+/);
    block.textContent = "";
    var spans = words.map(function (word, i) {
      var span = make("span", "", word);
      block.append(span, i < words.length - 1 ? " " : "");
      return span;
    });
    var lines = [];
    spans.forEach(function (span) {
      var last = lines[lines.length - 1];
      if (last && Math.abs(last.top - span.offsetTop) < 2) last.words.push(span.textContent);
      else lines.push({ top: span.offsetTop, words: [span.textContent] });
    });
    return lines.map(function (line) { return line.words.join(" "); });
  }

  // One mask per line, with the line inside it ready to rise; returns the risers
  function maskSentence(block) {
    var original = block.textContent;
    var lines = wrappedLines(block);
    block.textContent = "";
    block.classList.add("is-masked");
    var risers = lines.map(function (line, i) {
      var mask = make("span", "mask-line");
      // Only the first line keeps the paragraph's indent
      if (i) mask.style.textIndent = "0";
      var inner = make("span", "mask-rise", line);
      mask.append(inner);
      block.append(mask);
      return inner;
    });
    return { risers: risers, restore: function () {
      block.textContent = original;
      block.classList.remove("is-masked");
    } };
  }

  // The headline's two lines are already one span each: give each a mask (or reuse its mask)
  function maskHeadline(block) {
    block.classList.add("is-masked");
    return Array.prototype.map.call(block.children, function (line) {
      if (line.firstElementChild) return line.firstElementChild;
      line.classList.add("mask-line");
      var inner = make("span", "mask-rise", line.textContent);
      line.textContent = "";
      line.append(inner);
      return inner;
    });
  }

  function reveal() {
    var lede = document.querySelector(".home-lede");
    var headline = document.querySelector(".home-headline");
    if (!lede || !headline) return root.classList.remove("home-text-waiting");
    var sentence = maskSentence(lede);
    var risers = sentence.risers.concat(maskHeadline(headline));
    risers.forEach(function (inner, i) { inner.style.transitionDelay = (i * STEP) + "ms"; });
    root.classList.remove("home-text-waiting");
    // Next frame, so the lines are drawn below their masks before they move
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add("home-text-on"); });
    });
    // Once every line is in, the sentence goes back to plain text, so it rewraps on resize
    setTimeout(sentence.restore, (risers.length - 1) * STEP + RISE + 100);
  }

  function start(delay) {
    if (still) return;
    // Lines are measured in the real font, so wait for it
    var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(function () {
      setTimeout(function () {
        try { reveal(); } catch (e) { root.classList.remove("home-text-waiting"); }
      }, delay);
    });
  }

  // ---- The scroll effect. --grow is how far the box has grown (0 to 1), --pull how far the
  // sentence and headline have moved towards each other. A white copy of them lives inside the
  // panel, so it only shows where the gradient is.
  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function ease(x) { return x * x * (3 - 2 * x); }

  function scrollEffect() {
    var lede = document.querySelector(".home-lede");
    var headline = document.querySelector(".home-headline");
    if (!lede || !headline) return;
    var wide = window.matchMedia("(min-width: 801px)");
    var intro = document.querySelector(".home-intro");
    var panel = document.querySelector(".home-panel");
    var nav = document.querySelector(".nav");
    var next = document.querySelector(".home-next");
    var track = document.querySelector(".home-track");
    var row = document.querySelector(".home-row");
    var travel = -1;  // how far the methods' row slides, measured once the row is laid out sideways
    var letters = splitLetters(document.querySelector(".home-next-lede"));

    // The paragraph under "Three Methods", one span per letter (words kept whole for wrapping),
    // for the text gradient opacity effect from olivierlarose/text-gradient-opacity-on-scroll
    function splitLetters(block) {
      if (!block) return [];
      var spans = [];
      var words = block.textContent.trim().split(/\s+/);
      block.textContent = "";
      words.forEach(function (word, i) {
        var whole = make("span", "home-next-word");
        word.split("").forEach(function (letter) {
          var span = make("span", "", letter);
          whole.append(span);
          spans.push(span);
        });
        block.append(whole, i < words.length - 1 ? " " : "");
      });
      return spans;
    }

    // Each letter goes from 20% to full opacity in turn, as GSAP's stagger does it: each takes
    // 0.5 of the timeline and starts 0.1 after the one before, with no easing
    function light(progress) {
      lightLetters(letters, progress);
    }

    function lightLetters(spans, progress) {
      var total = 0.5 + 0.1 * (spans.length - 1);
      spans.forEach(function (span, i) {
        var value = progress == null ? "" : (0.2 + 0.8 * clamp((progress * total - i * 0.1) / 0.5)).toFixed(3);
        if (span.lit !== value) span.style.opacity = span.lit = value;
      });
    }
    var gap = 0, frame = 0, copy = null, navCopy = null;
    var toCentre = { x: 0, y: 0 };
    var unmask = null;  // puts the copy's sentence back to plain text, once it has masks

    // Masks for the white copy's lines, so they can leave the way they came in. Only the copy:
    // by then the gradient covers the whole window, so the page's own text is hidden under it
    function maskCopy() {
      var sentence = maskSentence(copy.querySelector(".home-lede"));
      var risers = sentence.risers.concat(maskHeadline(copy.querySelector(".home-headline")));
      risers.forEach(function (inner, i) { inner.style.transitionDelay = (i * STEP) + "ms"; });
      // Drawn in place before they move
      void copy.offsetWidth;
      return sentence.restore;
    }

    // While the text is leaving or coming back, the page holds still where that started, so a
    // fast scroll can't rush past it. Held 1px past the point, so it doesn't start again after.
    var holdAt = 0, holdUntil = 0, textGone = null;

    function holding() { return Date.now() < holdUntil; }

    // ms: how long to hold; by default, as long as the first screen's text takes to mask out
    function hold(at, ms) {
      var lines = copy ? copy.querySelectorAll(".mask-rise").length : 1;
      holdAt = at;
      holdUntil = Date.now() + (ms == null ? (lines - 1) * STEP + RISE : ms);
      window.scrollTo({ top: at, behavior: "instant" });
    }

    // The same hold where the methods' row starts to slide: "Three Methods" finishes rising in and
    // the paragraph lights up (SWEEP, timed rather than scrolled, so a fast scroll can't skip it)
    // before the row moves. Scrolling back up, it holds while the paragraph dims again
    var SWEEP = 1000;
    var lastY = null, heldPanel = -1;  // the scroll last frame; the panel the page is waiting on
    var slideBegun = null, titleReadyAt = 0, lit = 0, litAt = 0;
    var titleLetters = document.querySelectorAll(".home-next-letter").length;

    function stopWhileHolding(event) {
      if (holding()) event.preventDefault();
    }

    // The sentence rewraps on resize, so its masks are made again
    function remask() {
      if (unmask) unmask();
      unmask = null;
    }

    // Measured from the resting layout (offsetTop and offsetLeft ignore the transforms)
    function measure() {
      gap = Math.max(0, headline.offsetTop - (lede.offsetTop + lede.offsetHeight));
      // How far the pair has to move for its middle to reach the window's middle. The pull keeps
      // its middle where it is, so that's halfway between the sentence's top and the headline's
      // bottom, and halfway across the space they sit in.
      var style = getComputedStyle(intro);
      var left = intro.offsetLeft + parseFloat(style.paddingLeft);
      var right = intro.offsetLeft + intro.offsetWidth - parseFloat(style.paddingRight);
      var top = intro.offsetTop + lede.offsetTop;
      var bottom = intro.offsetTop + headline.offsetTop + headline.offsetHeight;
      toCentre.x = window.innerWidth / 2 - (left + right) / 2;
      toCentre.y = window.innerHeight / 2 - (top + bottom) / 2;
      travel = -1;
    }

    // The row slides in steps, one panel at a time in the middle of the window. Only that panel is
    // the size of the window; the others stay small (--box 0 to 1 on each, styles.css). Distances
    // in px of scrolling: first the row slides until the first panel fills the window (as far as
    // that panel is from the start, so the row keeps pace with the scroll), then each panel
    // stays a moment (HOLD) before handing over to the next (MOVE): it shrinks away to the left
    // as the next grows in from the right.
    var boxes = row ? Array.prototype.slice.call(row.querySelectorAll(".home-method")) : [];
    // Each panel's description gets the same letter-by-letter lighting as the paragraph under
    // "Three Methods": it lights up once its panel fills the window, and dims again as the panel
    // shrinks away, over SWEEP ms either way
    var panelTexts = boxes.map(function (box) {
      return { letters: splitLetters(box.querySelector(".home-method-text")), lit: 0 };
    });
    var slide = { start: 0, step: 0, hold: 0, move: 0, gap: 0 };
    var CLEAR = 270;  // px from the window's left where a panel's text may start: past the sidebar's fade
    var GLIDE = 110;  // ms the row takes to catch most of the way up with the scroll
    var shown = null, shownAt = 0, jump = true;  // where the row is drawn, eased towards the scroll
    function measureSlide() {
      var space = parseFloat(getComputedStyle(row).columnGap) || 0;
      slide.start = boxes.length ? boxes[0].offsetLeft : 0;
      slide.gap = space;
      slide.step = 0.22 * window.innerWidth + space;  // a small panel and the gap after it
      slide.hold = 0.4 * window.innerHeight;
      slide.move = 1.8 * window.innerHeight;  // a slow handover: almost two windows of scrolling
      travel = slide.start + Math.max(0, boxes.length - 1) * (slide.hold + slide.move) + slide.hold;
      next.style.height = (window.innerHeight + travel) + "px";
    }

    // Where the row is and how big each panel is, after scrolling `at` px into the slide
    function place(at) {
      var sizes = boxes.map(function () { return 0; });
      var x;
      if (at < slide.start) {
        var t = ease(at / slide.start);
        x = t * slide.start;
        sizes[0] = t;
      } else {
        var rest = at - slide.start, each = slide.hold + slide.move;
        var i = Math.min(Math.floor(rest / each), boxes.length - 1);
        var into = rest - i * each;
        if (i >= boxes.length - 1 || into < slide.hold) {
          x = slide.start + i * slide.step;
          sizes[i] = 1;
        } else {
          var handover = ease((into - slide.hold) / slide.move);
          x = slide.start + (i + handover) * slide.step;
          sizes[i] = 1 - handover;
          sizes[i + 1] = handover;
        }
      }
      return { x: x, sizes: sizes };
    }

    function update() {
      frame = 0;
      var on = wide.matches && !still;
      root.classList.toggle("home-scroll", on);
      if (!on) {
        remask();
        holdUntil = 0;
        textGone = null;
        slideBegun = null;
        lastY = null;
        heldPanel = -1;
        lit = 0;
        root.classList.remove("home-tokenz-out", "home-text-out", "home-covered", "home-methods-in");
        if (heroBackground) heroBackground.hold(false);
        ["--grow", "--pull", "--edge", "--shift-x", "--shift-y", "--cover", "--sheet"].forEach(function (name) { root.style.removeProperty(name); });
        if (copy) copy.remove();
        if (navCopy) navCopy.remove();
        if (next) next.style.height = "";
        if (row) row.style.transform = "";
        boxes.forEach(function (box) { box.style.removeProperty("--box"); box.style.removeProperty("--clear"); });
        travel = -1;
        jump = true;
        light(null);
        panelTexts.forEach(function (text) {
          lightLetters(text.letters, null);
          text.lit = 0;
        });
        copy = navCopy = null;
        return;
      }
      // The sidebar's white copy, for where the gradient is behind it: never clicked or focused,
      // and hidden from screen readers, so the real sidebar underneath does all of that
      if (!navCopy && nav) {
        navCopy = nav.cloneNode(true);
        navCopy.classList.add("nav-copy");
        navCopy.setAttribute("aria-hidden", "true");
        navCopy.inert = true;
        nav.after(navCopy);
      }
      // Made from the plain text: at the top the box doesn't reach the text, so the copy is hidden
      // while the page's own text plays its entrance
      if (!copy && intro && panel) {
        copy = intro.cloneNode(true);
        copy.classList.add("is-copy");
        copy.setAttribute("aria-hidden", "true");
        panel.append(copy);
      }
      var y = window.scrollY, distance = window.innerHeight;
      // A little past the full window, the sentence and headline mask out line by line, and come
      // back the same way when scrolling up
      var gate = 1.2 * distance;
      if (holding() && Math.abs(y - holdAt) > 1) {
        window.scrollTo({ top: holdAt, behavior: "instant" });
        y = holdAt;
      }
      var gone = holding() ? textGone : y > gate;
      if (textGone !== null && gone !== textGone) {
        hold(gone ? gate + 1 : gate - 1);
        y = holdAt;
      }
      textGone = gone;
      if (next) {
        var slideStart = next.offsetTop;
        var begun = holding() ? slideBegun : y > slideStart;
        if (slideBegun !== null && begun !== slideBegun) {
          hold(begun ? slideStart + 1 : slideStart - 1, begun ? Math.max(SWEEP, titleReadyAt - Date.now()) : SWEEP);
          y = holdAt;
        }
        slideBegun = begun;
        // And at each panel: arriving at the point where it fills the window (from either side),
        // the page holds there until its description has lit up, then lets the scroll carry on
        if (row && boxes.length && !holding() && lastY != null) {
          if (travel < 0) measureSlide();
          var was = lastY - slideStart, now = y - slideStart, each = slide.hold + slide.move;
          for (var p = 0; p < boxes.length; p++) {
            var full = slide.start + p * each;
            var till = p === boxes.length - 1 ? travel : full + slide.hold;
            var stopAt = now > was && was < full && now >= full ? full + 1
              : now < was && was > till && now <= till ? till - 1 : null;
            if (stopAt != null && panelTexts[p].lit < 1) {
              hold(slideStart + stopAt, 3000);  // released as soon as the text is lit, below
              heldPanel = p;
              y = holdAt;
              break;
            }
          }
        }
        lastY = y;
      }
      root.classList.toggle("home-tokenz-out", y > 4);
      // The box starts growing once TOKENZ is on its way out
      var grow = ease(clamp((y - 0.12 * distance) / (0.88 * distance)));
      root.style.setProperty("--grow", grow.toFixed(4));
      // The gradient's left edge, matching the panel's clip (60% of the window, shrinking to 0)
      root.style.setProperty("--edge", (0.6 * window.innerWidth * (1 - grow)).toFixed(1) + "px");
      // Each moves 47% of the gap, so they end close but not touching, and together they move to
      // the middle of the window
      root.style.setProperty("--pull", (grow * gap * 0.47).toFixed(1) + "px");
      root.style.setProperty("--shift-x", (grow * toCentre.x).toFixed(1) + "px");
      root.style.setProperty("--shift-y", (grow * toCentre.y).toFixed(1) + "px");
      if (gone && !unmask && copy) unmask = maskCopy();
      root.classList.toggle("home-text-out", gone);
      // The white page's top edge in the window, where the sidebar turns dark again
      if (next) {
        var nextTop = next.getBoundingClientRect().top;
        var cover = Math.min(window.innerHeight, Math.max(0, nextTop));
        root.style.setProperty("--cover", cover.toFixed(1) + "px");
        root.style.setProperty("--sheet", (1 - cover / window.innerHeight).toFixed(4));
        // Once it fills the window, nothing is left behind it, so the bounce at the end of the
        // page shows white too
        root.classList.toggle("home-covered", cover < 1);
        // and the big gradient stops drawing while it can't be seen
        if (heroBackground) heroBackground.hold(cover < 1);
        // "Three Methods" rises in from its mask once the white page is most of the way up
        var titleIn = cover < 0.4 * window.innerHeight;
        if (titleIn && !root.classList.contains("home-methods-in")) titleReadyAt = Date.now() + (titleLetters - 1) * STEP + RISE;
        root.classList.toggle("home-methods-in", titleIn);
        // Once it's at the top, the row of methods slides left as the page scrolls on, bringing
        // each panel to the middle in turn (place, above)
        if (row && track && boxes.length) {
          if (travel < 0) measureSlide();
          // The row follows the scroll with a short ease (like GSAP's scrub), so the steps of a
          // mouse wheel blend into one smooth glide. It keeps asking for frames until it catches up
          var target = Math.min(travel, Math.max(0, -nextTop));
          var now = performance.now();
          if (shown == null || jump) shown = target;
          // (time since the last frame, capped, so the first frame after a rest still eases)
          else shown += (target - shown) * (1 - Math.exp(-Math.min(now - shownAt, 34) / GLIDE));
          if (Math.abs(target - shown) < 0.5) shown = target;
          shownAt = now;
          jump = false;
          if (shown !== target) soon();
          var spot = place(shown);
          row.style.transform = "translate3d(" + (-spot.x).toFixed(2) + "px, 0, 0)";
          // Each panel's left edge in the window, worked out from the sizes (no measuring). Where it
          // reaches under the sidebar, its contents move right by that much (--clear), so they
          // start just past the sidebar's fade instead of hiding under it
          var small = 0.22 * window.innerWidth, big = window.innerWidth, edge = slide.start - spot.x;
          boxes.forEach(function (box, i) {
            var width = small + (big - small) * spot.sizes[i];
            var clear = Math.min(Math.max(0, CLEAR - edge), width / 2);
            box.style.setProperty("--box", spot.sizes[i].toFixed(4));
            box.style.setProperty("--clear", clear.toFixed(2) + "px");
            edge += width + slide.gap;
          });
          // The paragraph sweeps to lit once the slide has begun, and back to dim before it,
          // over SWEEP ms whatever the scroll does
          var nowMs = performance.now();
          var goal = slideBegun ? 1 : 0;
          var stepBy = Math.min(nowMs - litAt, 34) / SWEEP;
          lit = goal > lit ? Math.min(goal, lit + stepBy) : Math.max(goal, lit - stepBy);
          litAt = nowMs;
          if (lit !== goal) soon();
          light(lit);
          panelTexts.forEach(function (text, i) {
            // Lights up only once the panel fills the window; dims as soon as it starts to shrink
            var want = spot.sizes[i] > 0.995 ? 1 : 0;
            text.lit = want > text.lit ? Math.min(want, text.lit + stepBy) : Math.max(want, text.lit - stepBy);
            if (text.lit !== want) soon();
            if (heldPanel === i && text.lit >= 1) {
              holdUntil = 0;
              heldPanel = -1;
            }
            lightLetters(text.letters, text.lit);
          });
        }
      }
    }

    function soon() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    measure();
    update();
    if (document.fonts) document.fonts.ready.then(function () { measure(); soon(); });
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("wheel", stopWhileHolding, { passive: false });
    window.addEventListener("touchmove", stopWhileHolding, { passive: false });
    window.addEventListener("resize", function () { remask(); measure(); jump = true; soon(); });
    if (wide.addEventListener) wide.addEventListener("change", function () { remask(); measure(); soon(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    scrollEffect();
    mountMethodBackgrounds();
    if (!root.classList.contains("intro-play")) {
      mountBackground();
      return start(REVISIT);
    }
    var watch = new MutationObserver(function () {
      if (root.classList.contains("intro-play")) return;
      watch.disconnect();
      mountBackground();
      start(AFTER_INTRO);
    });
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
  });
})();
