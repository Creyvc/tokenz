#!/bin/sh
# macOS / Linux version of Start-TokenSaver.ps1: runs the Streamlit app from this folder's .venv.
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Create the virtual environment and install dependencies using README.md first." >&2
  exit 1
fi
exec .venv/bin/python -m streamlit run app.py --server.address 127.0.0.1 --browser.gatherUsageStats false
