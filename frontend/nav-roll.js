// The sidebar's links roll on hover (styles.css, .nav-roll): each letter slides up out of its
// mask while a copy of it rises in from below, one letter after another. The letters are drawn
// from a copy hidden from screen readers; the link's real name stays as plain text for them.
// Runs before home.js, so Home's copy of the sidebar has the letters too
(function () {
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    var label = link.getAttribute("data-label") || link.textContent.trim();
    var words = Array.prototype.filter.call(link.childNodes, function (node) {
      return node.nodeType === 3 && node.nodeValue.trim();
    });
    if (!label || !words.length) return;
    var real = document.createElement("span");
    real.className = "nav-roll-label";
    real.textContent = label;
    var roll = document.createElement("span");
    roll.className = "nav-roll";
    roll.setAttribute("aria-hidden", "true");
    label.split("").forEach(function (ch, i) {
      var letter = document.createElement("span");
      letter.className = "nav-roll-ch";
      letter.textContent = ch;
      letter.setAttribute("data-ch", ch);
      letter.style.setProperty("--i", i);
      roll.append(letter);
    });
    words[0].replaceWith(real, roll);
    words.slice(1).forEach(function (node) { node.remove(); });
  });
})();
