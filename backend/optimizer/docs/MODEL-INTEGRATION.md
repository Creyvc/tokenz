## Current website: optimize prompts, then use ChatGPT

Only Groq Qwen and Gemini 3.6 Flash optimize the human prompt. Each makes one rewrite request; the website no longer asks either provider to generate task answers or judge their quality. Results compares original/selected token counts, savings, wording edits and basic format/number safeguards. Those checks do not prove meaning or quality retention.

The handoff copies the selected prompt and opens the plain ChatGPT web URL. The user pastes/sends in their own free account. Clipboard/popup permission failures have a native copy-icon and Open ChatGPT fallback. No automatic free ChatGPT API integration, answer retrieval, credential extraction or quality calculation is claimed. Official integration eligibility is documented at https://developers.openai.com/siwc/quickstart.

Old answer-generation workflows and evidence below remain archived research documentation; they are not active website steps.

## Current website: two models only

The active Autopilot uses Qwen on Groq and Gemini 3.6 Flash on Google, each through its official native adapter. The user confirmed both free accounts have billing disabled. OpenRouter, OpenAI and other optimizer choices are excluded from this interface. Legacy integration modules remain for archived experiments and backwards-compatible scripts.

Connections contains only these two providers. Autopilot accepts a prompt and optional quality estimation. Each model independently answers the original, shortens it, answers the shorter version and reviews its anonymous pair. Up to eight generation requests are made. No automatic retry or paid-provider fallback is used.

Results opens with two analysis cards; detailed prompt edits, answer edits and quality evidence are separated. Full Markdown responses, usage/timing and the HTML export remain collapsed. No raw JSON or repeated model-answer list is shown. Suggested Python is never executed by Tokenz.

Groq and Gemini 3.6 completed the live comparison and AI reviews. Gemini 3.8 rejected minimal thinking, then returned service failures; the working Gemini 3.6 route was selected explicitly with supported low thinking. Native zero-cost accounting relies on the user's free-plan confirmation. Estimated quality is not independent accuracy verification.

The setup instructions below describe the earlier integration and archived research tools.

## Guided website setup

Open **Connections** for the four-provider status table. Expand Groq or Gemini for numbered key/free-plan steps and official billing links. OpenRouter has a key form and connection check; OpenAI explains why its stored key cannot generate in free-only mode. A saved key alone does not prove free account status.

Open **Autopilot** and follow the four numbered steps. Each optimizer independently shortens the original prompt, with a shared original answer and the same fixed free answer model for fair comparison. The live phase table and saved trace show what actually happened. Optional AI review costs another free request per comparison; human review is separate. Failed providers retain any original answer.

Identical completed input/settings reopen the saved result without generation. Explicit new trials preserve separate records; History hides duplicate signatures by default. Results separates the answer, prompt edits, answer edits and quality evidence. Detailed parameters, model comparisons and exports are available in expanders.

# Methodology 1 integration, with paid calls disabled

The supplied integration document is implemented within the user's free-only constraint. Each selected optimizer independently rewrites the original prompt. The original and candidate then go to the **same fixed free OpenRouter answer model**. The baseline is retained. This measures the named free answer model; it does not measure consumer ChatGPT or an OpenAI API model.

The OpenAI target path is blocked even if `OPENAI_API_KEY` is configured. No OpenAI API request is necessary or permitted by this workflow. An API key or ChatGPT subscription does not make API inference free.

## Providers and configuration

All optimizer IDs live in the central integration registry. Defaults from the specification are preserved as requested names, not claims that those IDs currently exist:

| Selection | Provider | Model configuration |
| --- | --- | --- |
| `qwen` | Groq | `GROQ_QWEN_MODEL`, default `qwen/qwen3.8-27b` |
| `gpt_oss_20b` | Groq | `GROQ_GPT_OSS_20B_MODEL`, default `openai/gpt-oss-20b` |
| `gpt_oss_120b` | Groq | `GROQ_GPT_OSS_120B_MODEL`, default `openai/gpt-oss-120b` |
| `gemini_flash` | Gemini | `GEMINI_MODEL`, default `gemini-3.8-flash` |
| `openrouter_free` | OpenRouter | `OPENROUTER_MODEL`, default `openrouter/free` |

Model catalogs are checked before live dispatch. A missing model fails clearly; Tokenz does not substitute a different ID or a paid model. Configurable model IDs allow a user to select an available equivalent deliberately.

