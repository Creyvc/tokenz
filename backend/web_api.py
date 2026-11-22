"""Web API for the Tokenz website: the two local methods and the AI rewrite, and locally the site too.

On this computer: ./start-web.sh (or .venv/bin/python web_api.py), then open
http://127.0.0.1:8000/compare.html. It serves ../frontend and answers on 127.0.0.1 only. NLP and
TF-IDF (/api/compress) run here; the AI rewrite (/api/optimize) sends the prompt on to Groq (Qwen,
GPT-OSS) and Google (Gemini) through optimizer/, once they're set up in optimizer/.env.

In public (TOKENZ_PUBLIC=1, as on Render: see Dockerfile and ../render.yaml) it's the API only, on
every network address at $PORT, for the website at TOKENZ_ORIGINS (the GitHub Pages site) and no
other. Each visitor gets a few runs a minute and a few AI rewrites an hour, the whole site a daily
number of AI rewrites (TOKENZ_RUNS_PER_MINUTE, TOKENZ_AI_PER_HOUR, TOKENZ_AI_PER_DAY), and one AI
rewrite runs at a time, so the free Groq and Google plans can't be used up and the server can't be
swamped. /healthz answers at once, for the host's health check.

Prompts are never logged or saved; the request log shows paths, not bodies. This adapter calls the
public service functions and leaves the backend contract unchanged (see docs/FRONTEND_HANDOFF.md).
"""
import json
import os
import subprocess
import sys
import threading
import time
from collections import deque
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from service import compare_methods
from compressors.nlp_compressor import NLP_MODES
from compressors.tfidf_compressor import inspect_tfidf_input

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
OPTIMIZER = Path(__file__).resolve().parent / "optimizer"
ENCODINGS = ("o200k_base", "cl100k_base")
MAX_BODY_BYTES = 400_000
MAX_TEXT = 40_000  # Same limit as the Streamlit prompt box.
MAX_BUDGET = 6000
# spaCy and the TF-IDF vectorizer are used from one request at a time.
ENGINE_LOCK = threading.Lock()
# The AI models the website offers (Qwen and GPT-OSS on Groq, Gemini on Google), each run on its
# own so the website can show each one as soon as it answers. One
# request per model at a time: more would only run into the free plans' rate limits.
AI_MODELS = ("qwen", "gemini_flash", "gpt_oss_120b")
AI_LOCKS = {model: threading.Lock() for model in AI_MODELS}
# Hard stop for the optimizer process; each model is limited to 30 seconds inside it
AI_SECONDS = 300
_ai_status = {"at": 0.0, "value": None}
# How long a request waits for the engine (spaCy and TF-IDF run one at a time) before it's told
# the engine is busy
ENGINE_WAIT = 20


