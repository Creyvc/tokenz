"""Streamlit workbenches with independent drafts; backend services stay UI-free."""
import streamlit as st
from config import load_config
from service import compare_methods
from token_utils import count_tokens
from compressors.tfidf_compressor import split_sentences, inspect_tfidf_input
from compressors.nlp_compressor import NLP_MODES

NLP_EXAMPLE = "Please explain photosynthesis. Please explain photosynthesis."
TFIDF_EXAMPLE = (
    "Explain photosynthesis. The chlorophyll absorbs sunlight for plant growth. "
    "Yesterday the weather near the old bus station was cloudy and rainy."
)
LABELS = {"nlp": "NLP", "tfidf": "TF-IDF", "qwen": "Qwen"}
NLP_LEVEL_LABELS = dict(zip(NLP_MODES, ["1 · Conservative", "2 · Balanced",
    "3 · Aggressive", "4 · Maximum (20%+ target)"]))
NLP_LEVEL_HELP = {
    "conservative": "Remove supported polite openings and exact duplicate sentences.",
    "balanced": "Also shorten common request openings while keeping content nouns.",
    "aggressive": "Apply more phrase edits and remove duplicates made identical by those edits.",
    "maximum": "Target 20% or more by compacting supported framing and personal rationale. "
        "Source nouns in that wording may be removed. Review every task, detail and constraint. "
        "The target is not guaranteed for concise or protected prompts.",
}


def draft(view):
    drafts = st.session_state.setdefault("workbench_drafts", {})
    if view not in drafts:
        drafts[view] = dict(text="", phrases="", encoding="o200k_base", question="",
            task_choice=None, confirmed=False, budget=1, sentences=[], consent=False,
            include_qwen=False)
    drafts[view].setdefault("nlp_mode", "conservative")
    return drafts[view]


def key(view, field):
    name = f"workbench_{view}_{field}"
    if name not in st.session_state:
        st.session_state[name] = draft(view)[field]
    return name


def set_field(view, field, value):
    draft(view)[field] = value
    st.session_state[f"workbench_{view}_{field}"] = value


def changed(view, field):
    state = draft(view)
    state[field] = st.session_state[f"workbench_{view}_{field}"]
    if field == "text":
        # Locks and confirmation belong to one prompt and one workbench.
        for name, value in dict(question="", task_choice=None, confirmed=False,
                                sentences=[], budget=max(1, min(6000,
                                int(count_tokens(state['text'], state['encoding']) * .65)))).items():
            set_field(view, name, value)
    elif field == "task_choice":
        choice = state[field]
        sentences = split_sentences(state["text"])
        set_field(view, "question", sentences[choice] if choice is not None and choice >= 0 else "")
        set_field(view, "confirmed", False)
    elif field == "question":
        set_field(view, "confirmed", False)


def load_example(view):
    example = NLP_EXAMPLE if view in ("nlp", "qwen") else TFIDF_EXAMPLE
    set_field(view, "text", example)
    set_field(view, "phrases", "")
    set_field(view, "sentences", [])
    set_field(view, "consent", False)
    set_field(view, "confirmed", False)
    set_field(view, "task_choice", 0 if view in ("tfidf", "compare") else None)
    set_field(view, "question", "Explain photosynthesis." if view in ("tfidf", "compare") else "")
    set_field(view, "budget", max(1, int(count_tokens(example, draft(view)["encoding"]) * .65)))
    st.session_state.setdefault("workbench_runs", {}).pop(view, None)


def prompt_input(view):
    st.button(f"Try {LABELS.get(view, 'comparison')} example", key=f"example_{view}",
              on_click=load_example, args=(view,))
    return st.text_area(f"{LABELS.get(view, 'Comparison')} prompt", height=190,
        placeholder="Paste your educational prompt here.", max_chars=40000,
        key=key(view, "text"), on_change=changed, args=(view, "text"))


