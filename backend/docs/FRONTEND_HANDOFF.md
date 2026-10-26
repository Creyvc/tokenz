# Frontend integration contract

The confirmed handoff is the existing Python interface and serialized result contract; add no HTTP server for this MVP. The backend has no Streamlit dependency at its boundary. Import `compare_methods` from `service.py` from the project root. A separately running browser frontend would need a future adapter outside this submission's scope.

Run the standalone example from the project root with `python -m examples.frontend_handoff`. It prints JSON for two local-method results using synthetic text, with external calls disabled. Existing interface/behavior tests are in `tests/test_backend.py` and `tests/test_tfidf_diagnostics.py`; the complete suite runs with `python -m pytest -q`. No added service or dependency is needed.

```python
from service import compare_methods

results = compare_methods(
    "Explain photosynthesis. Plants absorb sunlight. The bus was late.",
    {
        "methods": ["nlp", "tfidf"],
        "encoding": "o200k_base",
        "nlp_mode": "conservative",  # balanced, aggressive or maximum; local editing
        "main_question": "Explain photosynthesis.",  # user confirms verbatim task
        "token_budget": 14,
        "locked_spans": ["photosynthesis"],
        "locked_sentences": [],  # zero-based indices from split_sentences(text)
        "allow_external": False,
    },
)
payload = [result.to_dict() for result in results]
```

`CompressionResult` in `models.py` defines the complete payload. Statuses are `unchanged`, `review_required`, or `error`. Every shortened suggestion requires review; no `success` status asserts semantic equivalence. Results retain the original text on errors or failed validation. `sentences` provides TF-IDF text, scores and selection states. `agent_trace` lists Qwen attempt/action/reason records. Provider token counts are separate from target text-token counts.

`compress_with_nlp(text, locked_spans=None, encoding="o200k_base", *, mode="conservative")` also accepts `mode="aggressive"`. The default behavior is unchanged. Aggressive applies supported phrase substitutions, checks local noun/constraint presence, skips rewriting quoted/code/literal-lock sentences, and deduplicates only identical rewritten sentences. Shared validation still gates the final result. There is no semantic equivalence guarantee or external call. The UI saves mode alongside its result and invalidates results when mode changes; callers should retain their requested mode with their serialized result. Unknown modes produce isolated service errors.

The complete mode set is now `conservative`, `balanced`, `aggressive`, `maximum` (exported as `NLP_MODES`). Balanced uses a smaller phrase-edit set. Maximum adds framing/rationale compaction and relaxes the all-source-noun checks; shared protected constraints, entities and literal locks are still checked. No noun-presence or constraint-presence check proves meaning retention. Maximum reports reached/not-reached for a 20% target in result warnings and the UI. It returns the strongest supported validated edit even below target; it never removes arbitrary extra sentences to force a percentage. A lock may prevent reduction altogether. The result schema is unchanged.

TF-IDF also returns optional `selection_info`: `token_budget`, `sentence_count`, `minimum_required_tokens`, `main_task_valid`, and `reason_code`. Reasons distinguish `input_not_ready`, `invalid_budget`, `budget_too_small`, `empty_vocabulary`, `all_sentences_retained`, `selected`, and validation failures. Each sentence row includes `mandatory_reasons` so the frontend can explain locks and constraints. Scores are null when no ranking ran. On fallback, `selected=True` for all rows because the returned text is the original.

Use `inspect_tfidf_input` from `compressors/tfidf_compressor.py` for local preflight before running. It identifies exact-source task matches and the token count needed by mandatory sentences. Its internal `mandatory` set is for Python callers; use `selection_info` in exported results. Let users select an exact sentence rather than requiring them to retype punctuation, case and Markdown. They must still confirm the main task. Clear task confirmation and sentence-index locks when the source text changes. The TF-IDF workbench starts new prompts with a 65% budget and disables its Run button for infeasible budgets; it never silently drops a mandatory constraint. The comparison screen displays saved local results only. An unchanged NLP result is valid: this method removes supported polite openings and exact duplicates, not general background context.

