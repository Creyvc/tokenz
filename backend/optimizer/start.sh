#!/bin/sh
# macOS / Linux version of Start-Tokenz.ps1: the Groq and Gemini dashboard on port 8501.
# Inside the Tokenz backend this shares ../.venv with TokenSaver; a .venv of its own still works.
set -eu
cd "$(dirname "$0")"
python=../.venv/bin/python
[ -x "$python" ] || python=.venv/bin/python
if [ ! -x "$python" ]; then
  echo "Create the virtual environment and install dependencies using ../README.md first." >&2
  exit 1
fi
exec "$python" -m streamlit run dashboard/streamlit_app.py --server.address 127.0.0.1 --server.port 8501 --server.headless true --browser.gatherUsageStats false
