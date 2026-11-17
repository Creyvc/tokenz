// The moving gradient behind Compare and Results: the method panels' own from Home, copied as
// they are (colours, angle, grain; home.js METHOD_COLORS), only slower, so a whole page of it
// stays calm: Compare has method 1's (NLP, slate), Results method 2's (TF-IDF, teal). The colours
// and angle are on the element (data-colors, data-angle). It doesn't follow the pointer, so it
// stays quiet behind the controls. Without WebGL2 the element keeps a still CSS gradient.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var el = document.querySelector("[data-page-bg]");
    if (!el || !window.Grainient) return;
    var background = window.Grainient(el, {
      colors: el.dataset.colors.split(","),
      angle: Number(el.dataset.angle) || 55,
      // The panels on Home run at speed 16 and flow 2.6; this is well under half that
      speed: 6,
      flow: 1.4,
      silk: 0.35,
      grainAmount: 0.08,
      intro: false,
      interactive: false,
      clickSwirl: false,
      dpr: 1
    });
    if (background) el.classList.add("is-lit");
  });
})();
