# Tokenz

A token saver for AI prompts: it shortens what you send to a language model while keeping the meaning. A group academic project.

## What's in this repository

```
tokenz/
├── frontend/            The website, published to GitHub Pages as is (no build step)
│   ├── *.html           One file per page: index (Home), compare, results, how-it-works, about
│   ├── css/             styles.css, every style for the whole site
│   ├── js/              The scripts, one per feature (api.js talks to the engine)
│   └── assets/          images/ (logo, favicon), audio/ (About's hellos), video/ (the ad)
├── backend/             TokenSaver, the prompt-compression engine (Python)
│   ├── compressors/     The NLP and TF-IDF methods (and the optional Qwen one)
│   ├── optimizer/       The AI rewrite (Qwen and GPT-OSS on Groq, Gemini on Google)
│   ├── tests/           The engine's tests
│   ├── docs/            Report, architecture, evaluation and screenshots
│   └── web_api.py       The local web API the website's Compare and Results use
├── film/                The ads, made in code (see film/README.md)
│   ├── promo/           The current ad
│   ├── shared/          The music toolkit the films use
│   └── archive/         Earlier films, kept as source
├── tools/               One-off scripts (make-hellos.py makes About's spoken hellos)
├── docs/                Notes about the website (the old Home FAQ)
└── .github/workflows/   Publishes frontend/ to GitHub Pages on every push to main
```

| Folder | What it is |
| --- | --- |
| `frontend/` | The Tokenz website: plain HTML, CSS and JavaScript, no build step. Open any page from disk to view it. |
| `backend/` | TokenSaver, the prompt-compression engine in Python: NLP and TF-IDF methods (local), an optional Qwen method, tests, evaluation and the report. It has its own small Streamlit app for testing the methods. See [backend/README.md](backend/README.md). |
| `backend/optimizer/` | The AI rewrite: Qwen on Groq and Gemini on Google each rewrite a prompt to use fewer tokens, with its own Streamlit dashboard. It shares the backend's Python environment. See [backend/optimizer/README.md](backend/optimizer/README.md). |
| `film/` | The Tokenz ads, each drawn and scored in code. See [film/README.md](film/README.md). |

The website's Compare and Results pages run the engine's two local methods (NLP and TF-IDF) through a small local web API, `backend/web_api.py`. It serves the website and answers only on this computer, and those two methods send nothing anywhere else. The same API also offers the AI rewrite (`/api/optimize`), which sends the prompt to Groq and Google once their keys are set up in `backend/optimizer/.env`. On Compare it's the third option, **AI rewrite**, with a notice that it leaves the computer; Results shows it next to NLP and TF-IDF.

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
