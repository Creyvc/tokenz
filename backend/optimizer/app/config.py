import math
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def number(name, default=None):
    raw = os.getenv(name, "").strip()
    value = float(raw) if raw else default
    if value is not None and not math.isfinite(value):
        raise ValueError(f"{name} must be finite")
    return value


def flag(name, default):
    raw = os.getenv(name, str(default)).lower()
    if raw not in {"true", "false"}:
        raise ValueError(f"{name} must be true or false")
    return raw == "true"


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    model: str = ""
    base_url: str = ""
    api_key: str = field(default="", repr=False)
    input_price: float | None = None
    output_price: float | None = None
    enable_thinking: bool | None = None
    reasoning_effort: str | None = None
    free_tier_confirmed: bool = False

    def __post_init__(self):
        for value in (self.input_price, self.output_price):
            if value is not None and (not math.isfinite(value) or value < 0):
                raise ValueError("Prices must be finite and nonnegative")

    def public(self):
        return {"provider": self.name, "model": self.model, "base_url": self.base_url,
                "input_price_per_million": self.input_price,
                "output_price_per_million": self.output_price,
                "enable_thinking": self.enable_thinking, "reasoning_effort": self.reasoning_effort,
                "free_tier_confirmed": self.free_tier_confirmed}


@dataclass(frozen=True)
class Settings:
    demo: bool = True
    free_only: bool = False
    target: str = "openai"
    optimizer: str = "qwen"
    strategy: str = "structured"
    skip_below: int = 100
    min_quality: float = .95
    target_ratio: float = .75
    max_output: int = 2048
    optimizer_max_output: int = 4096
    target_temperature: float | None = None
    optimizer_temperature: float | None = 0
    timeout: float = 60
    delay: float = 1
    budget: float = 5
    store: bool = True
    database: Path = ROOT / "results/experiments.sqlite3"
    encoding: str = "o200k_base"
    providers: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.optimizer not in {"qwen", "deepseek", "openrouter_optimizer", "gpt_oss_20b", "gpt_oss_120b", "gemini_flash", "openrouter_free"}:
            raise ValueError("Unknown optimizer provider")
        if self.target not in {"openai", "openrouter_target"}:
            raise ValueError("Unknown target provider")
        if self.strategy not in {"simple", "structured", "delete_only", "aggressive"}:
            raise ValueError("Unknown optimization strategy")
        if self.skip_below < 0 or not 0 < self.min_quality <= 1 or not 0 < self.target_ratio <= 1:
            raise ValueError("Invalid threshold or ratio")
        if min(self.max_output, self.optimizer_max_output, self.timeout, self.budget) <= 0 or self.delay < 0:
            raise ValueError("Limits must be positive; delay may be zero")


def load_settings():
    load_dotenv(ROOT / ".env", override=False, interpolate=False)
    providers = {}
    for name, url, model in (("openai", "https://api.openai.com/v1", ""),
                             ("qwen", "", ""), ("deepseek", "https://api.deepseek.com", "deepseek-flash")):
        prefix = name.upper()
        providers[name] = ProviderConfig(name, os.getenv(prefix + "_MODEL", model),
                                        os.getenv(prefix + "_BASE_URL", url),
                                        os.getenv(prefix + "_API_KEY", ""),
                                        number(prefix + "_INPUT_PRICE_PER_MILLION"),
                                        number(prefix + "_OUTPUT_PRICE_PER_MILLION"),
                                        flag(prefix + "_ENABLE_THINKING", False)
                                        if os.getenv(prefix + "_ENABLE_THINKING", "").strip() else None,
                                        os.getenv(prefix + "_REASONING_EFFORT", "").strip() or None)
    for role, default in (("optimizer", "cohere/north-mini-code:free"),
                          ("target", "nvidia/nemotron-3.5-lightning:free")):
        providers["openrouter_" + role] = ProviderConfig(
            "openrouter", os.getenv("OPENROUTER_" + role.upper() + "_MODEL", default),
            "https://openrouter.ai/api/v1", os.getenv("OPENROUTER_API_KEY", ""), 0, 0)
    return Settings(
        demo=flag("TOKENZ_DEMO", True), free_only=flag("TOKENZ_FREE_ONLY", False),
        target=os.getenv("TOKENZ_TARGET_PROVIDER", "openai"),
        optimizer=os.getenv("TOKENZ_OPTIMIZER_PROVIDER", "qwen"),
        strategy=os.getenv("TOKENZ_DEFAULT_STRATEGY", "structured"),
        skip_below=int(number("TOKENZ_SKIP_OPTIMIZATION_BELOW", 100)),
        min_quality=number("TOKENZ_MIN_QUALITY_RETENTION", .95),
        target_ratio=number("TOKENZ_TARGET_RATIO", .75),
        max_output=int(number("TOKENZ_MAX_OUTPUT_TOKENS", 2048)),
        optimizer_max_output=int(number("TOKENZ_OPTIMIZER_MAX_OUTPUT_TOKENS", 4096)),
        target_temperature=number("TOKENZ_TARGET_TEMPERATURE"),
        optimizer_temperature=number("TOKENZ_OPTIMIZER_TEMPERATURE", 0),
        timeout=number("TOKENZ_TIMEOUT_SECONDS", 60), delay=number("TOKENZ_BATCH_DELAY_SECONDS", 1),
        budget=number("TOKENZ_MAX_EXPERIMENT_COST_USD", 5),
        store=flag("TOKENZ_STORE_DATA", True),
        database=ROOT / os.getenv("TOKENZ_DATABASE", "results/experiments.sqlite3"),
        encoding=os.getenv("TOKENZ_TOKENIZER_ENCODING", "o200k_base"), providers=providers)