def env_flag(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def env_int(name, default):
    try:
        return max(0, int(os.environ.get(name, "")))
    except ValueError:
        return default


class Limiter:
    """How often each visitor (or the whole site) may do something: at most `limit` times in any
    `seconds`. A limit of 0 means no limit."""

    def __init__(self, limit, seconds):
        self.limit, self.seconds = limit, seconds
        self.hits = {}
        self.lock = threading.Lock()

    def _recent(self, key, now):
        times = self.hits.get(key)
        while times and now - times[0] >= self.seconds:
            times.popleft()
        return times

    def wait(self, key):
        """Seconds until `key` may go again; 0 when it may go now."""
        if not self.limit:
            return 0
        now = time.monotonic()
        with self.lock:
            times = self._recent(key, now)
            return times[0] + self.seconds - now if times and len(times) >= self.limit else 0

    def add(self, key):
        if not self.limit:
            return
        now = time.monotonic()
        with self.lock:
            # (forget visitors who haven't been back for a while, so the table stays small)
            if len(self.hits) > 20000:
                for old in [k for k, t in self.hits.items() if not t or now - t[-1] >= self.seconds]:
                    del self.hits[old]
            self.hits.setdefault(key, deque())
            self._recent(key, now)
            self.hits[key].append(now)


class Policy:
    """How the engine behaves: on this computer (the default) or in public."""

    def __init__(self, public=False, origins=(), runs_per_minute=0, ai_per_hour=0, ai_per_day=0):
        self.public = public
        self.origins = {origin.strip().rstrip("/") for origin in origins if origin.strip()}
        self.runs = Limiter(runs_per_minute, 60)
        self.ai_visitor = Limiter(ai_per_hour, 3600)
        self.ai_site = Limiter(ai_per_day, 86400)
        # In public one AI rewrite at a time (each starts a helper process; the server is small)
        self.ai_one = threading.BoundedSemaphore(1) if public else None
        self.status_seconds = 60 if public else 5

    @classmethod
    def from_env(cls):
        if not env_flag("TOKENZ_PUBLIC"):
            return cls()
        return cls(public=True,
                   origins=os.environ.get("TOKENZ_ORIGINS", "https://creyvc.github.io").split(","),
                   runs_per_minute=env_int("TOKENZ_RUNS_PER_MINUTE", 30),
                   ai_per_hour=env_int("TOKENZ_AI_PER_HOUR", 5),
                   ai_per_day=env_int("TOKENZ_AI_PER_DAY", 100))

    def describe(self):
        if not self.public:
            return {}
        return dict(public=True, limits=dict(runs_per_minute=self.runs.limit,
                                             ai_per_hour=self.ai_visitor.limit, ai_per_day=self.ai_site.limit))


POLICY = Policy.from_env()


@contextmanager
def engine():
    """The engine, once it's free: one run at a time, or a polite 'busy' after ENGINE_WAIT."""
    if not ENGINE_LOCK.acquire(timeout=ENGINE_WAIT):
        raise Unavailable("The engine is busy with other prompts. Try again in a moment.")
    try:
        yield
    finally:
        ENGINE_LOCK.release()


class BadRequest(ValueError):
    pass


class Unavailable(RuntimeError):
    """The AI rewrite isn't set up yet, or the engine is busy (503)."""


class TooMany(RuntimeError):
    """A visitor (or the whole site) has reached a limit (429); `wait` is the seconds until it lifts."""

    def __init__(self, message, wait):
        super().__init__(message)
        self.wait = wait


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


def run_bridge(command, payload=None):
    """Runs optimizer/app/bridge.py in its own process. The optimizer's package is called `app`, like
    this folder's app.py, so the two are never imported into the same Python."""
    env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    done = subprocess.run([sys.executable, "-m", "app.bridge", command], cwd=OPTIMIZER, env=env,
                          input=json.dumps(payload or {}), capture_output=True, text=True,
                          timeout=AI_SECONDS)
    lines = done.stdout.strip().splitlines()
    if done.returncode or not lines:
        raise RuntimeError("The optimizer stopped without an answer.")
    return json.loads(lines[-1])


def ai_status():
    # Checked at most every few seconds (a minute in public), so health stays quick; it reads
    # settings only
    now = time.monotonic()
    if _ai_status["value"] is None or now - _ai_status["at"] > POLICY.status_seconds:
        try:
            _ai_status["value"] = run_bridge("status")
        except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired):
            _ai_status["value"] = dict(available=False, optimizers=[])
        _ai_status["at"] = now
    return _ai_status["value"]


def health(_body=None):
    return dict(ok=True, methods=["nlp", "tfidf"], nlp_modes=list(NLP_MODES), encodings=list(ENCODINGS),
                ai=ai_status())


def inspect(body):
    """TF-IDF preflight: the sentences, the token count and the minimum budget."""
    text = text_field(body, "text")
    with engine():
        plan = inspect_tfidf_input(text, text_field(body, "main_question"), sentences_field(body),
                                   encoding_field(body), phrases_field(body))
    minimum = plan["minimum_required_tokens"]
    return dict(
        sentences=[dict(index=row["index"], text=row["text"], locked=row["locked"],
                        mandatory_reasons=row["mandatory_reasons"]) for row in plan["rows"]],
        problems=plan["problems"], main_task_valid=plan["main_task_valid"],
        original_tokens=plan["original_tokens"], minimum_required_tokens=minimum,
        # Enough for the mandatory sentences and every relevant one; without a confirmed task, the
        # Streamlit workbench's rule: 65% of the original, never below the minimum.
        suggested_budget=min(MAX_BUDGET, max(minimum or 1, plan["suggested_budget"] or int(plan["original_tokens"] * .65))))


def compress(body):
    method = body.get("method")
    if method not in ("nlp", "tfidf"):
        raise BadRequest("Choose NLP or TF-IDF. The Qwen and Gemini AI rewrite is at /api/optimize.")
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
    with engine():
        result, = compare_methods(text, options)
    return dict(result=result.to_dict(), nlp_mode=mode if method == "nlp" else None, encoding=encoding)


