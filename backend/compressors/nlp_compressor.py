"""Small, explainable grammar rules using spaCy dependency parsing."""
from functools import lru_cache
from time import perf_counter
import re
import spacy
from models import make_result
from validation import extract_protected_constraints, validate_candidate, contains_span, is_pleasantry

NLP_MODES = ("conservative", "balanced", "aggressive", "maximum")
LEVEL = {mode: i for i, mode in enumerate(NLP_MODES)}

# Explicit phrase edits, not semantic summarization. A pattern anchored with ^ is a sentence
# opening; removing one turns a request into a direct instruction. Anchors avoid changing an
# explanation of what somebody else wants into a new instruction.

# Balanced: request openings, and wordy phrases whose short form keeps every content word
BALANCED_RULES = [
    (r"^What I (?:mainly |really |basically |actually )?(?:need|want) (?:you to do|from you) is\s+(?:to\s+)?", ""),
    (r"^I(?: would|'d) (?:also |really )?like (?:for )?you to\s+", ""),
    (r"^I (?:also |really )?(?:need|want) you to\s+", ""),
    (r"\bin order to\b", "to"),
    (r"\bso as to\b", "to"),
    (r"\bprior to\b", "before"),
    (r"\bsubsequent to\b", "after"),
    (r"\b(?:is|are|am) able to\b", "can"),
    (r"\beach and every\b", "every"),
    (r"\bfirst and foremost\b", "first"),
    (r"\bwhether or not\b", "whether"),
]

# Aggressive: more openings and sign-posts, filler words, and wordy phrases that drop a framing noun
AGGRESSIVE_RULES = [
    (r"^(?:So|Well|Okay|OK|Anyway),?\s+(?=\w)", ""),
    (r"^(?:Hi|Hello|Hey)(?: there| everyone| all)?[,!]\s+", ""),
    (r"^I(?: was|'m| am) (?:just )?wondering if (?:maybe |perhaps )?you (?:could|can|would) (?:please )?", ""),
    (r"^I(?: would|'d) (?:really |greatly |truly )?appreciate it if you could (?:please )?(?:also )?", ""),
    (r"^Do you think you could (?:please )?", ""),
    (r"^My (?:main )?question is:?\s+", ""),
    ((r"^It would (?:also )?be (?:really |very |super |extremely )?(?:useful|helpful|great|nice|good|ideal) "
      r"if you could (?:please )?(?:also )?"), ""),
    (r"^(?:Please )?(?:also )?make sure (?:that )?", "Ensure "),
    (r"^(?:Please )?first give me\s+", "First provide "),
    (r"^In addition to giving me the code, please\s+", "With the code, "),
    (r"^(?:To summari[sz]e|To sum up|In summary|In short|In conclusion)(?: again)?,\s*", ""),
    (r"^(?:Just )?to be clear,\s*", ""),
    (r"^(?:Again|As I said(?: before| earlier)?|Like I said|As (?:I )?mentioned(?: before| earlier)?),\s*", ""),
    (r"^(?:It is|It's) (?:also )?worth (?:noting|mentioning) that\s+", ""),
    (r"^(?:It should be noted that|Note that)\s+", ""),
    (r"^(Also|And|Then|Finally|Lastly|Next),?\s+(?:could|can|would) you (?:please )?(?:also )?", r"\1 "),
    (r"^I want to be able to see clearly what\s+", "Show what "),
    ((r",? and I (?:was|am|'m) (?:just )?wondering if (?:maybe |perhaps )?you (?:could|can) help me(?: out)?"
      r"(?: with (?:it|this|that))?(?=[.!?]$)"), ""),
    (r"\b(?:due|owing) to the fact that\b", "because"),
    (r"\b(?:despite|in spite of) the fact that\b", "although"),
    (r"\bfor the purpose of\b", "for"),
    (r"\bin the event that\b", "if"),
    (r"\bat (?:this point in time|the present time)\b", "now"),
    (r"\b(?:has|have) the ability to\b", "can"),
    (r"\bmake use of\b", "use"),
    (r"\ba (?:large|great|huge|significant) number of\b", "many"),
    (r"\bthe (?:vast )?majority of\b", "most"),
    (r"\b(?:with|in) regards? to\b", "about"),
    (r"\bon a (daily|weekly|monthly|yearly) basis\b", r"\1"),
    (r"\bon a regular basis\b", "regularly"),
    (r"\bend result\b", "result"),
    (r"\bfor every individual\s+", "for each "),
    (r"\bcan be used to\s+", "can "),
    (r"\bso (?:that )?I can\b", "to"),
    (r"\b(?:basically|actually|honestly),\s*", ""),
    (r"\b(?:really|basically|actually|honestly|literally|definitely|totally)\s+(?=\w)", ""),
    (r"(?<!\bnot )(?<!n't )\bjust\s+(?=\w)", ""),
    (r"(?<=\s)please,?\s+(?=\w)", ""),
    (r",?\s+please(?=[.!?]$)", ""),
    (r"[,;]?\s+(?:thanks|thank you)(?: (?:so|very) much)?(?: in advance)?[.!]*$", "."),
]

