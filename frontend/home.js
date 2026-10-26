// Home: the Grainient background fills the rounded panel on the right. On a first visit it
// waits for the intro to finish, so its own bloom from the middle is seen rather than hidden
// under the intro's cover. Without WebGL2 the panel just stays plain grey.
(function () {
  var panel = document.querySelector(".home-panel");
  if (!panel || !window.Grainient) return;

  // is-lit turns the title white once the gradient is behind it
  function mount() {
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

  var root = document.documentElement;
  if (!root.classList.contains("intro-play")) {
    mount();
    return;
  }
  var watch = new MutationObserver(function () {
    if (root.classList.contains("intro-play")) return;
    watch.disconnect();
    mount();
  });
  watch.observe(root, { attributes: true, attributeFilter: ["class"] });
})();
