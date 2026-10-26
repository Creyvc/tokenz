"""Offline policy and transport contract tests. No real credentials or calls."""
import json
from dataclasses import replace

import httpx
import pytest

from app.config import ProviderConfig
from app.integration_config import (
    IntegrationConfig,
    get_optimizer_config,
    load_integration_settings,
    optimizer_registry,
)
from app.integration_providers import OpenAIResponsesProvider, make_integration_provider
from app.providers import ProviderError

MESSAGES = [{"role": "system", "content": "Rewrite only"}, {"role": "user", "content": "Test prompt"}]


def config(provider="groq", model="qwen/qwen3.8-27b", **changes):
    bases = {"groq": "https://api.groq.com/openai/v1",
             "gemini": "https://generativelanguage.googleapis.com/v1beta",
             "openrouter": "https://openrouter.ai/api/v1", "openai": "https://api.openai.com/v1"}
    return replace(ProviderConfig(provider, model, bases[provider], "provider-test-secret", 0, 0,
                                  free_tier_confirmed=True), **changes)


def groq_response(**updates):
    data = {"id": "response-1", "model": "qwen/qwen3.8-27b",
            "choices": [{"message": {"content": "Short prompt"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 3}}
    return {**data, **updates}


def test_groq_paces_before_next_request_using_provider_token_allowance(monkeypatch):
    clock = [100.]
    waits = []
    monkeypatch.setattr('app.integration_providers.time.monotonic', lambda: clock[0])
    def sleep(seconds):
        waits.append(seconds)
        clock[0] += seconds
    monkeypatch.setattr('app.integration_providers.time.sleep', sleep)
    def handle(request):
        if request.method == 'GET':
            return httpx.Response(200, json={'data': [{'id': config().model}]})
        return httpx.Response(200, json=groq_response(), headers={
            'x-ratelimit-remaining-tokens': '100', 'x-ratelimit-reset-tokens': '2s'})
    provider = make_integration_provider(config(), transport=httpx.MockTransport(handle))
    provider.complete(MESSAGES, 50, 0)
    assert not waits
    provider.complete(MESSAGES, 200, 0)
    assert waits == pytest.approx([2.2])


def test_rate_limit_message_uses_only_safe_retry_header():
    transport = httpx.MockTransport(lambda request: httpx.Response(
        429, headers={'retry-after': '12.4'}, json={'error': {'message': 'provider-test-secret'}}))
    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(), transport=transport).complete(MESSAGES, 100, 0)
    assert '13 seconds' in str(error.value)
    assert 'provider-test-secret' not in str(error.value)


def test_groq_retries_rejected_rate_limit_once_using_safe_numeric_delay(monkeypatch):
    waits, posts = [], []
    monkeypatch.setattr('app.integration_providers.time.sleep', waits.append)
    def handle(request):
        if request.method == 'GET':
            return httpx.Response(200, json={'data': [{'id': config().model}]})
        posts.append(request)
        if len(posts) == 1:
            return httpx.Response(429, json={'error': {
                'message': 'Private organization data. Please try again in 2.5s. provider-test-secret'}})
        return httpx.Response(200, json=groq_response())
    result = make_integration_provider(config(), transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert len(posts) == 2 and waits == [2.7]
    assert result.request_settings['rate_limit_retry'] is True
    assert 'provider-test-secret' not in json.dumps(result.to_dict())


def test_registry_key_isolation_and_secrets_hidden():
    cfg = IntegrationConfig(groq_api_key="groq-secret", openrouter_api_key="router-secret",
                            groq_free_tier_confirmed=True)
    rows = optimizer_registry(cfg)
    assert rows["qwen"]["available"]
    assert not rows["gemini_flash"]["available"]
    assert get_optimizer_config(cfg, "qwen").api_key == "groq-secret"
    assert get_optimizer_config(cfg, "openrouter_free").api_key == "router-secret"
    assert get_optimizer_config(cfg, "gemini_flash").api_key == ""
    assert "groq-secret" not in repr(cfg)
    assert "router-secret" not in repr(rows)


def test_registry_disabled_and_free_confirmation():
    cfg = IntegrationConfig(groq_api_key="x", gemini_api_key="y", openrouter_api_key="z",
                            gemini_enabled=False, openrouter_enabled=False)
    assert all(not row["available"] for row in optimizer_registry(cfg).values())
    assert get_optimizer_config(cfg, "gemini_flash").api_key == ""
    assert not optimizer_registry(replace(cfg, openrouter_enabled=True,
                                         openrouter_model="paid/model"))["openrouter_free"]["available"]


def test_google_key_alias_and_configurable_models(monkeypatch):
    monkeypatch.setattr("app.integration_config.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_API_KEY", "google-secret")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-configured")
    monkeypatch.setenv("TOKENZ_GEMINI_FREE_TIER_CONFIRMED", "true")
    monkeypatch.setenv("TOKENZ_ENABLE_GEMINI", "true")
    cfg = load_integration_settings()
    assert cfg.gemini_api_key == "google-secret"
    assert cfg.gemini_model == "gemini-configured"
    assert cfg.gemini_free_tier_confirmed
    monkeypatch.setenv("GEMINI_API_KEY", "preferred-secret")
    assert load_integration_settings().gemini_api_key == "preferred-secret"


@pytest.mark.parametrize("cfg", [config(free_tier_confirmed=False),
                                     config("gemini", "gemini-3.8-flash", free_tier_confirmed=False),
                                     config(base_url="https://lookalike.test/v1"),
                                     config(input_price=0.01),
                                     config("openrouter", "paid/model"),
                                     config("openai", "gpt-5.5")])
def test_free_guard_precedes_every_network_call(cfg):
    seen = []
    transport = httpx.MockTransport(lambda request: seen.append(request))
    with pytest.raises(ProviderError) as error:
        make_integration_provider(cfg, transport=transport).complete(MESSAGES, 100, 0.1)
    assert error.value.code == "FREE_ONLY"
    assert not seen


def test_missing_key_graceful_before_network():
    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(api_key=""), transport=httpx.MockTransport(
            lambda _: pytest.fail("No request expected"))).complete(MESSAGES, 100, 0.1)
    assert error.value.code == "CONFIGURATION"


@pytest.mark.parametrize("model,effort", [("qwen/qwen3.8-27b", "none"),
                                          ("openai/gpt-oss-20b", "low"),
                                          ("openai/gpt-oss-120b", "low")])
def test_groq_official_catalog_and_payload(model, effort):
    seen = []

    def handle(request):
        seen.append(request)
        assert request.url.host == "api.groq.com"
        assert request.headers["authorization"] == "Bearer provider-test-secret"
        if request.method == "GET":
            return httpx.Response(200, json={"data": [{"id": model}]})
        payload = json.loads(request.content)
        assert payload["reasoning_effort"] == effort
        assert payload["max_completion_tokens"] == 100
        return httpx.Response(200, json=groq_response(model=model))

    result = make_integration_provider(config(model=model), transport=httpx.MockTransport(handle)).complete(
        MESSAGES, 100, 0.1)
    assert (result.text, result.input_tokens, result.output_tokens) == ("Short prompt", 12, 3)
    assert result.finish_reason == "stop"
    assert result.model == model
    assert result.provider_cost_usd is None
    assert len(seen) == 2


def test_unknown_groq_model_never_posts_or_falls_back():
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"data": [{"id": "other-model"}]})

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(), transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == "INVALID_MODEL"
    assert len(seen) == 1 and seen[0].method == "GET"


