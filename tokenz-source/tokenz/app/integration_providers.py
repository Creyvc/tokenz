"""Official provider transports with no paid fallback and no automatic retries."""
import math
import re
import time
from urllib.parse import quote

import httpx

from app.config import ProviderConfig
from app.live_setup import is_free_model
from app.providers import ChatProvider, Completion, ProviderError

ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "openrouter": "https://openrouter.ai/api/v1",
}


def _guard(config):
    if config.name == "openai":
        raise ProviderError("FREE_ONLY", "OpenAI API calls are disabled by the free-only policy.")
    if config.name not in ENDPOINTS or config.base_url != ENDPOINTS[config.name]:
        raise ProviderError("FREE_ONLY", "Only official supported provider endpoints are permitted.")
    if config.input_price not in (None, 0) or config.output_price not in (None, 0):
        raise ProviderError("FREE_ONLY", "Nonzero configured prices are blocked.")
    if config.name in {"groq", "gemini"} and not config.free_tier_confirmed:
        raise ProviderError("FREE_ONLY", "Confirm this account uses the free tier with billing disabled.")
    if config.name == "openrouter" and not is_free_model(config.model):
        raise ProviderError("FREE_ONLY", "Only free OpenRouter model IDs are permitted.")
    if not config.api_key:
        raise ProviderError("CONFIGURATION", "This provider's API key is missing.")
    if not config.model or not re.fullmatch(r"[A-Za-z0-9_.:/-]+", config.model):
        raise ProviderError("CONFIGURATION", "A valid model ID is required.")
    if config.name == "gemini" and "/" in config.model:
        raise ProviderError("CONFIGURATION", "Use a Gemini model ID without a URL or models/ prefix.")


def _retry_seconds(response):
    header = response.headers.get('retry-after', '')
    if re.fullmatch(r'\d+(?:\.\d+)?', header):
        value = float(header)
        return value if math.isfinite(value) and 0 < value <= 86400 else None
    try:
        message = response.json().get('error', {}).get('message', '')
        match = re.search(r'try again in\s+((?:\d+(?:\.\d+)?(?:ms|s|m))+)', message, re.IGNORECASE)
        if match:
            value = sum(float(amount) * {'ms': .001, 's': 1, 'm': 60}[unit.lower()]
                        for amount, unit in re.findall(r'(\d+(?:\.\d+)?)(ms|s|m)', match[1], re.IGNORECASE))
            return value if math.isfinite(value) and 0 < value <= 86400 else None
    except (ValueError, TypeError, AttributeError):
        pass
    return None


def _response_json(response):
    if response.status_code != 200:
        code = {400: "INVALID_REQUEST", 401: "AUTHENTICATION", 403: "AUTHENTICATION",
                402: "QUOTA_EXHAUSTED", 404: "INVALID_MODEL", 429: "RATE_LIMIT"}.get(
                    response.status_code, "PROVIDER_UNAVAILABLE")
        descriptions = {
            "AUTHENTICATION": "Provider rejected this provider's API key or account access.",
            "QUOTA_EXHAUSTED": "Free access is unavailable. No paid fallback was attempted.",
            "INVALID_MODEL": "The configured model is unavailable. No fallback was attempted.",
            "RATE_LIMIT": "Free access is busy or exhausted. Saved work is retained; resume later.",
            "INVALID_REQUEST": "Provider rejected the request settings. No retry was sent.",
        }
        message = descriptions.get(code, f'Provider is temporarily unavailable (HTTP {response.status_code}). Resume later.')
        seconds = _retry_seconds(response) if code == 'RATE_LIMIT' else None
        if seconds:
            message = f'Free request limit reached. Wait about {math.ceil(seconds)} seconds before resuming.'
        raise ProviderError(code, message)
    try:
        data = response.json()
        if not isinstance(data, dict):
            raise TypeError
        return data
    except (ValueError, TypeError):
        raise ProviderError("INVALID_RESPONSE", "Provider returned malformed JSON.") from None


def _tokens(value):
    if value is not None and (type(value) is not int or value < 0):
        raise ValueError("Invalid token count")
    return value


def _usage(data, key):
    value = data.get(key)
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise TypeError("Invalid usage")
    return value


def _free_cost(data):
    """Reject explicit nonzero charges, without treating absent cost as measured zero."""
    containers = [data, _usage(data, "usage"), _usage(data, "usageMetadata")]
    found = None
    for source in containers:
        if not isinstance(source, dict):
            raise TypeError("Invalid usage")
        for key in ("cost", "cost_usd", "total_cost", "totalCost"):
            value = source.get(key)
            if value is None:
                continue
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError("Invalid cost")
            if value != 0:
                raise ProviderError("FREE_ONLY", "Provider reported a charge. Further calls must stop.")
            found = 0.0
    return found