For Qwen, show an external-transfer notice and obtain affirmative action, then pass `allow_external=True` and include `qwen` in methods. The direct `compress_with_qwen` function assumes the caller has already obtained consent. Never invoke it on keystrokes or rerenders. `config` and `qwen_client` can be injected for tests. SDK retries are disabled. An optional setting rejected by the account must be omitted via configuration; the application does not spend another request probing capabilities.

When any input changes, invalidate old results and reset approval. Render candidate text as text, never untrusted HTML. Show diff, warnings and protected spans before copy/download. Run TF-IDF again with restored sentence indices; never silently remove a lock to meet a token budget. The displayed code block offers Streamlit's copy control; the reviewed download button remains disabled until the reviewer checks the acknowledgment.

An explained `unchanged` result is valid comparison behavior and contributes zero savings. `review_required` means a shorter suggestion passed mechanical checks; it is not a human retention verdict. Under the agreed rule, any lost requested subtask or explicit constraint makes a suggestion unacceptable even if its main topic survives. Student review in the app and the formal 15-case study checklist are distinct: checking the UI acknowledgment does not populate study ratings.

The submission's measured experiment covers NLP and TF-IDF only. Qwen is implemented and mock-tested, with live evaluation deferred. Keep its configuration state visible and do not present mock usage or costs as live experimental results.

No API key or raw prompt is logged by application code. Results live in the UI session; exports are explicit. If your team introduces persistence or remote hosting, reassess privacy, transport and access controls first.

The frontend now separates NLP, TF-IDF, comparison and optional Qwen into independently rendered workbenches. `ui_workbenches.py` keeps durable drafts/results apart from transient widget keys so navigating between screens does not leak prompts, locks, consent or results. Local screen calls always restrict methods to that single local method and disable external transfer. URL hints `?view=nlp` and `?view=tfidf` can open a screen directly. The backend functions and result schema are unchanged.

Owner split: backend team owns `config.py`, `models.py`, `token_utils.py`, `validation.py`, `service.py`, `compressors/` and their tests. Frontend team owns `app.py`, `ui_workbenches.py` or their replacement. Agree on schema changes before modifying `CompressionResult`.

## Website adapter (added 26 October 2026 by the Tokenz frontend team)

The group asked for the Tokenz website itself to run the methods, so `web_api.py` now adds the adapter this document called a future step. It is outside the original submission scope and leaves the backend untouched: it calls `compare_methods` and `inspect_tfidf_input` and returns `CompressionResult.to_dict()` unchanged.

- `GET /api/health`: the methods, NLP modes and encodings it accepts, and under `ai` whether the AI rewrite is set up (each model with its reason when not).
- `POST /api/inspect`: `{text, main_question, locked_sentences, locked_spans, encoding}` returns the sentence rows, `problems`, `original_tokens`, `minimum_required_tokens` and `suggested_budget` (65% of the original, never below the minimum).
- `POST /api/compress`: `{method: "nlp" | "tfidf", text, nlp_mode, main_question, token_budget, locked_sentences, locked_spans, encoding}` returns `{result, nlp_mode, encoding}`.
- `POST /api/optimize` (added with `optimizer/`): `{text, encoding}` returns `{status, original_tokens, encoding, candidates, note}`, one candidate per model (`provider`, `model`, `status` accepted/rejected/failed, `optimized_prompt`, `optimized_tokens`, `tokens_saved`, `reduction_percent`, `checks`, `error`). 503 until Groq and Gemini are set up, 504 if it times out. It is the only route that sends the prompt off this computer, so a page using it must say so.

On `/api/compress` Qwen is refused and `allow_external` is always false, and the server binds to 127.0.0.1 and checks the Host header. Inputs are validated (text up to 40,000 characters, budget 1–6000, known modes and encodings) and requests are handled one at a time around spaCy. The website follows the rules above: the user picks the main task from the exact sentences (that click is the confirmation; nothing is inferred), locks and confirmation reset when the prompt changes, results are shown as text, stale results are marked, and copying the suggestion needs the review tick.