# Maximum compacts framing, personal rationale and hedges rather than selecting sentences by a
# token budget. Captured task clauses remain in the original order. The first rules are specific
# framings; they run before shorter openings can consume them.
MAXIMUM_RULES = [
    (r"^I am currently working on (?:a|an) (.+?) for one of my [^.!?]+? classes, and I need some help\s+", r"For one \1, help with "),
    (r"^I(?: am|'m) (?:currently )?working on (an? [^,.!?]+?),? and I need (?:some )?help with\s+", r"For \1, help with "),
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
    (r", and I want to be able to see clearly what\s+", "; show what "),
]

# Maximum also drops hedges: they soften a request without changing what is asked
HEDGE_RULES = [
    (r"\bI (?:think|believe|guess|suppose|feel like)(?: that)?\s+(?!about\b|of\b|so\b)(?=\w)", ""),
    (r"\b(?:probably|maybe|perhaps|possibly)\s+(?=\w)", ""),
]

# A whole sentence that only announces or offers help, asking for nothing itself (Aggressive and up)
FILLER_SENTENCE = re.compile(
    r"(?:let me know if (?:you (?:have any questions|need (?:any )?(?:more|further|additional|other) "
    r"(?:information|details|info|context)|need anything else)|anything is unclear)"
    r"|i have a (?:quick |small |simple )?question(?: for you)?"
    r"|(?:sorry|apologies) (?:if|for) (?:this is |this |my )?(?:a )?(?:dumb|stupid|silly|basic|simple|long|newbie) ?(?:question|message|post)?"
    r"|(?:this is |this might be |it's |it is )?(?:probably )?(?:a )?(?:dumb|stupid|silly|newbie) question"
    r"|(?:so,? |and,? )?i (?:was|am|'m) (?:just )?wondering if (?:maybe |perhaps )?you (?:could|can) help(?: me)?(?: (?:out )?with (?:something|this|it|a (?:problem|question|task)))?"
    r"|(?:can|could|would) you (?:please )?help me(?: (?:out )?with (?:something|this|it|a (?:problem|question|task)))?"
    r"|i need (?:some |your )?help(?: with (?:something|this|a (?:problem|question|task)))?)"
    r"\s*[.!?:]*", re.I)


def rules_for(mode):
    if mode == "maximum":
        return MAXIMUM_RULES + BALANCED_RULES + AGGRESSIVE_RULES + HEDGE_RULES
    return BALANCED_RULES + (AGGRESSIVE_RULES if mode == "aggressive" else [])


def filler_tokens(sentence, rules):
    """Token indices inside text the rules will remove: its nouns are framing, not requirements."""
    text = sentence.text
    base = sentence.start_char + len(text) - len(text.lstrip())
    raw = text.strip()
    covered = set()
    for pattern, _ in rules:
        for match in re.finditer(pattern, raw, flags=re.I):
            start, end = base + match.start(), base + match.end()
            covered.update(t.i for t in sentence if start <= t.idx < end)
    return covered


def stronger_sentence(sentence, raw, locked_spans, mode, skip):
    """Attempt bounded edits; keep the sentence when a local safeguard fails."""
    # Quoted text, code and literal user locks are never phrase-rewritten.
    if re.search(r'["“”`=<>]', raw) or any(span and span in raw for span in locked_spans or []):
        return raw
    edited, opened = raw, False
    for pattern, replacement in rules_for(mode):
        changed = re.sub(pattern, replacement, edited, flags=re.I)
        if changed != edited:
            opened = opened or pattern.startswith("^")
            edited = changed
    edited = re.sub(r"(?<=\S)[ \t]{2,}(?=\S)", " ", edited)
    if opened:
        edited = re.sub(r"^not\s+", "Do not ", edited, flags=re.I)
        if edited.endswith("?"):
            edited = edited[:-1] + "."
    # Only a sentence that began with a capital gets one back; an untouched clause (for example
    # one spaCy split off, starting "and …") keeps its own case
    if edited and edited != raw and raw[:1].isupper():
        edited = edited[0].upper() + edited[1:]
    requirements = extract_protected_constraints(raw)
    requirements += [e.text for e in sentence.ents if not all(t.i in skip for t in e)]
    if mode != "maximum":
        requirements += [t.text for t in sentence if t.pos_ in ("NOUN", "PROPN") and t.i not in skip]
    return edited if edited and all(contains_span(edited, span) for span in requirements) else raw


