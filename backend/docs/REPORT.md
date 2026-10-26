# TokenSaver — project report draft

**Status:** Local-method experiment complete; human retention ratings pending. Live Qwen evaluation is deferred by the confirmed submission scope.  
**Project scope:** English educational prompt-text compression; local Python application.  
**Authors / course / institution:** [Complete before submission]

## Abstract

TokenSaver implements three approaches to reducing educational prompt-text tokens: bounded Qwen rewriting, conservative spaCy transformations, and TF-IDF sentence selection. This submission experimentally compares the two local methods; Qwen is implemented and mock-tested, with live evaluation deliberately deferred. The application separates local token measurement from provider usage and API cost. A modular Python backend supplies a replaceable Streamlit frontend. The Qwen controller validates proposals locally, accepts only shorter passing outputs, and allows at most one revision. This report does not claim semantic equivalence, real Qwen performance, or ChatGPT subscription savings.

## Research question

For the measured scope of this submission: how do local NLP transformations and TF-IDF sentence filtering compare in prompt-text reduction, runtime and retention of requested educational requirements?

The original broader question also included Qwen rewriting and provider overhead. The architecture and mocked tests address its implementation, but this submission does not experimentally answer that three-method question. Live Qwen comparisons and API pricing measurements are deferred work.

## Design and implementation

See `ARCHITECTURE.md` and `architecture.svg`. `service.py` exposes backend functions to any Python frontend. `CompressionResult` supplies text, token metrics, warnings, differences, protected spans and optional provider usage/agent trace. Each method fails independently so unavailable Qwen credentials do not disable local compression. The frontend separates NLP and TF-IDF into their own workbenches, with independent drafts/results. Task confirmation, budgets and sentence locks appear on TF-IDF only; Qwen consent is confined to its optional screen. Comparison displays the latest individual NLP and TF-IDF tests without running a new test; a common baseline requires the same source text and encoding.

Qwen is accessed using the OpenAI Python SDK configured for Alibaba Cloud's endpoint. The controller treats input as transformation data and exposes no executable tools. It rejects empty, wrapped, truncated, longer or mechanically invalid proposals. It returns the original when validation or budgets fail. The initial request and optional revision are the only model calls; transport errors are not retried. Prices and provider settings are configurable. The default model name is a starting configuration, not a promise of regional availability.

The NLP baseline uses spaCy dependency parsing to remove supported polite openings when the sentence root is a verb and removes exact duplicate sentences. It protects detected entities and content nouns in addition to shared constraints. These deliberately conservative rules may leave many prompts unchanged.

An optional Aggressive NLP mode was added after the saved experiment. It uses explicit phrase substitutions to shorten request framing and merges sentences made identical by those substitutions. Nouns, detected constraints and literal locks remain checked; shortened suggestions still require human review. The long sales-analysis development example measured 659 → 653 tokens in Conservative mode and 659 → 617 in Aggressive mode with the default encoding. The 24-prompt experiment and 15-case review packet below describe **Conservative NLP only**; they are not evidence about Aggressive NLP retention or aggregate performance. No study records or pending ratings were replaced.

Subsequent intensity controls add Balanced and Maximum. Maximum compacts supported framing and personal rationale and targets 20% reduction; it checks detected constraints, entities and locks but relaxes the all-source-noun safeguard. The same sales development example yielded Balanced 659 → 639 (3.0%) and Maximum 659 → 508 (22.9%). Maximum reports an unmet target for concise/locked prompts rather than deleting arbitrary text. These single-example results do not establish general performance or retention. The saved experiment and review packet remain unchanged and apply only to Conservative NLP.

TF-IDF compares a confirmed verbatim main task with each sentence, then greedily includes sentences under a target token budget in descending similarity order. It preserves original order in the result. Main-task sentences, user-locked sentences and sentences containing protected constraints are mandatory. An infeasible budget returns the original. Scores describe lexical similarity, not semantic dispensability.

## Evaluation method

`evaluation.py` runs 24 synthetic prompts across six categories: concise, polite, repetitive, background, constrained and adversarial. Each local method receives the same text and tokenizer. TF-IDF receives a main question and a 60% token budget (minimum eight tokens). All examples and outputs are saved, allowing reviewers to inspect failures and unchanged cases. Timings include cold-start loading. Results should not be generalized to all student prompts.

Measured local results appear in `evaluation/summary.md`; full per-prompt observations are in `evaluation/results.json`. The test execution record appears in `TEST_RESULTS.txt`. Live Qwen evaluation is outside the confirmed submission scope. Mocked results validate software behavior only and are not Qwen experimental data. No account setup, paid calls or measured Qwen performance is required for this submission.

The user will act as the single human reviewer for all 15 shortened outputs: 11 NLP and 4 TF-IDF. `evaluation/RETENTION_REVIEW.md` contains every original/suggestion pair and an unfilled checklist; `evaluation/review_ratings.json` is an optional structured answer sheet. `evaluation/review_cases.json` snapshots the exact source records with a source fingerprint. Original experimental records remain unchanged and their human-rating fields remain null.

