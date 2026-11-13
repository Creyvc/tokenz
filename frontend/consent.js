// Cookie consent: shows a banner on every new visit until the visitor accepts or denies,
// remembers the choice, and only switches on optional scripts after Accept All.
//
// To add something optional later (analytics, etc.), write its script tag like this
// and it will only run once the visitor has accepted:
//   <script type="text/plain" data-consent src="https://example.com/analytics.js"></script>
(function () {
  var NAME = "tokenz_consent";
  var MAX_AGE = 60 * 60 * 24 * 182; // about six months

  // Browsers block cookies on pages opened straight from disk (file://),
  // so remember the choice in local storage there instead
  var cookiesWork = (function () {
    document.cookie = "tokenz_test=1; Path=/; SameSite=Lax";
    var works = document.cookie.indexOf("tokenz_test=1") !== -1;
    document.cookie = "tokenz_test=; Max-Age=0; Path=/";
    return works;
  })();

  function readChoice() {
    if (cookiesWork) {
      var match = document.cookie.match(new RegExp("(?:^|; )" + NAME + "=(accepted|denied)"));
      return match ? match[1] : null;
    }
    try { return localStorage.getItem(NAME); } catch (e) { return null; }
  }

  function saveChoice(choice) {
    if (cookiesWork) {
      document.cookie = NAME + "=" + choice + "; Max-Age=" + MAX_AGE + "; Path=/; SameSite=Lax";
    } else {
      try { localStorage.setItem(NAME, choice); } catch (e) {}
    }
  }

  // Swap each waiting <script type="text/plain" data-consent> for a real one so it runs
  function enableOptionalScripts() {
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach(function (waiting) {
      var script = document.createElement("script");
      if (waiting.src) script.src = waiting.src;
      script.text = waiting.text;
      waiting.replaceWith(script);
    });
  }

  // Delete every cookie except the one that stores the choice itself
  function removeOptionalCookies() {
    document.cookie.split("; ").forEach(function (pair) {
      var name = pair.split("=")[0];
      if (name && name !== NAME) {
        document.cookie = name + "=; Max-Age=0; Path=/";
      }
    });
  }

  function apply(choice) {
    if (choice === "accepted") {
      enableOptionalScripts();
    } else {
      removeOptionalCookies();
    }
    showStatus();
  }

  // Session storage clears when the tab closes, so the banner asks again on every new visit
  function answeredThisVisit() {
    try { return sessionStorage.getItem(NAME + "_answered") === "1"; } catch (e) { return false; }
  }

  function decide(choice, button) {
    saveChoice(choice);
    try { sessionStorage.setItem(NAME + "_answered", "1"); } catch (e) {}
    apply(choice);
    var banner = document.querySelector(".consent");
    if (!banner) return;
    if (reduceMotion) {
      banner.remove();
      return;
    }
    // The button blinks, then the whole banner blinks out (intro-blink-out in styles.css)
    banner.inert = true;
    reblink(button);
    setTimeout(function () {
      banner.classList.add("is-leaving");
      setTimeout(function () { banner.remove(); }, BLINK_TIME);
    }, BLINK_TIME);
  }

  // ---- The blink, the same as the intro notice's (intro-blink in styles.css) ----
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BLINK_TIME = 120; // ms, the length of one blink

  // The banner blinks on, then each word and button inside it in reading order, 10ms apart
  function blinkIn(banner) {
    var pieces = [];
    var walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      // A button blinks on as a whole just before its own words
      var button = node.parentNode.closest("button");
      if (button && pieces.indexOf(button) === -1) pieces.push(button);
      var fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (!part.trim()) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement("span");
        span.textContent = part;
        fragment.appendChild(span);
        pieces.push(span);
      });
      node.parentNode.replaceChild(fragment, node);
    });
    banner.classList.add("intro-blink");
    pieces.forEach(function (el, i) {
      el.classList.add("intro-blink");
      el.style.animationDelay = 150 + i * 10 + "ms";
    });
  }

  // Plays the blink again on one element, straight away
  function reblink(el) {
    el.classList.remove("intro-blink");
    void el.offsetWidth; // let the browser see the class gone, so the animation restarts
    el.style.animationDelay = "0ms";
    el.classList.add("intro-blink");
  }

  function showBanner() {
    if (document.querySelector(".consent")) return;

    var banner = document.createElement("div");
    banner.className = "consent";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<p>We use an essential cookie to remember this choice. With your permission, we also use optional cookies to understand how the site is used. <a href="cookies.html" data-modal="cookies">Cookie Policy</a></p>' +
      '<div class="consent-actions">' +
        '<button type="button" class="consent-accept">Accept All</button>' +
        '<button type="button" class="consent-deny">Deny All</button>' +
      '</div>';

    banner.querySelector(".consent-accept").addEventListener("click", function () { decide("accepted", this); });
    banner.querySelector(".consent-deny").addEventListener("click", function () { decide("denied", this); });
    document.body.appendChild(banner);
    if (reduceMotion) return;

    // On Home's first visit the intro covers the page, so the banner waits, hidden, and blinks
    // on once the intro has gone (intro.js removes intro-play from <html>)
    var root = document.documentElement;
    if (!root.classList.contains("intro-play")) {
      blinkIn(banner);
      return;
    }
    banner.style.opacity = "0";
    var watch = new MutationObserver(function () {
      if (root.classList.contains("intro-play")) return;
      watch.disconnect();
      banner.style.opacity = "";
      blinkIn(banner);
    });
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
  }

  // On the Cookies page, show the current choice next to the settings button
  function showStatus() {
    var status = document.querySelector("[data-consent-status]");
    if (!status) return;
    var choice = readChoice();
    status.textContent = choice === "accepted" ? "You accepted optional cookies."
      : choice === "denied" ? "You denied optional cookies."
      : "You haven't chosen yet.";
  }

  // The Cookies window (modal.js) shows the current choice too, so fill it in when it opens
  document.addEventListener("tokenz:modal-open", showStatus);

  // Any element with data-consent-open reopens the banner so the choice can be changed
  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-consent-open]")) showBanner();
  });

  // The saved choice keeps applying, but the banner still shows once per visit
  // until the visitor answers it again
  var choice = readChoice();
  if (choice) {
    apply(choice);
  } else {
    showStatus();
  }
  if (!answeredThisVisit()) showBanner();
})();
