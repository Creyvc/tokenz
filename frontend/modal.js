// Info and Cookies open in a window in the middle of the screen, over a blurred view of the
// page, instead of on pages of their own. Any link with data-modal="info" or "cookies" opens
// one (its href still points at info.html / cookies.html, which forward here).
(function () {
  var CONTENT = {
    info:
      '<h1 id="modal-title">Info</h1>' +
      '<p class="info-intro">Tokenz shortens AI prompts, reducing token use without changing the answer.</p>' +
      '<div class="info-body">' +
      '<p>Developed in 2026 as an academic project. Prompts are processed on your device; only AI rewrite sends them to an external service (Groq and Google).</p>' +
      '</div>',
    cookies:
      '<h1 id="modal-title">Cookies</h1>' +
      '<p class="info-intro">Tokenz uses a single cookie to remember your choice. No tracking.</p>' +
      '<div class="info-body">' +
      '<p>Fonts are served by Google Fonts, which receives your IP address but sets no cookies.</p>' +
      '</div>' +
      '<div class="consent-settings">' +
      '<button type="button" class="consent-deny" data-consent-open>Change cookie settings</button>' +
      '<p data-consent-status></p>' +
      '</div>'
  };

  var dialog = null;

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.setAttribute("aria-labelledby", "modal-title");
    // The panel takes focus when it opens (instead of the first button inside it)
    dialog.innerHTML =
      '<div class="modal-panel" tabindex="-1" autofocus>' +
        '<section class="info"></section>' +
      '</div>';
    document.body.appendChild(dialog);

    // A click anywhere closes it: on the panel or on the blurred page around it
    dialog.addEventListener("click", close);
    // Esc: play the closing animation instead of vanishing instantly
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      close();
    });
    // The closing animation has finished: now actually close
    dialog.addEventListener("animationend", function (event) {
      if (event.animationName === "modal-out") dialog.close();
    });
    // However it closed (the browser can also close it on Esc by itself), tidy up
    dialog.addEventListener("close", function () {
      dialog.classList.remove("is-closing");
      document.documentElement.classList.remove("modal-open");
    });
  }

  function open(name) {
    if (!CONTENT[name]) return;
    if (!dialog) build();
    dialog.querySelector(".info").innerHTML = CONTENT[name];
    dialog.classList.remove("is-closing");
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("modal-open");
    // Lets consent.js fill in the current cookie choice
    document.dispatchEvent(new CustomEvent("tokenz:modal-open", { detail: name }));
  }

  function close() {
    if (!dialog || !dialog.open || dialog.classList.contains("is-closing")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
    } else {
      dialog.classList.add("is-closing"); // plays modal-out, then closes (see build)
    }
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("[data-modal]");
    if (link) {
      event.preventDefault();
      open(link.getAttribute("data-modal"));
      return;
    }
    // "Change cookie settings" brings up the cookie banner (consent.js), so get out of its way
    if (event.target.closest(".modal [data-consent-open]")) close();
  });

  // Arriving at index.html#info or #cookies (where info.html and cookies.html forward to)
  // opens that window, once the intro animation has finished if it's playing
  var name = location.hash.slice(1);
  if (CONTENT[name]) {
    var html = document.documentElement;
    if (html.classList.contains("intro-play")) {
      new MutationObserver(function (changes, watcher) {
        if (!html.classList.contains("intro-play")) {
          watcher.disconnect();
          open(name);
        }
      }).observe(html, { attributes: true, attributeFilter: ["class"] });
    } else {
      open(name);
    }
  }
})();
