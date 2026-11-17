// Liquid glass on Compare and Results: every glass piece gets the same layers as Run (the pasted
// glass button, styles.css .wb-send): bright rims, a dark blurred line inside its lower edge, a
// blurred white glare on two corners and a faint inner ring, all turned up by a contrast layer.
// They go in a layer behind each piece's content (.lg-layer), so the contrast only touches the
// glass, never the text. Pieces drawn later (a result, Results' panels, the bubbles) get theirs
// as they appear, and a piece whose content is replaced gets its layer back.
(function () {
  var PIECES = [
    ".content.workbench .wb",
    ".content.workbench .wb-result",
    ".content.workbench .engine-notice",
    ".content.workbench .wb-composer",
    ".content.workbench .wb-card-plain",
    ".content.workbench .wb-segmented",
    ".content.workbench .wb-history-open",
    ".content.workbench .wb-steps label > span",
    ".content.workbench .wb-secondary",
    ".content.workbench .is-mine .wb-bubble-text",
    ".content.results-page [data-results]",
    ".content.results-page .wb-primary",
    ".content.results-page .is-mine .wb-bubble-text"
  ].join(", ");

  function dress() {
    document.querySelectorAll(PIECES).forEach(function (piece) {
      var first = piece.firstElementChild;
      if (first && first.classList.contains("lg-layer")) return;
      var layer = document.createElement("span");
      layer.className = "lg-layer";
      layer.setAttribute("aria-hidden", "true");
      var glass = document.createElement("span");
      glass.className = "lg-glass";
      var ring = document.createElement("span");
      ring.className = "lg-ring";
      glass.append(ring);
      layer.append(glass);
      piece.prepend(layer);
      piece.classList.add("lg");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    dress();
    new MutationObserver(dress).observe(document.body, { childList: true, subtree: true });
  });
})();