def advanced_settings(view):
    with st.expander("Advanced settings"):
        st.text_area("Protected phrases (one per line)", height=80,
            key=key(view, "phrases"), on_change=changed, args=(view, "phrases"))
        st.selectbox("Token counting encoding", ["o200k_base", "cl100k_base"],
            key=key(view, "encoding"), on_change=changed, args=(view, "encoding"))
        st.caption("The encoding counts both versions consistently. It does not choose the compression method.")


def use_budget(view, value):
    set_field(view, "budget", value)


def tfidf_settings(view):
    state = draft(view)
    sentences = split_sentences(state["text"]) if state["text"].strip() else []
    st.subheader("1. Choose the main task")
    st.selectbox("Main task", list(range(len(sentences))) + [-1], index=None,
        placeholder="Choose the sentence that states your task…", key=key(view, "task_choice"),
        format_func=lambda i: "Use a custom excerpt…" if i == -1 else f"{i+1}. {sentences[i]}",
        on_change=changed, args=(view, "task_choice"))
    if state["task_choice"] == -1:
        st.text_area("Exact task excerpt", height=85, key=key(view, "question"),
                     on_change=changed, args=(view, "question"))
    elif state["question"]:
        st.caption("Kept exactly: " + state["question"])
    st.checkbox("I confirm this is my main task", key=key(view, "confirmed"),
                 on_change=changed, args=(view, "confirmed"))
    st.subheader("2. Choose how much to keep")
    st.number_input("Token budget", 1, 6000, key=key(view, "budget"),
                     on_change=changed, args=(view, "budget"))
    with st.expander("Lock or restore sentences"):
        st.multiselect("Sentences to keep", list(range(len(sentences))),
            format_func=lambda i: f"{i+1}. {sentences[i]}", key=key(view, "sentences"),
            on_change=changed, args=(view, "sentences"))
        st.caption("Select an excluded sentence here and run again to restore it.")
    advanced_settings(view)
    plan = inspect_tfidf_input(state["text"], state["question"], state["sentences"],
                               state["encoding"], state["phrases"].splitlines())
    minimum = plan["minimum_required_tokens"]
    suggested = min(6000, max(minimum or 1, int(plan["original_tokens"] * .65)))
    st.button("Use suggested budget", key=f"suggest_{view}", on_click=use_budget,
               args=(view, suggested), disabled=not state["text"].strip())
    if state["text"].strip():
        st.caption(f"Original: {plan['original_tokens']} tokens. " +
            (f"The main task and locks need {minimum} tokens." if minimum is not None else "Choose your main task to see the minimum budget."))
        for problem in plan["problems"]:
            st.info(problem)
        if plan["main_task_valid"] and not state["confirmed"]:
            st.info("Confirm the main task above before running TF-IDF.")
        if minimum is not None and state["budget"] < minimum:
            st.warning(f"Budget too small: keep at least {minimum} tokens, or review your locks.")
    return not plan["problems"] and state["confirmed"] and minimum is not None and state["budget"] >= minimum


def qwen_notice(view):
    ready = False
    try:
        config = load_config()
        config.validate()
        ready = True
        st.info(f"Qwen configuration ready: {config.model}. Live connection has not been verified.")
    except ValueError:
        st.info("Qwen is not configured. Its live evaluation is deferred for this submission.")
    st.warning("Running Qwen sends this screen's prompt to Alibaba Cloud Model Studio, with at most two model requests.")
    st.checkbox("Allow this prompt to be sent to Qwen", key=key(view, "consent"),
                 on_change=changed, args=(view, "consent"))
    return ready


def signature(view):
    state = draft(view)
    fields = ["text", "phrases", "encoding"]
    if view == "nlp":
        fields += ["nlp_mode"]
    if view in ("tfidf", "compare"):
        fields += ["question", "confirmed", "budget", "sentences"]
    if view in ("qwen", "compare"):
        fields += ["consent", "include_qwen"]
    return tuple(tuple(state[name]) if isinstance(state[name], list) else state[name] for name in fields)


