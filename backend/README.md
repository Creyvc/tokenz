# TokenSaver

Local, backend-first educational prompt compression comparator. Includes a replaceable Streamlit UI, Qwen provider adapter/controller, two local baselines, mocked tests, evaluation, report draft and architecture diagram.

The interface now has separate **NLP** and **TF-IDF** workbenches in the sidebar. Each keeps an independent prompt, settings and result. Start with its **Try … example** button. See `docs/HOW_TO_TEST.md` for a short walkthrough.

Confirmed submission scope: measure the two local methods, NLP and TF-IDF. Qwen remains implemented and mock-tested; live evaluation is deferred and is not a submission requirement. Explained unchanged outcomes are valid. Human retention assessment covers all 15 shortened local outputs and remains pending the user's ratings. See `docs/DESIGN_INTERVIEW.md` for the confirmed decisions and `GLOSSARY.md` for the agreed terminology.

## Start on Windows

Use Python 3.13 (the implementation is tested on the installed Python 3.13.7). From this project folder:

On this PC, the development environment is already prepared in the workspace's `work/.venv`. Run `powershell -ExecutionPolicy Bypass -File .\Start-TokenSaver.ps1` from this folder to use it. The script also supports a conventional project-local `.venv` for your teammates. For a fresh installation:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m spacy download en_core_web_sm
.\.venv\Scripts\python.exe -c "from token_utils import count_tokens; count_tokens('warmup'); count_tokens('warmup', 'cl100k_base')"
.\.venv\Scripts\python.exe -m streamlit run app.py --server.address 127.0.0.1
```

If venv creation cannot run ensurepip, use an existing Python's pip to bootstrap the environment: `python -m pip --python .venv\Scripts\python.exe install pip -r requirements.txt`.

## Start on macOS or Linux

Tested on macOS with Python 3.13.9. From this folder (`backend/` in the Tokenz repository):

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-lock.txt
.venv/bin/python -c "from token_utils import count_tokens; count_tokens('warmup'); count_tokens('warmup', 'cl100k_base')"
./start.sh
```

`requirements-lock.txt` already includes the spaCy model, so no separate `spacy download` is needed. Use `python3.13` (or another 3.13 interpreter): the locked versions were tested on 3.13. `./start.sh` opens the app at http://127.0.0.1:8501. Tests: `.venv/bin/python -m pytest -q`.

Dependencies, spaCy weights and tiktoken vocabulary need internet access once. After download/cache warmup the local methods run offline. No GPU or locally installed Qwen model is required. `requirements-lock.txt` records the exact tested Windows environment; use it instead of `requirements.txt` to reproduce it.

## Qwen setup (optional future live evaluation)

This section is for future use. The agreed submission does not require a Qwen account or live API calls.

1. Create an Alibaba Cloud Model Studio account and select an available region/model. Obtain the actual endpoint and key from your console. See the [official overview](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) and [compatible chat API](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions).
2. Copy `.env.example` to `.env`. Fill credentials locally; never share or commit `.env`. Replace the example workspace URL and verify model availability. `qwen-flash` is configurable, not guaranteed for every account.
3. Configure supported optional parameters. A blank `QWEN_TEMPERATURE` omits temperature; blank `QWEN_ENABLE_THINKING` omits that vendor parameter. Unsupported settings produce a friendly error, with no automatic probing/retry. Verify model compatibility before use.
4. Optionally enter both input and output USD prices per million provider tokens, checking region and price tier. Missing rates or incomplete usage means cost unknown. Reasoning tokens are reported separately when present and are not added twice to completion usage.
5. Restart the app and choose **Qwen (optional)**. Acknowledge external data transfer and click that screen's Run button. “Ready” means configuration is present, not that a live connection has been tested.

No live API call is part of setup, automated tests or local evaluation. Qwen requests are text-only and limited to two per invocation. SDK retries are disabled; transport failures return immediately. Each request has a timeout capped by remaining time. Late responses are discarded. This is a controlled state machine, not an autonomous multi-agent framework.

## Review and restoration

Choose the **NLP** screen, paste text, choose **NLP reduction**, then click **Run NLP**. Four local levels are available:

| Level | Behavior |
| --- | --- |
| 1 · Conservative (default) | Supported polite openings and exact duplicates. |
| 2 · Balanced | Also shortens common request openings, retaining content nouns. |
| 3 · Aggressive | More phrase edits and identical rewritten-sentence deduplication. |
| 4 · Maximum (20%+ target) | Compacts supported framing and personal rationale; shows whether 20% was reached. Source nouns in that wording may be removed. |

Maximum targets at least 20% reduction but does not force deletion to meet it. Concise or protected prompts may miss the target. On the supplied sales prompt, 659 original tokens became 653 / 639 / 617 / 508 tokens respectively; Maximum saved 22.9%. These are development examples, not a semantic-retention verdict. All levels remain rule-based local editing rather than general paragraph summarization. Review every task and constraint. Optional protected phrases and the counting encoding are under **Advanced settings**.

Choose the separate **TF-IDF** screen for prompts with at least three sentences and removable context. Select the main-task sentence (or choose **Use a custom excerpt…**), confirm it, and choose a token budget on that screen. New prompts start at 65% of original tokens. **Use suggested budget** accounts for mandatory content. The required minimum is displayed before running; an infeasible budget disables **Run TF-IDF** with an explanation.

Lock exact phrases under Advanced settings or sentences under **Lock or restore sentences**. Inspect the changes before copying. The backend still returns the original if mandatory content exceeds the budget. To restore an excluded sentence, select it in **Sentences to keep**, increase the budget if needed and rerun. Changing the original resets that screen's task confirmation, sentence locks and budget. Switching screens preserves independent drafts/results. The code block has a copy control; the download requires a review acknowledgment.

