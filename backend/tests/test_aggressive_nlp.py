"""Public backend behavior for optional stronger local editing."""
from service import compare_methods
import pytest


def test_aggressive_shortens_request_framing_without_losing_tasks():
    text = (
        "What I mainly need you to do is calculate the average Sales for each Region. "
        "I would also like you to show simple Python code using pandas. "
        "Please make sure that missing Sales values do not affect the mean. "
        "Please first give me the code, then explain each step, and finally show 4 example regions. "
        "Please do not use machine learning."
    )
    conservative = compare_methods(text, {"methods": ["nlp"]})[0]
    aggressive = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "aggressive"})[0]
    assert aggressive.tokens_saved > conservative.tokens_saved
    assert aggressive.status == "review_required"
    for requirement in ("average Sales for each Region", "Python code using pandas",
                        "missing Sales values do not affect the mean", "then explain each step",
                        "finally show 4 example regions", "do not use machine learning"):
        assert requirement.casefold() in aggressive.candidate_text.casefold()


def test_aggressive_merges_only_identical_rewritten_requests():
    text = "I would like you to explain gravity. Explain gravity. Explain mass."
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "aggressive"})[0]
    assert result.candidate_text == "Explain gravity. Explain mass."


@pytest.mark.parametrize("text,locked", [
    ("I would like you to explain gravity.", ["I would like you to"]),
    ('Explain the phrase "can be used to" without changing it.', []),
    ("I would like you to explain SQL without code and give exactly 3 examples.", []),
    ("I would like you to explain gravity. I would like you to describe chloroplast structures.", []),
])
def test_aggressive_preserves_literals_constraints_and_distinct_subtasks(text, locked):
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "aggressive", "locked_spans": locked})[0]
    if locked or '"' in text:
        assert result.candidate_text == text
    elif "SQL" in text:
        assert "SQL without code and give exactly 3 examples" in result.candidate_text
    else:
        assert "Explain gravity." in result.candidate_text
        assert "Describe chloroplast structures." in result.candidate_text


def test_invalid_mode_is_an_isolated_error_not_silent_fallback():
    result = compare_methods("Explain gravity.", {"methods": ["nlp"], "nlp_mode": "invalid"})[0]
    assert result.status == "error"
    assert result.candidate_text == "Explain gravity."


def test_negative_request_remains_a_grammatical_prohibition():
    text = "I would like you to not remove missing values. Please show exactly 2 rows."
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "aggressive"})[0]
    assert result.candidate_text == "Do not remove missing values. Show exactly 2 rows."


CHATTY = ("Hi there! I hope you're having a great day. I was wondering if you could help me with something. "
          "I'm basically trying to write a Python function that takes a list of email addresses and removes any duplicates. "
          "I would really like you to keep the original order of the emails, because in order to send them in the right "
          "sequence, the order actually matters. Please do not use any external libraries. It would also be really helpful "
          "if you could add a short docstring and 3 example test cases. Just to be clear, I need you to keep the original "
          "order. Thanks so much in advance for your help!")


def test_aggressive_trims_filler_offers_of_help_and_a_repeated_request():
    result = compare_methods(CHATTY, {"methods": ["nlp"], "nlp_mode": "aggressive"})[0]
    assert result.reduction_percent >= 40
    text = result.candidate_text
    for requirement in ("Python function", "list of email addresses", "removes any duplicates",
                        "Keep the original order of the emails", "Do not use any external libraries",
                        "short docstring and 3 example test cases"):
        assert requirement in text
    for filler in ("Hi there", "great day", "wondering", "basically", "Just to be clear", "Thanks"):
        assert filler not in text


@pytest.mark.parametrize("text", [
    "Do not use pandas. Use pandas.",
    "Use pandas for loading. Do not use pandas for plotting.",
    "Show the code and explain the output. Explain the code.",
    "Write 3 examples. Write 5 examples.",
])
@pytest.mark.parametrize("mode", ["aggressive", "maximum"])
def test_a_sentence_that_adds_or_flips_a_request_is_not_a_repeat(text, mode):
    assert compare_methods(text, {"methods": ["nlp"], "nlp_mode": mode})[0].candidate_text == text


@pytest.mark.parametrize("mode", ["aggressive", "maximum"])
def test_filler_words_go_but_negated_and_quoted_ones_stay(mode):
    text = 'Do not just copy the code. Translate "I really just want to sleep" into French.'
    assert compare_methods(text, {"methods": ["nlp"], "nlp_mode": mode})[0].candidate_text == text
    trimmed = compare_methods("I basically need a really short summary, thanks!",
                              {"methods": ["nlp"], "nlp_mode": mode})[0]
    assert trimmed.candidate_text == "I need a short summary."


def test_wordy_phrases_shorten_but_technical_ones_stay():
    text = "Explain the derivative with respect to x. In order to help, use 2 examples."
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "balanced"})[0]
    assert result.candidate_text == "Explain the derivative with respect to x. To help, use 2 examples."


def test_sign_offs_are_dropped_at_every_level():
    text = "Explain recursion in Python. Any help would be greatly appreciated! I look forward to your response."
    for mode in ("conservative", "balanced", "aggressive", "maximum"):
        result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": mode})[0]
        assert result.candidate_text == "Explain recursion in Python."


def test_maximum_drops_hedges_and_a_summary_of_earlier_requests():
    text = ("Explain how to calculate the total revenue for each product category using a pivot table. "
            "I think my manager probably wants the steps in order. "
            "To summarize, explain how to calculate the total revenue for each product category using a pivot table.")
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "maximum"})[0]
    assert result.candidate_text == ("Explain how to calculate the total revenue for each product category using a "
                                     "pivot table. My manager wants the steps in order.")