def optimize(body):
    """The AI rewrite: each chosen model (Qwen or GPT-OSS on Groq, Gemini on Google) rewrites the prompt. A rewrite that
    loses a number, a limit, a negation, quoted text or an acronym, saves nothing or comes back incomplete gets one
    retry with the reasons; if that fails too it is rejected and the original is kept."""
    text = text_field(body, "text")
    if not text.strip():
        raise BadRequest("Paste a prompt first.")
    encoding = encoding_field(body)
    models = body.get("models", ["qwen", "gemini_flash"])
    if not isinstance(models, list) or not models or len(set(models)) != len(models) or \
            any(model not in AI_MODELS for model in models):
        raise BadRequest("Choose one or more of: " + ", ".join(AI_MODELS) + ".")
    taken = []
    try:
        for model in models:
            if not AI_LOCKS[model].acquire(blocking=False):
                raise Unavailable("An AI rewrite is already running. Try again when it finishes.")
            taken.append(model)
        study = run_bridge("optimize", dict(prompt=text, encoding=encoding, models=models))
    finally:
        for model in taken:
            AI_LOCKS[model].release()
    if study.get("code") == "NOT_CONFIGURED":
        raise Unavailable(study["error"])
    if study.get("code") == "BAD_REQUEST":
        raise BadRequest(study["error"])
    original = study["original_tokens"]
    candidates = []
    for row in study["optimizations"]:
        tokens = row.get("optimized_tokens")
        candidates.append(dict(
            key=row["key"], provider=row["provider"], model=row["model"], status=row["status"],
            optimized_prompt=row.get("optimized_prompt"), optimized_tokens=tokens,
            tokens_saved=None if tokens is None else original - tokens,
            reduction_percent=row.get("token_saving_pct"), checks=row.get("checks", []),
            error=(row.get("error") or {}).get("message")))
    return dict(status=study["status"], original_tokens=original, encoding=encoding, candidates=candidates,
                note="Sent to Groq and Google to rewrite. Check that every task and constraint survived "
                     "before you use a suggestion.")


ROUTES = {"/api/inspect": inspect, "/api/compress": compress, "/api/optimize": optimize}


def local_origin(origin):
    """A page served from this computer, such as VS Code's Live Server on another port."""
    parts = urlsplit(origin or "")
    return parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost") and not parts.path