def run(view):
    state = draft(view)
    if view not in LABELS:
        raise ValueError("Run a method on its own screen; comparison only displays saved results.")
    results = compare_methods(state["text"], dict(methods=[view], encoding=state["encoding"],
        nlp_mode=state["nlp_mode"],
        locked_spans=state["phrases"].splitlines(), main_question=state["question"] if state["confirmed"] else "",
        token_budget=int(state["budget"]), locked_sentences=state["sentences"],
        allow_external=state["consent"] if view == "qwen" else False))
    runs = st.session_state.setdefault("workbench_runs", {})
    version = runs.get(view, {}).get("version", 0) + 1
    runs[view] = dict(results=results, signature=signature(view), version=version,
                      encoding=state["encoding"], nlp_mode=state["nlp_mode"])


def render_result(view, result, version):
    label = LABELS[result.method]
    st.subheader(f"{label} result")
    if result.status == "review_required":
        st.info("Shorter suggestion. Check every requested task and constraint before using it.")
    elif result.status == "error":
        st.error("This method could not run. See the reason below.")
    else:
        st.info("Original kept. No shorter suggestion passed the checks.")
        if result.method == "nlp":
            st.caption("NLP makes supported phrase edits and removes exact duplicates. "
                       "It does not generally summarize background sentences, so some prompts correctly save 0 tokens.")
    if result.method == "nlp":
        st.caption(f"NLP mode: {draft(view)['nlp_mode'].title()}")
        if draft(view)["nlp_mode"] == "maximum":
            if result.reduction_percent >= 20:
                st.success(f"20% target reached: {result.reduction_percent:.1f}% fewer prompt tokens. Review the retained requirements.")
            else:
                st.info(f"20% target not reached: {result.reduction_percent:.1f}% saved. "
                        "No extra text was deleted just to meet the target. Check protected phrases and the change details.")
    cols = st.columns(4)
    for col, title, value in zip(cols, ["Original tokens", "Suggestion tokens", "Saved", "Runtime"],
        [result.original_target_tokens, result.candidate_target_tokens,
         result.tokens_saved, f"{result.elapsed_seconds:.3f}s"]):
        col.metric(title, value)
        if title == "Saved":
            col.caption(f"{result.reduction_percent:.1f}% reduction")
    original, suggestion = st.columns(2)
    prefix = f"result_{view}_{result.method}_{version}"
    original.text_area("Original", result.original_text, disabled=True, height=135, key=prefix+"_original")
    suggestion.caption("Suggestion" if result.tokens_saved else "Original retained")
    suggestion.code(result.candidate_text, language=None, wrap_lines=True)
    for warning in result.warnings:
        st.caption(warning)
    with st.expander("See changes and protected requirements"):
        st.code("\n".join(result.changes) or "No changes.", language="diff")
        st.write(result.protected_constraints)
    if result.sentences:
        st.write("Sentences kept and removed")
        st.dataframe([dict(Sentence=row["text"], Kept=row["selected"],
            Relevance=row["score"], Reason=", ".join(row.get("mandatory_reasons", [])))
            for row in result.sentences], hide_index=True, use_container_width=True)
        st.caption("Restore any removed sentence using the sentence locks above, then run again.")
    if result.api_usage is not None:
        with st.expander("Provider usage and controller trace"):
            st.json(result.api_usage)
            st.caption("Price not configured or usage incomplete" if result.api_usage["estimated_cost_usd"] is None else "Estimated cost uses configured provider prices.")
            st.json(result.agent_trace)
    reviewed = st.checkbox("I checked every requested task and constraint", key=prefix+"_review")
    st.download_button("Download reviewed prompt", result.candidate_text,
        file_name=f"{result.method}_prompt.txt", disabled=not reviewed, key=prefix+"_download")


def show_results(view):
    saved = st.session_state.get("workbench_runs", {}).get(view)
    if not saved:
        return
    if saved["signature"] != signature(view):
        st.info("Settings changed. Run this test again to refresh its result.")
        return
    for result in saved["results"]:
        render_result(view, result, saved["version"])


