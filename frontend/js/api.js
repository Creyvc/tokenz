// Every call to the TokenSaver engine goes through here.
// - On this computer the engine (backend/web_api.py) usually serves this site itself, so the calls
//   go to the same address. When the site comes from another local server instead (VS Code's Live
//   Server on port 5500, say), they go to the engine's own address on port 8000. A page opened
//   straight from disk has no engine to reach.
// - The online copy (GitHub Pages) uses the public engine on Render (PUBLIC_ENGINE; render.yaml),
//   never the visitor's own computer. On Render's free plan the engine sleeps when no one has used
//   it for a while and takes up to a minute to wake, so its first answer can be slow
//   (TokenzApi.slow tells the page when a request is taking a while).
// No keys live here: the AI rewrite's Groq and Gemini keys stay with the engine (backend/optimizer/.env
// locally, Render's environment settings online).
(function () {
  var fromDisk = location.protocol === "file:";
  var ENGINE = "http://127.0.0.1:8000";
  // The public engine's address (Render shows it on the service's page; change it here if it differs)
  var PUBLIC_ENGINE = "https://tokenz-engine.onrender.com";
  var onThisComputer = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var hosted = !fromDisk && !onThisComputer;
  // Where the engine answered last; same address first, then the engine's own (online: the public one)
  var bases = hosted ? [PUBLIC_ENGINE] : location.origin === ENGINE ? [""] : ["", ENGINE];
  var base = bases[0];
  // (long enough for the free plan to wake; an AI rewrite can take a few minutes)
  var WAIT_HEALTH = 90000, WAIT_RUN = 320000;

  function failure(message, offline) {
    var error = new Error(message);
    error.offline = Boolean(offline);
    return error;
  }

  function request(path, options, wait) {
    if (fromDisk) return Promise.reject(failure("Opened from disk", true));
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, wait || WAIT_RUN) : null;
    if (controller) options = Object.assign({}, options, { signal: controller.signal });
    return fetch(path, options).finally(function () { clearTimeout(timer); }).then(
      function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw failure(data.error || "The engine couldn't handle that request.");
          return data;
        });
      },
      function () { throw failure("The engine isn't running", true); }
    );
  }

  function post(path, body) {
    return request(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  window.TokenzApi = {
    fromDisk: fromDisk,
    hosted: hosted,
    engine: hosted ? PUBLIC_ENGINE : ENGINE,
    // Where the engine serves the site by default (TOKENZ_PORT changes the port)
    address: ENGINE + "/",
    health: function () {
      // Try each address in turn and remember the one that answers
      function attempt(i) {
        return request(bases[i] + "/api/health", { cache: "no-store" }, WAIT_HEALTH).then(function (data) {
          base = bases[i];
          return data;
        }, function (error) {
          if (i + 1 < bases.length) return attempt(i + 1);
          throw error;
        });
      }
      return attempt(0);
    },
    inspect: function (body) { return post("/api/inspect", body); },
    compress: function (body) { return post("/api/compress", body); },
    // The AI rewrite: the engine sends the prompt to Groq and Google and returns both rewrites
    optimize: function (body) { return post("/api/optimize", body); }
  };
})();
