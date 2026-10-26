# Tokenz

A token saver for AI prompts: it shortens what you send to a language model while keeping the meaning. A group academic project.

## What's in this repository

| Folder | What it is |
| --- | --- |
| `frontend/` | The Tokenz website: plain HTML, CSS and JavaScript, no build step. Open any page from disk to view it. |
| `backend/` | TokenSaver, the prompt-compression engine in Python: NLP and TF-IDF methods (local), an optional Qwen method, tests, evaluation and the report. It has its own small Streamlit app for testing the methods. See [backend/README.md](backend/README.md). |

The website's Compare and Results pages run the engine's two local methods (NLP and TF-IDF) through a small local web API, `backend/web_api.py`. It serves the website and answers only on this computer; nothing is sent anywhere else.

## Run the website with the engine

Set up the engine once, from `backend/` (macOS or Linux):

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements-lock.txt
```

Then start it and open http://127.0.0.1:8000/compare.html:

```sh
./start-web.sh
```

On Windows, set up the engine as in [backend/README.md](backend/README.md), then run `Start-TokenzWeb.ps1`. The engine's own Streamlit test app is still there too: `./start.sh` (Windows: `Start-TokenSaver.ps1`).

Opening the pages straight from disk still shows the site, but Compare can only run once the engine is started.
