"""Provider choices for the integration pilot, with a mandatory free-only policy.

Groq/Gemini confirmation is a user's attestation that billing is disabled on
their provider account. It is not a server-verified pricing guarantee.
"""
import math
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

from app.config import ROOT, ProviderConfig
from app.live_setup import is_free_model


@dataclass(frozen=True)
class IntegrationConfig:
    groq_api_key: str = field(default="", repr=False)
    gemini_api_key: str = field(default="", repr=False)
    openrouter_api_key: str = field(default="", repr=False)
    openai_api_key: str = field(default="", repr=False)
    groq_free_tier_confirmed: bool = False
    gemini_free_tier_confirmed: bool = False
    gemini_enabled: bool = True
    openrouter_enabled: bool = True
    qwen_model: str = "qwen/qwen3.8-27b"
    gpt_oss_20b_model: str = "openai/gpt-oss-20b"
    gpt_oss_120b_model: str = "openai/gpt-oss-120b"
    gemini_model: str = "gemini-3.8-flash"
    openrouter_model: str = "openrouter/free"
    openai_target_model: str = "gpt-5.5"
    default_optimizer: str = "qwen"
    minimum_prompt_tokens: int = 100
    temperature: float = 0.1
    timeout: float = 60

    def __post_init__(self):
        if self.default_optimizer not in {"qwen", "gpt_oss_20b", "gpt_oss_120b",
                                          "gemini_flash", "openrouter_free"}:
            raise ValueError("Unknown default optimizer")
        if type(self.minimum_prompt_tokens) is not int or self.minimum_prompt_tokens < 0:
            raise ValueError("Minimum prompt tokens must be a nonnegative integer")
        if not math.isfinite(self.temperature) or not 0 <= self.temperature <= 2:
            raise ValueError("Temperature must be between 0 and 2")
        if not math.isfinite(self.timeout) or self.timeout <= 0:
            raise ValueError("Request timeout must be positive")


def _flag(name, default):
    value = os.getenv(name, str(default)).strip().lower()
    if value not in {"true", "false"}:
        raise ValueError(f"{name} must be true or false")
    return value == "true"


def _key(name):
    value = os.getenv(name, "").strip()
    if not value or value.lower().startswith(("your_", "replace_")):
        return ""
    return value


def load_integration_settings():
    load_dotenv(ROOT / ".env", override=False, interpolate=False)
    return IntegrationConfig(
        groq_api_key=_key("GROQ_API_KEY"),
        gemini_api_key=_key("GEMINI_API_KEY") or _key("GOOGLE_API_KEY"),
        openrouter_api_key=_key("OPENROUTER_API_KEY"), openai_api_key=_key("OPENAI_API_KEY"),
        groq_free_tier_confirmed=_flag("TOKENZ_GROQ_FREE_TIER_CONFIRMED", False),
        gemini_free_tier_confirmed=_flag("TOKENZ_GEMINI_FREE_TIER_CONFIRMED", False),
        gemini_enabled=_flag("TOKENZ_ENABLE_GEMINI", True),
        openrouter_enabled=_flag("TOKENZ_ENABLE_OPENROUTER", True),
        qwen_model=os.getenv("GROQ_QWEN_MODEL", "qwen/qwen3.8-27b").strip(),
        gpt_oss_20b_model=os.getenv("GROQ_GPT_OSS_20B_MODEL", "openai/gpt-oss-20b").strip(),
        gpt_oss_120b_model=os.getenv("GROQ_GPT_OSS_120B_MODEL", "openai/gpt-oss-120b").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip(),
        openrouter_model=os.getenv("OPENROUTER_MODEL", "openrouter/free").strip(),
        openai_target_model=os.getenv("OPENAI_TARGET_MODEL", "gpt-5.5").strip(),
        default_optimizer=os.getenv("TOKENZ_DEFAULT_OPTIMIZER", "qwen").strip(),
        minimum_prompt_tokens=int(os.getenv("TOKENZ_MIN_PROMPT_TOKENS", "100")),
        temperature=float(os.getenv("TOKENZ_TEMPERATURE", "0.1")),
        timeout=float(os.getenv("TOKENZ_REQUEST_TIMEOUT_SECONDS", "60")))


def optimizer_registry(config):
    """Configuration readiness only. Live catalogs are checked before dispatch."""
    choices = [
        ("qwen", "groq", config.qwen_model, "Qwen 3.8 27B", config.groq_api_key,
         True, config.groq_free_tier_confirmed),
        ("gpt_oss_20b", "groq", config.gpt_oss_20b_model, "GPT-OSS 20B", config.groq_api_key,
         True, config.groq_free_tier_confirmed),
        ("gpt_oss_120b", "groq", config.gpt_oss_120b_model, "GPT-OSS 120B", config.groq_api_key,
         True, config.groq_free_tier_confirmed),
        ("gemini_flash", "gemini", config.gemini_model, "Gemini Flash", config.gemini_api_key,
         config.gemini_enabled, config.gemini_free_tier_confirmed),
        ("openrouter_free", "openrouter", config.openrouter_model, "OpenRouter free route",
         config.openrouter_api_key, config.openrouter_enabled, True),
    ]
    registry = {}
    for key, provider, model, label, secret, enabled, confirmed in choices:
        reason = ("Provider disabled" if not enabled else
                  "API key missing" if not secret else
                  "Model ID missing" if not model else
                  "Confirm a free-tier account with billing disabled" if not confirmed else
                  "Only free OpenRouter model IDs are permitted"
                  if provider == "openrouter" and not is_free_model(model) else "")
        registry[key] = {"provider": provider, "model": model, "label": label, "key_configured": bool(secret),
                         "available": not reason, "reason": reason, "free_tier_confirmed": confirmed}
    return registry


def get_optimizer_config(config, optimizer_key):
    row = optimizer_registry(config).get(optimizer_key)
    if row is None:
        raise ValueError("Unknown optimizer selection")
    provider = row["provider"]
    secrets = {"groq": config.groq_api_key, "gemini": config.gemini_api_key,
               "openrouter": config.openrouter_api_key}
    endpoints = {"groq": "https://api.groq.com/openai/v1",
                 "gemini": "https://generativelanguage.googleapis.com/v1beta",
                 "openrouter": "https://openrouter.ai/api/v1"}
    # Disabled providers cannot be dispatched even if a caller bypasses the registry UI.
    secret = secrets[provider] if row["available"] else ""
    return ProviderConfig(provider, row["model"], endpoints[provider], secret, 0, 0,
                          reasoning_effort=("low" if optimizer_key.startswith("gpt_oss") else
                                            "none" if provider == "groq" else None),
                          free_tier_confirmed=row["free_tier_confirmed"])