The acceptance rule is strict: every requested task, subtask and explicit constraint must survive. Losing a requested lesson section is unacceptable even when the main topic remains. The reviewer checks tasks/subtasks, concepts and requested examples, negations/quantities/conditions, audience/language/format, and added or contradictory requirements. Any lost requirement makes the verdict unacceptable. An unresolved criterion yields an unsure verdict. Background can be deleted only if these requirements survive.

These 15 shortened outputs form the denominator for the planned human assessment. The other 33 outcomes were unchanged; they are reported separately and are not assigned human retention ratings. No shorter candidate is called meaning-preserving based only on automatic checks or reduction percentage. The review is not blinded: method labels and token metrics are visible.

| Method | Shortened outputs | Human reviews completed | Awaiting review | Retention verdicts |
|---|---:|---:|---:|---|
| NLP | 11 | 0 | 11 | Not assessed |
| TF-IDF | 4 | 0 | 4 | Not assessed |

After the user returns the completed review packet or answer sheet, consolidate ratings and report acceptable, unacceptable and unsure counts per method, with the corresponding denominators and examples of lost requirements. Do not invent ratings or treat the single reviewer's judgments as a universal semantic-equivalence guarantee.

### Measured local results

The recorded 48 local executions produced the following results. These are averages of per-prompt reductions, not aggregate token reduction or human retention scores.

| Method | Prompts | Mean reduction | Unchanged | Errors |
|---|---:|---:|---:|---:|
| NLP | 24 | 16.39% | 13 | 0 |
| TF-IDF | 24 | 8.60% | 20 | 0 |
| Qwen | Not run | Not measured | Not measured | Not measured |

NLP reduced polite and duplicate requests most consistently. TF-IDF reduced all four long-background prompts (51.58% mean reduction in that category) and left the other categories unchanged. These results support the expected specialization of the baselines on this synthetic set; they do not establish that the shortened prompts retained all necessary information.

## Limitations and threats to validity

Software verification: **83 tests passed** in the latest run (`TEST_RESULTS.txt`). Coverage includes provider errors, bounded revision, token/constraint checks, usage aggregation, consent isolation, UI reruns, review reset, exact main-task selection, actionable budget diagnostics, stale-lock reset, multiline tasks and independent method drafts/results across navigation. Earlier browser evidence reduced the three-sentence example from 26 to 13 tokens (`tfidf-fixed.png`). The original `TokenSaver-demo.webm` records the older shared interface; the current separate workbenches are described in `HOW_TO_TEST.md`. It contains no live Qwen call.

- Deterministic checks cannot detect all scope changes, paraphrase errors or lost technical meaning. Generic term extraction is incomplete; users should lock important phrases.
- A negation can remain present while its scope changes. The review step is essential.
- Duplicate removal can alter emphasis. Conservative span checks can also reject harmless paraphrases.
- TF-IDF can discard semantically necessary low-similarity context. Main-task confirmation and restoration controls mitigate but do not eliminate this risk.
- No live Qwen integration test or pricing experiment has been performed without credentials.
- Provider errors can leave usage unknown. Partial usage is labeled and cost stays unknown.
- Prompt-text counts omit hidden ChatGPT context and message framing. Qwen uses provider-reported usage for billing; its tokenizer is not assumed to match tiktoken.
- Token reduction does not demonstrate dollar savings on a ChatGPT subscription. A compression call may cost more than downstream token savings.
- Synthetic inputs and a small sample limit external validity. No claim of prompt-injection immunity is made.
- Human retention evidence is currently absent. The planned single reviewer, visible method labels and lack of blinding limit reliability and introduce potential reviewer bias. No agreement statistic can be reported without independent reviewers.
- An unchanged outcome is valid when its reason is explained; it is not successful compression and contributes zero token savings. A shorter output can still fail retention assessment.

## Five-day completion plan

| Day | Work and evidence |
|---|---|
| 1 | Review backend contract, install dependencies, run baseline tests and local app. |
| 2 | User reviews all 15 shortened outputs using the supplied checklist; quote any lost requirements. |
| 3 | Frontend team checks the existing Python functions, serialized result schema, runnable example and tests; add no HTTP server. |
| 4 | Consolidate actual human ratings, report failures and uncertainty, and distinguish token reduction from retention. |
| 5 | Finalize analysis, authors/course details and architecture; record or replace demo and rehearse presentation. |

## Conclusion

The implementation supports reproducible local comparisons and bounded provider orchestration. The measured experiment covers NLP and TF-IDF, with observed mean per-prompt token reductions of 16.39% and 8.60% on this synthetic set. Human retention conclusions remain pending the user's 15-case assessment. Qwen performance is not measured and live evaluation is deferred beyond this submission. The existing Python interface lets a Python frontend reuse the backend without a new HTTP server.

## References

- Alibaba Cloud Model Studio overview and account-dependent endpoint: https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio
- Qwen OpenAI-compatible API: https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions
- Model prices and regional availability: https://www.alibabacloud.com/help/en/model-studio/model-pricing
- tiktoken: https://github.com/openai/tiktoken
- spaCy linguistic features: https://spacy.io/usage/linguistic-features
- scikit-learn TF-IDF: https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html
