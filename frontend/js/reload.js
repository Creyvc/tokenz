// Refreshing any page (Cmd+R / F5) starts over like a fresh visit: back to the front page,
// with the intro animation playing and the cookie banner showing again.
// replace() swaps out the current history entry, so Back doesn't return to the refreshed page.
//
// Online, each page also tidies its own address: /tokenz/compare instead of /tokenz/compare.html,
// and /tokenz/ instead of /tokenz/index.html (GitHub Pages serves both forms). Not on this
// computer: Live Server can't open an address without .html, so a refresh there would fail.
(function () {
  var online = location.protocol === "https:" || (location.protocol === "http:" &&
    !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  if (online && window.history && history.replaceState) {
    var tidy = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
    if (tidy !== location.pathname) history.replaceState(history.state, "", tidy + location.search + location.hash);
  }
})();

(function () {
  var nav = performance.getEntriesByType("navigation")[0];
  if (!nav || nav.type !== "reload") return;

  // Forget that the banner was answered and the intro played this visit (keys from consent.js and intro.js)
  try {
    sessionStorage.removeItem("tokenz_consent_answered");
    sessionStorage.removeItem("tokenz_intro_played");
  } catch (e) {}

  var onHome = /\/(index(\.html)?)?$/.test(location.pathname);
  if (!onHome) location.replace("index.html");
})();
