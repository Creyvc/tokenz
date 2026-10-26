# Tokenz 0.2 — live handover

## Prompt optimization only, 26 October 2026

- User clarified that Groq/Gemini must only rewrite prompts. Implemented `app/prompt_optimization.py`, with a new `prompt_optimization_v1` study schema and dedicated optimizer-only instruction template.
- Each provider receives the original independently. No baseline answer, shortened-prompt answer, or AI quality-judge request is dispatched. Identical completed prompt comparisons are reused; partial runs retry only failed optimizers.
- Active Results/History exclude previous answer-generation studies. Results now shows the two selected prompts, local token savings, wording changes, guarded candidates and exact safe highlights. Answer/quality tabs and controls are removed.
- Combined Copy & open ChatGPT action uses clipboard plus a plain chatgpt.com browser URL. The user must paste and send; fallback copy icon, Open ChatGPT link and plain-text downloads are provided. No prompt appears in a URL, no ChatGPT session credentials are read, no replies are retrieved and no OpenAI API requests are made. Clipboard/popup behavior depends on browser permissions and was not live-browser verified under the existing browser policy restriction.
- Official documentation checked: https://developers.openai.com/siwc/quickstart and https://learn.chatgpt.com/docs/sign-in-with-chatgpt. Plan-powered integrations document eligible Plus/Pro users, not free-account generation access for this app.
- Live optimizer-only study `48f5d090-6f93-4b92-9d79-9709df460e82` completed both Groq Qwen and Gemini 3.6 Flash rewrites. Both reduced the same private prompt from 87 to 40 local tokens (54.0%). No answers or quality reviews were generated. Quality retention is explicitly deferred to later ChatGPT evaluation.
- 195 tests pass, including exactly-two-call enforcement, resume/reuse, rejected rewrite handling, no-quality UI, escaped handoff data and prompt-free browser URLs. Private prompt reports remain local and outside the source bundle; sanitized evidence is in `presentation/Optimizer-Only-Verification.json`.

## Partial-result recovery, 26 October 2026

The user's latest prompt failed at Groq optimization (HTTP 429) and Gemini baseline (HTTP 503). The original Groq answer had hit its output limit. Fixed the UI's false “shorter prompt produced” message when no optimized prompt existed, added saved-answer counts and a readable original-answer preview, distinguished truncated drafts, and made Resume unfinished steps reopen the correct saved prompt directly.

Focused runs now allow 4096 answer tokens, size optimizer output to the input (minimum 256 tokens), and cap AI-review output at 768 tokens. Successful baseline and optimizer requests in a failed comparison are restored to exact memo keys on explicit resume. Truncated outputs are not reused; prior attempts remain preserved. Groq waits on reported token resets (up to 60 seconds) and retries one explicitly rejected HTTP 429 only when a provider-supplied numeric cooldown is at most 30 seconds. Ambiguous failures/timeouts are not automatically retried. Provider messages expose only safe numeric cooldowns/HTTP status, never raw provider errors.

Recovery saved a complete original Groq answer and a shorter prompt for study `e8ab1f05-c81d-479d-844d-084d713a395e`. Its shortened-answer request remained rate-limited; Gemini returned HTTP 503 and then timed out. The comparison remains explicitly partial; no missing answer or score is fabricated. Private prompt/recovery reports remain local and outside the source bundle. The full 190-test suite passed, followed by focused regression checks for the final UI/resume change. The actual private saved run was verified in Streamlit AppTest: one complete original answer is exposed, zero interface exceptions, and Resume restores the exact saved prompt and opens the run step. Sanitized evidence: `presentation/Partial-Recovery-Verification.json`.

## Groq and Gemini focus, 26 October 2026

- User selected Groq/Gemini and explicitly confirmed both free accounts have billing disabled. Local confirmation flags are now enabled.
- Active workflow uses exactly Groq Qwen and Google Gemini Flash through their official native adapters. OpenRouter and OpenAI are absent from the website flow; older evidence remains archived locally.
- Input controls reduced to the prompt and optional quality estimate. Each model independently rewrites the same original, answers both versions and optionally reviews its anonymous pair. Exactly two paired comparisons are planned, rather than a four-way matrix.
- The result opens with two analysis cards. Full responses are collapsed and Markdown formatted; scripts are not executed. Removed technical JSON, CSV/JSON downloads, other-provider tables and manual model-ID controls from the active website.
- Identical completed runs reuse saved results. Explicit repeats of incomplete studies preserve completed providers and retry only unfinished providers or reviews; attempt history remains stored.
- Live validation: study `e5036081-cd52-4872-b29a-7627defaece5` completed both model comparisons and both AI reviews at configured/recorded USD 0 cost. Active models are `qwen/qwen3.8-27b` on Groq and `gemini-3.6-flash` on Google. Gemini 3.8 returned service errors/timeouts; Gemini 2.5 returned not found, so the responding Gemini 3.6 version was selected explicitly.
- 185 automated tests pass. Browser visual review remains policy-blocked; interface behavior is covered with Streamlit AppTest.
- Fixed Gemini 3 thinking configuration: supported low thinking replaces rejected minimal thinking. Reference: https://ai.google.dev/gemini-api/docs/thinking

