// Home. Loaded in <head> without defer, so the headline and sentence can be hidden before the
// first paint; everything else waits for the page.
//
// - The Grainient background: on wider screens it fills the whole window from the start, with
//   the sentence and headline in white in the middle of it (no box, no TOKENZ); on narrow screens
//   and with reduced motion it fills the rounded panel on the right, with TOKENZ in it. On a first
//   visit it waits for the intro to finish, so its own bloom from the middle is seen rather than
//   hidden under the intro's cover. Without WebGL2 it just stays plain.
// - The sentence, then the headline, rise into place line by line from behind a mask: the text
//   mask animation from olivierlarose/text-mask-animation (each line slides up from 100%, 0.75s,
//   ease [0.33, 1, 0.68, 1], 0.075s apart). It starts a quarter of a second after the intro uncovers the
//   page, or straight away on a later visit. People who prefer less motion just see the text.
// - Scrolling (wider screens, not for reduced motion): a little way down, the sentence and
//   headline mask out line by line, like their entrance played backwards. Then a white page
//   scrolls up over the gradient, and the sidebar turns dark again where it covers it. Then it
//   holds still while its title and the three methods slide past sideways (the horizontal
//   section from olivierlarose.com). All of it follows the scroll, both ways.
(function () {
  var root = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STEP = 75;          // ms between lines
  var RISE = 750;         // ms for one line
  var AFTER_INTRO = 250;  // ms to wait once the intro has uncovered the page
  var REVISIT = 150;      // ms to wait when there's no intro

  if (!still) root.classList.add("home-text-waiting");

  // Arriving from another page through the page switch (page-transition.js), Home's text waits
  // under the switch's black cover and only rises in as it leaves (ARRIVE ms in), all together:
  // the sentence and headline line by line, and TOKENZ letter by letter (home-arriving holds
  // its letters down, styles.css)
  var ARRIVE = 1200;
  // The gradient box comes in a little before that (BOX_ARRIVE ms in), just as the new page
  // starts to show under the cover, so it's already there as the box grows, like the other
  // pages' content (home-box-waiting, styles.css)
  var BOX_ARRIVE = 800;
  var arriveAt = 0, boxAt = 0;
  window.addEventListener("pagereveal", function (event) {
    if (still || !event.viewTransition) return;
    arriveAt = performance.now() + ARRIVE;
    boxAt = performance.now() + BOX_ARRIVE;
    root.classList.add("home-arriving", "home-box-waiting");
    setTimeout(function () { root.classList.remove("home-arriving"); }, ARRIVE);
    setTimeout(function () { root.classList.remove("home-box-waiting"); }, BOX_ARRIVE);
    // The gradient box fades in, its gradient blooming from the middle as on a first visit: if
    // it's already up, it's taken down and put up again then
    if (heroBackground) {
      heroBackground.destroy();
      heroBackground = null;
      var panel = document.querySelector(".home-panel");
      if (panel) panel.classList.remove("is-lit");
      setTimeout(mountBackground, BOX_ARRIVE);
    }
    // Back on Home from the browser's memory (the Back button), its text was already in: down
    // behind the masks again (at once), and in again as the cover leaves
    if (root.classList.contains("home-text-on")) {
      root.classList.remove("home-text-on");
      setTimeout(function () {
        try { reveal(); } catch (e) { root.classList.add("home-text-on"); }
      }, ARRIVE);
    }
  });

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

  // Each panel's gradient, by its class, so the scroll effect can pause the last one once the
  // black has closed over it
  var methodBackgrounds = {};

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
      methodBackgrounds[name] = background;
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

  // The sentence as plain text, even while it's split into masked lines (the lines sit side by
  // side with no space between them, so their text is joined back with one)
  function plainText(block) {
    var lines = block.querySelectorAll(".mask-line");
    if (!lines.length) return block.textContent;
    return Array.prototype.map.call(lines, function (line) { return line.textContent.trim(); }).join(" ");
  }

  // One mask per line, with the line inside it ready to rise; returns the risers. If the sentence
  // is still split from an earlier rise (a fast scroll can start the exit before the entrance has
  // finished), it goes back to plain text first, so the lines are measured on the real sentence
  function maskSentence(block) {
    var original = plainText(block);
    block.textContent = original;
    block.classList.remove("is-masked");
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
    // (a restore only undoes its own masks, not a newer split made since)
    var restore = function () {
      if (block.maskedBy !== restore) return;
      block.maskedBy = null;
      block.textContent = original;
      block.classList.remove("is-masked");
    };
    block.maskedBy = restore;
    return { risers: risers, restore: restore };
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
    // The white copy over the gradient (the scroll effect's) rises in the same way, at the same
    // time: with the gradient filling the window from the start, it's the one that shows
    var copyBlock = document.querySelector(".home-intro.is-copy");
    var copySentence = null;
    if (copyBlock) {
      copySentence = maskSentence(copyBlock.querySelector(".home-lede"));
      copySentence.risers.concat(maskHeadline(copyBlock.querySelector(".home-headline"))).forEach(function (inner, i) {
        inner.style.transitionDelay = (i * STEP) + "ms";
      });
    }
    root.classList.remove("home-text-waiting");
    // Next frame, so the lines are drawn below their masks before they move
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add("home-text-on"); });
    });
    // Once every line is in, the sentence goes back to plain text, so it rewraps on resize
    setTimeout(function () {
      sentence.restore();
      // (not if it's already leaving: its exit has masks of its own then)
      if (copySentence && !root.classList.contains("home-text-out")) copySentence.restore();
    }, (risers.length - 1) * STEP + RISE + 100);
  }

  // The gradient, but not while the page switch's cover is still over Home (see BOX_ARRIVE)
  function mountWhenArrived() {
    var wait = boxAt - performance.now();
    if (wait > 0) return setTimeout(mountWhenArrived, wait);
    if (!heroBackground) mountBackground();
  }

  function start(delay) {
    if (still) return;
    // Lines are measured in the real font, so wait for it
    var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(function () {
      setTimeout(function go() {
        var wait = arriveAt - performance.now();
        if (wait > 0) return setTimeout(go, wait);
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
    // "What We Measure", and the black page that comes up over it once it's done
    var end = document.querySelector(".home-end");
    var endCover = document.querySelector(".home-cover");
    var faqList = endCover ? endCover.querySelector(".faq-list") : null;
    var faqWord = endCover ? endCover.querySelector(".faq-scroll") : null;
    var faqLine = endCover ? endCover.querySelector(".faq-line") : null;
    var compareLink = endCover ? endCover.querySelector(".faq-word.is-compare") : null;
    // The measures, one at a time (after nickho-motorsports.nl's story section): see styles.css
    var measureItems = end ? Array.prototype.slice.call(end.querySelectorAll(".measure-item")) : [];
    var measureNow = end ? end.querySelector(".measure-count-now") : null;
    var MEASURE_STEP = 1.2;  // windows of scrolling from one measure to the next
    var MEASURE_TAIL = 0.8;  // windows of scrolling with the last one shown, before the white comes
    var MEASURE_WIPE = 1.2;  // windows of scrolling for the white half circle to fill the window
    var measureWipe = end ? end.querySelector(".measure-wipe") : null;
    var measureAt = null, measureAtTime = 0;  // which measure is in the middle (0 to 3), eased
    var activeMeasure = -1, playedMeasure = -1;
    var BAR = 2, BAR_GAP = 7;  // px: each bar's width, and the space between them
    var barsFor = "", barsAt = -1;
    var lastBarsUp = -1, toCompare = 0;  // the bars last frame; the wait before going to Compare

    // The bars between the page's left edge and the word, level with its capitals. Each grows a
    // little taller than the one before (easing in, so the rise speeds up towards the word); made
    // again only if the room or the word's size has changed
    function layBars() {
      var word = faqWord.getBoundingClientRect();
      var box = faqLine.offsetParent.getBoundingClientRect();
      var size = parseFloat(getComputedStyle(faqWord).fontSize);
      var cap = 0.727 * size;  // Inter's capitals are about 0.727 of the font size tall
      var left = 218, right = word.left - box.left - 32;
      faqLine.style.top = (word.top + word.height / 2 - box.top - cap / 2).toFixed(1) + "px";
      faqLine.style.height = cap.toFixed(1) + "px";
      var key = Math.round(right) + "/" + Math.round(cap);
      if (key === barsFor) return;
      barsFor = key;
      barsAt = -1;
      var count = Math.max(2, Math.floor((right - left + BAR_GAP) / (BAR + BAR_GAP)));
      faqLine.textContent = "";
      for (var i = 0; i < count; i++) {
        var t = i / (count - 1);
        var bar = make("span", "faq-bar");
        bar.style.height = (6 + (cap - 6) * Math.pow(t, 1.6)).toFixed(1) + "px";
        faqLine.append(bar);
      }
    }

    // `progress` 0 to 1 along the row: each bar rises over a short stretch of it, one after
    // another from the left, the last one full at 1
    function growBars(progress) {
      if (!faqLine || progress === barsAt) return;
      barsAt = progress;
      var bars = faqLine.children, count = bars.length, SPAN = 0.15;
      for (var i = 0; i < count; i++) {
        var t = count > 1 ? i / (count - 1) : 1;
        var up = clamp((progress * (1 + SPAN) - t) / SPAN);
        bars[i].style.transform = "scaleY(" + up.toFixed(3) + ")";
      }
    }
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
    var GROW_TIME = 850;  // ms: the quickest the box may grow the whole way
    var growShown = null, growAt = 0;

    function holding() { return Date.now() < holdUntil; }

    // ms: how long to hold; by default, as long as the first screen's text takes to mask out
    function hold(at, ms) {
      var lines = copy ? copy.querySelectorAll(".mask-rise").length : 1;
      holdAt = at;
      holdUntil = Date.now() + (ms == null ? (lines - 1) * STEP + RISE : ms);
      window.scrollTo({ top: at, behavior: "instant" });
    }

    // All the Three Methods text follows the scroll: scrolling down plays it forward, scrolling
    // up plays it backward, and stopping stops it. Nothing in it is timed, and the page never
    // holds for it. "Three Methods" rises letter by letter, the paragraph and each panel's
    // description light up letter by letter, and the last panel's text drops out line by line.
    var titleLetters = Array.prototype.slice.call(document.querySelectorAll(".home-next-letter"));
    var textY = null, textYAt = 0;  // the scroll, eased like the row's glide so wheel steps blend

    // Where a staggered piece is, 0 to 1: the whole run takes `progress` 0 to 1, each piece
    // starting `gap` (as a share of one piece's own time) after the one before
    function staggered(progress, i, count, gap) {
      var total = 1 + gap * (count - 1);
      return clamp(progress * total - i * gap);
    }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function stopWhileHolding(event) {
      if (holding()) event.preventDefault();
    }

    // From where the FAQ locks to the end of the page, the wheel drags: each turn moves the page
    // DRAG as far as usual while "SCROLL" grows, and DRAG_BARS while the bars fill, so both take
    // more effort, the bars most
    var DRAG = 0.4, DRAG_BARS = 0.15;
    function wheel(event) {
      if (holding()) { event.preventDefault(); return; }
      if (!endCover || !root.classList.contains("home-scroll") || event.ctrlKey) return;
      if (window.scrollY < endCover.offsetTop) return;
      var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      // (the bars start a window past the lock, once "SCROLL" is full size)
      var drag = window.scrollY - endCover.offsetTop >= window.innerHeight ? DRAG_BARS : DRAG;
      event.preventDefault();
      window.scrollBy({ top: event.deltaY * unit * drag, behavior: "instant" });
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
      // (a little above the middle, 6% of the window, so it sits clear of "Scroll" below)
      toCentre.y = window.innerHeight / 2 - 0.06 * window.innerHeight - (top + bottom) / 2;
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
    // "Three Methods": it lights up as its panel comes to fill the window, and dims again as the
    // panel shrinks away, following the scroll
    var panelTexts = boxes.map(function (box) {
      return { letters: splitLetters(box.querySelector(".home-method-text")) };
    });
    // The last panel's text leaves once the slide is over, the way the first screen's text does:
    // each line drops out of sight behind a mask, top to bottom, following the scroll
    var lastBox = boxes[boxes.length - 1];
    var exits = lastBox ? maskPanel(lastBox) : [];
    var exitLines = -1;  // how many lines the exits fall into; worked out again after a resize
    // The FAQ: when it locks in the middle of the window, the page holds for a moment
    // (FAQ_HOLD ms) before "SCROLL" starts to grow
    var FAQ_HOLD = 1250;
    var faqLocked = null;

    function maskPanel(box) {
      var risers = [];
      function wrap(mask, nodes) {
        var inner = make("span", "panel-rise");
        nodes.forEach(function (node) { inner.append(node); });
        mask.classList.add("panel-mask");
        mask.append(inner);
        risers.push(inner);
      }
      box.querySelectorAll(".home-method-top > span").forEach(function (part) {
        wrap(part, Array.prototype.slice.call(part.childNodes));
      });
      var name = box.querySelector(".home-method-name");
      if (name) {
        var mask = make("span", "");
        wrap(mask, Array.prototype.slice.call(name.childNodes));
        name.append(mask);
      }
      // The description is already in letters for its lighting; each word is masked
      box.querySelectorAll(".home-method-text .home-next-word").forEach(function (word) {
        wrap(word, Array.prototype.slice.call(word.childNodes));
      });
      return risers;
    }

    // Which line each exit is on, as the browser wrapped them (offsetTop ignores transforms,
    // so this works whatever size the panel is drawn at)
    function lineExits() {
      var line = -1, lineTop = null, lineBlock = null;
      exits.forEach(function (inner) {
        var mask = inner.parentNode;
        var block = mask.closest(".home-method-top, .home-method-body");
        var top = mask.offsetTop;
        if (block !== lineBlock || Math.abs(top - lineTop) > 4) { line++; lineTop = top; lineBlock = block; }
        inner.line = line;
      });
      exitLines = line + 1;
    }

    function dropExits(progress) {
      if (exitLines < 0) lineExits();
      exits.forEach(function (inner) {
        var value = progress == null ? "" : "translateY(" + (135 * easeOutCubic(staggered(progress, inner.line, exitLines, 0.12))).toFixed(2) + "%)";
        if (inner.drop !== value) inner.style.transform = inner.drop = value;
      });
    }

    function riseTitle(progress) {
      titleLetters.forEach(function (letter, i) {
        var value = progress == null ? "" : "translateY(" + (135 * (1 - easeOutCubic(staggered(progress, i, titleLetters.length, 0.1)))).toFixed(2) + "%)";
        if (letter.risen !== value) letter.style.transform = letter.risen = value;
      });
    }

    // After the last panel the page stays put for one more stretch (TAIL): its text leaves
    // (above), then the purple turns black square by square, in a random order, until the whole
    // window is black (a pixel transition), and only then does the black's bottom edge come up
    // with "What We Measure" under it
    var pixels = document.querySelector(".home-pixels");
    var grid = { width: 0, height: 0, size: 0, cols: 0, cells: [], drawn: -1 };

    // Squares about 1/24 of the window wide, each with its own point (0 to 1) where it turns black
    function layPixels() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      grid.width = window.innerWidth;
      grid.height = window.innerHeight;
      grid.size = Math.ceil(grid.width / 24);
      grid.cols = Math.ceil(grid.width / grid.size);
      var count = grid.cols * Math.ceil(grid.height / grid.size);
      grid.cells = [];
      for (var c = 0; c < count; c++) grid.cells.push(Math.random() * 0.97);
      pixels.width = Math.round(grid.width * dpr);
      pixels.height = Math.round(grid.height * dpr);
      pixels.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      grid.drawn = -1;
    }

    // Draws every square whose point is behind `progress`; only redrawn when it changes
    function drawPixels(progress) {
      if (!pixels) return;
      if (grid.width !== window.innerWidth || grid.height !== window.innerHeight) layPixels();
      if (progress === grid.drawn) return;
      grid.drawn = progress;
      var context = pixels.getContext("2d");
      context.clearRect(0, 0, grid.width, grid.height);
      context.fillStyle = "#000000";
      if (progress >= 1) { context.fillRect(0, 0, grid.width, grid.height); return; }
      grid.cells.forEach(function (point, i) {
        if (point < progress) {
          context.fillRect((i % grid.cols) * grid.size, Math.floor(i / grid.cols) * grid.size, grid.size, grid.size);
        }
      });
    }
    var slide = { start: 0, step: 0, hold: 0, move: 0, gap: 0, tail: 0 };
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
      slide.tail = 2.2 * window.innerHeight;
      travel = slide.start + Math.max(0, boxes.length - 1) * (slide.hold + slide.move) + slide.hold;
      next.style.height = (window.innerHeight + travel + slide.tail) + "px";
      exitLines = -1;  // the text may have rewrapped
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
        growShown = null;
        textY = null;
        faqLocked = null;
        dropExits(null);
        riseTitle(null);
        root.classList.remove("home-tokenz-out", "home-text-out", "home-covered");
        if (heroBackground) heroBackground.hold(false);
        ["--grow", "--pull", "--edge", "--shift-x", "--shift-y", "--cover", "--sheet"].forEach(function (name) { root.style.removeProperty(name); });
        if (copy) copy.remove();
        if (navCopy) navCopy.remove();
        if (next) next.style.height = "";
        if (row) row.style.transform = "";
        boxes.forEach(function (box) { box.style.removeProperty("--box"); box.style.removeProperty("--clear"); });
        if (pixels) drawPixels(0);
        root.style.removeProperty("--dark");
        root.classList.remove("home-dark");
        if (end) end.style.removeProperty("top");
        if (end) end.style.removeProperty("height");
        if (measureWipe) measureWipe.style.removeProperty("--wipe");
        root.classList.remove("home-wipe");
        ["--wipe-r", "--wipe-x", "--wipe-y"].forEach(function (name) { root.style.removeProperty(name); });
        measureItems.forEach(function (item) {
          item.classList.remove("is-active");
          item.style.removeProperty("--y");
          item.style.removeProperty("--o");
        });
        measureAt = null;
        activeMeasure = playedMeasure = -1;
        root.style.removeProperty("--bury");
        root.style.removeProperty("--outro");
        root.style.removeProperty("--outro-max");
        root.classList.remove("home-compare");
        growBars(0);
        lastBarsUp = -1;
        if (toCompare) clearTimeout(toCompare);
        toCompare = 0;
        if (methodBackgrounds["is-ai"]) methodBackgrounds["is-ai"].hold(false);
        travel = -1;
        jump = true;
        light(null);
        panelTexts.forEach(function (text) { lightLetters(text.letters, null); });
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
      // A quarter of a window down, the sentence and headline mask out line by line, and come
      // back the same way when scrolling up
      var gate = 0.25 * distance;
      if (holding() && Math.abs(y - holdAt) > 1) {
        window.scrollTo({ top: holdAt, behavior: "instant" });
        y = holdAt;
      }
      // How far the box has grown, before easing (0 to 1). It follows the scroll, but never faster
      // than GROW_TIME for the whole way, so a fast scroll still sees it grow
      // (the gradient fills the window from the start now: there's no box to grow)
      var growTo = 1;
      var nowGrow = performance.now();
      if (growShown == null) growShown = growTo;
      else {
        var most = Math.min(nowGrow - growAt, 50) / GROW_TIME;
        growShown += Math.max(-most, Math.min(most, growTo - growShown));
      }
      growAt = nowGrow;
      if (growShown !== growTo) soon();
      var gone = holding() ? textGone : y > gate;
      if (textGone !== null && gone !== textGone) {
        // (going down, the hold also waits for the box to finish growing)
        hold(gone ? gate + 1 : gate - 1, gone && growShown < 1 ? (1 - growShown) * GROW_TIME + RISE + 2 * STEP : null);
        y = holdAt;
      }
      textGone = gone;
      if (next) {
        var slideStart = next.offsetTop;
        // Arriving at the FAQ's lock on the way down, the page holds with "SCROLL" still small
        if (end && endCover) {
          var lockAt = endCover.offsetTop;
          var locked = holding() ? faqLocked : y > lockAt;
          if (faqLocked === false && locked) {
            hold(lockAt + 1, FAQ_HOLD);
            y = holdAt;
          }
          faqLocked = locked;
        }
      }
      root.classList.toggle("home-tokenz-out", y > 4);
      // The box starts growing once TOKENZ is on its way out
      var grow = ease(growShown);
      root.style.setProperty("--grow", grow.toFixed(4));
      // The gradient's left edge, matching the panel's clip (60% of the window, shrinking to 0)
      root.style.setProperty("--edge", (0.6 * window.innerWidth * (1 - grow)).toFixed(1) + "px");
      // Each moves 47% of the gap, so they end close but not touching, and together they move to
      // the middle of the window
      root.style.setProperty("--pull", (grow * gap * 0.47).toFixed(1) + "px");
      root.style.setProperty("--shift-x", (grow * toCentre.x).toFixed(1) + "px");
      root.style.setProperty("--shift-y", (grow * toCentre.y).toFixed(1) + "px");
      // The text masks out once the box fills the window
      var textOut = gone && growShown >= 1;
      if (textOut && !unmask && copy) unmask = maskCopy();
      root.classList.toggle("home-text-out", textOut);
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
        // The scroll, eased the same way as the row below, for the text that plays before the
        // row moves
        var H0 = window.innerHeight;
        var nowText = performance.now();
        if (textY == null || jump) textY = y;
        else textY += (y - textY) * (1 - Math.exp(-Math.min(nowText - textYAt, 34) / GLIDE));
        if (Math.abs(y - textY) < 0.5) textY = y;
        textYAt = nowText;
        if (textY !== y) soon();
        var intoNext = textY - next.offsetTop;  // 0 once the white page has reached the top
        // "Three Methods" rises out of its mask, letter by letter, while the white page comes up
        // the last 60% of the window
        riseTitle(clamp((intoNext + 0.6 * H0) / (0.45 * H0)));
        // Then the paragraph under it lights up, letter by letter, from when the white page is a
        // fifth of a window from the top until the row has slid a third of a window
        light(clamp((intoNext + 0.2 * H0) / (0.55 * H0)));
        // Once it's at the top, the row of methods slides left as the page scrolls on, bringing
        // each panel to the middle in turn (place, above)
        if (row && track && boxes.length) {
          if (travel < 0) measureSlide();
          // The row follows the scroll with a short ease (like GSAP's scrub), so the steps of a
          // mouse wheel blend into one smooth glide. It keeps asking for frames until it catches up
          var target = Math.min(travel + slide.tail, Math.max(0, -nextTop));
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
          // The black squares come in over the tail, from a third of a window in to its last half
          // window, which is all black; the purple under them stops drawing once it's covered
          var H = window.innerHeight;
          var black = Math.round(clamp((shown - travel - 0.35 * H) / (1.35 * H)) * 1000) / 1000;
          drawPixels(black);
          // and the white fade behind the sidebar goes with it (--dark), the sidebar turning white
          // once the window is more black than purple
          root.style.setProperty("--dark", black);
          root.classList.toggle("home-dark", black > 0.5);
          if (methodBackgrounds["is-ai"]) methodBackgrounds["is-ai"].hold(black >= 1);
          // Each panel's description lights up over the last part of its panel growing in and the
          // stretch it fills the window, and dims again as it shrinks away
          var each = slide.hold + slide.move, lead = 0.4 * slide.move;
          panelTexts.forEach(function (text, i) {
            var full = slide.start + i * each;
            var lighting = clamp((shown - (full - lead)) / (lead + slide.hold));
            var dimming = i === boxes.length - 1 ? 0 : clamp((shown - full - slide.hold) / lead);
            lightLetters(text.letters, lighting * (1 - dimming));
          });
          // Just past the last panel, its text drops out line by line, over a third of a window
          dropExits(clamp((shown - travel - 0.02 * H) / (0.3 * H)));
        }
        // "What We Measure" locks in place once its end is in the window (sticky, pinned by its
        // bottom), and the next black page slides up over it; the measures dim and blur under it
        // (--bury 0 to 1, styles.css)
        if (end && endCover) {
          if (measureItems.length) placeMeasures();
          end.style.top = Math.min(0, window.innerHeight - end.offsetHeight) + "px";
          var coverTop = endCover.getBoundingClientRect().top;
          root.style.setProperty("--bury", clamp(1 - coverTop / window.innerHeight).toFixed(4));
          // Then the FAQ locks in the middle of the window. Over the next window "SCROLL" grows
          // from small in the corner to big (--outro 0 to 1, styles.css), and over the last one
          // the bars grow in under it, left to right
          var pastLock = Math.max(0, -coverTop);
          var outro = clamp(pastLock / window.innerHeight);
          root.style.setProperty("--outro", outro.toFixed(4));
          // At its biggest it's 9% of the window wide, and never closer than 48px to the last
          // question (or an open answer): its letters are about 0.8 of its size tall
          if (faqList) {
            // (where the list's bottom will be once the FAQ has locked at the top)
            var listBottom = faqList.getBoundingClientRect().bottom - Math.max(0, coverTop);
            var below = window.innerHeight - 28 - listBottom - 48;
            var biggest = Math.max(13, Math.min(0.09 * window.innerWidth, below / 0.8));
            root.style.setProperty("--outro-max", biggest.toFixed(1) + "px");
          }
          // Once it's done growing, a row of thin bars like the wake slider's grows in with the
          // scroll from the left to just short of it, small to big, the last as tall as its S.
          // As soon as the bars begin, "SCROLL" masks out downwards and "COMPARE" comes down in
          // its place (home-compare, styles.css)
          if (faqWord && faqLine) {
            // (over two windows of scrolling, so the row takes its time)
            var barsUp = clamp((pastLock - window.innerHeight) / (2 * window.innerHeight));
            if (barsUp > 0.995) barsUp = 1;  // the page's last pixel of scroll can fall a hair short
            if (outro >= 1) layBars();
            growBars(outro >= 1 ? barsUp : 0);
            var comparing = barsUp > 0;
            root.classList.toggle("home-compare", comparing);
            // (the link can only be tabbed to while it's showing)
            if (compareLink) compareLink.tabIndex = comparing ? 0 : -1;
            // When the last bar reaches COMPARE, on the way down, the page goes on to Compare, a
            // moment later so the row is seen full. Scrolling back before then stays
            if (barsUp >= 1 && lastBarsUp < 1 && lastBarsUp >= 0 && compareLink && !toCompare) {
              toCompare = setTimeout(function () {
                if (window.TokenzTransition) window.TokenzTransition.go(compareLink.href);
                else window.location.assign(compareLink.href);
              }, 250);
            } else if (barsUp < 1 && toCompare) {
              clearTimeout(toCompare);
              toCompare = 0;
            }
            lastBarsUp = barsUp;
          }
        }
      }
    }

    // What We Measure is a window, then MEASURE_STEP windows per measure after the first, then a
    // little more with the last one shown, all of it pinned in the window. The drawings stand in
    // a column that moves up with the scroll (--y), the one in the middle bright and the rest
    // dimmed (--o). The one nearest the middle is the current one (is-active): its name and
    // description show, decrypting in as it takes over, and the counter shows its number
    function placeMeasures() {
      var H = window.innerHeight, count = measureItems.length;
      end.style.height = Math.round(H * (1 + MEASURE_STEP * (count - 1) + MEASURE_TAIL + MEASURE_WIPE)) + "px";
      var top = end.getBoundingClientRect().top;
      // Then a white half circle rises from the middle of the bottom edge and grows until the
      // whole window is white (--wipe 0 to 1 scales it to just past the farthest corner)
      var W = window.innerWidth;
      var wipe = clamp((-top - (MEASURE_STEP * (count - 1) + MEASURE_TAIL) * H) / (MEASURE_WIPE * H));
      var wipeMax = 1.02 * Math.hypot(W / 2, H);
      if (measureWipe) {
        measureWipe.style.setProperty("--wipe-size", (2 * wipeMax).toFixed(0) + "px");
        measureWipe.style.setProperty("--wipe", ease(wipe).toFixed(4));
      }
      // The sidebar stays where it is and changes colour exactly where the white touches it: dark
      // inside the circle, white outside it (home-wipe, styles.css)
      root.classList.toggle("home-wipe", wipe > 0);
      root.style.setProperty("--wipe-r", (ease(wipe) * wipeMax).toFixed(1) + "px");
      root.style.setProperty("--wipe-x", (W / 2).toFixed(1) + "px");
      root.style.setProperty("--wipe-y", H + "px");
      var target = Math.min(count - 1, Math.max(0, -top / (MEASURE_STEP * H)));
      // (with the same short ease as the methods' row, so the steps of a mouse wheel blend)
      var now = performance.now();
      if (measureAt == null) measureAt = target;
      else measureAt += (target - measureAt) * (1 - Math.exp(-Math.min(now - measureAtTime, 34) / GLIDE));
      if (Math.abs(target - measureAt) < 0.001) measureAt = target;
      measureAtTime = now;
      if (measureAt !== target) soon();
      // Square drawings, about 38% of the window tall, well apart: only the edge of the next
      // one shows at the bottom of the window
      var card = Math.min(0.38 * H, 0.24 * window.innerWidth);
      end.style.setProperty("--card", card.toFixed(1) + "px");
      measureItems.forEach(function (item, i) {
        var off = i - measureAt;
        item.style.setProperty("--y", (off * (card + 0.25 * H)).toFixed(1) + "px");
        item.style.setProperty("--o", (1 - 0.8 * Math.min(1, Math.abs(off))).toFixed(3));
      });
      var active = Math.round(measureAt);
      if (active !== activeMeasure) {
        measureItems.forEach(function (item, i) { item.classList.toggle("is-active", i === active); });
        if (measureNow) measureNow.textContent = active + 1;
        activeMeasure = active;
      }
      // Its text decrypts in once the section is coming into the window (and again each time
      // the current measure changes, or the section comes back into view)
      var inView = top < 0.8 * H && top > -end.offsetHeight + 0.2 * H;
      if (!inView) playedMeasure = -1;
      else if (playedMeasure !== active && window.TokenzDecrypt) {
        var item = measureItems[active];
        window.TokenzDecrypt.play(item.querySelector(".measure-name"));
        window.TokenzDecrypt.play(item.querySelector(".measure-text"));
        playedMeasure = active;
      }
    }

    function soon() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    measure();
    update();
    if (document.fonts) document.fonts.ready.then(function () { measure(); soon(); });
    window.addEventListener("scroll", soon, { passive: true });
    // An answer opening or closing changes the room under the questions for "SCROLL"
    if (faqList && window.ResizeObserver) new ResizeObserver(function () { soon(); }).observe(faqList);
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchmove", stopWhileHolding, { passive: false });
    window.addEventListener("resize", function () { remask(); measure(); jump = true; soon(); });
    if (wide.addEventListener) wide.addEventListener("change", function () { remask(); measure(); soon(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    scrollEffect();
    mountMethodBackgrounds();
    if (!root.classList.contains("intro-play")) {
      mountWhenArrived();
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