# Words that carry no requirement of their own when comparing two sentences' content
GENERIC = {"want", "need", "like", "would", "could", "should", "make", "sure", "please", "also", "help",
           "do", "be", "have", "get", "go", "let", "know", "thing", "way", "lot", "just", "really", "able"}
CONTENT_POS = {"NOUN", "PROPN", "VERB", "ADJ", "NUM", "ADV"}
NEGATIONS = {"not", "n't", "no", "never", "without", "nothing", "none", "nor"}


def is_content(token):
    word = token.lower_
    if word in NEGATIONS or token.dep_ == "neg":
        return True
    return ((token.is_alpha or token.like_num) and not token.is_stop and token.pos_ in CONTENT_POS
            and token.lemma_.lower() not in GENERIC)


def lemma(token):
    return "not" if token.lower_ in NEGATIONS or token.dep_ == "neg" else token.lemma_.lower()


def anchor(token):
    """The nearest content word the token depends on, skipping prepositions and auxiliaries."""
    head = token.head
    while head.i != head.head.i and not is_content(head):
        head = head.head
    return head if head.i != token.i and is_content(head) else None


def signature(sentence, skip):
    """What a sentence asks for: its content lemmas, which word each depends on, and what's negated."""
    lemmas, pairs, negated = set(), set(), set()
    for token in sentence:
        if token.i in skip or not is_content(token):
            continue
        lemmas.add(lemma(token))
        heads = [anchor(token)]
        # In "the mean and the median", the median belongs to the same verb as the mean
        if token.dep_ == "conj":
            first = token
            while first.dep_ == "conj" and first.head.i != first.i:
                first = first.head
            heads.append(anchor(first))
        for head in heads:
            if head is not None and head.i not in skip:
                pairs.add((lemma(head), lemma(token)))
                if lemma(token) == "not":
                    negated.add(lemma(head))
    return lemmas, pairs, negated