Groq needs `GROQ_API_KEY` and `TOKENZ_GROQ_FREE_TIER_CONFIRMED=true`. Gemini needs `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and `TOKENZ_GEMINI_FREE_TIER_CONFIRMED=true`. These flags mean the user has checked that their provider account uses a free tier **with billing disabled**. They are attestations, not automatic verification of billing status. Do not set them merely because a key exists. Provider quotas can still reject requests.

OpenRouter needs `OPENROUTER_API_KEY`. Only `openrouter/free` or `:free` optimizer slugs are allowed. The answer target must be a **fixed `:free` slug**; a random route would not provide a stable baseline comparison. Free catalog pricing is checked before calls. No paid fallback is enabled.

New Groq and Gemini integrations are not claimed to be live verified merely because their code and mocked tests pass. They require the user's real provider credentials, account confirmation and a currently listed model before live evaluation. Existing OpenRouter results remain available separately.

Keep secrets in the local `.env`, never in source, prompts or experiment records. Never paste API keys into chat. Settings expose readiness, not secret values.

## Run locally on Windows

From the project directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

For a new checkout only, copy `.env.example` to `.env` and fill in keys locally. Preserve an existing `.env` rather than overwriting it. Start the application with:

```powershell
streamlit run dashboard/streamlit_app.py
```

Use Settings to review provider readiness, then **Optimizer study** to enter a prompt and choose optimizer(s), strategy and the fixed free answer target. The existing **New comparison** page remains available for comparing free answer models. Balanced favors meaning preservation; conservative removes obvious filler; aggressive requests stronger compression; target ratio is an approximate retained fraction. A ratio of `0.75` requests about 75% of the original prompt length, not 75% saved. The prompt-length threshold is an advisory research setting, not a proven optimum. Below the threshold, the original is kept unless you select the manual override.

## Provider check

```powershell
python scripts/check_api_keys.py
```

This default is **local configuration only**. It sends no network requests and does not authenticate any key. A `[CONFIGURED]` line means locally ready for a check, not a working inference service. OpenAI always shows `[BLOCKED]`; unavailable optional providers show `[SKIP]` with the reason.

```powershell
python scripts/check_api_keys.py --live
```

This sends GET requests only to official model catalog endpoints for locally permitted providers. It never requests completions. `[CATALOG_OK]` verifies that a catalog was reachable and the configured ID was listed. Some catalogs are public, so this does **not** prove authentication, inference access, free-account billing state, available quota, or successful generation. Catalog response bodies, authorization headers, keys and raw exceptions are never printed. Exit 0 means no attempted check failed, 1 means a catalog check failed, and 2 means invalid local configuration. Skipped providers do not fail the overall local check; read their individual statuses.

## Explicit batch experiments

The dataset contains 36 synthetic prompts, varied in length and wording, including coding, data analysis, writing, summarization, explanation, reasoning, planning, structured extraction, education and research-style tasks. The original 30-prompt dataset is retained in JSON form with six additional planning, education and research prompts. No private user prompt is added.

Validate first without sending requests:

```powershell
python scripts/run_experiment.py --models openrouter_free --dry-run
```

Run one prompt with an explicitly selected optimizer:

```powershell
python scripts/run_experiment.py --models openrouter_free --limit 1
```

After configuring a free Groq account and confirming current model IDs:

```powershell
python scripts/run_experiment.py --dataset data/test_prompts.json --models qwen,gpt_oss_20b,gpt_oss_120b --limit 1 --strategy balanced
```

`--include-gemini` and `--include-openrouter` extend an explicitly supplied `--models` list. They do not enable hidden batch defaults. `--target-model` selects a fixed `:free` answer model; `--strategy target_ratio --ratio 0.5` requests approximately half-length prompts. `--limit` defaults to 1 to conserve quota. No unlimited retries, agent chains or paid calls are included.

`--dry-run` checks local configuration and the selected dataset without network calls, database writes or generation. It does not prove models will respond. Exit 2 indicates invalid input or configuration readiness; exit 1 indicates failed/incomplete execution; exit 0 indicates every planned comparison completed. Completion alone is not a quality verdict.

Completed and partial runs save SQLite records plus JSON, CSV and Markdown under `results/integration/` by default. Use `--output-dir` for a different report folder. JSON preserves detailed prompt changes, responses, provider usage, failures and reproducibility fields. CSV includes full prompt/answer text and metrics, with formula-like text neutralized for spreadsheet use. Reports may contain the submitted prompt and model output, so share them intentionally. Within a study, identical target requests can reuse an exact recorded response, marked `reused`; the original baseline is retained, and optimizers always receive the original independently. There is no semantic cache or optimizer chain.

## Interpreting results

Prompt reduction, fixed-target input reduction, optimizer overhead, total system token usage, latency and financial cost are separate measurements. A shorter prompt can increase total tokens because optimization itself uses tokens. Provider usage is preferred; local tokenizer counts are labeled as estimates. Zero configured/provider-reported cost is not an independent account billing audit.

The integration workflow does not request an AI judge by default. On **Results → Quality review → Your quality assessment**, human ratings use 1–5 correctness, completeness, instruction following, relevance and meaning preservation, plus Yes/Partially/No intent preservation and notes. Missing ratings remain unmeasured. The form's initial slider positions are not saved ratings. Reviews and study snapshots save in one SQLite transaction, remain editable, and appear separately from AI scores in reports. A high relative quality-retention ratio does not prove correctness: both answers can be wrong. Exact checks, where available, and direct review of both responses remain visible. Failed or non-saving optimization keeps the original prompt and records the failure rather than inventing success. Small pilot datasets cannot establish a general winning model.

## Live verification on 26 October 2026

The new `openrouter/free` optimizer path completed one controlled writing comparison against the fixed Nemotron 3.5 Lightning target, with three new requests and USD 0 recorded cost. The prompt shrank from 53 to 40 locally counted tokens (24.5% reduction); provider target input fell by 16.9%. Optimizer overhead was 612 tokens, so the full optimized route used 729 tokens versus 137 for the original. Quality is **not yet rated**; no AI judge or invented human ratings were added. This verifies the route, not a winning optimizer or preserved intent.

Evidence: `presentation/Methodology-Integration-Live-2026-10-26.json`, `.md` and `.html`. Groq and Gemini remain unconfigured here; their transport tests use mocked responses and do not establish live account access.

## Official references

- [OpenAI GPT-5.5 model documentation](https://developers.openai.com/api/docs/models/gpt-5.5) lists pricing and unsupported free-tier access; this project's OpenAI path remains blocked.
- [Groq billing FAQs](https://console.groq.com/docs/billing-faqs) describes free and paid plans and account limits.
- [Groq model documentation](https://console.groq.com/docs/models) lists supported models; requested IDs may change.
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) distinguishes free and paid model usage.
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing) explains account tier and billing setup.
- [OpenRouter free route](https://openrouter.ai/docs/guides/routing/model-variants/free) documents free-model routing and limitations.

These links are provider documentation, not a promise of permanent free availability.