class GroqProvider:
    def __init__(self, config, timeout=60, transport=None):
        self.config, self.timeout, self.transport = config, timeout, transport
        self.remaining_tokens = None
        self.reset_at = 0

    def complete(self, messages, max_tokens, temperature):
        cfg = self.config
        _guard(cfg)
        allowance = max_tokens + sum(len(message['content'].encode('utf-8')) // 3 + 32 for message in messages)
        wait = self.reset_at - time.monotonic()
        if self.remaining_tokens is not None and allowance > self.remaining_tokens and wait > 0:
            if wait > 60:
                raise ProviderError('RATE_LIMIT', f'Free token allowance needs about {math.ceil(wait)} seconds to recover. Resume later.')
            time.sleep(wait)
        payload = {"model": cfg.model, "messages": messages, "stream": False,
                   "max_completion_tokens": max_tokens}
        if temperature is not None:
            payload["temperature"] = temperature
        if cfg.model.startswith("qwen/"):
            payload["reasoning_effort"] = "none"
        elif cfg.model in {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}:
            payload["reasoning_effort"] = "low"
        start = time.perf_counter()
        rate_limit_retry = False
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                headers = {"Authorization": "Bearer " + cfg.api_key}
                catalog = _response_json(client.get(cfg.base_url + "/models", headers=headers))
                models = catalog.get("data")
                if not isinstance(models, list) or not any(
                        isinstance(row, dict) and row.get("id") == cfg.model for row in models):
                    raise ProviderError("INVALID_MODEL", "Configured Groq model is unavailable. No fallback was sent.")
                response = client.post(cfg.base_url + "/chat/completions", headers=headers, json=payload)
                # A 429 explicitly rejects the request. Honour a short provider
                # cooldown once; do not retry timeouts or ambiguous failures.
                cooldown = _retry_seconds(response) if response.status_code == 429 else None
                if cooldown and cooldown <= 30:
                    time.sleep(cooldown + .2)
                    rate_limit_retry = True
                    response = client.post(cfg.base_url + "/chat/completions", headers=headers, json=payload)
                remaining = response.headers.get('x-ratelimit-remaining-tokens', '')
                reset = response.headers.get('x-ratelimit-reset-tokens', '')
                if remaining.isdigit() and re.fullmatch(r'(?:\d+(?:\.\d+)?[hms])+', reset):
                    self.remaining_tokens = int(remaining)
                    seconds = sum(float(value) * {'h': 3600, 'm': 60, 's': 1}[unit]
                                  for value, unit in re.findall(r'(\d+(?:\.\d+)?)([hms])', reset))
                    self.reset_at = time.monotonic() + seconds + .2
        except httpx.TimeoutException:
            raise ProviderError("TIMEOUT", "Provider timed out. No automatic retry was sent.") from None
        except httpx.HTTPError:
            raise ProviderError("PROVIDER_UNAVAILABLE", "Could not connect to provider.") from None
        data = _response_json(response)
        try:
            choice = data["choices"][0]
            text = choice["message"]["content"]
            if not isinstance(text, str) or not text.strip():
                raise ValueError
            usage = _usage(data, "usage")
            inp, out = _tokens(usage.get("prompt_tokens")), _tokens(usage.get("completion_tokens"))
            cost = _free_cost(data)
            return Completion(text, inp, out, (time.perf_counter() - start) * 1000,
                              response.headers.get("x-request-id") or data.get("id"),
                              data.get("model", cfg.model), choice.get("finish_reason"),
                              "provider" if inp is not None and out is not None else "missing",
                              provider_cost_usd=cost,
                              request_settings={**{k: v for k, v in payload.items() if k != "messages"},
                                                'rate_limit_retry': rate_limit_retry})
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise ProviderError("INVALID_RESPONSE", "Provider returned an empty or malformed response.") from None


class GeminiProvider:
    def __init__(self, config, timeout=60, transport=None):
        self.config, self.timeout, self.transport = config, timeout, transport

    def complete(self, messages, max_tokens, temperature):
        cfg = self.config
        _guard(cfg)
        system = "\n\n".join(message["content"] for message in messages if message["role"] == "system")
        contents = [{"role": "model" if message["role"] == "assistant" else "user",
                     "parts": [{"text": message["content"]}]} for message in messages
                    if message["role"] != "system"]
        generation = {"maxOutputTokens": max_tokens}
        if temperature is not None:
            generation["temperature"] = temperature
        if cfg.model.startswith("gemini-3"):
            generation["thinkingConfig"] = {"thinkingLevel": "low"}
        elif cfg.model.startswith("gemini-2.5-flash"):
            generation["thinkingConfig"] = {"thinkingBudget": 0}
        payload = {"contents": contents, "generationConfig": generation}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        url = cfg.base_url + "/models/" + quote(cfg.model, safe="-._")
        start = time.perf_counter()
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                headers = {"x-goog-api-key": cfg.api_key}
                model = _response_json(client.get(url, headers=headers))
                if model.get("name") != "models/" + cfg.model or "generateContent" not in model.get(
                        "supportedGenerationMethods", []):
                    raise ProviderError("INVALID_MODEL", "Configured Gemini model cannot generate content.")
                response = client.post(url + ":generateContent", headers=headers, json=payload)
        except httpx.TimeoutException:
            raise ProviderError("TIMEOUT", "Provider timed out. No automatic retry was sent.") from None
        except httpx.HTTPError:
            raise ProviderError("PROVIDER_UNAVAILABLE", "Could not connect to provider.") from None
        data = _response_json(response)
        try:
            feedback = data.get("promptFeedback") or {}
            if feedback.get("blockReason"):
                raise ProviderError("CONTENT_BLOCKED", "Provider blocked this prompt. No answer was returned.")
            candidate = data["candidates"][0]
            finish = candidate.get("finishReason")
            if finish not in {"STOP", "MAX_TOKENS"}:
                raise ProviderError("CONTENT_BLOCKED", "Provider did not return a usable answer.")
            parts = candidate["content"]["parts"]
            text = "".join(part["text"] for part in parts if not part.get("thought") and "text" in part)
            if not text.strip():
                raise ValueError
            usage = _usage(data, "usageMetadata")
            inp = _tokens(usage.get("promptTokenCount"))
            visible, thoughts = _tokens(usage.get("candidatesTokenCount")), _tokens(usage.get("thoughtsTokenCount"))
            out = visible + (thoughts or 0) if visible is not None else None
            cost = _free_cost(data)
            return Completion(text, inp, out, (time.perf_counter() - start) * 1000,
                              data.get("responseId") or response.headers.get("x-request-id"),
                              data.get("modelVersion", cfg.model), "stop" if finish == "STOP" else "length",
                              "provider" if inp is not None and out is not None else "missing",
                              provider_cost_usd=cost, request_settings={"model": cfg.model, **generation})
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise ProviderError("INVALID_RESPONSE", "Provider returned an empty or malformed response.") from None


class FreeOpenRouterProvider:
    def __init__(self, config, timeout=60, transport=None):
        self.config = config
        self.inner = ChatProvider(config, timeout, transport)

    def complete(self, messages, max_tokens, temperature):
        _guard(self.config)
        result = self.inner.complete(messages, max_tokens, temperature)
        if result.provider_cost_usd not in (None, 0):
            raise ProviderError("FREE_ONLY", "Provider reported a charge. Further calls must stop.")
        return result


class OpenAIResponsesProvider:
    """Responses API adapter contract; dispatch remains disabled in this free-only build."""
    def __init__(self, config, timeout=60, transport=None):
        self.config, self.timeout, self.transport = config, timeout, transport

    def complete(self, messages, max_tokens, temperature):
        raise ProviderError("FREE_ONLY", "OpenAI Responses API is disabled. No paid API call was sent.")

    @staticmethod
    def parse_response(data, latency_ms=0):
        """Normalize an already-supplied synthetic Responses result, with no SDK/network."""
        if hasattr(data, "model_dump"):
            data = data.model_dump()
        try:
            text = "".join(part["text"] for item in data.get("output", [])
                           if item.get("type") == "message" for part in item.get("content", [])
                           if part.get("type") == "output_text")
            if not text.strip():
                raise ValueError
            usage = _usage(data, "usage")
            inp, out = _tokens(usage.get("input_tokens")), _tokens(usage.get("output_tokens"))
            status = data.get("status")
            finish = "stop" if status == "completed" else "length" if status == "incomplete" else status
            return Completion(text, inp, out, latency_ms, data.get("id"), data.get("model", ""), finish,
                              "provider" if inp is not None and out is not None else "missing")
        except (ValueError, KeyError, TypeError, AttributeError):
            raise ProviderError("INVALID_RESPONSE", "Responses result is empty or malformed.") from None


def make_integration_provider(provider_config: ProviderConfig, timeout=60, transport=None):
    cls = {"groq": GroqProvider, "gemini": GeminiProvider, "openrouter": FreeOpenRouterProvider,
           "openai": OpenAIResponsesProvider}.get(provider_config.name)
    if cls is None:
        raise ProviderError("CONFIGURATION", "Unknown integration provider.")
    return cls(provider_config, timeout, transport)
