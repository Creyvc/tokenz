"""Small, explainable grammar rules using spaCy dependency parsing."""
from functools import lru_cache
from time import perf_counter
import re
import spacy
from models import make_result
from validation import extract_protected_constraints, validate_candidate, contains_span, is_pleasantry

# Explicit phrase edits, not semantic summarization. Anchors avoid changing an
# explanation of what somebody else wants into a new instruction.
AGGRESSIVE_RULES = [
    (r"^What I (?:mainly )?need you to do is\s+", ""),
    (r"^I would (?:also )?like you to\s+", ""),
    (r"^(?:Please )?(?:also )?make sure that\s+", "Ensure "),
    (r"^(?:Please )?first give me\s+", "First provide "),
    (r"^It would (?:also )?be useful if you could\s+", ""),
    (r"^In addition to giving me the code, please\s+", "With the code, "),
    (r"^To summarize again,\s*", ""),
    (r"^I want to be able to see clearly what\s+", "Show what "),
    (r"\bfor every individual\s+", "for each "),
    (r"\bcan be used to\s+", "can "),
]

NLP_MODES = ("conservative", "balanced", "aggressive", "maximum")

# Maximum compacts known framing and rationale rather than selecting sentences
# by a token budget. Captured task clauses remain in the original order.
MAXIMUM_RULES = [
    (r"^I am currently working on (?:a|an) (.+?) for one of my [^.!?]+? classes, and I need some help\s+", r"For one \1, help with "),
    (r"^I am not (?:completely )?sure about [^.!?]+?, but I would like to\s+", "I am not sure; "),
    (r"\bbecause that is the programming language we are currently using in class,?\s*", ""),
    (r"\band I think (\w+) would probably be the most suitable library for doing the analysis", r"and use \1 as the analysis library"),
    (r"\bhas several different columns, including things such as\s+", "has columns including "),
    (r"^Another thing I would like is for (.+?) to be\s+", r"Keep \1 "),
    (r"^The main goal is to\s+", ""),
    (r"^I want the solution to include\s+", "Include "),
    (r"^I would prefer (.+?) to be relatively simple because I am still learning (.+?), so please avoid using\s+", r"Keep \1 simple for a learner of \2; avoid "),
    (r"\ba small example of what the output might look like\b", "a small output example"),
    (r"\bso that I can understand what\s+", "to show what "),
    (r"\bthe important steps required to\s+", "the steps to "),
    (r"\bunless they are actually required\b", "unless required"),
    (r"\bIn addition to giving me the code, please\s+", "With the code, "),
    (r"\bfor every individual\s+", "for each "),
    (r", and I want to be able to see clearly what\s+", "; show what "),
]


def stronger_sentence(sentence, raw, locked_spans, mode):
    """Attempt bounded edits; keep the sentence when a local safeguard fails."""
    # Quoted text, code and literal user locks are never phrase-rewritten.
    if re.search(r'["“”`=<>]', raw) or any(span and span in raw for span in locked_spans or []):
        return raw
    edited = raw
    rules = AGGRESSIVE_RULES[:2] if mode == "balanced" else AGGRESSIVE_RULES
    if mode == "maximum":
        # Framing rules must run before shorter prefixes can consume them.
        rules = MAXIMUM_RULES + AGGRESSIVE_RULES
    for pattern, replacement in rules:
        edited = re.sub(pattern, replacement, edited, flags=re.I)
    if edited != raw:
        edited = re.sub(r"^not\s+", "Do not ", edited, flags=re.I)
        # Only a sentence whose opening was edited gets a new capital letter; an untouched one
        # (for example a clause spaCy split off, starting "and …") keeps its own case
        if edited:
            edited = edited[0].upper() + edited[1:]
    requirements = extract_protected_constraints(raw)
    if mode != "maximum":
        requirements += [t.text for t in sentence if t.pos_ in ("NOUN", "PROPN")]
    return edited if edited and all(contains_span(edited, span) for span in requirements) else raw

@lru_cache(maxsize=1)
def get_nlp():
    return spacy.load("en_core_web_sm")

