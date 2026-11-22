// Refreshing any page (Cmd+R / F5) starts over like a fresh visit: back to the front page,
// with the intro animation playing and the cookie banner showing again.
// replace() swaps out the current history entry, so Back doesn't return to the refreshed page.
(function () {
  var nav = performance.getEntriesByType("navigation")[0];
  if (!nav || nav.type !== "reload") return;

  // Forget that the banner was answered and the intro played this visit (keys from consent.js and intro.js)
  try {
    sessionStorage.removeItem("tokenz_consent_answered");
    sessionStorage.removeItem("tokenz_intro_played");
  } catch (e) {}

  var onHome = /\/(index\.html)?$/.test(location.pathname);
  if (!onHome) location.replace("index.html");
})();