**Compare methods** displays the latest NLP and TF-IDF tests from this browser session. It has no prompt form or Run button. Run each method on its own screen, using the same original text and encoding for a fair comparison. The chart includes an **Original prompt** bar as the no-reduction baseline. Different prompts show separate baselines and a warning; different encodings require rerunning before a chart is shown. Edited settings hide stale results. **Qwen (optional)** has its own configuration and consent.

NLP does not generally summarize background context. The TF-IDF example correctly remains 26 tokens under NLP, while the polite duplicate NLP example reduces from 10 to 4. Unchanged output is valid and is explained in the interface. Comparison labels the saved NLP mode; changing modes requires rerunning the test.

## Tests and local experiment

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe evaluation.py
```

Tests inject fake provider responses and do not make paid calls. First-use tokenizer downloads are installation traffic, not model calls. Evaluation runs 24 synthetic prompts through the two local methods. See `docs/evaluation/summary.md` and `results.json`; human checklist fields remain unscored. No Qwen performance is fabricated.

For the agreed human assessment, open `docs/evaluation/RETENTION_REVIEW.md`. Review all 15 cases (11 NLP, 4 TF-IDF), or use the matching `review_ratings.json` answer sheet, and return the completed file in this chat. Any lost requested subtask or explicit constraint makes a suggestion unacceptable. Retained keywords or fewer tokens do not establish retention. The packet preserves the existing experimental records and includes an exact source snapshot; no ratings have been filled automatically.

## Tokenz website

The Tokenz website (`../frontend`) uses this engine through `web_api.py`, a local adapter built on Python's standard library: no new dependency. `./start-web.sh` (Windows: `Start-TokenzWeb.ps1`) serves the site and the API at http://127.0.0.1:8000/. It offers NLP and TF-IDF only, never Qwen, answers on 127.0.0.1 only, and doesn't log prompts. Its routes are `GET /api/health`, `POST /api/inspect` (TF-IDF preflight) and `POST /api/compress`; tests are in `tests/test_web_api.py`. It calls `compare_methods` and `inspect_tfidf_input`, so the result schema is unchanged. Pages served from another local port (VS Code's Live Server on 5500, for example) can call the API too: it allows `http://127.0.0.1` and `http://localhost` origins, and no others.

## Frontend team handoff

Import `compare_methods` from `service.py`; call `.to_dict()` on results. See `docs/FRONTEND_HANDOFF.md` and run `python -m examples.frontend_handoff` for a local-only JSON example. The backend does not import Streamlit. The team can replace `app.py` without rewriting algorithms. The confirmed scope adds no HTTP server.

## Project map

```text
app.py                  Minimal Streamlit frontend
ui_workbenches.py        Separate method screens and durable frontend drafts
service.py              Public orchestration interface
models.py               Result schema and diff/metric construction
config.py               Environment settings and validation
token_utils.py          Shared local tiktoken counts
validation.py           Protected spans and candidate checks
compressors/            Qwen adapter/controller, NLP, TF-IDF
tests/                  Backend, adapter and UI tests
evaluation.py           Synthetic local experiment
web_api.py              Local web API that serves the Tokenz website (../frontend)
start.sh, start-web.sh  macOS/Linux starters for the Streamlit app and the website
docs/                   Report, architecture, demo, handoff and evidence
```

## Accuracy and limitations

Human review remains necessary. Checks protect obvious negations, quantities, quoted strings, selected technical terms and manual locks; they cannot prove equivalence or fully prevent prompt injection. NLP additionally protects detected entities/nouns. TF-IDF low similarity is not proof of irrelevance. Many short prompts correctly remain unchanged.

The selected tiktoken encoding measures prompt text only, not hidden system/context/reasoning tokens or total ChatGPT usage. Provider billing uses actual Qwen response usage, separately. A smaller prompt does not demonstrate ChatGPT subscription dollar savings; monetary break-even needs a specified downstream paid API and actual rates.

Application code does not log raw prompts or keys. Inputs/results remain in the Streamlit session until explicitly exported. Avoid sending sensitive or restricted coursework to a third party without authorization. Startup assets require downloads; local compression does not. No database, login, upload ingestion, cloud deployment or ChatGPT integration is included.

Live Qwen validation is deliberately deferred beyond this submission. Manual retention scoring remains the user's outstanding task before making retention conclusions. The report clearly distinguishes these two statuses.

## Submission artifacts

- `docs/REPORT.md`: editable report draft with measured local results and pending work.
- `docs/architecture.svg` and `docs/architecture.png`: architecture diagram; Mermaid source is in `docs/ARCHITECTURE.md`.
- `docs/TokenSaver-demo.webm`: original silent screen recording of the local app and architecture; newer TF-IDF controls are demonstrated in `docs/tfidf-fixed.png`.
- `docs/DEMO_SCRIPT.md`: narration/recording script for your team.
- `docs/TEST_RESULTS.txt`: latest run, 86 tests passed.
- `docs/HOW_TO_TEST.md`: walkthrough of the separate NLP and TF-IDF screens.
- `docs/evaluation/RETENTION_REVIEW.md`: readable 15-case packet awaiting your ratings.
- `docs/evaluation/review_ratings.json`: optional structured answer sheet; all verdicts are pending.
- `docs/evaluation/review_cases.json`: exact source snapshot for the 15 review cases.
- `docs/DESIGN_INTERVIEW.md` and `GLOSSARY.md`: confirmed scope and domain terminology.
