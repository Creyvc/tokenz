"""Reviewable sentence selection with explicit task and budget diagnostics."""
from time import perf_counter
from functools import lru_cache
import re
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from token_utils import count_tokens
from models import make_result
from validation import extract_protected_constraints, validate_candidate, contains_span, is_pleasantry

# TF-IDF only measures word overlap with the task, so a request such as "Please focus on
# alliances" or "Avoid paid courses" can score zero and be dropped. Requested subtasks must survive
# (docs/DESIGN_INTERVIEW.md, Q4), so sentences that ask for something are kept like constraints.
REQUEST_VERBS = (r"add|analy[sz]e|answer|avoid|calculate|check|cite|compare|convert|create|define|describe|"
                 r"design|discuss|draft|draw|ensure|exclude|explain|find|fix|focus|format|generate|give|"
                 r"highlight|identify|implement|improve|include|keep|label|limit|list|make|mention|"
                 r"organi[sz]e|outline|plan|prepare|present|provide|recommend|remember|remove|reply|"
                 r"respond|return|rewrite|show|sort|state|structure|suggest|summari[sz]e|tell|translate|"
                 r"use|write")
REQUEST_START = re.compile(r"^(?:[-*•]|\d+[.)])?\s*(?:(?:and|also|then|now|finally|first|next|lastly),?\s+)*"
                           r"(?:please\s+|kindly\s+)?(?:do not|don't|never|always|be sure to|make sure|"
                           + REQUEST_VERBS + r")\b", re.I)
REQUEST_ANYWHERE = re.compile(r"\b(?:please|kindly|(?:could|can|would|will) you|i(?:'d| would) like (?:you )?to|"
                              r"i (?:want|need) (?:you )?to|it would (?:also )?be (?:useful|helpful|great|nice|good) if|"
                              r"you (?:should|must|need to)|make sure|remember to|target audience|tone|word count)\b", re.I)


# A task that works on text given with it ("rewrite this email", "proofread the following"). The
# text itself is often in the sentences right after the task and shares few words with it.
TRANSFORM_TASK = re.compile(r"\b(?:rewrite|rephrase|reword|paraphrase|translate|proofread|edit|correct|"
                            r"polish|shorten|simplify|summari[sz]e|improve|fix|check)\b.*"
                            r"\b(?:this|these|the following|below|my)\b", re.I)


def is_request(sentence):
    """A sentence that asks for something (an instruction, a request or a stated requirement).

    Each line is checked on its own, and so is the part after a colon, so a list item such as
    "Requirements:\n- Keep the original order" counts.
    """
    parts = [sentence] + sentence.splitlines() + [piece for piece in sentence.split(":")[1:]]
    return any(REQUEST_START.search(part.strip()) or REQUEST_ANYWHERE.search(part) for part in parts)


def normalized(sentence):
    return " ".join(sentence.split()).casefold()

@lru_cache(maxsize=1)
def sentence_splitter():
    pipeline = spacy.blank("en")
    pipeline.add_pipe("sentencizer")
    return pipeline

def sentence_spans(text):
    """Keep offsets so adjacent selected sentences retain their exact whitespace."""
    spans = []
    for sentence in sentence_splitter()(text).sents:
        raw = sentence.text
        if raw.strip():
            start = sentence.start_char + len(raw) - len(raw.lstrip())
            end = sentence.end_char - len(raw) + len(raw.rstrip())
            spans.append(dict(text=text[start:end], start=start, end=end))
    # The sentencizer can split a list number ("2.") off from its item; join it back on
    merged = []
    for span in spans:
        if merged and re.fullmatch(r"(?:\d{1,3}|[a-zA-Z])[.)]|[-*•]", merged[-1]["text"]):
            start = merged[-1]["start"]
            merged[-1] = dict(text=text[start:span["end"]], start=start, end=span["end"])
        else:
            merged.append(span)
    return merged


def split_sentences(text):
    return [span["text"] for span in sentence_spans(text)]