def render_comparison():
    """Read-only view of current individual tests. Never invokes a compressor."""
    st.header("Compare methods")
    st.write("View the latest NLP and TF-IDF results from their own screens. No new test runs here.")
    st.caption("Run both methods using the sidebar in this browser tab, then return here.")
    runs = st.session_state.get("workbench_runs", {})
    results, encodings, missing = [], [], []
    for method in ("nlp", "tfidf"):
        saved = runs.get(method)
        if not saved:
            missing.append(f"Run {LABELS[method]} on its own screen first.")
            continue
        if saved["signature"] != signature(method):
            missing.append(f"{LABELS[method]} settings changed. Run {LABELS[method]} again to refresh its result.")
            continue
        result = next((r for r in saved["results"] if r.method == method), None)
        if result is None:
            missing.append(f"Run {LABELS[method]} again to save its result.")
            continue
        results.append(result)
        encodings.append(saved.get("encoding", saved["signature"][2]))
    if missing:
        for message in missing:
            st.info(message)
        return

    same_prompt = results[0].original_text == results[1].original_text
    st.dataframe([{"Method": LABELS[r.method], "Original tokens": r.original_target_tokens,
        "Result tokens": r.candidate_target_tokens, "Tokens saved": r.tokens_saved,
        "Reduction (%)": round(r.reduction_percent, 2), "Runtime (s)": round(r.elapsed_seconds, 3),
        "Outcome": r.status.replace("_", " "), "Encoding": encoding,
        "NLP mode": runs["nlp"].get("nlp_mode", "conservative").title() if r.method == "nlp" else "—"}
        for r, encoding in zip(results, encodings)], hide_index=True, width="stretch")
    if len(set(encodings)) != 1:
        st.warning("These results use different token encodings. Choose the same encoding under Advanced settings on both method screens and rerun before comparing their counts.")
    elif same_prompt:
        st.bar_chart({"Method": ["Original prompt", "NLP", "TF-IDF"],
            "Tokens": [results[0].original_target_tokens] + [r.candidate_target_tokens for r in results]},
            x="Method", y="Tokens", sort=False, y_label="Prompt tokens")
        st.caption("Original prompt is the baseline with no reduction. Both methods used the same original text.")
    else:
        st.warning("These results came from different prompts. Use the same original text on both method screens for a fair comparison. Each method's own baseline is shown below.")
        st.bar_chart({"Method": [LABELS[r.method] for r in results],
            "Original prompt": [r.original_target_tokens for r in results],
            "After compression": [r.candidate_target_tokens for r in results]},
            x="Method", y=["Original prompt", "After compression"], stack=False, sort=False,
            color=["#9aaab4", "#1b6577"], y_label="Prompt tokens")
    if results[0].tokens_saved == 0 and results[0].status != "error":
        st.info("NLP saved 0 tokens on this prompt. No shorter edit passed the checks for the selected mode. NLP uses supported phrase edits and exact duplicates; it does not summarize background context. This is a valid unchanged result.")
    st.caption("Token savings and runtime describe the completed tests. Shorter output still needs human review for retained requirements.")
    with st.expander("View the tested prompts and suggestions"):
        for result in results:
            st.write(LABELS[result.method])
            st.caption("Original")
            st.code(result.original_text, language=None, wrap_lines=True)
            st.caption("Suggestion" if result.tokens_saved else "Original retained")
            st.code(result.candidate_text, language=None, wrap_lines=True)