@pytest.mark.parametrize("usage", [{"prompt_tokens": True}, {"completion_tokens": -1},
                                    {"prompt_tokens": "12"}, {"cost": float("nan")}, [1], [], False])
def test_groq_malformed_usage_rejected(usage):
    def handle(request):
        data = {"data": [{"id": "qwen/qwen3.8-27b"}]} if request.method == "GET" else groq_response(usage=usage)
        # NaN isn't valid JSON on the wire, and malformed JSON is rejected too.
        return httpx.Response(200, content=json.dumps(data))

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(), transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == "INVALID_RESPONSE"


def test_reported_charge_is_rejected():
    def handle(request):
        return httpx.Response(200, json={"data": [{"id": "qwen/qwen3.8-27b"}]}
                              if request.method == "GET" else groq_response(usage={"cost": 0.1}))

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(), transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == "FREE_ONLY"


def test_openrouter_paid_catalog_never_posts():
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"data": [{"id": "provider/model:free",
                                                   "pricing": {"prompt": "0.01", "completion": "0"}}]})

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config("openrouter", "provider/model:free"),
                                  transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == "FREE_MODEL_UNAVAILABLE"
    assert len(requests) == 1 and requests[0].method == "GET"


def test_openrouter_reported_charge_rejected_after_zero_price_catalog():
    def handle(request):
        return httpx.Response(200, json={"data": [{"id": "provider/model:free",
                                                   "pricing": {"prompt": "0", "completion": "0"}}]}
                              if request.method == "GET" else groq_response(usage={"cost": 0.1}))

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config("openrouter", "provider/model:free"),
                                  transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == "FREE_ONLY"


