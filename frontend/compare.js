// Compare page: paste a prompt, pick NLP, TF-IDF or the AI rewrite, run it through the TokenSaver
// engine (via api.js) and show the original and the suggestion side by side. The AI rewrite is the
// one option that sends the prompt off this computer (to Groq and Google, through the engine). The form is kept for this visit
// under tokenz_compare_draft, and each finished run under tokenz_runs, which results.js reads.
// Prompt text is always written with textContent, never as HTML.
(function () {
  var DRAFT_KEY = "tokenz_compare_draft";
  var RUNS_KEY = "tokenz_runs";
  var EXAMPLE_TASK = "Please explain how photosynthesis works for a beginner.";
  var EXAMPLE = EXAMPLE_TASK + " " + EXAMPLE_TASK + " Chlorophyll in the leaves absorbs sunlight. " +
    "My teacher said this topic will be in the exam next week. " +
    "Yesterday the bus to school was late and it was raining.";
  var LEVEL_HELP = {
    conservative: "Removes polite openings like “Could you please” and exact repeated sentences.",
    balanced: "Also shortens common request openings, while keeping every content word.",
    aggressive: "Applies more wording edits and removes sentences those edits made identical.",
    maximum: "Aims for 20% or more by trimming framing and personal reasons. Some words from that framing can go, so check the result closely. Concise prompts may not reach 20%."
  };
  var LEVEL_NAMES = { conservative: "1 · Conservative", balanced: "2 · Balanced", aggressive: "3 · Aggressive", maximum: "4 · Maximum" };
  var NAMES = { nlp: "NLP", tfidf: "TF-IDF", ai: "AI rewrite" };
  // Names for the AI models; the engine's health check sends the same ones with each model
  var AI_LABELS = { qwen: "Qwen · Groq", gemini_flash: "Gemini Flash · Google", gpt_oss_120b: "GPT-OSS 120B · Groq" };
  var AI_PROVIDERS = { qwen: "groq", gemini_flash: "gemini", gpt_oss_120b: "groq" };
  var AI_STATES = { accepted: ["Shorter", "review_required"], rejected: ["Original kept", "unchanged"],
    failed: ["Couldn't run", "error"], running: ["Still working…", "running"] };
  var OUTCOMES = { review_required: "Needs review", unchanged: "Original kept", error: "Couldn't run", running: "Working…" };
  var METHOD_HELP = {
    nlp: "Tidies the wording: cuts polite openings and repeated sentences. Good for any prompt.",
    tfidf: "Cuts whole sentences that are off-topic. Best for longer prompts with background.",
    ai: "AI models each rewrite the whole prompt shorter. Sends your prompt to the ones you pick."
  };
  // The engine's warnings, in plainer words. Anything not listed is shown as the engine wrote it.
  var NOTE_TEXT = {
    "Human review required: mechanical checks cannot prove equivalent meaning.": null,
    "Low lexical similarity does not establish that a sentence is safe to remove.":
      "TF-IDF judges sentences by the words they share with your task, so it can drop something important that's worded differently.",
    "Substantial deletion: more than half the text tokens were removed. Inspect the diff.":
      "More than half the prompt was removed. Read the suggestion carefully before using it."
  };
  var SHORT_PROMPT = "TF-IDF needs at least 3 sentences";
  var NOTHING_TO_CUT = "Every sentence has to stay";
  var BELOW_LEAST = "That's below what must stay";
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  // The engine's own wording for "pick a task"; this page asks for that with the sentence list
  var TASK_PROBLEM = "Choose a main-task sentence";

  var form = document.querySelector("[data-workbench]");
  if (!form || !window.TokenzApi) return;
  var api = window.TokenzApi;

  function find(name) { return document.querySelector("[data-" + name + "]"); }
  var el = {
    prompt: find("prompt"), promptTokens: find("prompt-tokens"), example: find("example"), clear: find("clear"),
    least: find("budget-least"), share: find("budget-share"), shortcut: find("shortcut"),
    methodHelp: find("method-help"), levelHelp: find("level-help"),
    nlp: document.querySelector('[data-for="nlp"]'), tfidf: document.querySelector('[data-for="tfidf"]'),
    ai: document.querySelector('[data-for="ai"]'), aiStatus: find("ai-status"),
    sentences: find("sentences"), budget: find("budget"),
    suggest: find("suggest"), budgetHelp: find("budget-help"), problems: find("problems"),
    phrases: find("phrases"), encoding: find("encoding"), run: find("run"), runHelp: find("run-help"),
    result: find("result"), notice: find("engine-notice"), noticeMessage: find("engine-message"),
    retry: find("engine-retry")
  };

  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; }
  }
  function write(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var state = {
    text: "", method: "nlp", level: "conservative", phrases: "", encoding: "o200k_base",
    task: null, taskText: "", keep: [], confirmed: false, budget: null, budgetTouched: false,
    aiModels: ["qwen", "gemini_flash"]
  };
  var saved = read(DRAFT_KEY);
  if (saved && typeof saved === "object") {
    Object.keys(state).forEach(function (name) {
      if (typeof saved[name] === typeof state[name] || state[name] === null) state[name] = saved[name];
    });
  }
  if (!NAMES[state.method]) state.method = "nlp";
  if (!LEVEL_HELP[state.level]) state.level = "conservative";
  if (!Array.isArray(state.keep)) state.keep = [];
  if (!Array.isArray(state.aiModels)) state.aiModels = ["qwen", "gemini_flash"];
  state.aiModels = state.aiModels.filter(function (key) { return AI_LABELS[key]; });

  // "How much to keep": the bar slider (wake-slider.js), in the site's near-black and grey
  var slider = window.WakeSlider(find("budget-slider"), {
    min: 1, max: 100, value: 50, step: 1, bars: 32, barWidth: 6, height: 44, restHeight: 10, gap: 4,
    fillColor: "#16171A", trackColor: "#E5E4DF", sensitivity: 1, reach: 6, skew: 0.6,
    glide: 0.3, smoothing: 100, ariaLabel: "Token budget", disabled: true,
    // More bars on a wider screen: the "least" mark is placed by bar, so it moves with them
    onLayout: function () { render(); },
    onChange: function (value) {
      state.budget = value;
      state.budgetTouched = true;
      save();
      render();
      autoRun();
    }
  });

  var engineReady = null;  // null until the first check answers
  var aiStatus = null;     // whether the engine has Groq and Gemini set up (from its health check)
  var plan = null;         // the engine's latest look at this prompt's sentences
  var inspectTimer = null;
  var inspectCount = 0;
  var running = false;
  var rerunAfterCheck = false;  // run again once the sentence check for a restored sentence is back
  var autoTimer = null;
  var quietRun = false;         // a rerun from a settings change: update in place, don't scroll
  var runError = "";       // why the last run or check failed, until the form changes
  var shown = null;        // the run whose result is on screen

  function save() {
    runError = "";
    write(DRAFT_KEY, state);
  }

  // Everything a result depends on, so an edited form can mark it out of date
  function signature(method) {
    // The AI rewrite ignores protected phrases, so they don't make its result out of date
    if (method === "ai") return JSON.stringify([method, state.text, state.encoding, state.aiModels.slice().sort()]);
    var parts = [method, state.text, state.phrases, state.encoding];
    if (method === "nlp") parts.push(state.level);
    else parts.push(state.taskText, state.confirmed, state.budget, state.keep.slice().sort());
    return JSON.stringify(parts);
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Engine status

  function setEngine(ready) {
    engineReady = ready;
    el.notice.hidden = ready;
    el.noticeMessage.textContent = "";
    if (ready) {
      scheduleInspect(0);
    } else if (api.fromDisk) {
      var link = make("a", null, "open Compare through it");
      link.href = api.address + "compare.html";
      el.noticeMessage.append("This page was opened from a file, so it can't reach the engine. Start the engine (",
        make("code", null, "./start-web.sh"), " in the backend folder), then ", link, ".");
      el.retry.hidden = true;
    } else {
      el.noticeMessage.append("The engine isn't running. In the backend folder run ",
        make("code", null, "./start-web.sh"), " (on Windows, ", make("code", null, "Start-TokenzWeb.ps1"),
        "), then press Try again.");
      el.retry.hidden = false;
    }
    render();
  }

  function checkEngine() {
    api.health().then(function (data) {
      aiStatus = data.ai || null;
      el.aiStatus.dataset.key = "";
      setEngine(true);
    }, function () { setEngine(false); });
  }

  // Whether Groq and Gemini are set up, and how to set them up when they aren't
  function renderAiStatus() {
    var box = el.aiStatus;
    var key = JSON.stringify([engineReady, aiStatus]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.textContent = "";
    if (!engineReady) return;  // the engine notice above the form covers this
    if (!aiStatus) {
      box.append(make("p", "wb-help", "This engine is older than the AI rewrite. Restart it (./start-web.sh in the backend folder)."));
      return;
    }
    // One box per model; a model that isn't set up says why and can't be ticked
    var picker = make("fieldset", "wb-ai-models");
    picker.append(make("legend", "wb-label", "Models"));
    aiStatus.optimizers.forEach(function (row) {
      var label = make("label", "wb-check wb-ai-model" + (row.available ? "" : " is-off"));
      var box = make("input");
      box.type = "checkbox";
      box.name = "ai-model";
      box.value = row.key;
      box.disabled = !row.available;
      var text = make("span");
      text.append(make("span", "wb-ai-model-name", row.label), make("span", "wb-ai-model-id", " " + row.model));
      if (!row.available) text.append(make("span", "wb-ai-model-id", " · " + row.reason));
      label.append(box, text);
      picker.append(label);
    });
    box.append(picker);
    if (aiStatus.available) return syncAiModels();
    var how = make("p", "wb-help");
    how.append("To set it up, copy ", make("code", null, "backend/optimizer/.env.example"), " to ",
      make("code", null, ".env"), " in the same folder, add ", make("code", null, "GROQ_API_KEY"), " and ",
      make("code", null, "GEMINI_API_KEY"), ", and set both free-plan confirmations to true once billing is off on each account. Then check again.");
    var again = make("button", "wb-secondary", "Check again");
    again.type = "button";
    again.addEventListener("click", function () {
      again.disabled = true;
      again.textContent = "Checking…";
      checkEngine();
    });
    box.append(make("p", "wb-ai-missing", "Not set up on this computer yet."), how, again);
    syncAiModels();
  }

  // Tick the chosen models (the boxes are rebuilt only when the engine's answer changes)
  function syncAiModels() {
    el.aiStatus.querySelectorAll('input[name="ai-model"]').forEach(function (box) {
      box.checked = !box.disabled && state.aiModels.indexOf(box.value) !== -1;
    });
  }

  // The chosen models the engine can run, in the engine's order
  function chosenAiModels() {
    return (aiStatus ? aiStatus.optimizers : []).filter(function (row) {
      return row.available && state.aiModels.indexOf(row.key) !== -1;
    });
  }

  // Sentence preflight for TF-IDF (it also counts the prompt's tokens)

  function scheduleInspect(delay) {
    clearTimeout(inspectTimer);
    inspectTimer = setTimeout(inspect, delay);
  }

  function inspect() {
    if (!engineReady) return;
    if (!state.text.trim()) {
      plan = null;
      return render();
    }
    var count = ++inspectCount;
    api.inspect({
      text: state.text, main_question: state.taskText, locked_sentences: state.keep,
      locked_spans: state.phrases.split("\n"), encoding: state.encoding
    }).then(function (reply) {
      if (count !== inspectCount) return;  // a newer check is on its way
      plan = reply;
      if (!state.budgetTouched) state.budget = reply.suggested_budget;
      state.budget = clampBudget(state.budget);
      var restoring = rerunAfterCheck;
      rerunAfterCheck = false;
      if (restoring) {
        // Make room for the sentence that was just brought back
        var least = reply.minimum_required_tokens;
        if (least != null && state.budget < least) state.budget = least;
      }
      write(DRAFT_KEY, state);
      render();
      if (restoring && !blocker()) {
        quietRun = true;
        form.requestSubmit();
      } else {
        autoRun();
      }
    }, function (error) {
      if (count !== inspectCount) return;
      if (error.offline) return setEngine(false);
      runError = error.message;
      render();
    });
  }

  // Drawing the form

  function renderSentences() {
    var rows = plan ? plan.sentences : [];
    var empty = rows.length ? "" : state.text.trim() ? "Reading your sentences…" : "Paste a prompt to see its sentences.";
    var key = JSON.stringify([rows.map(function (row) { return row.text; }), empty]);
    if (el.sentences.dataset.key !== key) {
      el.sentences.dataset.key = key;
      el.sentences.textContent = "";
      if (empty) el.sentences.append(make("li", "wb-sentence-empty", empty));
      rows.forEach(function (row) {
        var item = make("li", "wb-sentence");
        var task = make("label", "wb-sentence-task");
        var radio = make("input");
        radio.type = "radio";
        radio.name = "task";
        radio.value = row.index;
        task.append(radio, make("span", "wb-sentence-text", row.text));
        var keep = make("label", "wb-sentence-keep");
        var box = make("input");
        box.type = "checkbox";
        box.value = row.index;
        keep.append(box, make("span", null, "Keep"));
        item.append(task, keep, make("p", "wb-sentence-why"));
        el.sentences.append(item);
      });
    }
    rows.forEach(function (row, index) {
      var item = el.sentences.children[index];
      var isTask = state.task === index;
      var box = item.querySelector('input[type="checkbox"]');
      item.querySelector('input[type="radio"]').checked = isTask;
      box.checked = isTask || state.keep.indexOf(index) !== -1;
      box.disabled = isTask;
      item.classList.toggle("is-task", isTask);
      // Sentences the engine keeps whatever the budget, and why
      var words = row.mandatory_reasons.filter(function (reason) {
        return reason.indexOf("Protected requirement: ") === 0;
      }).map(function (reason) { return "“" + reason.slice(23) + "”"; });
      var why = [];
      if (row.mandatory_reasons.indexOf("Request or instruction") !== -1) why.push("it asks for something");
      if (row.mandatory_reasons.indexOf("Text the task works on") !== -1) why.push("it's the text your task works on");
      if (words.length) why.push("contains " + words.join(", "));
      item.querySelector(".wb-sentence-why").textContent = why.length && !isTask ? "Always kept: " + why.join(" · ") : "";
    });
  }

  function tfidfIssues() {
    var issues = plan ? plan.problems.filter(function (problem) {
      return problem.indexOf(TASK_PROBLEM) !== 0;
    }) : [];
    var minimum = plan && plan.minimum_required_tokens;
    if (minimum != null && minimum >= plan.original_tokens) {
      issues.push(NOTHING_TO_CUT + " in this prompt: " + mustStay() + ". To cut something, untick Keep or choose a different main task, or tidy the wording with NLP.");
    }
    if (minimum != null && state.budget < minimum) {
      issues.push(BELOW_LEAST + ": " + mustStay() + " add up to " + minimum + " tokens, so a budget of " + state.budget + " can't be met.");
    }
    return issues;
  }

  // What TF-IDF has to keep, counted from the engine's reasons: "2 sentences you ticked Keep on,
  // your main task and 1 sentence with a protected word (“12”)"
  function mustStay() {
    var ticked = 0, task = false, asks = 0, material = false, guarded = 0, words = [];
    plan.sentences.forEach(function (row) {
      var reasons = row.mandatory_reasons;
      if (reasons.indexOf("Confirmed main task") !== -1) task = true;
      else if (reasons.indexOf("User-locked sentence") !== -1) ticked++;
      else if (reasons.indexOf("Request or instruction") !== -1) asks++;
      else if (reasons.indexOf("Text the task works on") !== -1) material = true;
      else if (reasons.length) {
        guarded++;
        reasons.forEach(function (reason) {
          var word = "“" + reason.slice(23) + "”";
          if (reason.indexOf("Protected requirement: ") === 0 && words.indexOf(word) === -1 && words.length < 4) words.push(word);
        });
      }
    });
    var parts = [];
    if (ticked) parts.push(ticked + (ticked === 1 ? " sentence" : " sentences") + " you ticked Keep on");
    if (task) parts.push("your main task");
    if (asks) parts.push(asks + (asks === 1 ? " instruction" : " instructions"));
    if (material) parts.push("the text your task works on");
    if (guarded) parts.push(guarded + (guarded === 1 ? " sentence" : " sentences") + " with protected words" +
      (words.length ? " (" + words.join(", ") + ")" : ""));
    if (parts.length > 1) parts[parts.length - 1] = "and " + parts[parts.length - 1];
    return parts.join(parts.length > 2 ? ", " : " ") || "the sentences that must stay";
  }

  function untickAll() {
    state.keep = [];
    save();
    render();
    scheduleInspect(0);
  }

  // The fix buttons in the messages under the budget, handled in one place
  el.problems.addEventListener("click", function (event) {
    var button = event.target.closest("[data-fix]");
    if (!button) return;
    var fix = button.dataset.fix;
    if (fix === "nlp") return switchMethod("nlp");
    if (fix === "untick") return untickAll();
    if (fix === "least" && plan && plan.minimum_required_tokens != null) {
      state.budget = plan.minimum_required_tokens;
      state.budgetTouched = true;
      save();
      render();
      autoRun();
    }
  });

  // Keep the budget between 1 and the whole prompt (more than the prompt means nothing)
  function clampBudget(value) {
    if (value == null || isNaN(value)) return value;
    var most = plan ? Math.max(plan.original_tokens, 1) : 6000;
    return Math.min(Math.max(Math.round(value), 1), most);
  }

  function validBudget() {
    return Number.isInteger(state.budget) && state.budget >= 1 && state.budget <= 6000;
  }

  // Why the Run button can't be pressed yet, or "" when it can
  function blocker() {
    if (engineReady === null) return "Checking the engine…";
    if (!engineReady) return "Start the engine to run this.";
    if (!state.text.trim()) return "Paste a prompt first.";
    if (state.method === "nlp") return "";
    if (state.method === "ai") {
      if (!aiStatus || !aiStatus.available) return "Set up Groq and Gemini first (above).";
      return chosenAiModels().length ? "" : "Tick at least one model.";
    }
    if (!plan) return "Reading your sentences…";
    if (state.task === null) return "Click the sentence with your main task.";
    if (!validBudget()) return "Set how many tokens to keep.";
    var blocking = tfidfIssues().filter(function (issue) { return issue.indexOf(NOTHING_TO_CUT) !== 0; });
    if (blocking.length || plan.minimum_required_tokens == null) return "Fix the points above first.";
    return "";
  }

  function render() {
    var isNlp = state.method === "nlp";
    var isTfidf = state.method === "tfidf";
    if (el.prompt.value !== state.text) el.prompt.value = state.text;
    if (el.phrases.value !== state.phrases) el.phrases.value = state.phrases;
    form.elements.method.value = state.method;
    form.elements.level.value = state.level;
    el.methodHelp.textContent = METHOD_HELP[state.method];
    el.encoding.value = state.encoding;
    el.nlp.hidden = !isNlp;
    el.tfidf.hidden = !isTfidf;
    el.ai.hidden = state.method !== "ai";
    if (state.method === "ai") {
      renderAiStatus();
      syncAiModels();
    }
    el.levelHelp.textContent = LEVEL_HELP[state.level];
    el.promptTokens.textContent = plan ? plan.original_tokens + " tokens" : "";

    if (isTfidf) {
      renderSentences();
      if (document.activeElement !== el.budget) el.budget.value = state.budget == null ? "" : state.budget;
      var minimum = plan && plan.minimum_required_tokens;
      var nothingToCut = minimum != null && plan && minimum >= plan.original_tokens;
      // The slider always runs from 1 to the whole prompt, so it can always be moved; a mark
      // under it shows the least that can work
      if (plan) {
        var high = Math.max(plan.original_tokens, 1);
        el.budget.max = String(high);
        var showLeast = minimum != null && !nothingToCut;
        slider.set({ min: 1, max: high, value: state.budget == null ? high : state.budget,
          floor: showLeast ? minimum : null, disabled: false });
        el.least.hidden = !showLeast;
        if (showLeast) {
          el.least.style.setProperty("--at", slider.positionOf(minimum));
          el.least.textContent = "least " + minimum;
        }
        var share = state.budget ? Math.round(100 * state.budget / plan.original_tokens) : null;
        el.share.textContent = share == null ? "" : state.budget + " of " + plan.original_tokens + " tokens · keeps about " + share + "%";
      } else {
        slider.set({ disabled: true, floor: null });
        el.least.hidden = true;
        el.share.textContent = "";
      }
      el.suggest.disabled = !plan || state.budget === plan.suggested_budget;
      el.budgetHelp.textContent = !plan || nothingToCut ? "" : minimum != null ?
        "Drag to choose. Your task and the sentences that must stay need at least " + minimum + " tokens (the mark on the track)." :
        "Click your main task above to see the least you can keep.";
      // Rebuilt only when the messages change: a redraw between pressing and releasing a fix
      // button (the budget box losing focus causes one) would otherwise swallow the click
      var issues = tfidfIssues();
      var issueKey = JSON.stringify([issues, state.keep.length, nothingToCut, minimum]);
      if (el.problems.dataset.key !== issueKey) {
        el.problems.dataset.key = issueKey;
        el.problems.textContent = "";
        issues.forEach(function (issue) {
          var item = make("li", null, issue);
          var fixes = [];
          if (issue.indexOf(SHORT_PROMPT) === 0) {
            fixes.push(["Use NLP instead", "nlp"]);
          } else if (issue.indexOf(NOTHING_TO_CUT) === 0) {
            if (state.keep.length) fixes.push(["Untick all Keep", "untick"]);
            fixes.push(["Use NLP instead", "nlp"]);
          } else if (issue.indexOf(BELOW_LEAST) === 0) {
            if (state.keep.length) fixes.push(["Untick all Keep", "untick"]);
            if (!nothingToCut) fixes.push(["Use " + minimum + " tokens", "least"]);
          }
          fixes.forEach(function (fix) {
            var button = make("button", "wb-link", fix[0]);
            button.type = "button";
            button.dataset.fix = fix[1];
            item.append(" ", button);
          });
          el.problems.append(item);
        });
      }
    }

    var reason = blocker();
    el.run.textContent = running ? "Running…" : "Run " + NAMES[state.method];
    el.run.disabled = running || reason !== "";
    el.run.classList.toggle("is-running", running);
    el.runHelp.textContent = running ? (state.method === "ai" ? "Groq's models usually answer in seconds; Gemini can take up to 30." : "") :
      reason || runError;
    el.clear.hidden = !state.text;
    el.shortcut.textContent = reason || running ? "" : (MAC ? "⌘" : "Ctrl") + " + Enter also runs it";

    if (shown && shown.method !== state.method) {
      hideResult();
    } else if (shown) {
      var stale = shown.signature !== signature(shown.method);
      el.result.classList.toggle("is-stale", stale);
      el.result.querySelector(".wb-stale-note").hidden = !stale;
    }
  }

  // Once a result is on screen, changing a setting (budget, Keep, strength, advanced settings)
  // runs the method again by itself, so the result follows the slider. Editing the prompt
  // doesn't: that only marks the result out of date.
  function autoRun() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      // Never for the AI rewrite: each run sends the prompt away and uses the free plans' limits
      if (!shown || shown.method !== state.method || state.method === "ai" || running || blocker()) return;
      if (shown.signature === signature(state.method)) return;
      quietRun = true;
      form.requestSubmit();
    }, 450);
  }

  // Changes from the form

  function resetForNewText() {
    state.task = null;
    state.taskText = "";
    state.keep = [];
    state.confirmed = false;
    state.budgetTouched = false;
    plan = null;
  }

  el.prompt.addEventListener("input", function () {
    state.text = el.prompt.value;
    resetForNewText();
    save();
    render();
    scheduleInspect(350);
  });

  el.example.addEventListener("click", function () {
    state.text = EXAMPLE;
    resetForNewText();
    // Start the example with its first sentence picked as the task
    state.task = 0;
    state.taskText = EXAMPLE_TASK;
    state.confirmed = true;
    save();
    render();
    scheduleInspect(0);
  });

  el.clear.addEventListener("click", function () {
    state.text = "";
    resetForNewText();
    save();
    render();
    el.prompt.focus();
  });

  function switchMethod(method) {
    state.method = method;
    var run = (read(RUNS_KEY) || {})[method];
    if (run && run.signature === signature(method)) showResult(run);
    if (method === "tfidf" && !plan) scheduleInspect(0);
    save();
    render();
  }

  form.addEventListener("change", function (event) {
    var target = event.target;
    if (target.name === "method") {
      return switchMethod(target.value);
    } else if (target.name === "level") {
      state.level = target.value;
      autoRun();
    } else if (target === el.encoding) {
      state.encoding = target.value;
      scheduleInspect(0);
    } else if (target.name === "task") {
      // Clicking the sentence is the user's own choice of task, which counts as confirming it
      state.task = Number(target.value);
      state.taskText = plan.sentences[state.task].text;
      state.keep = state.keep.filter(function (index) { return index !== state.task; });
      state.confirmed = true;
      scheduleInspect(0);
    } else if (target.name === "ai-model") {
      state.aiModels = state.aiModels.filter(function (key) { return key !== target.value; });
      if (target.checked) state.aiModels.push(target.value);
    } else if (target.type === "checkbox" && target.closest(".wb-sentence")) {
      var index = Number(target.value);
      state.keep = state.keep.filter(function (kept) { return kept !== index; });
      if (target.checked) state.keep.push(index);
      scheduleInspect(0);
    } else {
      return;
    }
    save();
    render();
  });

  el.phrases.addEventListener("input", function () {
    state.phrases = el.phrases.value;
    save();
    render();
    scheduleInspect(350);
  });

  el.budget.addEventListener("input", function () {
    state.budget = el.budget.value === "" ? null : clampBudget(Number(el.budget.value));
    state.budgetTouched = true;
    save();
    render();
    autoRun();
  });

  // Show the capped number once the box is left (typing 100 into a 68-token prompt shows 68)
  el.budget.addEventListener("blur", render);

  // Cmd/Ctrl + Enter runs the method from anywhere in the form
  form.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!running && !blocker()) form.requestSubmit();
    }
  });

  el.suggest.addEventListener("click", function () {
    if (!plan) return;
    state.budget = plan.suggested_budget;
    state.budgetTouched = true;
    save();
    render();
    autoRun();
  });

  el.retry.addEventListener("click", checkEngine);

  // Running a method

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (running || blocker()) return;
    var method = state.method;
    var body = {
      method: method, text: state.text, locked_spans: state.phrases.split("\n"), encoding: state.encoding
    };
    if (method === "nlp") {
      body.nlp_mode = state.level;
    } else {
      body.main_question = state.taskText;
      body.token_budget = state.budget;
      body.locked_sentences = state.keep;
    }
    var sig = signature(method);
    var text = state.text;
    var started = Date.now();
    running = true;
    runError = "";
    render();
    if (method === "ai") return runAi(text, state.encoding, sig, started);
    api.compress(body).then(function (reply) {
      return { method: method, result: reply.result, nlp_mode: reply.nlp_mode, encoding: reply.encoding, signature: sig };
    }).then(function (run) {
      var runs = read(RUNS_KEY) || {};
      runs[method] = run;
      write(RUNS_KEY, runs);
      running = false;
      showResult(run);
      if (!quietRun) {
        var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.result.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      }
      quietRun = false;
    }, function (error) {
      running = false;
      quietRun = false;
      if (error.offline) return setEngine(false);
      runError = error.message;
      render();
    });
  });

  // The AI rewrite asks each model on its own, so a quick model's rewrite shows at once and a slow
  // one fills in when it lands. The run is kept for Results once both have answered.
  function runAi(text, encoding, sig, started) {
    var rows = chosenAiModels();
    var answers = {};
    var meta = { original_tokens: null, note: "" };
    var left = rows.length, offline = 0, scrolled = false;
    function draw() {
      var reply = { encoding: encoding, note: meta.note, original_tokens: meta.original_tokens,
        candidates: rows.map(function (row) {
          return answers[row.key] || { key: row.key, provider: AI_PROVIDERS[row.key], model: row.model, status: "running", checks: [] };
        }) };
      var run = aiRun(reply, text, (Date.now() - started) / 1000, sig);
      if (!left) {
        running = false;
        var runs = read(RUNS_KEY) || {};
        runs.ai = run;
        write(RUNS_KEY, runs);
      }
      showResult(run);
      if (!scrolled) {
        var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.result.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        scrolled = true;
      }
    }
    rows.forEach(function (row) {
      api.optimize({ text: text, encoding: encoding, models: [row.key] }).then(function (reply) {
        answers[row.key] = reply.candidates[0];
        meta.original_tokens = reply.original_tokens;
        meta.note = reply.note;
      }, function (error) {
        if (error.offline) offline++;
        answers[row.key] = { key: row.key, provider: AI_PROVIDERS[row.key], model: row.model, status: "failed", checks: [], error: error.message };
      }).then(function () {
        left--;
        if (offline === rows.length) {
          running = false;
          return setEngine(false);
        }
        // Wait for a token count before the first drawing, unless nothing more is coming
        if (meta.original_tokens != null || !left) draw();
      });
    });
  }

  function aiLabel(candidate) {
    return AI_LABELS[candidate.key] || candidate.model || candidate.provider;
  }

  // The AI rewrite's reply as a run like the others: the shortest accepted rewrite is its result,
  // so Results can chart it next to NLP and TF-IDF. Both models' rewrites are kept for this page.
  function aiRun(reply, text, seconds, sig) {
    var best = null;
    reply.candidates.forEach(function (candidate) {
      if (candidate.status === "accepted" && (!best || candidate.optimized_tokens < best.optimized_tokens)) best = candidate;
    });
    var anyRejected = reply.candidates.some(function (candidate) { return candidate.status === "rejected"; });
    var anyRunning = reply.candidates.some(function (candidate) { return candidate.status === "running"; });
    return {
      method: "ai", encoding: reply.encoding, signature: sig, candidates: reply.candidates, note: reply.note,
      result: {
        original_text: text, candidate_text: best ? best.optimized_prompt : text,
        original_target_tokens: reply.original_tokens,
        candidate_target_tokens: best ? best.optimized_tokens : reply.original_tokens,
        tokens_saved: best ? best.tokens_saved : 0, reduction_percent: best ? best.reduction_percent : 0,
        still_running: reply.candidates.filter(function (candidate) { return candidate.status === "running"; })
          .map(aiLabel),
        status: best ? "review_required" : anyRunning ? "running" : anyRejected ? "unchanged" : "error",
        elapsed_seconds: seconds, warnings: [], changes: [], protected_constraints: [],
        chosen: best ? aiLabel(best) : null
      }
    };
  }

  // Showing a result

  function hideResult() {
    shown = null;
    el.result.hidden = true;
    el.result.textContent = "";
  }

  // Word-level changes between the original and the suggestion, for highlighting. Words are
  // compared without their spacing. Very long prompts skip it (the table would be too large).
  function wordChanges(before, after) {
    var a = before.match(/\s*\S+\s*/g) || [];
    var b = after.match(/\s*\S+\s*/g) || [];
    if (a.length * b.length > 4000000) return null;
    var key = function (word) { return word.trim(); };
    var rows = [];
    for (var i = a.length; i >= 0; i--) {
      rows[i] = new Int32Array(b.length + 1);
      for (var j = b.length - 1; i < a.length && j >= 0; j--) {
        rows[i][j] = key(a[i]) === key(b[j]) ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
      }
    }
    var left = [], right = [];
    i = 0; j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && key(a[i]) === key(b[j])) {
        left.push(["same", a[i++]]);
        right.push(["same", b[j++]]);
      } else if (j >= b.length || (i < a.length && rows[i + 1][j] >= rows[i][j + 1])) {
        left.push(["del", a[i++]]);
      } else {
        right.push(["ins", b[j++]]);
      }
    }
    return { left: left, right: right };
  }

  // Joins neighbouring words of the same kind into one marked span. The spaces around a
  // change stay outside its mark, so the shading only covers the words themselves.
  function marked(parts) {
    var groups = [];
    parts.forEach(function (part) {
      var last = groups[groups.length - 1];
      if (last && last.kind === part[0]) last.text += part[1];
      else groups.push({ kind: part[0], text: part[1] });
    });
    var box = make("div", "wb-text");
    groups.forEach(function (group) {
      if (group.kind === "same") return box.append(group.text);
      var pieces = group.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      box.append(pieces[1], make(group.kind, "wb-" + group.kind, pieces[2]), pieces[3]);
    });
    return box;
  }

  function side(title, box) {
    var figure = make("figure", "wb-side");
    figure.append(make("figcaption", "wb-label", title), box);
    return figure;
  }

  function stat(list, label, value) {
    var item = make("div", "wb-stat");
    item.append(make("dt", null, label), make("dd", null, value));
    list.append(item);
  }

  // The engine's reasons for keeping a sentence, in plain words
  function reasonText(reasons) {
    var words = [], parts = [];
    reasons.forEach(function (reason) {
      if (reason === "Confirmed main task") parts.push("Your main task");
      else if (reason === "User-locked sentence") parts.push("You ticked Keep");
      else if (reason === "Request or instruction") parts.push("It asks for something");
      else if (reason === "Text the task works on") parts.push("The text your task works on");
      else if (reason.indexOf("Protected requirement: ") === 0) words.push("“" + reason.slice(23) + "”");
      else parts.push(reason);
    });
    if (words.length) parts.push("Contains " + words.join(", "));
    return parts.join(" · ");
  }

  // Tick Keep on a removed sentence and run again, without scrolling back up
  function restoreSentence(index) {
    if (state.keep.indexOf(index) === -1) state.keep.push(index);
    save();
    rerunAfterCheck = true;
    render();
    scheduleInspect(0);
  }

  function sentenceTable(rows) {
    var table = make("table", "wb-table");
    var thead = make("thead");
    var head = make("tr");
    ["Sentence", "Kept", "Match with task", "Why it was kept"].forEach(function (title) {
      head.append(make("th", null, title));
    });
    thead.append(head);
    var tbody = make("tbody");
    rows.forEach(function (row) {
      var tr = make("tr", row.selected ? null : "is-removed");
      var kept = make("td", null, row.selected ? "Yes" : "No");
      if (!row.selected) {
        var restore = make("button", "wb-link wb-restore", "Keep it");
        restore.type = "button";
        restore.addEventListener("click", function () {
          restore.disabled = true;
          restore.textContent = "Running…";
          restoreSentence(row.index);
        });
        kept.append(" · ", restore);
      }
      tr.append(make("td", null, row.text), kept,
        make("td", "wb-num", row.score == null ? "—" : Math.round(row.score * 100) + "%"),
        make("td", null, reasonText(row.mandatory_reasons)));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    var wrap = make("div", "wb-table-wrap");
    wrap.append(table);
    return wrap;
  }

  function reviewControls(text) {
    var review = make("div", "wb-review");
    var label = make("label", "wb-check");
    var box = make("input");
    box.type = "checkbox";
    label.append(box, make("span", null, "I checked every requested task and constraint"));
    var copy = make("button", "wb-primary", "Copy suggestion");
    copy.type = "button";
    copy.disabled = true;
    var copied = make("span", "wb-help");
    box.addEventListener("change", function () {
      copy.disabled = !box.checked;
      copied.textContent = "";
    });
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(text).then(function () {
        copied.textContent = "Copied.";
      }, function () {
        copied.textContent = "Couldn't copy. Select the suggestion above and copy it yourself.";
      });
    });
    var end = make("div", "wb-review-end");
    end.append(copied, copy);
    review.append(label, end);
    return review;
  }

  // The AI rewrite: the best of the two at the top, then each model's own rewrite
  function showAiResult(run) {
    var r = run.result;
    shown = run;
    el.result.textContent = "";
    el.result.classList.remove("is-stale");
    el.result.hidden = false;

    var head = make("header", "wb-result-head");
    head.append(make("h2", null, "AI rewrite result"),
      make("span", "wb-pill is-" + r.status, OUTCOMES[r.status] || r.status));
    var stale = make("p", "wb-stale-note", "You changed the prompt or settings. Run again to refresh this result.");
    stale.hidden = true;
    el.result.append(head, stale);

    var summary = make("div", "wb-summary");
    var hero = make("div", "wb-hero");
    var waiting = r.still_running || [];
    var single = run.candidates.length === 1;
    hero.append(make("span", "wb-hero-num", r.reduction_percent.toFixed(1) + "%"),
      make("span", "wb-hero-label", waiting.length ? "fewer tokens so far" : single ? "fewer tokens" : "fewer tokens, the shortest rewrite"));
    var stats = make("dl", "wb-stats");
    var tokens = function (n) { return n == null ? "—" : n + " tokens"; };
    stat(stats, "Original", tokens(r.original_target_tokens));
    stat(stats, "Shortest", tokens(r.candidate_target_tokens));
    stat(stats, "Saved", r.tokens_saved + " tokens");
    stat(stats, "Time", r.elapsed_seconds.toFixed(1) + " s");
    summary.append(hero, stats);
    el.result.append(summary);

    el.result.append(make("p", "wb-status", {
      review_required: "The shortest rewrite that passed the checks is " + r.chosen + "'s. Check that every task and constraint survived before you use it.",
      unchanged: single ? "Original kept: the rewrite didn't pass the checks." : "Original kept: no rewrite passed the checks.",
      error: single ? "The model couldn't run. The reason is below." : "No model could run. The reasons are below.",
      running: "Waiting for the models…"
    }[r.status]));
    if (waiting.length && r.status !== "running") {
      el.result.append(make("p", "wb-help", "Still waiting for " + waiting.join(" and ") + ". Its rewrite shows here as soon as it answers."));
    }

    var original = side("Original", make("div", "wb-text", r.original_text));
    original.classList.add("wb-ai-original");
    el.result.append(original);
    var list = make("div", "wb-candidates");
    var anyShorter = false;
    run.candidates.forEach(function (candidate) {
      var look = AI_STATES[candidate.status] || [candidate.status, "error"];
      var card = make("section", "wb-candidate");
      var top = make("div", "wb-candidate-head");
      top.append(make("h3", null, aiLabel(candidate)),
        make("span", "wb-pill is-" + look[1], look[0]));
      card.append(top, make("p", "wb-candidate-model", candidate.model));
      if (candidate.optimized_tokens != null) {
        card.append(make("p", "wb-candidate-num", candidate.optimized_tokens + " tokens · " +
          candidate.reduction_percent.toFixed(1) + "% fewer"));
      }
      if (candidate.status === "accepted") {
        anyShorter = true;
        var changes = wordChanges(r.original_text, candidate.optimized_prompt);
        card.append(changes ? marked(changes.right) : make("div", "wb-text", candidate.optimized_prompt),
          reviewControls(candidate.optimized_prompt));
      } else if (candidate.status === "running") {
        card.append(make("p", "wb-help", "Waiting for its answer…"));
      } else if (candidate.status === "rejected") {
        card.append(make("p", "wb-help", "Rejected, so the original is kept: " + candidate.checks.join(" ")));
      } else {
        // The optimizer's timeout wording, in plainer words for the website's 30-second limit
        var timedOut = /timed out/i.test(candidate.error || "");
        card.append(make("p", "wb-help", timedOut ?
          "Took longer than 30 seconds, so it was stopped. Its free plan is sometimes busy: run it again in a moment." :
          candidate.error || "This model didn't finish."));
      }
      list.append(card);
    });
    el.result.append(list);
    if (anyShorter) {
      var legend = make("p", "wb-legend");
      legend.append(make("ins", "wb-ins", "shaded"), " was reworded or added");
      el.result.append(legend);
    }
    el.result.append(make("p", "wb-help", run.note));

    var next = make("div", "wb-next");
    var tryNlp = make("button", "wb-secondary", "Try NLP on this prompt");
    tryNlp.type = "button";
    tryNlp.addEventListener("click", function () {
      switchMethod("nlp");
      var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      form.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    });
    var link = make("a", null, "See Results →");
    link.href = "results.html";
    next.append(tryNlp, link);
    el.result.append(next);
    render();
  }

  function showResult(run) {
    if (run.method === "ai") return showAiResult(run);
    var r = run.result;
    var changed = r.candidate_text !== r.original_text;
    shown = run;
    el.result.textContent = "";
    el.result.classList.remove("is-stale");
    el.result.hidden = false;

    var head = make("header", "wb-result-head");
    head.append(make("h2", null, NAMES[run.method] + " result"),
      make("span", "wb-pill is-" + r.status, OUTCOMES[r.status] || r.status));
    var stale = make("p", "wb-stale-note", "You changed the prompt or settings. Run again to refresh this result.");
    stale.hidden = true;
    el.result.append(head, stale);

    // The headline number, then the counts behind it
    var summary = make("div", "wb-summary");
    var hero = make("div", "wb-hero");
    hero.append(make("span", "wb-hero-num", r.reduction_percent.toFixed(1) + "%"),
      make("span", "wb-hero-label", "fewer tokens"));
    var stats = make("dl", "wb-stats");
    stat(stats, "Original", r.original_target_tokens + " tokens");
    stat(stats, "Suggestion", r.candidate_target_tokens + " tokens");
    stat(stats, "Saved", r.tokens_saved + " tokens");
    stat(stats, "Time", r.elapsed_seconds.toFixed(3) + " s");
    if (run.method === "nlp") stat(stats, "Strength", LEVEL_NAMES[run.nlp_mode] || run.nlp_mode);
    summary.append(hero, stats);
    el.result.append(summary);

    el.result.append(make("p", "wb-status", {
      review_required: "Shorter version found. Check that every task and constraint survived before you use it.",
      unchanged: run.method === "nlp" ?
        "Original kept: no shorter version passed the checks. NLP only rewords supported openings and removes exact repeats, so saving 0 tokens is a valid result." :
        "Original kept: no shorter version passed the checks.",
      error: "This method couldn't run. The reason is below."
    }[r.status]));

    var changes = changed ? wordChanges(r.original_text, r.candidate_text) : null;
    var sides = make("div", "wb-sides");
    sides.append(
      side("Original", changes ? marked(changes.left) : make("div", "wb-text", r.original_text)),
      side(changed ? "Suggestion" : "Original kept", changes ? marked(changes.right) : make("div", "wb-text", r.candidate_text)));
    el.result.append(sides);
    if (changes) {
      var legend = make("p", "wb-legend");
      legend.append(make("del", "wb-del", "Struck through"), " was removed · ",
        make("ins", "wb-ins", "shaded"), " was reworded or added");
      el.result.append(legend);
    }

    var plain = r.warnings.map(function (warning) {
      var tight = warning.match(/^Budget is (\d+) tokens, but the main task and mandatory sentences need (\d+) tokens/);
      if (tight) return "Nothing was removed: the sentences that must stay need " + tight[2] +
        " tokens, more than the budget of " + tight[1] + ". Untick Keep on some sentences or raise the budget, then run again.";
      return warning in NOTE_TEXT ? NOTE_TEXT[warning] : warning;
    }).filter(Boolean);
    if (plain.length) {
      var notes = make("ul", "wb-notes");
      plain.forEach(function (warning) { notes.append(make("li", null, warning)); });
      el.result.append(notes);
    }

    if (r.sentences && r.sentences.length) {
      el.result.append(make("h3", null, "Sentences kept and removed"), sentenceTable(r.sentences),
        make("p", "wb-help", "Removed something you need? Press Keep it next to that sentence and it runs again with it kept."));
    }

    var details = make("details", "wb-details");
    details.append(make("summary", null, "Line-by-line changes and protected requirements"),
      make("pre", "wb-diff", r.changes.join("\n") || "No changes."),
      make("p", "wb-help", r.protected_constraints.length ?
        "Checked to survive: " + r.protected_constraints.join(", ") : "No protected requirements were detected."));
    el.result.append(details);

    if (changed) el.result.append(reviewControls(r.candidate_text));

    // What to do next: try the other method on this prompt, or see both on Results
    var other = run.method === "nlp" ? "tfidf" : "nlp";
    var otherRun = (read(RUNS_KEY) || {})[other];
    var next = make("div", "wb-next");
    if (!otherRun || otherRun.result.original_text !== r.original_text) {
      var tryOther = make("button", "wb-secondary", "Try " + NAMES[other] + " on this prompt");
      tryOther.type = "button";
      tryOther.addEventListener("click", function () {
        switchMethod(other);
        var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        form.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      });
      next.append(tryOther);
    }
    var link = make("a", null, otherRun && otherRun.result.original_text === r.original_text ?
      "Both methods have run on this prompt: see them side by side on Results →" : "See Results →");
    link.href = "results.html";
    next.append(link);
    el.result.append(next);
    render();
  }

  // Start: show this method's last run if the form still matches it
  var runs = read(RUNS_KEY) || {};
  render();
  if (runs[state.method] && runs[state.method].signature === signature(state.method)) showResult(runs[state.method]);
  checkEngine();
})();