METHOD_EXPLANATIONS = {
    "nlp": """
**NLP — shorten wording locally**

This method reads the sentences and their grammatical structure using spaCy, then applies supported wording rules. For example, “What I mainly need you to do is calculate mean sales” can become “Calculate mean sales.” It can also remove exact duplicate sentences. Your prompt stays on your PC.

- **Conservative:** removes supported polite openings and exact duplicates.
- **Balanced:** also shortens common request openings while checking that content nouns remain.
- **Aggressive:** applies more phrase edits and removes sentences made identical by those edits.
- **Maximum:** also compacts supported introductory wording and personal rationale, targeting 20% or more reduction. Some source nouns can be removed at this level.

Protected phrases, detected requirements and token counts are checked before returning a suggestion. If no shorter edit passes, the original is kept. A concise prompt may have little to remove; Maximum cannot guarantee 20% for every prompt. These rules do not understand every repeated idea, so review the changes for lost tasks or meaning.
""",
    "tfidf": """
**TF-IDF — select relevant sentences locally**

TF-IDF means *Term Frequency–Inverse Document Frequency*. This method compares each sentence's words with the main task you select. Words that are less common across the sentences receive more weight, helping it rank context by its word overlap with your task. Your prompt stays on your PC.

1. Select and confirm your main task, then choose a token budget.
2. The method keeps the main task, locked sentences and detected protected requirements first.
3. It adds other sentences in relevance order when they fit the budget, preserving their source wording and order.

Use it for prompts with at least three sentences and removable background. It removes whole sentences rather than rewriting them. If mandatory content exceeds the budget, increase the budget or review your locks. Word overlap does not prove that a sentence is unnecessary: check that every requested subtask survives. Some inputs correctly remain unchanged.
""",
    "qwen": """
**Qwen — ask a language model to rewrite the prompt**

With a configured Alibaba Cloud Model Studio account and your explicit permission, this method sends the prompt to Qwen to propose a shorter version. It asks the model to preserve your task and constraints and to return a rewritten prompt rather than answer the task.

The app checks the proposal locally for fewer tokens and detected protected requirements. If the first proposal fails these checks, the controller can request one correction, with at most two model requests in total. If no proposal passes, it keeps the original.

Unlike the local methods, this sends text to an external provider and may incur provider usage charges. Configuration and consent are required before running. Live Qwen evaluation is deferred for this submission; passing automatic checks still requires human review of the suggestion.
""",
    "compare": """
**Understand the comparison**

This page displays your latest NLP and TF-IDF tests from their individual screens; it does not run another compression test. Use the sidebar in the same browser tab to run both methods with the same original prompt and token encoding, then return here.

The **Original prompt** bar is the baseline with no reduction. The other bars show how many tokens remain after each method: a shorter bar means fewer prompt tokens. With different prompts, each method gets its own baseline and a warning. Results with different encodings cannot share a fair token-count chart.

The table shows savings, runtime and the saved NLP intensity. Changing a method's settings requires rerunning it before comparison. Token savings alone do not show whether a suggestion retained every requirement; review both outputs alongside their original prompts.
""",
}


def explain_method(view):
    st.divider()
    st.subheader("How this method works" if view != "compare" else "How to read this comparison")
    st.markdown(METHOD_EXPLANATIONS[view])


def render_workbench(view):
    if view == "compare":
        render_comparison()
        explain_method(view)
        return
    state = draft(view)
    if view == "nlp":
        st.header("NLP compression")
        st.write("Shorten wording and repeated sentences. Runs locally on your PC.")
        prompt_input(view)
        st.selectbox("NLP reduction", NLP_MODES,
            format_func=lambda mode: NLP_LEVEL_LABELS[mode], key=key(view, "nlp_mode"),
            on_change=changed, args=(view, "nlp_mode"))
        if state["nlp_mode"] != "conservative":
            st.info(NLP_LEVEL_HELP[state["nlp_mode"]])
        else:
            st.caption(NLP_LEVEL_HELP["conservative"])
        advanced_settings(view)
        label, ready = "Run NLP", bool(state["text"].strip())
    elif view == "tfidf":
        st.header("TF-IDF sentence selection")
        st.write("Keep your main task and select context sentences that fit a token budget. Use at least three sentences.")
        prompt_input(view)
        ready = tfidf_settings(view) and bool(state["text"].strip())
        label = "Run TF-IDF"
    elif view == "qwen":
        st.header("Qwen compression")
        st.write("Optional provider integration. Live evaluation is deferred for this submission.")
        prompt_input(view)
        advanced_settings(view)
        configured = qwen_notice(view)
        label, ready = "Run Qwen", configured and state["consent"] and bool(state["text"].strip())
    if st.button(label, type="primary", disabled=not ready, key=f"run_{view}"):
        with st.spinner("Checking this prompt…"):
            run(view)
    show_results(view)
    explain_method(view)
