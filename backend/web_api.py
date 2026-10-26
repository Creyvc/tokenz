"""Local web API for the Tokenz website: serves ../frontend and the two local methods.

Run from this folder: ./start-web.sh (or .venv/bin/python web_api.py), then open
http://127.0.0.1:8000/compare.html. Only NLP and TF-IDF are offered: nothing leaves this
computer, and the server answers on 127.0.0.1 only. Prompts are never logged; the request
log shows paths, not bodies. This adapter calls the public service functions and leaves the
backend contract unchanged (see docs/FRONTEND_HANDOFF.md).
"""
import json
import os
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from service import compare_methods
from compressors.nlp_compressor import NLP_MODES
from compressors.tfidf_compressor import inspect_tfidf_input

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
ENCODINGS = ("o200k_base", "cl100k_base")
MAX_BODY_BYTES = 400_000
MAX_TEXT = 40_000  # Same limit as the Streamlit prompt box.
MAX_BUDGET = 6000
# spaCy and the TF-IDF vectorizer are used from one request at a time.
ENGINE_LOCK = threading.Lock()


class BadRequest(ValueError):
    pass


def text_field(body, name):
    value = body.get(name, "")
    if not isinstance(value, str):
        raise BadRequest(f"{name} must be text.")
    if len(value) > MAX_TEXT:
        raise BadRequest(f"Keep the prompt under {MAX_TEXT:,} characters.")
    return value


def phrases_field(body):
    value = body.get("locked_spans", [])
    if not isinstance(value, list) or len(value) > 200 or not all(
            isinstance(span, str) and len(span) <= 2000 for span in value):
        raise BadRequest("Protected phrases must be a short list of text.")
    # Same clean-up as compare_methods, so the preflight and the run agree.
    return [span.strip() for span in value if span.strip()]


def sentences_field(body):
    value = body.get("locked_sentences", [])
    if not isinstance(value, list) or len(value) > 2000 or not all(
            type(index) is int and index >= 0 for index in value):
        raise BadRequest("Kept sentences must be a list of sentence numbers.")
    return value


def encoding_field(body):
    value = body.get("encoding", "o200k_base")
    if value not in ENCODINGS:
        raise BadRequest("Choose o200k_base or cl100k_base.")
    return value


def health(_body=None):
    return dict(ok=True, methods=["nlp", "tfidf"], nlp_modes=list(NLP_MODES), encodings=list(ENCODINGS))


def inspect(body):
    """TF-IDF preflight: the sentences, the token count and the minimum budget."""
    text = text_field(body, "text")
    with ENGINE_LOCK:
        plan = inspect_tfidf_input(text, text_field(body, "main_question"), sentences_field(body),
                                   encoding_field(body), phrases_field(body))
    minimum = plan["minimum_required_tokens"]
    return dict(
        sentences=[dict(index=row["index"], text=row["text"], locked=row["locked"],
                        mandatory_reasons=row["mandatory_reasons"]) for row in plan["rows"]],
        problems=plan["problems"], main_task_valid=plan["main_task_valid"],
        original_tokens=plan["original_tokens"], minimum_required_tokens=minimum,
        # The Streamlit workbench's rule: start at 65% of the original, never below the minimum.
        suggested_budget=min(MAX_BUDGET, max(minimum or 1, int(plan["original_tokens"] * .65))))


def compress(body):
    method = body.get("method")
    if method not in ("nlp", "tfidf"):
        raise BadRequest("Choose NLP or TF-IDF. Qwen isn't available on the website.")
    mode = body.get("nlp_mode", "conservative")
    if mode not in NLP_MODES:
        raise BadRequest("Unknown NLP strength.")
    budget = body.get("token_budget", 1)
    if type(budget) is not int or not 1 <= budget <= MAX_BUDGET:
        raise BadRequest(f"The token budget must be a whole number from 1 to {MAX_BUDGET}.")
    encoding = encoding_field(body)
    options = dict(methods=[method], encoding=encoding, nlp_mode=mode,
                   locked_spans=phrases_field(body), main_question=text_field(body, "main_question"),
                   token_budget=budget, locked_sentences=sentences_field(body), allow_external=False)
    text = text_field(body, "text")
    with ENGINE_LOCK:
        result, = compare_methods(text, options)
    return dict(result=result.to_dict(), nlp_mode=mode if method == "nlp" else None, encoding=encoding)


ROUTES = {"/api/inspect": inspect, "/api/compress": compress}


def local_origin(origin):
    """A page served from this computer, such as VS Code's Live Server on another port."""
    parts = urlsplit(origin or "")
    return parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost") and not parts.path


class Handler(SimpleHTTPRequestHandler):
    server_version = "TokenzLocal"

    def end_headers(self):
        # Always pick up edits to the site while it's being worked on.
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Let the site call the API when it's served from another local port (Live Server).
        origin = self.headers.get("Origin")
        if self.path.startswith("/api/") and local_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def do_OPTIONS(self):
        # The browser's check before a cross-port POST: allowed for local pages only.
        if not self.host_allowed():
            return
        if not self.path.startswith("/api/") or not local_origin(self.headers.get("Origin")):
            return self.send_json(403, dict(error="Only pages on this computer can use the engine."))
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def host_allowed(self):
        # Only this computer's own names, so another website can't reach the engine
        # through a look-alike address.
        host = urlsplit("//" + (self.headers.get("Host") or "")).hostname
        if host in ("127.0.0.1", "localhost"):
            return True
        self.send_json(403, dict(error="Open Tokenz at http://127.0.0.1 on this computer."))
        return False

    def do_GET(self):
        if not self.host_allowed():
            return
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.send_json(200, health())
        if path.startswith("/api/"):
            return self.send_json(404, dict(error="Unknown address."))
        if any(part.startswith(".") for part in path.split("/")):
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.host_allowed():
            super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_POST(self):
        if not self.host_allowed():
            return
        route = ROUTES.get(urlsplit(self.path).path)
        if route is None:
            return self.send_json(404, dict(error="Unknown address."))
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.send_json(415, dict(error="Send JSON."))
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY_BYTES:
            return self.send_json(413, dict(error="The request is empty or too large."))
        try:
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise BadRequest("Send a JSON object.")
            return self.send_json(200, route(body))
        except (BadRequest, json.JSONDecodeError, UnicodeDecodeError) as exc:
            message = str(exc) if isinstance(exc, BadRequest) else "Send valid JSON."
            return self.send_json(400, dict(error=message))
        except Exception:
            # No exception text in the reply: it could quote the prompt.
            return self.send_json(500, dict(error="The engine hit a problem with that request."))


def warm_up():
    # Load spaCy and both token encodings now, so the first run on the page isn't slow.
    text = "Please explain gravity. Please explain gravity. Mass bends space. The bus was late."
    compare_methods(text, dict(methods=["nlp", "tfidf"], main_question="Please explain gravity.",
                               token_budget=12))
    compare_methods(text, dict(methods=["nlp"], encoding="cl100k_base"))


def main():
    port = int(os.environ.get("TOKENZ_PORT", "8000"))
    if not (FRONTEND / "compare.html").is_file():
        sys.exit(f"Can't find the website next to this folder: {FRONTEND}")
    print("Loading the NLP model and tokenizers…", flush=True)
    warm_up()
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(FRONTEND)))
    print(f"Tokenz is running at http://127.0.0.1:{port}/compare.html  (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