def compress_with_nlp(text, locked_spans=None, encoding="o200k_base", *, mode="conservative"):
    start = perf_counter()
    if mode not in NLP_MODES:
        raise ValueError("Unknown NLP intensity level.")
    protected = extract_protected_constraints(text, locked_spans)
    if not text.strip():
        return make_result("nlp", text, text, start, encoding, ["Enter a non-empty prompt."])
    try:
        doc = get_nlp()(text)
    except OSError:
        return make_result("nlp", text, text, start, encoding,
                           ["Install the spaCy model: python -m spacy download en_core_web_sm"], "error")
    # Greetings and small talk ("Hi!", "I hope you are doing well today.") are dropped below,
    # so their words ("today") aren't treated as requirements
    pleasantries = {sent.start for sent in doc.sents if is_pleasantry(sent.text)}
    protected = list(dict.fromkeys(protected + [e.text for e in doc.ents if e.sent.start not in pleasantries]))
    # Detect noun phrases as candidate technical concepts; show them for human review.
    # Protect content nouns individually so polite opening removal remains possible.
    if mode != "maximum":
        protected += [t.text for t in doc if t.pos_ in ("NOUN", "PROPN") and t.sent.start not in pleasantries]
    # Each kept sentence keeps the spacing around it (line and paragraph breaks, list layout),
    # so the suggestion has the original's shape and no tokens are "saved" by flattening it
    pieces, seen, seen_edited = [], set(), set()

    def drop(spacing):
        # A removed sentence that ended a line or paragraph passes that break on
        if "\n" in spacing and pieces and "\n" not in pieces[-1][len(pieces[-1].rstrip()):]:
            pieces[-1] = pieces[-1].rstrip() + spacing

    for sentence in doc.sents:
        chunk = sentence.text_with_ws
        raw = chunk.strip()
        if not raw:
            pieces.append(chunk)
            continue
        lead = chunk[:len(chunk) - len(chunk.lstrip())]
        trail = chunk[len(chunk.rstrip()):]
        # Exact duplicates and pure pleasantries only. The shared validator still checks constraints.
        if raw in seen or sentence.start in pleasantries:
            drop(trail)
            continue
        seen.add(raw)
        root = sentence.root
        if mode != "conservative":
            raw = stronger_sentence(sentence, raw, locked_spans, mode)
        # Only remove a polite opening when the parsed sentence root is a verb.
        if root.pos_ == "VERB":
            # A greeting in front ("Hey, could you please …") goes with the polite opening
            raw = re.sub(r"^(?:(?:hey|hi|hello)(?: there)?,?\s+)?(?:(?:Could|Would|Can) you (?:please )?|Please )",
                         "", raw, flags=re.I)
            if raw != sentence.text.strip() and raw:
                raw = raw[0].upper() + raw[1:]
                if raw.endswith("?"): raw = raw[:-1] + "."
        if mode != "conservative":
            # Deduplicate only sentences made identical by the explicit edits.
            if raw in seen_edited:
                drop(trail)
                continue
            seen_edited.add(raw)
        pieces.append(lead + raw + trail)
    body = "".join(pieces).strip()
    candidate = text[:len(text) - len(text.lstrip())] + body + text[len(text.rstrip()):]
    validation = validate_candidate(text, candidate, protected, encoding, locked_spans)
    notes = validation.warnings + validation.failures
    if mode != "conservative":
        notes.append(f"{mode.title()} NLP uses additional phrase edits and normalized exact duplicates. Review every task and constraint; it is not semantic summarization.")
    if mode == "maximum":
        from token_utils import count_tokens
        before = count_tokens(text, encoding)
        after = count_tokens(candidate if validation.passed else text, encoding)
        reached = before > 0 and (before - after) / before >= .2
        notes.append("20% reduction target reached." if reached else
                     "20% reduction target not reached. No extra text was deleted just to meet the target.")
        notes.append("Maximum can remove framing nouns and personal rationale. Unlike lower levels it does not require every source noun to survive. Review the full diff for lost meaning.")
    return make_result("nlp", text, candidate if validation.passed else text, start, encoding,
                       notes, protected=protected)
