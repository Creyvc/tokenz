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