## Autopilot presentation update, 26 October 2026

- Four visible pages: Autopilot, Results, History, Connections. Old comparison/study URLs remain accessible for saved work.
- Autopilot guides connections, prompt/options, execution and saved results. The phase trace records actual running/completed/error/reused states, with one final entry per experiment phase.
- Returning to options restores the prompt and generation settings. Exact completed comparisons reopen before constructing any provider; explicit new trials remain available.
- History hides repeated signatures by default while preserving every stored trial. Results has four tabs, no repeated list of answers, and collapsed comparison/export/technical details.
- Important controls and measurements remain available: fixed free target, optimizer choices, strategy/ratio, temperatures, timeout/output limits, optional AI judging, prompt/answer diffs, provider input/output, route overhead, latency, cost, exact checks and separate human/AI quality scales.
- Live Autopilot comparison `ab315041-598b-4be7-9c83-4db44222e694` completed all three request phases with answers saved at USD 0 recorded cost. A repeat opened the same study with zero requests. Evidence: `presentation/Autopilot-Live-2026-10-26.*` and `presentation/Autopilot-Verification.json`. Human/AI quality ratings remain unmeasured for this new demonstration.
- All four credentials are saved locally. Read-only provider checks previously accepted Groq/Gemini metadata access; their free billing status remains unconfirmed, so native generation stays disabled. OpenAI generation stays blocked. No paid calls are enabled.
- 182 automated tests pass, including the guided flow, parameter restoration, free-only guards, saved-result reuse, failure traces and partial-answer recovery. Browser visual inspection remains unavailable under browser policy; Streamlit interface tests were used.

## Model integration specification, 26 October 2026

- Implemented the specification's free-compatible independent-optimizer workflow in `app/methodology.py` and the **Optimizer study** page, retaining the existing answer-model comparison.
- Central registry/configuration supports Groq Qwen 3.8 27B, GPT-OSS 20B/120B, configurable Gemini Flash and OpenRouter Free. Missing keys and disabled/unconfirmed free accounts remain unavailable. Groq/Gemini free flags are explicit user attestations, not automatic billing verification.
- Native Groq/Gemini transports use official endpoints, provider-specific reasoning controls, catalog checks and normalized usage/latency/error handling. Secrets remain server-side and errors do not echo them. OpenRouter uses current zero-price catalog checks and request ceilings.
- OpenAI Responses normalization is tested against synthetic responses, but the dispatch method always rejects live requests. The document's paid OpenAI target is intentionally not executable under the user's no-paid-API constraint. A fixed free OpenRouter answer model is explicitly disclosed; no ChatGPT measurements are claimed.
- Original baseline runs first, each selected optimizer receives the original independently, and both versions use the same fixed target/settings. Canonical prompt `optimizer_prompt_v1`, strategy, controls, usage source and cost basis are saved. No optimizer chains or unlimited retry loops were added.
- Balanced, conservative, aggressive and approximate target-ratio strategies, short-prompt threshold with manual override, 36-prompt dataset, local/catalog provider checks and explicitly selected bounded CSV/JSON/Markdown/SQLite batch runs are available.
- Human 1–5 ratings cover correctness, completeness, instruction following, relevance and meaning preservation, plus Yes/Partially/No intent and notes. Atomic persistence, editing, distinct AI scales and report/CSV exports are implemented. No human ratings are fabricated.
- One live OpenRouter Free optimizer comparison completed with baseline/optimized answers, 3 new requests and USD 0 recorded cost. Estimated prompt tokens 53→40, provider target input reduction 16.9%, full optimized-route tokens 729 versus baseline 137. Quality remains unmeasured pending review. Evidence is in `presentation/Methodology-Integration-Live-2026-10-26.*`.
- 177 tests pass, including adapter guards, missing-provider behavior, independent workflow, baseline retention, interface controls and human-review persistence. Static checks pass. Groq and Gemini keys are now saved locally, but native generation is not enabled or claimed as live-tested. Browser visual inspection remains blocked by browser policy; interface tests were used.
- Full setup and boundaries: `docs/MODEL-INTEGRATION.md`.

## Comparison refinement, 26 October 2026

