// Refreshing any page (Cmd+R / F5) starts over like a fresh visit: back to the front page,
// with the cookie banner showing again.
// replace() swaps out the current history entry, so Back doesn't return to the refreshed page.
(function () {
  var nav = performance.getEntriesByType("navigation")[0];
  if (!nav || nav.type !== "reload") return;

  // Forget that the banner was answered this visit (the key consent.js uses)
  try { sessionStorage.removeItem("tokenz_consent_answered"); } catch (e) {}

  var onHome = /\/(index\.html)?$/.test(location.pathname);
  if (!onHome) location.replace("index.html");
})();
