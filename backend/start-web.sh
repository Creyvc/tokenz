#!/bin/sh
# Starts the Tokenz website with the engine behind it: http://127.0.0.1:8000/compare.html
# (TOKENZ_PORT changes the port). Uses this folder's .venv, like start.sh.
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Create the virtual environment and install dependencies using README.md first." >&2
  exit 1
fi
exec .venv/bin/python web_api.py