def assemble_sentences(text, spans, indices):
    """Join selected source blocks; never rewrite a confirmed multiline task.

    Neighbouring sentences keep the text between them. Across a removed sentence, the kept one is
    joined with the spacing that came before it in the source: a space inside a paragraph, the
    line or paragraph break otherwise, so no new paragraphs appear.
    """
    joined = ""
    previous = None
    for index in sorted(indices):
        span = spans[index]
        if previous is None:
            joined = text[span["start"]:span["end"]]
        elif index == previous + 1:
            joined += text[spans[previous]["end"]:span["end"]]
        else:
            gap = text[spans[index - 1]["end"]:span["start"]]
            joined += (gap if gap.strip() == "" and "\n" in gap else " ") + text[span["start"]:span["end"]]
        previous = index
    return joined


def inspect_tfidf_input(text, main_question, locked_sentences=None,
                        encoding="o200k_base", locked_spans=None):
    """Local preflight shared by the UI and compression service; no task is inferred."""
    spans = sentence_spans(text)
    protected = extract_protected_constraints(text, locked_spans)
    locked = set(locked_sentences or [])
    problems = []
    if not locked.issubset(set(range(len(spans)))):
        problems.append("Sentence locks no longer match this prompt. Clear the locks and select them again.")
        locked = locked.intersection(range(len(spans)))
    if not main_question.strip() or main_question not in text:
        problems.append("Choose a main-task sentence from the prompt, or paste an exact excerpt, then confirm it.")
        task_range = None
    else:
        start = text.index(main_question)
        task_range = (start, start + len(main_question))
    if len(spans) < 3:
        problems.append("TF-IDF needs at least 3 sentences with removable context. For short repeated requests, use NLP.")
    rows = [dict(index=i, text=span["text"], score=None, selected=True,
                 locked=i in locked, mandatory_reasons=[]) for i, span in enumerate(spans)]

    def mark_range(start, end, reason):
        for row, span in zip(rows, spans):
            if span["start"] < end and span["end"] > start and reason not in row["mandatory_reasons"]:
                row["mandatory_reasons"].append(reason)

    # An exact repeat of an earlier sentence adds nothing: the first copy carries its requirements
    first_seen, repeats = {}, set()
    for row in rows:
        key = normalized(row["text"])
        if key in first_seen:
            repeats.add(row["index"])
        else:
            first_seen[key] = row["index"]

    if task_range:
        mark_range(*task_range, "Confirmed main task")
    for index in locked:
        rows[index]["mandatory_reasons"].append("User-locked sentence")
    for row in rows:
        if row["index"] not in repeats and not row["mandatory_reasons"] and is_request(row["text"]):
            row["mandatory_reasons"].append("Request or instruction")
    # "Rewrite this email." The email follows: keep the sentences after the task up to the next
    # request, unless the task sentence already holds the text (a quote, or words after a colon)
    task_text = main_question if task_range else ""
    holds_text = re.search(r'["“].+["”]|:\s*\S', task_text)
    if task_range and TRANSFORM_TASK.search(task_text) and not holds_text:
        after = [row for row, span in zip(rows, spans) if span["start"] >= task_range[1]]
        for row in after:
            if row["mandatory_reasons"]:
                break
            row["mandatory_reasons"].append("Text the task works on")
    # Full-source constraints and locks can cross sentence boundaries.
    exact_locks = set(span for span in locked_spans or [] if span)
    # A protected word or number only has to survive once: if a sentence already being kept
    # (the task, a lock, a request) contains it, other sentences aren't forced in for it
    kept_text = " ".join(row["text"] for row in rows if row["mandatory_reasons"])
    for requirement in protected:
        if requirement not in exact_locks and contains_span(kept_text, requirement):
            continue
        pattern = re.escape(requirement)
        if requirement[0].isalnum() and requirement[-1].isalnum():
            pattern = r"(?<!\w)" + pattern + r"(?!\w)"
        matches = list(re.finditer(pattern, text, flags=0 if requirement in exact_locks else re.I))
        if requirement in exact_locks and not matches:
            problems.append(f"Locked phrase is absent from the original: {requirement}")
        for match in matches:
            mark_range(match.start(), match.end(), "Protected requirement: " + requirement)
    for index in repeats - locked:
        # Keep the reasons a repeat was flagged for only when the user locked it themselves
        if "Confirmed main task" not in rows[index]["mandatory_reasons"]:
            rows[index]["mandatory_reasons"] = []
    mandatory = {row["index"] for row in rows if row["mandatory_reasons"]}
    required_tokens = count_tokens(assemble_sentences(text, spans, mandatory), encoding) if task_range else None
    return dict(spans=spans, rows=rows, protected=protected, mandatory=mandatory, repeats=repeats,
                problems=problems, main_task_valid=task_range is not None,
                original_tokens=count_tokens(text, encoding), minimum_required_tokens=required_tokens)


