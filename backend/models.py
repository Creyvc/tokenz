"""Stable JSON-serializable frontend contract."""
from dataclasses import dataclass, field, asdict
from typing import Literal
from time import perf_counter
from difflib import unified_diff
from token_utils import count_tokens

@dataclass
class CompressionResult:
    method: str
    original_text: str
    candidate_text: str
    status: Literal["unchanged", "review_required", "error"]
    original_target_tokens: int
    candidate_target_tokens: int
    tokens_saved: int
    reduction_percent: float
    elapsed_seconds: float
    warnings: list[str] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)
    protected_constraints: list[str] = field(default_factory=list)
    api_usage: dict | None = None
    agent_trace: list[dict] | None = None
    sentences: list[dict] = field(default_factory=list)
    selection_info: dict | None = None

    def to_dict(self) -> dict:
        return asdict(self)

def make_result(method, original, candidate, start, encoding="o200k_base",
                warnings=None, status=None, protected=None, **extra):
    before, after = count_tokens(original, encoding), count_tokens(candidate, encoding)
    if after >= before:
        candidate, after = original, before
    notes = list(warnings or [])
    if candidate != original:
        notes.append("Human review required: mechanical checks cannot prove equivalent meaning.")
    return CompressionResult(
        method, original, candidate,
        status or ("review_required" if after < before else "unchanged"),
        before, after, before-after, 100*(before-after)/before if before else 0,
        perf_counter()-start, notes,
        list(unified_diff(original.splitlines(), candidate.splitlines(),
                          fromfile="original", tofile="suggestion", lineterm="")),
        list(protected or []), **extra)
