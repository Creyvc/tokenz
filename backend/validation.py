"""Conservative heuristics, not a semantic-equivalence proof."""
import re
from dataclasses import dataclass
from token_utils import count_tokens

@dataclass
class Validation:
    passed: bool
    failures: list[str]
    warnings: list[str]

# An expression inside prose: operands joined by operators, e.g. "3x + 7 = 22" or "a <= b"
EXPRESSION = r"[\w.()\[\]]+(?:\s*(?:[-+*/^%]|[=!<>]=?|=>|->)\s*[\w.()\[\]]+)+"

def extract_protected_constraints(text: str, locked_spans=None) -> list[str]:
    patterns = [
        r"\b(?:not|never|without|only|unless|except|must|exactly|at least|at most|no more than|no)\b",
        r"\b\w+n['’]t\b", r"(?<!\w)[+-]?\d+(?:[.,]\d+)*(?:%|\b)",
        r'"[^"\n]+"', r"“[^”\n]+”", r"(?<!\w)'[^'\n]+'(?!\w)", r"`[^`]+`",
        r"\b(?:JSON|CSV|XML|HTML|Python|Java|SQL|TF-IDF|NLP|API)\b",
        r"\b(?:bullet points?|table|paragraphs?|examples?|beginner|undergraduate|English|Spanish|French)\b",
        r"\b[A-Z]{2,}(?:[-_][A-Za-z]+)*\b",
    ]
    spans = list(locked_spans or [])
    for pattern in patterns:
        spans.extend(m.group() for m in re.finditer(pattern, text, flags=0 if "[A-Z]" in pattern else re.I))
    # Preserve equation/code lines as exact spans. Scope is plain text; this is a safeguard.
    # A code fence or a short line (code, a formula) is kept whole. In a longer line of prose,
    # only its expressions and tags are, so a one-line prompt with "3x + 7 = 22" can still be edited.
    for line in text.splitlines():
        if "```" in line or (re.search(r"[=<>]", line) and len(line.split()) <= 8):
            spans.append(line.strip())
        elif re.search(r"[=<>]", line):
            spans.extend(m.group() for m in re.finditer(EXPRESSION, line))
            spans.extend(m.group() for m in re.finditer(r"<[^<>\n]{1,80}>", line))
    return list(dict.fromkeys(s for s in spans if s.strip()))

# A whole sentence that is only a greeting or small talk: safe to drop, it asks for nothing
PLEASANTRY = re.compile(
    r"(?:(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: there| everyone| all)?"
    r"|i hope (?:you are|you're|this finds you) (?:doing )?(?:well|good|great|fine)(?: today)?"
    r"|(?:many )?thanks?(?: you)?(?: (?:so|very) much)?(?: in advance)?(?: for (?:your|the) help)?)"
    r"\s*[.!,]*", re.I)


def is_pleasantry(sentence: str) -> bool:
    return PLEASANTRY.fullmatch(sentence.strip()) is not None


def contains_span(text: str, span: str) -> bool:
    if span[0].isalnum() and span[-1].isalnum():
        return re.search(r"(?<!\w)" + re.escape(span) + r"(?!\w)", text, re.I) is not None
    return span in text

def validate_candidate(original: str, candidate: str, protected=None,
                       encoding="o200k_base", exact_spans=None) -> Validation:
    failures, warnings = [], []
    if not isinstance(candidate, str) or not candidate.strip():
        return Validation(False, ["Missing or empty proposal."], [])
    if ("```" in candidate and "```" not in original) or re.match(
        r"\s*(?:here is|here's|sure[,!:]|compressed prompt:|rewritten prompt:|<think>)", candidate, re.I):
        failures.append("Extraneous prose, reasoning or markdown wrapping.")
    before, after = count_tokens(original, encoding), count_tokens(candidate, encoding)
    if after >= before:
        failures.append("Proposal does not reduce target prompt-text tokens.")
    for span in protected or extract_protected_constraints(original):
        if not contains_span(candidate, span):
            failures.append(f"Missing protected requirement: {span}")
    for span in exact_spans or []:
        if span and span not in candidate:
            failures.append(f"Exact locked phrase changed: {span}")
    if before and after/before < 0.5:
        warnings.append("Substantial deletion: more than half the text tokens were removed. Inspect the diff.")
    return Validation(not failures, failures, warnings)