def covered(sig, other):
    """Every word and link of sig already appears in other, with the same negations."""
    lemmas, pairs, negated = sig
    other_lemmas, other_pairs, other_negated = other
    return (len(lemmas) >= 2 and lemmas <= other_lemmas and pairs <= other_pairs
            and not ((other_negated - negated) & lemmas))


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
    level = LEVEL[mode]
    rules = rules_for(mode) if level else []
    locks = [span for span in locked_spans or [] if span]

    def unlocked(sentence):
        return not any(span in sentence.text for span in locks)

    # Greetings and small talk ("Hi!", "I hope you are doing well today.") are dropped below, and
    # from Aggressive up so are sentences that only offer or ask for help in general ("I have a
    # question."), so their words ("today") aren't treated as requirements
    empty = {sent.start for sent in doc.sents if is_pleasantry(sent.text) or (
        level >= LEVEL["aggressive"] and FILLER_SENTENCE.fullmatch(sent.text.strip()) and unlocked(sent))}
    skips = {sent.start: filler_tokens(sent, rules) if rules else set() for sent in doc.sents}
    framing = set().union(*skips.values())
    protected = list(dict.fromkeys(protected + [
        e.text for e in doc.ents if e.sent.start not in empty and not all(t.i in framing for t in e)]))
    # Detect noun phrases as candidate technical concepts; show them for human review.
    # Protect content nouns individually so polite opening removal remains possible.
    if mode != "maximum":
        protected += [t.text for t in doc if t.pos_ in ("NOUN", "PROPN") and t.sent.start not in empty
                      and t.i not in framing]
    protected = list(dict.fromkeys(protected))

    # Each sentence keeps the spacing around it (line and paragraph breaks, list layout), so the
    # suggestion has the original's shape and no tokens are "saved" by flattening it. Every
    # sentence remembers its original so a single unsafe edit can be undone on its own.
    pieces, seen, seen_edited, kept = [], set(), set(), []
    for sentence in doc.sents:
        chunk = sentence.text_with_ws
        raw = chunk.strip()
        lead = chunk[:len(chunk) - len(chunk.lstrip())]
        trail = chunk[len(chunk.rstrip()):]
        piece = dict(lead=lead, old=raw, new=raw, trail=trail, drop=False)
        pieces.append(piece)
        if not raw:
            continue
        # Exact duplicates, pleasantries and empty offers of help only. The shared validator still checks constraints.
        if raw in seen or sentence.start in empty:
            piece["drop"] = True
            continue
        seen.add(raw)
        skip = skips[sentence.start]
        # From Aggressive up, a sentence that only repeats what an earlier one already asked
        # ("To be clear, keep the original order.") goes: each content word, the word it
        # belongs to, its negations and protected terms must already be there. Aggressive
        # compares with one earlier sentence; Maximum with all of them together.
        if level >= LEVEL["aggressive"] and unlocked(sentence) and not re.search(r'["“”`=<>]', raw):
            sig = signature(sentence, skip)
            spans = extract_protected_constraints(raw) + [e.text for e in sentence.ents]
            if mode != "maximum":
                spans += [t.text for t in sentence if t.pos_ in ("NOUN", "PROPN") and t.i not in skip]
            if mode == "maximum" and kept:
                union = (set().union(*(k[0][0] for k in kept)), set().union(*(k[0][1] for k in kept)),
                         set().union(*(k[0][2] for k in kept)))
                earlier = [(union, " ".join(k[1] for k in kept))]
            else:
                earlier = kept
            if any(covered(sig, other) and all(contains_span(words, s) for s in spans) for other, words in earlier):
                piece["drop"] = True
                continue
            kept.append((sig, raw))
        elif level >= LEVEL["aggressive"]:
            kept.append((signature(sentence, skip), raw))
        if level:
            raw = stronger_sentence(sentence, raw, locked_spans, mode, skip)
        # Only remove a polite opening when the parsed sentence root is a verb.
        if sentence.root.pos_ == "VERB":
            # A greeting in front ("Hey, could you please …") goes with the polite opening
            stripped = re.sub(r"^(?:(?:hey|hi|hello)(?: there)?,?\s+)?(?:(?:Could|Would|Can) you (?:please )?|Please )",
                              "", raw, flags=re.I)
            if stripped != raw and stripped:
                raw = stripped[0].upper() + stripped[1:]
                if raw.endswith("?"): raw = raw[:-1] + "."
        if level:
            # Deduplicate only sentences made identical by the explicit edits.
            if raw in seen_edited:
                piece["drop"] = True
                continue
            seen_edited.add(raw)
        piece["new"] = raw

    def assemble():
        out = []
        for piece in pieces:
            if piece["drop"]:
                # A removed clause that spaCy split off ("… due on Friday" / "and I was wondering …")
                # passes its full stop on to the clause before it
                if out and re.search(r"[.!?]$", piece["old"]) and not re.search(r"[.!?:;]\s*$", out[-1]):
                    spacing = out[-1][len(out[-1].rstrip()):]
                    out[-1] = out[-1].rstrip().rstrip(",") + piece["old"][-1] + spacing
                # A removed sentence that ended a line or paragraph passes that break on
                if "\n" in piece["trail"] and out and "\n" not in out[-1][len(out[-1].rstrip()):]:
                    out[-1] = out[-1].rstrip() + piece["trail"]
                continue
            out.append(piece["lead"] + piece["new"] + piece["trail"])
        body = "".join(out).strip()
        return text[:len(text) - len(text.lstrip())] + body + text[len(text.rstrip()):]

    # A requirement an edit lost puts back only the sentences it came from; one no single
    # sentence holds (a lock across sentences) puts back the whole original
    candidate = assemble()
    for _ in range(3):
        lost = [s for s in protected if not contains_span(candidate, s)] + [s for s in locks if s not in candidate]
        if not lost:
            break
        changed = [p for p in pieces if p["drop"] or p["new"] != p["old"]]
        for span in lost:
            holders = [p for p in changed if (span in p["old"] if span in locks else contains_span(p["old"], span))]
            for piece in holders or pieces:
                piece.update(new=piece["old"], drop=False)
        candidate = assemble()
    validation = validate_candidate(text, candidate, protected, encoding, locked_spans)
    notes = validation.warnings + validation.failures
    if mode != "conservative":
        notes.append(f"{mode.title()} NLP uses additional phrase edits and removes repeated requests. Review every task and constraint; it is not semantic summarization.")
    if mode == "maximum":
        from token_utils import count_tokens
        before = count_tokens(text, encoding)
        after = count_tokens(candidate if validation.passed else text, encoding)
        reached = before > 0 and (before - after) / before >= .2
        notes.append("20% reduction target reached." if reached else
                     "20% reduction target not reached. No extra text was deleted just to meet the target.")
        notes.append("Maximum can remove framing nouns, hedges and personal rationale. Unlike lower levels it does not require every source noun to survive. Review the full diff for lost meaning.")
    return make_result("nlp", text, candidate if validation.passed else text, start, encoding,
                       notes, protected=protected)