Result-recovery fix: latest partial/blocked/running live reports now load instead of being skipped for older completed reports. A new first tab, Your result, shows the generated answer before charts. Successful model answers remain visible when other models or reviews fail, and the default selection prefers an available, clean answer. Live studies publish answers before judging and between models, while a direct study link can open a specific saved run. The user's 16-comparison custom study retained six answers; its incomplete attempts are preserved. A standalone recovered HTML report is saved locally and excluded from the source bundle. The suite now has 86 passing tests, including partial-run recovery and publication before quality review.

- Five-page navigation retained. Results now has task/model selectors and Compare models, Prompt changes, Answer changes, Quality review and Downloads sections.
- Prompt and answer wording edits are highlighted safely, with separate text-change, word/character reduction, local prompt-token reduction and provider input-reduction measurements.
- Absolute original/optimized quality scores, the uncapped retention ratio, all six rubric dimensions, exact checks, expected answers and judge notes are visible. Unknown scores are not displayed as zero.
- Compared model charts use one task at a time and paired original/optimized bars. Answer-route totals include optimizer work but exclude separate judging.
- Added a standalone detailed HTML report and enriched CSV export. User/model text is escaped before highlighting.
- Recommendations now flag incomplete outputs, review errors and unknown input savings for review. Exact failures override a favorable retention ratio.
- Connection status refreshes every five minutes, avoiding stale exhausted-quota state. Older selected reports can open the newest completed comparison explicitly.
- Fresh live study `1baa2d48-f03f-49df-a5db-eb2f301c552e`: six comparisons, six reviews, 15 new requests, six matching reused baseline answers, USD 0 recorded cost. No failure retry loops or cherry-picking.
- Three of four shortened answers with exact checks passed. Nemotron arithmetic returned 96 instead of 80 and failed, despite a 600% AI retention score. Two writing cases have AI review only; human review found invented weekdays. This is not proof of general quality preservation.
- 84 automated tests pass, including Streamlit interface and main navigation tests; static checks pass. Live browser visual review was blocked by browser security policy, so no claim of screenshot verification is made for this revision.
- Detailed report: `presentation/Detailed-Comparison-2026-10-26.html`. Full fresh records and summary: `presentation/Refinement-Live-Results-2026-10-26.json` and `.md`. Prior October 24 evidence remains unchanged.

## Earlier handover, 24 October 2026

## Working and verified

- Created the user-approved OpenRouter key, stored it only in local configuration, and verified account authentication (HTTP 200).
- Account reported total usage USD 0 after testing. The key expires on 23 November 2026 and has the approved USD 0.01 cap; no credits were purchased.
- Completed six real comparisons: writing, extraction and arithmetic, each tested with Nemotron 3.5 Lightning and North Mini Code.
- North Mini Code is the tested prompt optimizer. Each prompt is sent as source data with a structured optimized-prompt output contract.
- Optimizer task answers, malformed output and lost critical numbers are rejected; the original is retained.
- Both original and shortened answers, model identities, native usage, timings, costs, exact checks and model reviews are saved.
- Completed reports load without new model requests. Matching original baselines and optimizer candidates are reused with request IDs retained.
- Failed model/provider attempts remain in history. Only unfinished comparisons/reviews are resumed.
- Provider failover is allowed only within the selected model under zero input/output/request price ceilings. Paid models and paid fallback models remain blocked.
- Optional reasoning is disabled only when the model catalog says it is optional; effective request settings are recorded.
- Fenced reviewer JSON is parsed safely and checked against the six-dimension rubric.
- 64 automated tests, static checks and the interface control test pass.

## Real pilot findings

The final study completed 6/6 comparisons and all six automated quality reviews. Writing input reductions were about 16.9% and 24.5%, with reviewed quality retained. North Mini Code passed the arithmetic exact check; Nemotron failed both the original and shortened arithmetic answers despite a 100% aggregate quality-retention ratio. The report marks that case Neither passed. Both extraction cases failed exact-answer checks after shortening; the original passed those checks, so the report recommends keeping it.

These are small pilot results and same-model automated reviews, not general proof of quality preservation. Some token reductions increased total system token processing after optimizer overhead. Report input savings, total tokens and quality together.

## Free-service limitations

Testing exhausted today's free-request allowance. Authentication still works and the account reported USD 0 usage. Saved reports and previews remain available without completion requests. New real comparisons resume only after OpenRouter resets the allowance. Additional keys/accounts are not used to evade this limit.

Gemma and some other free endpoints were busy or refused model access during testing; they remain optional rather than being silently substituted. Defaults use the responding models. Future availability is controlled by providers.

## Presentation files

- presentation/Live-Report.html — portable real-results report, usable offline.
- presentation/Live-Summary.md — plain-language findings.
- presentation/Live-Results.json — complete underlying real study and attempt history.
- presentation/Presenter-Notes.md — demonstration notes and interpretation.
- Sample files — labelled previews only; not scientific findings.

The localhost app automatically loads the latest completed real study and clearly distinguishes an exhausted quota from an invalid key.
