// Every call to the TokenSaver engine goes through here. The engine (backend/web_api.py) usually
// serves this site itself, so the calls go to the same address. When the site comes from another
// local server instead (VS Code's Live Server on port 5500, say), they go to the engine's own
// address on port 8000. A page opened straight from disk has no engine to reach.
// No keys live here: the AI rewrite's Groq and Gemini keys stay with the engine (backend/optimizer/.env).
(function () {
  var fromDisk = location.protocol === "file:";
  var ENGINE = "http://127.0.0.1:8000";
  // Where the engine answered last; same address first, then the engine's own
  var bases = location.origin === ENGINE ? [""] : ["", ENGINE];
  var base = bases[0];

  function failure(message, offline) {
    var error = new Error(message);
    error.offline = Boolean(offline);
    return error;
  }

  function request(path, options) {
    if (fromDisk) return Promise.reject(failure("Opened from disk", true));
    return fetch(path, options).then(
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
    // Where the engine serves the site by default (TOKENZ_PORT changes the port)
    address: ENGINE + "/",
    health: function () {
      // Try each address in turn and remember the one that answers
      function attempt(i) {
        return request(bases[i] + "/api/health", { cache: "no-store" }).then(function (data) {
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