class Handler(SimpleHTTPRequestHandler):
    server_version = "Tokenz"
    policy = POLICY
    # A visitor that stops sending halfway is let go after this long, so it can't hold a thread
    timeout = 30

    def origin_allowed(self, origin):
        # Locally: pages on this computer (Live Server on another port). In public: the website
        # at TOKENZ_ORIGINS only
        if self.policy.public:
            return bool(origin) and origin.rstrip("/") in self.policy.origins
        return local_origin(origin)

    def end_headers(self):
        # Always pick up edits to the site while it's being worked on.
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Let the site call the API from its own address (Live Server locally, GitHub Pages in public).
        origin = self.headers.get("Origin")
        if self.path.startswith("/api/") and self.origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def do_OPTIONS(self):
        # The browser's check before a POST from the site's own address.
        if not self.host_allowed():
            return
        if not self.path.startswith("/api/") or not self.origin_allowed(self.headers.get("Origin")):
            return self.send_json(403, dict(error="This website can't use the Tokenz engine."))
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
        if status == 429:
            self.send_header("Retry-After", str(getattr(self, "retry_after", 60)))
        self.end_headers()
        self.wfile.write(data)

    def host_allowed(self):
        # In public it answers at the host's address. Locally, only this computer's own names, so
        # another website can't reach the engine through a look-alike address.
        if self.policy.public:
            return True
        host = urlsplit("//" + (self.headers.get("Host") or "")).hostname
        if host in ("127.0.0.1", "localhost"):
            return True
        self.send_json(403, dict(error="Open Tokenz at http://127.0.0.1 on this computer."))
        return False

    def client(self):
        """Who's asking, for the limits: in public the visitor's address as the host's proxy
        passes it on (Render sends True-Client-IP), otherwise the connection's."""
        if self.policy.public:
            for name in ("True-Client-IP", "CF-Connecting-IP"):
                value = (self.headers.get(name) or "").strip()
                if value:
                    return value
            forwarded = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if forwarded:
                return forwarded
        return self.client_address[0]

    def do_GET(self):
        if not self.host_allowed():
            return
        path = urlsplit(self.path).path
        # For the host's health check: answers at once, without touching the engine
        if path == "/healthz":
            return self.send_json(200, dict(ok=True))
        if path == "/api/health":
            return self.send_json(200, dict(health(), **self.policy.describe()))
        if path.startswith("/api/"):
            return self.send_json(404, dict(error="Unknown address."))
        # In public it's the API only; the website is on GitHub Pages
        if self.policy.public:
            if path == "/":
                return self.send_json(200, dict(service="Tokenz engine", health="/api/health"))
            return self.send_json(404, dict(error="Unknown address."))
        if any(part.startswith(".") for part in path.split("/")):
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if not self.host_allowed():
            return
        if self.policy.public:
            # (some uptime checks use HEAD)
            path = urlsplit(self.path).path
            self.send_response(200 if path in ("/", "/healthz") else 404)
            self.send_header("Content-Length", "0")
            return self.end_headers()
        super().do_HEAD()

    def check_limits(self, route):
        """Counts this request against the visitor's limits, or says how long to wait."""
        who = self.client()
        if route is optimize:
            wait = self.policy.ai_visitor.wait(who)
            if wait:
                raise TooMany("You've used the AI rewrite " + str(self.policy.ai_visitor.limit) +
                              " times this hour. Try it again in " + minutes(wait) +
                              ", or use NLP or TF-IDF meanwhile.", wait)
            wait = self.policy.ai_site.wait("site")
            if wait:
                raise TooMany("The AI rewrite has reached today's limit for everyone. Try it again "
                              "tomorrow, or use NLP or TF-IDF meanwhile.", wait)
            self.policy.ai_visitor.add(who)
            self.policy.ai_site.add("site")
        else:
            wait = self.policy.runs.wait(who)
            if wait:
                raise TooMany("That's a lot of runs in a minute. Try again in " + minutes(wait) + ".", wait)
            self.policy.runs.add(who)

    def run(self, route, body):
        if route is optimize and self.policy.ai_one is not None:
            if not self.policy.ai_one.acquire(blocking=False):
                raise Unavailable("Someone else's AI rewrite is running. Try again in a moment.")
            try:
                return route(body)
            finally:
                self.policy.ai_one.release()
        return route(body)

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
            # Read and drop a moderately oversized body first, so the sender gets this answer
            # instead of a broken connection; anything huge just closes the connection
            if MAX_BODY_BYTES < length <= 4 * MAX_BODY_BYTES:
                self.rfile.read(length)
            else:
                self.close_connection = True
            return self.send_json(413, dict(error="The request is empty or too large."))
        try:
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise BadRequest("Send a JSON object.")
            self.check_limits(route)
            return self.send_json(200, self.run(route, body))
        except (BadRequest, json.JSONDecodeError, UnicodeDecodeError) as exc:
            message = str(exc) if isinstance(exc, BadRequest) else "Send valid JSON."
            return self.send_json(400, dict(error=message))
        except TooMany as exc:
            self.retry_after = int(exc.wait) + 1
            return self.send_json(429, dict(error=str(exc)))
        except Unavailable as exc:
            return self.send_json(503, dict(error=str(exc)))
        except subprocess.TimeoutExpired:
            return self.send_json(504, dict(error="The AI rewrite took too long. Try again."))
        except Exception:
            # No exception text in the reply: it could quote the prompt.
            return self.send_json(500, dict(error="The engine hit a problem with that request."))


def minutes(seconds):
    whole = max(1, round(seconds / 60))
    return "a minute" if whole == 1 else f"{whole} minutes"


class Server(ThreadingHTTPServer):
    """One thread per request, but no more than MOST at once: past that, a short 'busy' answer, so
    a flood of requests can't use up the server's memory."""
    daemon_threads = True
    MOST = 48
    BUSY = (b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n"
            b"Content-Length: 45\r\nRetry-After: 5\r\nConnection: close\r\n\r\n"
            b'{"error": "The engine is busy. Try again."}  ')

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(self.MOST)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(self.BUSY)
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def warm_up():
    # Load spaCy and both token encodings now, so the first run on the page isn't slow.
    text = "Please explain gravity. Please explain gravity. Mass bends space. The bus was late."
    compare_methods(text, dict(methods=["nlp", "tfidf"], main_question="Please explain gravity.",
                               token_budget=12))
    compare_methods(text, dict(methods=["nlp"], encoding="cl100k_base"))


def main():
    public = POLICY.public
    # (the host sets $PORT in public; locally TOKENZ_PORT, 8000 by default)
    port = int(os.environ.get("PORT") or os.environ.get("TOKENZ_PORT") or ("10000" if public else "8000"))
    if not public and not (FRONTEND / "compare.html").is_file():
        sys.exit(f"Can't find the website next to this folder: {FRONTEND}")
    print("Loading the NLP model and tokenizers…", flush=True)
    warm_up()
    server = Server(("0.0.0.0" if public else "127.0.0.1", port), partial(Handler, directory=str(FRONTEND)))
    if public:
        print(f"Tokenz engine is running in public on port {port}, for " + ", ".join(sorted(POLICY.origins)), flush=True)
    else:
        print(f"Tokenz is running at http://127.0.0.1:{port}/compare.html  (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
