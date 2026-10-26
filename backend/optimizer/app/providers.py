import json
import math
import time
from dataclasses import asdict, dataclass
from typing import Protocol
from urllib.parse import urlsplit

import httpx

from app.config import ProviderConfig


class ProviderError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


@dataclass
class Completion:
    text: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: float
    request_id: str | None = None
    model: str = ""
    finish_reason: str | None = None
    usage_source: str = "provider"
    cost_usd: float | None = None
    provider_cost_usd: float | None = None
    reused: bool = False
    request_settings: dict | None = None

    def to_dict(self):
        return asdict(self)


class Provider(Protocol):
    def complete(self, messages: list, max_tokens: int, temperature: float | None) -> Completion: ...


class ChatProvider:
    """OpenAI-compatible transport; no automatic paid retries."""
    def __init__(self, config: ProviderConfig, timeout=60, transport=None):
        self.config = config
        self.timeout = timeout
        self.transport = transport

    def complete(self, messages, max_tokens, temperature):
        cfg = self.config
        if not all((cfg.api_key, cfg.model, cfg.base_url)):
            raise ProviderError("CONFIGURATION", f"Set {cfg.name.upper()} key, model and base URL in .env.")
        parsed = urlsplit(cfg.base_url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ProviderError("CONFIGURATION", "Provider base URL must be HTTPS without embedded credentials.")
        payload = {"model": cfg.model, "messages": messages, "stream": False}
        payload["max_completion_tokens" if cfg.name == "openai" else "max_tokens"] = max_tokens
        if temperature is not None:
            payload["temperature"] = temperature
        if cfg.enable_thinking is not None:
            payload["enable_thinking"] = cfg.enable_thinking
        if cfg.reasoning_effort is not None:
            payload["reasoning_effort"] = cfg.reasoning_effort
        if cfg.name == "openrouter":
            from app.live_setup import is_free_model
            if cfg.base_url != "https://openrouter.ai/api/v1" or not is_free_model(cfg.model):
                raise ProviderError("FREE_ONLY", "OpenRouter requests require the official endpoint and a free model ID.")
            payload["provider"] = {"max_price": {"prompt": 0, "completion": 0, "request": 0}, "allow_fallbacks": True}
        start = time.perf_counter()
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                if cfg.name == "openrouter":
                    catalog = client.get("https://openrouter.ai/api/v1/models")
                    try:
                        model = next(m for m in catalog.json()["data"] if m["id"] == cfg.model)
                        pricing = model["pricing"]
                        if catalog.status_code != 200 or any(float(pricing[k]) != 0 for k in ("prompt", "completion")):
                            raise ValueError
                        if any(float(v) != 0 for v in pricing.values()):
                            raise ValueError
                        reasoning = model.get('reasoning') or {}
                        if reasoning and not reasoning.get('mandatory') and 'reasoning' in model.get('supported_parameters', []):
                            payload['reasoning'] = {'enabled': False}
                        if ('response_format' in model.get('supported_parameters', [])
                                and any('OUTPUT CONTRACT v2' in m['content'] for m in messages if m['role'] == 'system')):
                            payload['response_format'] = {'type':'json_object'}
                    except (ValueError, KeyError, StopIteration, TypeError):
                        raise ProviderError("FREE_MODEL_UNAVAILABLE", "Selected model is absent or not zero-priced in the current catalog. No completion was sent.") from None
                response = client.post(cfg.base_url.rstrip("/") + "/chat/completions",
                                       headers={"Authorization": "Bearer " + cfg.api_key}, json=payload)
        except httpx.TimeoutException:
            raise ProviderError("TIMEOUT", "Provider timed out; the request may still have been billed.") from None
        except httpx.HTTPError:
            raise ProviderError("PROVIDER_UNAVAILABLE", "Could not connect to provider.") from None
        if response.status_code != 200:
            code = {401: "AUTHENTICATION", 403: "AUTHENTICATION", 402: "QUOTA_EXHAUSTED",
                    429: "RATE_LIMIT", 404: "INVALID_MODEL", 400: "INVALID_REQUEST"}.get(
                        response.status_code, "PROVIDER_UNAVAILABLE")
            if cfg.name == 'openrouter' and code == 'AUTHENTICATION':
                from app.connection import check_connection
                if check_connection(cfg.api_key).get('ok'):
                    code = 'MODEL_ACCESS'
            # Never echo raw error bodies: providers may reflect keys or prompts.
            messages = {"AUTHENTICATION": "OpenRouter rejected the API key. Reconnect with a valid key.",
                        "RATE_LIMIT": "This free model is busy or your free allowance is exhausted. Resume later or choose another free model.",
                        "INVALID_MODEL": "This model is no longer available. Choose another free model.",
                        "MODEL_ACCESS": "This free model currently refuses access. Other free models can still be tested.",
                        "QUOTA_EXHAUSTED": "Free access is unavailable for this account. No paid fallback was attempted."}
            raise ProviderError(code, messages.get(code, f"{cfg.name} returned HTTP {response.status_code}. Try another model or retry later."))
        try:
            data = response.json()
            choice = data["choices"][0]
            text = choice["message"]["content"]
            if not isinstance(text, str) or not text.strip():
                raise ValueError
            usage = data.get("usage") or {}
            inp, out = usage.get("prompt_tokens"), usage.get("completion_tokens")
            if any(x is not None and (type(x) is not int or x < 0) for x in (inp, out)):
                raise ValueError
            reported_cost = usage.get("cost") if cfg.name == "openrouter" else None
            if reported_cost is not None and (type(reported_cost) not in (int, float)
                                               or not math.isfinite(reported_cost) or reported_cost < 0):
                raise ValueError
            return Completion(text, inp, out, (time.perf_counter() - start) * 1000,
                              response.headers.get("x-request-id") or data.get("id"),
                              data.get("model", cfg.model), choice.get("finish_reason"),
                              "provider" if inp is not None and out is not None else "missing",
                              provider_cost_usd=reported_cost,
                              request_settings={k: v for k, v in payload.items() if k != 'messages'})
        except (ValueError, KeyError, IndexError, TypeError):
            raise ProviderError("INVALID_RESPONSE", "Provider returned an empty or malformed response.") from None


class DemoProvider:
    """Deterministic test double, deliberately not a real language model."""
    def __init__(self, counter, optimizer=False):
        self.counter, self.optimizer = counter, optimizer

    def complete(self, messages, max_tokens, temperature):
        prompt = messages[-1]["content"]
        if self.optimizer:
            prompt = json.loads(prompt).get('prompt_to_compress', prompt)
        text = prompt
        if self.optimizer:
            for phrase in ("Hi ChatGPT, ", "I would like you to please ", "Please, ", "please ",
                           "Thank you very much.", "I am currently working on an assignment and "):
                text = text.replace(phrase, "")
            text = json.dumps({'optimized_prompt':text}, ensure_ascii=False)
        else:
            text = "DEMO ONLY — no model answer was generated.\n\nReceived prompt:\n" + prompt
        return Completion(text, sum(self.counter.count(m["content"]) for m in messages),
                          self.counter.count(text), 0, "demo", "demo-fixture", "stop", "demo", 0)
