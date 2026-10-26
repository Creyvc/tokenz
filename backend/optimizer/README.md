# Tokenz

**Optimize a human prompt with Groq and Gemini, then use it in ChatGPT.**

Start with `.\Start-Tokenz.ps1`, then open [Tokenz](http://127.0.0.1:8501/).

## Inside the Tokenz repository

This folder is `backend/optimizer/` (it was `tokenz-source/tokenz/`). It shares the backend's environment: from `backend/`, set up `.venv` as in [../README.md](../README.md), then run `./optimizer/start.sh` (Windows: `optimizer\Start-Tokenz.ps1`). A `.venv` of its own still works too. The website's local API runs this folder's rewrite through `app/bridge.py` in a separate process; see "AI rewrite" in the backend README.

## Current workflow

1. **Connection:** two optimizers only — Qwen on Groq and Gemini 3.6 Flash on Google. Both accounts require confirmed free plans with billing disabled.
2. **Your prompt:** enter the original human prompt. There are no answer-generation or judge controls.
3. **Optimize:** each model receives the same original and returns only a rewritten prompt. Normally two optimizer requests are made; no task answers, answer comparisons or quality-judge requests are made. Groq may retry an explicitly rejected rate-limit request once after a short provider cooldown.
4. **Compare:** two cards show the chosen prompts, token counts, token savings and wording changes. Expand exact edits to inspect removals and additions. Empty/truncated rewrites, missing literal numbers and candidates that save no tokens are rejected; the original is offered instead. These checks do not establish meaning preservation or answer quality.
5. **Use in ChatGPT:** select **Copy & open ChatGPT**, then paste and send in your own free ChatGPT session. If clipboard/popup permissions block the combined action, use the prompt's copy icon and the **Open ChatGPT** link. No prompt is put in a URL, no conversation is read back, and no OpenAI API call is made.
6. **History:** each distinct prompt/configuration is shown once. Completed runs are reused; explicit resume calls only unfinished optimizers. Previous answer-generation studies stay archived locally.

Both optimizers reduced the saved test prompt from 87 to 40 estimated tokens (54.0%). Their answer quality was not evaluated. Token counts use the same local fallback tokenizer; actual ChatGPT usage may differ.

## ChatGPT integration boundary

Official Sign in with ChatGPT documents plan-powered requests for eligible Plus/Pro users; it does not establish free-account generation access for this application. The free workflow is an explicit clipboard-and-browser handoff. The user pastes and sends, and later evaluates answers in ChatGPT. See [OpenAI's integration quickstart](https://developers.openai.com/siwc/quickstart).

## Earlier integration and research documentation

The sections below describe retained research tools and earlier experiments. They do not add providers to the current two-model website.

## Model integration from the specification

Use **Autopilot** to compare independent Qwen, GPT-OSS, Gemini and OpenRouter rewrites against the same fixed free target. Groq and Gemini require optional keys and your confirmation that their accounts use free plans with billing disabled; absent providers stay unavailable. Connections contains these connections, configurable model IDs and experiment defaults. Balanced, conservative, aggressive and approximate target-ratio strategies share `optimizer_prompt_v1`. Human review is manual and no AI judge is called by default in this workflow.

**OpenAI API targets remain blocked**, even when a key is configured. The documented OpenAI target is paid; this build explicitly labels its fixed OpenRouter target as an alternative and never presents those results as ChatGPT measurements. See [the integration guide](docs/MODEL-INTEGRATION.md) for all configuration, safety boundaries, the 36-prompt dataset, provider checks, explicit batch commands and the successful zero-cost live smoke test.

```powershell
.\.venv\Scripts\python.exe scripts/check_api_keys.py
.\.venv\Scripts\python.exe scripts/run_experiment.py --models openrouter_free --limit 1 --dry-run
```

Wording-change percentages compare word occurrences, not meaning. Prompt-token reduction uses the local tokenizer; model-input reduction uses provider usage and can differ. Quality retention is optimized judge score divided by original judge score, so it may exceed 100% and does not prove correctness. Both absolute scores and exact checks are displayed. A zero original quality score makes the ratio undefined. Full answer-route tokens include the shortener and exclude the separate quality-review call.

The 26 October follow-up is saved in `presentation/Refinement-Live-Results-2026-10-26.json` and the highlighted `presentation/Detailed-Comparison-2026-10-26.html`. Six comparisons and six reviews completed at USD 0 recorded cost, using 15 new requests and six reused matching original responses. Three of four shortened answers with exact checks passed. The failed arithmetic answer still received 600% AI score retention, illustrating why exact checks override judge scores. The two writing cases have no exact check and remain unverified.

Use **Change models and options** to choose other free optimizers/answer models. Use **Try 3 sample tasks** for writing, extraction and numerical reasoning. Exact-answer checks are included where an expected answer is known.

**Use sample responses without API requests**, under the comparison options, exercises the interface with test responses. It is explicitly labelled and cannot establish real research findings. Ready-made preview reports are in [presentation/](presentation/).

## What the app does

- Checks the connection before starting any live study.
- Preserves the original prompt and creates a shorter candidate.
- Enforces a structured optimizer response and rejects task answers or missing critical numbers.
- Reuses each optimizer candidate across answer models for fairer comparison.
- Sends original and shortened prompts to the same fixed target model.
- Checks exact answers when a known expected answer exists.
- Optionally asks the target model to review anonymous answers against a six-dimension rubric.
- Saves completed work, errors, scores, timing, tokens and actual model identities.
- Generates a plain-language summary and portable HTML presentation report.
- Resumes unfinished comparisons without repeating completed ones; missing reviews can be retried separately.

The default roles are separate: the **optimizer** shortens the prompt; the **answer models** perform the task. You can compare multiple optimizers and multiple targets. Dynamic Free Models Router is kept out of the fixed target choices. Models unavailable during live testing remain optional rather than being silently substituted.

The real three-task, two-target study completed all six comparisons at zero reported cost. See [the live presentation report](presentation/Live-Report.html). Writing retained reviewed quality. North Mini Code passed arithmetic; Nemotron failed both arithmetic answers. Both shortened extraction answers failed while their original answers passed. The report distinguishes Use original from Neither passed. This is a small pilot, not proof of general quality preservation.

## Free-only behavior

The active local setup blocks paid providers and non-free model IDs. Every OpenRouter completion rechecks zero catalog pricing and sets maximum prompt/completion/request prices to zero, without paid fallback models. It stops on authentication or account-access failures. A busy free model is recorded as a failure so other models can still be compared; an exhausted account allowance pauses the study.

Free capacity is not guaranteed. Invalid keys require replacement; daily caps require waiting for reset. Tokenz does not buy credits, change account billing settings, create extra accounts or evade quotas.

## Results you can defend

The report distinguishes real results from previews, measured quality from missing scores, and target input reduction from total-system token use. It does not claim that the shortest prompt is the best. Automated model reviews are estimates with same-model bias; review important answers yourself before presenting scientific conclusions.

This project now studies free-model prompt optimization, not ChatGPT performance. Local text counts use a fallback tokenizer for non-OpenAI models. Provider-reported usage drives billed-request comparisons. Legacy metric keys containing `chatgpt` remain in JSON for compatibility; the UI and actual target metadata identify the real models.

## Fresh installation

Python 3.11+ is required. Development was tested on Python 3.14.7.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.main preflight
.\Start-Tokenz.ps1
```

The first token-counter run downloads official vocabulary into `.tokenizer-cache/`. Later local counts work offline. Package installation and live models require network access.

## Core settings

The dashboard handles ordinary setup. Advanced options live in `.env`:

| Setting | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Private key; never commit or share |
| `TOKENZ_FREE_ONLY=true` | Blocks paid routes |
| `TOKENZ_DEMO` | Legacy CLI demo switch; dashboard preview is explicit |
| `OPENROUTER_OPTIMIZER_MODEL` / `OPENROUTER_TARGET_MODEL` | Default free model IDs |
| `TOKENZ_DATABASE` | Local SQLite file, normally `results/free-experiments.sqlite3` |
| `TOKENZ_STORE_DATA` | Disable SQLite persistence when false |
| `TOKENZ_BATCH_DELAY_SECONDS` | Delay between comparisons, normally 10 |
| `TOKENZ_TIMEOUT_SECONDS` | Request timeout, normally 60 |
| `TOKENZ_MAX_OUTPUT_TOKENS` | Target and reviewer output ceiling |
| `TOKENZ_OPTIMIZER_MAX_OUTPUT_TOKENS` | Optimizer output ceiling |
| `TOKENZ_DEFAULT_STRATEGY` | structured, simple, delete_only or aggressive |
| `TOKENZ_MIN_QUALITY_RETENTION` | Research retention cutoff, normally 0.95 |

See `.env.example` for all configurable defaults. Keep the app on localhost. Prompts/answers are stored locally as plain text and are sent to the selected providers during real runs. Keys are excluded from experiments and reports. Reports contain the prompts and answers you choose to export.

## Developer checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app dashboard tests
.\.venv\Scripts\python.exe -m app.main preflight
```

`app/study.py` runs model comparisons; `app/report.py` builds portable HTML reports. The older CLI batch runner and 30-prompt dataset remain available for larger studies. Start with a small live pilot within the account's free allowance.

Current verification and remaining blockers: [docs/STATUS.md](docs/STATUS.md). Free API details and official references: [docs/FREE-API.md](docs/FREE-API.md).
