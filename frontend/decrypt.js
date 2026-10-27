// "What We Measure" decrypts as you reach it (after React Bits' DecryptedText): each piece of
// text (the title, and each measure's number, name and description) starts as random
// characters, and once it comes into view its real letters settle in from left to right while
// the rest keep shuffling.
// - Each letter keeps the width of the real one while it shuffles, so the lines don't jump or
//   rewrap. Once a piece is done it goes back to plain text.
// - Screen readers get the real text the whole time.
// - With reduced motion, the text is just shown.
(function () {
  var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+=?";
  var LEAD = 300;     // ms of shuffling before the first letter settles
  var SHUFFLE = 50;   // ms between new random characters
  var SPREAD = 1400;  // ms a piece takes to settle, short pieces a little longer per letter
  var pieces = [], running = [], frame = 0;

  function make(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // A random character for this letter, from the ones about as wide as it (picked in prepare)
  function random(span) {
    var pool = span.pool;
    return pool.charAt(Math.floor(Math.random() * pool.length));
  }

  // How wide each character is in this piece's font, in em
  function charWidths(block, size) {
    var probe = make("span", "");
    probe.style.whiteSpace = "pre";
    block.append(probe);
    var widths = {};
    CHARS.split("").forEach(function (letter) {
      probe.textContent = letter;
      widths[letter] = probe.getBoundingClientRect().width / size;
    });
    probe.remove();
    return widths;
  }

  // One span per letter, words kept whole for wrapping. Widths are measured on the real letters
  // and kept in em, so they still fit if the font size changes with the window
  function prepare(block) {
    var text = block.textContent.trim();
    var shown = make("span", "decrypt-shown");
    shown.setAttribute("aria-hidden", "true");
    var letters = [];
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { shown.append(" "); return; }
      var word = make("span", "decrypt-word");
      part.split("").forEach(function (letter) {
        var span = make("span", "decrypt-letter", letter);
        span.real = letter;
        word.append(span);
        letters.push(span);
      });
      shown.append(word);
    });
    block.textContent = "";
    block.append(make("span", "decrypt-label", text), shown);
    var size = parseFloat(getComputedStyle(block).fontSize) || 16;
    var widths = letters.map(function (span) { return span.getBoundingClientRect().width / size; });
    // Each letter only shuffles through characters close to its own width, so a wide M never
    // lands in the slot of a narrow i and spills over its neighbours
    var options = charWidths(block, size);
    var pools = {};
    letters.forEach(function (span, i) {
      var key = widths[i].toFixed(2);
      if (!pools[key]) {
        var fit = CHARS.split("").filter(function (letter) {
          return Math.abs(options[letter] - widths[i]) <= Math.max(0.08, widths[i] * 0.25);
        });
        pools[key] = fit.length > 2 ? fit.join("") : CHARS;
      }
      span.pool = pools[key];
      span.style.width = widths[i].toFixed(4) + "em";
      span.textContent = random(span);
    });
    block.classList.add("is-scrambled");
    return {
      block: block,
      text: text,
      letters: letters,
      step: Math.min(70, Math.max(18, SPREAD / letters.length)),
      startAt: 0,
      shuffledAt: 0
    };
  }

  function tick(now) {
    frame = 0;
    running = running.filter(function (piece) {
      if (!piece.startAt) piece.startAt = now;
      var settled = Math.max(0, Math.floor((now - piece.startAt - LEAD) / piece.step) + 1);
      if (now - piece.startAt < LEAD) settled = 0;
      if (settled >= piece.letters.length) {
        // Done: back to plain text, so it reads and kerns as normal
        piece.block.classList.remove("is-scrambled");
        piece.block.textContent = piece.text;
        return false;
      }
      var shuffle = now - piece.shuffledAt >= SHUFFLE;
      if (shuffle) piece.shuffledAt = now;
      piece.letters.forEach(function (span, i) {
        if (i < settled) {
          if (span.textContent !== span.real) span.textContent = span.real;
        } else if (shuffle) {
          span.textContent = random(span);
        }
      });
      return true;
    });
    if (running.length) frame = requestAnimationFrame(tick);
  }

  function begin(piece) {
    running.push(piece);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function setUp() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var blocks = document.querySelectorAll(".measure-title, .measure-num, .measure-name, .measure-text");
    if (!blocks.length) return;
    pieces = Array.prototype.map.call(blocks, prepare);
    // A piece starts once its top is past the bottom fifth of the window, or if a fast scroll
    // already took it past the window altogether, so none is left scrambled
    var checking = 0;
    function check() {
      checking = 0;
      var line = 0.8 * window.innerHeight;
      pieces = pieces.filter(function (piece) {
        if (piece.block.getBoundingClientRect().top > line) return true;
        begin(piece);
        return false;
      });
      if (!pieces.length) {
        window.removeEventListener("scroll", soon);
        window.removeEventListener("resize", soon);
      }
    }
    function soon() {
      if (!checking) checking = requestAnimationFrame(check);
    }
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    check();
  }

  // The letters are measured, so wait for the fonts
  document.addEventListener("DOMContentLoaded", function () {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);
    else setUp();
  });
})();
