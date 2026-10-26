"""Local credential setup and checks. Never return or log secret values."""
import math
import os
import tempfile
from urllib.parse import urlsplit

from dotenv import dotenv_values

from app.config import ROOT

PILOT_DEFAULTS = {
    "OPENAI_MODEL": "gpt-5.6-terra",
    "OPENAI_INPUT_PRICE_PER_MILLION": "2",
    "OPENAI_OUTPUT_PRICE_PER_MILLION": "12",
    "OPENAI_REASONING_EFFORT": "none",
    "QWEN_MODEL": "qwen3.7-flash",
    "QWEN_INPUT_PRICE_PER_MILLION": "0.03",
    "QWEN_OUTPUT_PRICE_PER_MILLION": "0.13",
    "QWEN_ENABLE_THINKING": "false",
    "TOKENZ_MAX_EXPERIMENT_COST_USD": "1",
    "TOKENZ_DATABASE": "results/live-experiments.sqlite3",
}


def readiness(settings, optimizer=None):
    issues = []
    for name in (settings.target, optimizer or settings.optimizer):
        cfg = settings.providers[name]
        prefix = "OPENROUTER" if cfg.name == "openrouter" else name.upper()
        for suffix, value in (("API_KEY", cfg.api_key), ("MODEL", cfg.model), ("BASE_URL", cfg.base_url)):
            if not value or "{" in value or "YOUR_" in value.upper():
                issues.append(f"Set {prefix}_{suffix}")
        parsed = urlsplit(cfg.base_url)
        if cfg.base_url and (parsed.scheme != "https" or not parsed.hostname or parsed.username
                             or parsed.password or parsed.query or parsed.fragment):
            issues.append(f"Use a valid HTTPS {prefix}_BASE_URL without embedded credentials")
        if cfg.input_price is None or cfg.output_price is None:
            issues.append(f"Set {prefix} input and output prices")
        if settings.free_only and not is_free_provider(cfg):
            issues.append("Free-only mode blocks paid providers and non-free model IDs")
    if settings.target == "openrouter_target" and settings.providers[settings.target].model == "openrouter/free":
        issues.append("Choose a fixed :free target model so both answers use the same model")
    issues = list(dict.fromkeys(issues))
    return {"configured": not issues, "mode": "demo" if settings.demo else "live", "issues": issues,
            "free_only": settings.free_only, "account_access": "Not tested; a real request is required",
            "budget_usd": 0 if settings.free_only else settings.budget}


def is_free_model(model):
    return model == "openrouter/free" or (model.endswith(":free") and "/" in model
                                           and not any(c.isspace() for c in model))


def is_free_provider(config):
    """Free router prices are checked at dispatch; native tiers require explicit attestation.

    Attestation means the user confirmed the account has no billing enabled. It is
    not an API verification of the account's plan. Never infer it from key presence.
    """
    if config.name == 'openrouter':
        return config.base_url == 'https://openrouter.ai/api/v1' and is_free_model(config.model)
    endpoints = {'groq': 'https://api.groq.com/openai/v1',
                 'gemini': 'https://generativelanguage.googleapis.com/v1beta'}
    return (config.name in endpoints and config.base_url == endpoints[config.name]
            and config.free_tier_confirmed is True
            and config.input_price == 0 and config.output_price == 0)


def free_environment(key, optimizer, target):
    if not key.strip():
        raise ValueError("Enter your OpenRouter API key")
    if not is_free_model(optimizer) or not is_free_model(target) or target == "openrouter/free":
        raise ValueError("Use free model IDs; the target must be a fixed model ending in :free")
    return {"OPENROUTER_API_KEY": key.strip(), "OPENROUTER_OPTIMIZER_MODEL": optimizer,
            "OPENROUTER_TARGET_MODEL": target, "TOKENZ_FREE_ONLY": "true",
            "TOKENZ_OPTIMIZER_PROVIDER": "openrouter_optimizer", "TOKENZ_TARGET_PROVIDER": "openrouter_target",
            "TOKENZ_DATABASE": "results/free-experiments.sqlite3", "TOKENZ_DEMO": "false",
            "TOKENZ_BATCH_DELAY_SECONDS": "10", "TOKENZ_OPTIMIZER_TEMPERATURE": "",
            "TOKENZ_TARGET_TEMPERATURE": ""}


def save_environment(updates, path=None):
    """Atomic local .env write; preserves unrelated settings and never prints values."""
    path = path or ROOT / ".env"
    for key, value in updates.items():
        if not isinstance(value, str) or any(c in value for c in ("\n", "\r", "\x00")):
            raise ValueError(f"Invalid value for {key}")
        if not key.replace("_", "").isalnum():
            raise ValueError("Invalid setting name")
    current = dict(dotenv_values(path if path.exists() else ROOT / ".env.example", interpolate=False))
    current.update(updates)
    # Single quotes keep keys and dollar signs literal; escape backslashes and quotes.
    content = "# Local Tokenz settings. Contains secrets; never share or commit.\n"
    for key, value in current.items():
        escaped = (value or "").replace("\\", "\\\\").replace("'", "\\'")
        content += f"{key}='{escaped}'\n"
    fd, temp_path = tempfile.mkstemp(prefix=".env-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def validate_live_form(values):
    for name in ("OPENAI_API_KEY", "QWEN_API_KEY", "QWEN_BASE_URL", "OPENAI_MODEL", "QWEN_MODEL"):
        if not values.get(name, "").strip():
            raise ValueError(f"Enter {name}")
    parsed = urlsplit(values["QWEN_BASE_URL"])
    if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".aliyuncs.com")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or not parsed.path.rstrip("/").endswith("/compatible-mode/v1") or "{" in parsed.netloc):
        raise ValueError("Copy your actual Alibaba workspace HTTPS URL ending in /compatible-mode/v1.")
    for name in ("OPENAI_INPUT_PRICE_PER_MILLION", "OPENAI_OUTPUT_PRICE_PER_MILLION",
                 "QWEN_INPUT_PRICE_PER_MILLION", "QWEN_OUTPUT_PRICE_PER_MILLION", "TOKENZ_MAX_EXPERIMENT_COST_USD"):
        try:
            value = float(values[name])
        except (ValueError, KeyError):
            raise ValueError(f"Enter a valid number for {name}") from None
        if not math.isfinite(value) or value < 0 or (name == "TOKENZ_MAX_EXPERIMENT_COST_USD" and value == 0):
            raise ValueError(f"Invalid amount for {name}")
