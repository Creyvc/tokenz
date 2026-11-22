# The Tokenz engine in public (web_api.py with TOKENZ_PUBLIC=1): the API the GitHub Pages site
# uses, with its limits. Render builds this from ../render.yaml; it runs on any Docker host too:
#   docker build -t tokenz-engine backend
#   docker run -p 10000:10000 -e GROQ_API_KEY=... -e GEMINI_API_KEY=... tokenz-engine
# The keys come from the host's environment settings, never from a file in the image
# (.dockerignore leaves every .env out).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TIKTOKEN_CACHE_DIR=/app/.tiktoken \
    TOKENZ_PUBLIC=1 \
    PORT=10000

WORKDIR /app

# The exact versions tested on this project (spaCy's English model included)
COPY requirements-lock.txt .
RUN pip install -r requirements-lock.txt

COPY . .

# Both token counts' tables, fetched now so starting up never depends on the network
RUN python -c "import tiktoken; tiktoken.get_encoding('o200k_base'); tiktoken.get_encoding('cl100k_base')"

# Not as root
RUN useradd --create-home --uid 10001 tokenz && chown -R tokenz /app
USER tokenz

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT', '10000'), timeout=4)"
CMD ["python", "web_api.py"]