def compress_with_tfidf(text, main_question, token_budget, locked_sentences=None,
                        encoding="o200k_base", locked_spans=None):
    start = perf_counter()
    plan = inspect_tfidf_input(text, main_question, locked_sentences, encoding, locked_spans)
    rows = plan["rows"]
    info = dict(token_budget=token_budget, sentence_count=len(rows),
                minimum_required_tokens=plan["minimum_required_tokens"],
                main_task_valid=plan["main_task_valid"], reason_code="ready")

    def finish(candidate=text, warnings=None, reason="unchanged"):
        info["reason_code"] = reason
        if candidate == text:
            for row in rows:
                row["selected"] = True
        return make_result("tfidf", text, candidate, start, encoding, warnings,
                           protected=plan["protected"], sentences=rows, selection_info=info)

    if plan["problems"]:
        return finish(warnings=plan["problems"], reason="input_not_ready")
    if type(token_budget) is not int or token_budget <= 0:
        return finish(warnings=["The token budget must be a positive integer."], reason="invalid_budget")
    try:
        matrix = TfidfVectorizer(stop_words="english").fit_transform([main_question] + [row["text"] for row in rows])
        scores = cosine_similarity(matrix[1:], matrix[0]).ravel()
    except ValueError:
        return finish(warnings=["No usable TF-IDF vocabulary; original retained."], reason="empty_vocabulary")
    for row, score in zip(rows, scores):
        row["score"] = float(score)
    if plan["minimum_required_tokens"] > token_budget:
        return finish(warnings=[
            f"Budget is {token_budget} tokens, but the main task and mandatory sentences need "
            f"{plan['minimum_required_tokens']} tokens. Increase the budget or review your sentence/phrase locks. "
            "The original was retained; no locked requirement was removed."], reason="budget_too_small")
    selected = set(plan["mandatory"])
    for i in sorted(range(len(rows)), key=lambda i: (-scores[i], i)):
        repeat = any(normalized(rows[i]["text"]) == normalized(rows[j]["text"]) for j in selected)
        if i not in selected and not repeat and not is_pleasantry(rows[i]["text"]) and count_tokens(assemble_sentences(text, plan["spans"], selected | {i}), encoding) <= token_budget:
            selected.add(i)
    if len(selected) == len(rows):
        return finish(warnings=["All sentences fit the budget or are mandatory, so none were removed. "
                               "Use a smaller feasible budget to filter context."], reason="all_sentences_retained")
    candidate = assemble_sentences(text, plan["spans"], selected)
    if main_question not in candidate:
        return finish(warnings=["Selection would alter the exact main task; original retained."], reason="task_validation_failed")
    check = validate_candidate(text, candidate, plan["protected"], encoding, locked_spans)
    for row in rows:
        row["selected"] = row["index"] in selected
    return finish(candidate if check.passed else text,
                  ["Low lexical similarity does not establish that a sentence is safe to remove."] +
                  check.warnings + check.failures, "selected" if check.passed else "validation_failed")
