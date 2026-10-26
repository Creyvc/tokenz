// Results page: how many tokens each method saved on its latest run this visit, from the runs
// compare.js keeps under tokenz_runs. It only reads them; nothing here calls the engine.
// Prompt text is always written with textContent, never as HTML.
(function () {
  var RUNS_KEY = "tokenz_runs";
  var METHODS = ["nlp", "tfidf", "ai"];
  var NAMES = { nlp: "NLP", tfidf: "TF-IDF", ai: "AI rewrite" };
  var LEVELS = {
    conservative: "1 · Conservative", balanced: "2 · Balanced",
    aggressive: "3 · Aggressive", maximum: "4 · Maximum"
  };
  var OUTCOMES = { review_required: "Needs review", unchanged: "Original kept", error: "Couldn't run" };

  var box = document.querySelector("[data-results]");
  if (!box) return;

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function compareLink(text) {
    var link = make("a", null, text);
    link.href = "compare.html";
    return link;
  }

  var runs = {};
  try { runs = JSON.parse(sessionStorage.getItem(RUNS_KEY)) || {}; } catch (e) {}
  var done = METHODS.filter(function (method) { return runs[method] && runs[method].result; });

  if (!done.length) {
    var empty = make("div", "rs-empty");
    var go = compareLink("Go to Compare");
    go.className = "wb-primary";
    empty.append(make("h2", null, "Nothing to compare yet"),
      make("p", null, "Paste a prompt on Compare, run NLP, TF-IDF or the AI rewrite on it, and the results show up here side by side."), go);
    box.append(empty);
    return;
  }

  var results = done.map(function (method) { return runs[method].result; });
  var samePrompt = results.every(function (r) { return r.original_text === results[0].original_text; });
  var encodings = done.map(function (method) { return runs[method].encoding; });
  var sameEncoding = encodings.every(function (name) { return name === encodings[0]; });

  // "NLP", "NLP and TF-IDF", "NLP, TF-IDF and AI rewrite"
  function names(list) {
    var words = list.map(function (method) { return NAMES[method]; });
    return words.length > 1 ? words.slice(0, -1).join(", ") + " and " + words[words.length - 1] : words[0];
  }

  if (done.length < METHODS.length) {
    var missing = METHODS.filter(function (method) { return done.indexOf(method) === -1; });
    var tip = make("p", "rs-notice");
    tip.append("Run " + names(missing) + " on ", compareLink("Compare"),
      " with the same prompt to see " + (done.length + missing.length === 2 ? "both methods" : "every method") + " side by side.");
    box.append(tip);
  }
  if (!sameEncoding) {
    box.append(make("p", "rs-notice is-warning", "These runs counted tokens in different ways (" + encodings.join(" and ") +
      "), so their numbers can't share a chart. Pick the same option under Advanced settings on Compare and run both again."));
  } else if (!samePrompt) {
    box.append(make("p", "rs-notice is-warning", "These runs used different prompts, so each method is shown against its own original. Use the same prompt for both for a fair comparison."));
  }

  // The headline, then one card per method

  if (done.length > 1 && samePrompt && sameEncoding) {
    var savedMost = Math.max.apply(null, results.map(function (r) { return r.tokens_saved; }));
    var leaders = done.filter(function (method, i) { return results[i].tokens_saved === savedMost; });
    var verdict = savedMost === 0 ? (done.length === 2 ? "Neither method" : "No method") + " found a shorter version of this prompt." :
      leaders.length === done.length ? (done.length === 2 ? "Both methods" : "All three methods") + " saved " + savedMost + " tokens on this prompt." :
      leaders.length > 1 ? names(leaders) + " both saved the most on this prompt: " + savedMost + " tokens." :
      NAMES[leaders[0]] + " saved the most on this prompt: " + savedMost + " tokens (" +
        results[done.indexOf(leaders[0])].reduction_percent.toFixed(1) + "% fewer).";
    box.append(make("p", "rs-verdict", verdict));
  }

  var cards = make("div", "rs-cards");
  done.forEach(function (method, i) {
    var r = results[i];
    var card = make("section", "rs-card");
    var top = make("div", "rs-card-top");
    top.append(make("h2", null, NAMES[method]), make("span", "wb-pill is-" + r.status, OUTCOMES[r.status] || r.status));
    card.append(top, make("p", "rs-card-num", r.reduction_percent.toFixed(1) + "%"),
      make("p", "rs-card-sub", r.original_target_tokens + " → " + r.candidate_target_tokens + " tokens · " + r.tokens_saved + " saved" +
        (method === "ai" && r.chosen ? " · " + r.chosen : "")));
    cards.append(card);
  });
  box.append(cards);

  // The chart: one bar per prompt version, all measured from zero

  function describe(name, tokens, original) {
    if (original == null) return name + ": " + tokens + " tokens, the starting point.";
    var saved = original - tokens;
    var share = original ? (100 * saved / original).toFixed(1) : "0.0";
    return name + ": " + tokens + " tokens, " + saved + " fewer than the original (" + share + "%).";
  }

  if (sameEncoding) {
    var bars = [];
    if (samePrompt) {
      bars.push({ label: "Original prompt", tokens: results[0].original_target_tokens, baseline: true });
      done.forEach(function (method, i) {
        bars.push({ label: NAMES[method], tokens: results[i].candidate_target_tokens, original: results[i].original_target_tokens });
      });
    } else {
      done.forEach(function (method, i) {
        bars.push({ label: NAMES[method] + " original", tokens: results[i].original_target_tokens, baseline: true });
        bars.push({ label: NAMES[method], tokens: results[i].candidate_target_tokens, original: results[i].original_target_tokens });
      });
    }
    var top = Math.max.apply(null, bars.map(function (bar) { return bar.tokens; })) || 1;

    var chart = make("figure", "rs-chart");
    var caption = make("figcaption", "rs-chart-title", "Prompt tokens");
    caption.append(make("span", null, " · shorter bars mean fewer tokens"));
    var list = make("div", "rs-bars");
    list.setAttribute("role", "list");
    var detail = make("p", "rs-detail", "Point at or tab to a bar for details.");
    detail.setAttribute("aria-live", "polite");

    bars.forEach(function (bar) {
      var row = make("div", "rs-bar" + (bar.baseline ? " is-baseline" : ""));
      row.setAttribute("role", "listitem");
      row.tabIndex = 0;
      var text = describe(bar.label, bar.tokens, bar.baseline ? null : bar.original);
      row.setAttribute("aria-label", text);
      var track = make("span", "rs-bar-track");
      var fill = make("span", "rs-bar-fill");
      fill.style.width = (100 * bar.tokens / top) + "%";
      track.append(fill);
      row.append(make("span", "rs-bar-label", bar.label), track, make("span", "rs-bar-value", String(bar.tokens)));
      ["pointerenter", "focus"].forEach(function (type) {
        row.addEventListener(type, function () { detail.textContent = text; });
      });
      list.append(row);
    });
    chart.append(caption, list, detail);
    box.append(chart);
  }

  // The table: the same numbers, plus outcome and settings

  var table = make("table", "wb-table rs-table");
  var thead = make("thead");
  var head = make("tr");
  ["Method", "Original", "After", "Saved", "Reduction", "Time", "Outcome", "Settings"].forEach(function (title) {
    head.append(make("th", null, title));
  });
  thead.append(head);
  var tbody = make("tbody");
  done.forEach(function (method, i) {
    var r = results[i];
    var settings = method === "nlp" ? "Strength " + (LEVELS[runs[method].nlp_mode] || runs[method].nlp_mode) :
      method === "ai" ? "Shortest: " + (r.chosen || "neither passed") :
      "Budget " + (r.selection_info ? r.selection_info.token_budget : "—") + " tokens";
    var tr = make("tr");
    [NAMES[method], r.original_target_tokens, r.candidate_target_tokens, r.tokens_saved,
      r.reduction_percent.toFixed(1) + "%", r.elapsed_seconds.toFixed(3) + " s",
      OUTCOMES[r.status] || r.status, settings + " · " + runs[method].encoding].forEach(function (value) {
      tr.append(make("td", null, String(value)));
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  var wrap = make("div", "wb-table-wrap");
  wrap.append(table);
  box.append(wrap);

  if (results.some(function (r) { return r.status === "unchanged"; })) {
    box.append(make("p", "wb-help", "“Original kept” is a valid outcome: no shorter version passed the checks, so it saves 0 tokens."));
  }

  // The texts themselves, for checking

  var details = make("details", "wb-details");
  details.append(make("summary", null, "Prompts and suggestions"));
  done.forEach(function (method, i) {
    var r = results[i];
    details.append(make("h3", null, NAMES[method]),
      make("p", "wb-label", "Original"), make("div", "wb-text", r.original_text),
      make("p", "wb-label", r.candidate_text === r.original_text ? "Original kept" : "Suggestion"),
      make("div", "wb-text", r.candidate_text));
  });
  box.append(details);

  var again = make("p", "wb-next");
  again.append(compareLink("Run again on Compare"));
  box.append(again);
})();
