"""Local web API used by the Tokenz website. Runs a real server on a free local port."""
import json
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
import pytest
import web_api

EXAMPLE = ("Please explain how photosynthesis works for a beginner. "
           "Please explain how photosynthesis works for a beginner. "
           "Chlorophyll in the leaves absorbs sunlight. "
           "My teacher said this topic will be in the exam next week. "
           "Yesterday the bus to school was late and it was raining.")


@pytest.fixture(scope="module")
def base():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(web_api.Handler, directory=str(web_api.FRONTEND)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


def call(url, body=None, raw=None, headers=None, method=None):
    data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def test_health_lists_local_methods_only(base):
    status, data = call(base + "/api/health")
    assert status == 200
    assert json.loads(data)["methods"] == ["nlp", "tfidf"]


def test_serves_the_website(base):
    status, data = call(base + "/compare.html")
    assert status == 200 and b"<title>Compare" in data


def test_nlp_run_returns_the_result_contract(base):
    status, data = call(base + "/api/compress", dict(method="nlp", text=EXAMPLE, nlp_mode="balanced"))
    reply = json.loads(data)
    assert status == 200 and reply["nlp_mode"] == "balanced"
    assert reply["result"]["status"] == "review_required"
    assert reply["result"]["tokens_saved"] > 0


def test_tfidf_preflight_then_run(base):
    status, data = call(base + "/api/inspect", dict(text=EXAMPLE))
    plan = json.loads(data)
    assert status == 200 and len(plan["sentences"]) == 5 and plan["minimum_required_tokens"] is None
    task = plan["sentences"][0]["text"]
    plan = json.loads(call(base + "/api/inspect", dict(text=EXAMPLE, main_question=task))[1])
    assert plan["main_task_valid"] and plan["problems"] == []
    assert plan["minimum_required_tokens"] <= plan["suggested_budget"] < plan["original_tokens"]
    status, data = call(base + "/api/compress", dict(method="tfidf", text=EXAMPLE, main_question=task,
                                                     token_budget=plan["suggested_budget"]))
    result = json.loads(data)["result"]
    assert status == 200 and result["selection_info"]["reason_code"] == "selected"
    assert task in result["candidate_text"]


def test_qwen_is_not_offered(base):
    status, data = call(base + "/api/compress", dict(method="qwen", text=EXAMPLE))
    assert status == 400 and "Qwen" in json.loads(data)["error"]


@pytest.mark.parametrize("budget", [0, 6001, True, "20", 2.5])
def test_rejects_bad_budgets(base, budget):
    status, _ = call(base + "/api/compress", dict(method="tfidf", text=EXAMPLE, token_budget=budget))
    assert status == 400


@pytest.mark.parametrize("body", [dict(text=7), dict(text="x" * 40_001), dict(text="x", locked_spans="x"),
                                  dict(text="x", locked_sentences=[-1]), dict(text="x", encoding="gpt2")])
def test_rejects_bad_fields(base, body):
    assert call(base + "/api/inspect", body)[0] == 400


def test_rejects_bad_requests(base):
    assert call(base + "/api/inspect", raw=b"{not json")[0] == 400
    assert call(base + "/api/inspect", raw=b"[1, 2]")[0] == 400
    assert call(base + "/api/inspect", body=dict(text="x"), headers={"Content-Type": "text/plain"})[0] == 415
    assert call(base + "/api/inspect", raw=b"x" * (web_api.MAX_BODY_BYTES + 1))[0] == 413
    assert call(base + "/api/nothing", body={})[0] == 404


def test_only_answers_to_local_host_names(base):
    assert call(base + "/api/health", headers={"Host": "evil.example"})[0] == 403
    assert call(base + "/api/health", headers={"Host": "localhost"})[0] == 200


def test_no_folder_listings_or_hidden_files(base):
    assert call(base + "/assets/")[0] == 404
    assert call(base + "/.DS_Store")[0] == 404


def test_pages_on_other_local_ports_can_use_the_api(base):
    # VS Code's Live Server serves the site on port 5500 and calls the engine on its own port.
    request = urllib.request.Request(base + "/api/health", headers={"Origin": "http://127.0.0.1:5500"})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5500"
    status, _ = call(base + "/api/compress", method="OPTIONS",
                     headers={"Origin": "http://localhost:5500", "Access-Control-Request-Method": "POST"})
    assert status == 204


@pytest.mark.parametrize("origin", ["https://evil.example", "http://evil.example:5500", "null"])
def test_other_websites_cannot_use_the_api(base, origin):
    request = urllib.request.Request(base + "/api/health", headers={"Origin": origin})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert "Access-Control-Allow-Origin" not in response.headers
    assert call(base + "/api/compress", method="OPTIONS", headers={"Origin": origin})[0] == 403


# The AI rewrite (optimizer/, Groq and Gemini). Tests never reach Groq or Google: keys are blanked,
# or the bridge to the optimizer is replaced.

NO_KEYS = ("GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")


@pytest.fixture
def no_keys(monkeypatch):
    for name in NO_KEYS:
        monkeypatch.setenv(name, "")
    web_api._ai_status["value"] = None
    yield
    web_api._ai_status["value"] = None


def test_health_reports_whether_the_ai_rewrite_is_set_up(base, no_keys):
    status, data = call(base + "/api/health")
    ai = json.loads(data)["ai"]
    assert status == 200 and ai["available"] is False
    assert [row["key"] for row in ai["optimizers"]] == ["qwen", "gemini_flash"]
    assert all(row["reason"] == "API key missing" for row in ai["optimizers"])


def test_ai_rewrite_without_keys_says_how_to_set_it_up(base, no_keys):
    status, data = call(base + "/api/optimize", dict(text=EXAMPLE))
    assert status == 503
    message = json.loads(data)["error"]
    assert message.startswith("Connect Groq and Gemini first") and "photosynthesis" not in message


def test_ai_rewrite_rejects_empty_and_oversized_prompts_without_starting(base, monkeypatch):
    monkeypatch.setattr(web_api, "run_bridge", lambda *a: pytest.fail("must not start the optimizer"))
    assert call(base + "/api/optimize", dict(text="  "))[0] == 400
    assert call(base + "/api/optimize", dict(text="x" * (web_api.MAX_TEXT + 1)))[0] == 400
    assert call(base + "/api/optimize", dict(text=EXAMPLE, encoding="latin1"))[0] == 400


def test_ai_rewrite_returns_both_models_with_the_local_token_counts(base, monkeypatch):
    sent = []

    def bridge(command, payload=None):
        sent.append((command, payload))
        return dict(status="completed", original_tokens=31, optimizations=[
            dict(provider="groq", model="qwen/qwen3.8-27b", status="accepted",
                 optimized_prompt="Help me write a short email to my team: the deadline moved to Friday.",
                 optimized_tokens=18, token_saving_pct=41.9, checks=[]),
            dict(provider="gemini", model="gemini-3.6-flash", status="rejected",
                 optimized_prompt="original kept", optimized_tokens=31, token_saving_pct=0.0,
                 checks=["An original number was not preserved literally."])])
    monkeypatch.setattr(web_api, "run_bridge", bridge)
    status, data = call(base + "/api/optimize", dict(text="Hi there, please help.", encoding="cl100k_base"))
    reply = json.loads(data)
    assert status == 200 and sent == [("optimize", dict(prompt="Hi there, please help.", encoding="cl100k_base"))]
    assert reply["original_tokens"] == 31 and reply["encoding"] == "cl100k_base"
    groq, gemini = reply["candidates"]
    assert groq["status"] == "accepted" and groq["tokens_saved"] == 13 and groq["reduction_percent"] == 41.9
    assert gemini["status"] == "rejected" and gemini["tokens_saved"] == 0 and gemini["checks"]
    assert "Check that every task" in reply["note"]


def test_ai_rewrite_failure_inside_the_optimizer_is_a_generic_500(base, monkeypatch):
    def broken(*args):
        raise RuntimeError("The optimizer stopped without an answer.")
    monkeypatch.setattr(web_api, "run_bridge", broken)
    status, data = call(base + "/api/optimize", dict(text=EXAMPLE))
    assert status == 500 and "photosynthesis" not in data.decode()
