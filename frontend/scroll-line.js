// Shows the nav's dividing line only once the page is scrolled: adds "scrolled" to <html>
// while you're away from the top, and takes it off again when you're back at the top.
(function () {
  function update() {
    document.documentElement.classList.toggle("scrolled", window.scrollY > 0);
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
})();
