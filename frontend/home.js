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
//   turn white above it, draw closer together and move to the middle of the window. All of it
//   follows the scroll, both ways.
(function () {
  var root = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STEP = 75;          // ms between lines
  var RISE = 750;         // ms for one line
  var AFTER_INTRO = 250;  // ms to wait once the intro has uncovered the page
  var REVISIT = 150;      // ms to wait when there's no intro

  if (!still) root.classList.add("home-text-waiting");

  // is-lit turns the title in the panel white once the gradient is behind it
  function mountBackground() {
    var panel = document.querySelector(".home-panel");
    if (!panel || !window.Grainient) return;
    var background = window.Grainient(panel, {
      colors: ["#120f17", "#2a0f0a", "#9a3412", "#f97316", "#fed7aa"],
      angle: 55,
      speed: 6,
      flow: 1.1,
      silk: 0.35,
      grainAmount: 0.08
    });
    if (background) panel.classList.add("is-lit");
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

  // The headline's two lines are already one span each: give each a mask
  function maskHeadline(block) {
    block.classList.add("is-masked");
    return Array.prototype.map.call(block.children, function (line) {
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
    var gap = 0, frame = 0, copy = null, navCopy = null;
    var toCentre = { x: 0, y: 0 };

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
    }

    function update() {
      frame = 0;
      var on = wide.matches && !still;
      root.classList.toggle("home-scroll", on);
      if (!on) {
        root.classList.remove("home-tokenz-out");
        ["--grow", "--pull", "--edge", "--shift-x", "--shift-y"].forEach(function (name) { root.style.removeProperty(name); });
        if (copy) copy.remove();
        if (navCopy) navCopy.remove();
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
    }

    function soon() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    measure();
    update();
    if (document.fonts) document.fonts.ready.then(function () { measure(); soon(); });
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", function () { measure(); soon(); });
    if (wide.addEventListener) wide.addEventListener("change", function () { measure(); soon(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    scrollEffect();
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
