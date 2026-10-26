"""Environment configuration. Configuration reads never make network requests."""
import os
import math
from dataclasses import dataclass, field
from urllib.parse import urlparse
from dotenv import load_dotenv

@dataclass(frozen=True)
class QwenConfig:
    api_key: str = field(default="", repr=False)
    base_url: str = ""
    model: str = "qwen-flash"
    temperature: float | None = 0.2
    max_output_tokens: int = 256
    max_attempts: int = 2
    request_timeout: float = 20
    total_budget: float = 40
    max_input_tokens: int = 6000
    input_price: float | None = None
    output_price: float | None = None
    enable_thinking: bool | None = None

    def validate(self):
        url = urlparse(self.base_url)
        if not self.api_key or url.scheme != "https" or not url.hostname or any(
            x in self.base_url for x in ("<", ">", "{", "}", "workspace-id")):
            raise ValueError("Qwen not configured: set a local API key and actual HTTPS endpoint in .env.")
        if url.username or url.password or url.query or url.fragment:
            raise ValueError("Qwen endpoint must not contain credentials, query parameters or fragments.")
        if not self.model.strip() or not 1 <= self.max_attempts <= 2:
            raise ValueError("Set a model and QWEN_MAX_ATTEMPTS to 1 or 2.")
        for value in (self.max_output_tokens, self.request_timeout, self.total_budget, self.max_input_tokens):
            if not math.isfinite(value) or value <= 0:
                raise ValueError("Qwen token and time limits must be positive finite numbers.")
        for price in (self.input_price, self.output_price):
            if price is not None and (not math.isfinite(price) or price < 0):
                raise ValueError("Prices must be blank or finite nonnegative numbers.")
        if self.temperature is not None and (not math.isfinite(self.temperature) or not 0 <= self.temperature <= 2):
            raise ValueError("Temperature must be blank or between 0 and 2.")

def load_config() -> QwenConfig:
    load_dotenv()
    def optional(name):
        value = os.getenv(name, "").strip()
        return float(value) if value else None
    thinking = os.getenv("QWEN_ENABLE_THINKING", "").lower().strip()
    if thinking not in ("", "true", "false"):
        raise ValueError("QWEN_ENABLE_THINKING must be blank, true or false.")
    try:
        return QwenConfig(
            api_key=os.getenv("QWEN_API_KEY", ""), base_url=os.getenv("QWEN_BASE_URL", ""),
            model=os.getenv("QWEN_MODEL", "qwen-flash"),
            temperature=optional("QWEN_TEMPERATURE") if "QWEN_TEMPERATURE" in os.environ else 0.2,
            max_output_tokens=int(os.getenv("QWEN_MAX_OUTPUT_TOKENS", "256")),
            max_attempts=int(os.getenv("QWEN_MAX_ATTEMPTS", "2")),
            request_timeout=float(os.getenv("QWEN_REQUEST_TIMEOUT_SECONDS", "20")),
            total_budget=float(os.getenv("QWEN_TOTAL_BUDGET_SECONDS", "40")),
            max_input_tokens=int(os.getenv("QWEN_MAX_INPUT_TOKENS", "6000")),
            input_price=optional("QWEN_INPUT_USD_PER_1M"), output_price=optional("QWEN_OUTPUT_USD_PER_1M"),
            enable_thinking=None if not thinking else thinking == "true")
    except ValueError:
        raise ValueError("Invalid numeric Qwen configuration; check .env against .env.example.") from None
