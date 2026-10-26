# Tokenz

A token saver for AI prompts: it shortens what you send to a language model while keeping the meaning. A group academic project.

## What's in this repository

| Folder | What it is |
| --- | --- |
| `frontend/` | The Tokenz website: plain HTML, CSS and JavaScript, no build step. Open any page from disk to view it. |
| `backend/` | TokenSaver, the prompt-compression engine in Python: NLP and TF-IDF methods (local), an optional Qwen method, tests, evaluation and the report. It has its own small Streamlit app for testing the methods. See [backend/README.md](backend/README.md). |

The website and the engine aren't connected yet. The engine is called from Python (`compare_methods` in `backend/service.py`); a browser page would need a small local web API in between. See [backend/docs/FRONTEND_HANDOFF.md](backend/docs/FRONTEND_HANDOFF.md) for the engine's interface.

## Run the engine

On macOS or Linux, from `backend/`:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-lock.txt
./start.sh
```

On Windows, follow [backend/README.md](backend/README.md) and run `Start-TokenSaver.ps1`.