def test_error_does_not_echo_secret_or_retry():
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(401, json={"error": "provider-test-secret Test prompt"})

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config(), transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert "provider-test-secret" not in str(error.value)
    assert "Test prompt" not in str(error.value)
    assert "OpenRouter" not in str(error.value)
    assert len(calls) == 1


def gemini_response(finish="STOP", **changes):
    return {"responseId": "gemini-response", "modelVersion": "gemini-3.8-flash",
            "candidates": [{"finishReason": finish,
                            "content": {"parts": [{"text": "private thought", "thought": True},
                                                   {"text": "Short prompt"}]}}],
            "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 3,
                              "thoughtsTokenCount": 2}, **changes}


def test_gemini_native_payload_and_usage():
    seen = []

    def handle(request):
        seen.append(request)
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.headers["x-goog-api-key"] == "provider-test-secret"
        assert "key=" not in str(request.url)
        if request.method == "GET":
            return httpx.Response(200, json={"name": "models/gemini-3.8-flash",
                                            "supportedGenerationMethods": ["generateContent"]})
        payload = json.loads(request.content)
        assert payload["systemInstruction"]["parts"][0]["text"] == "Rewrite only"
        assert payload["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}
        assert "tools" not in payload
        return httpx.Response(200, json=gemini_response())

    result = make_integration_provider(config("gemini", "gemini-3.8-flash"),
                                      transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0.1)
    assert result.text == "Short prompt"
    assert result.input_tokens == 12 and result.output_tokens == 5
    assert result.finish_reason == "stop"
    assert len(seen) == 2


@pytest.mark.parametrize("data,code", [(gemini_response("SAFETY"), "CONTENT_BLOCKED"),
                                       ({"promptFeedback": {"blockReason": "SAFETY"}}, "CONTENT_BLOCKED"),
                                       (gemini_response(usageMetadata={"promptTokenCount": False}),
                                        "INVALID_RESPONSE"),
                                       (gemini_response(usageMetadata={"cost": 1}), "FREE_ONLY")])
def test_gemini_rejects_safety_and_malformed_results(data, code):
    def handle(request):
        return httpx.Response(200, json={"name": "models/gemini-3.8-flash",
                                        "supportedGenerationMethods": ["generateContent"]}
                              if request.method == "GET" else data)

    with pytest.raises(ProviderError) as error:
        make_integration_provider(config("gemini", "gemini-3.8-flash"),
                                  transport=httpx.MockTransport(handle)).complete(MESSAGES, 100, 0)
    assert error.value.code == code


def test_openai_responses_normalizes_synthetic_only():
    result = OpenAIResponsesProvider.parse_response({"id": "r1", "model": "synthetic",
        "status": "completed", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": "An answer"}]}],
        "usage": {"input_tokens": 20, "output_tokens": 5}})
    assert result.text == "An answer" and result.finish_reason == "stop"
    assert result.input_tokens == 20
