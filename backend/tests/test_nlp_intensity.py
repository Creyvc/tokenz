from pathlib import Path
import pytest
from service import compare_methods

SALES = Path(__file__).parent / "fixtures" / "sales_request.txt"


def test_maximum_reaches_twenty_percent_on_verbose_sales_request_and_retains_requirements():
    text = SALES.read_text(encoding="utf-8").strip()
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "maximum"})[0]
    assert result.status == "review_required"
    assert result.reduction_percent >= 20
    assert "I am not sure; use Python" in result.candidate_text
    for phrase in ("Region column", "Sales column", "average", "Python", "pandas",
                   "missing sales values", "step by step", "North, South, East, and West",
                   "first", "finally", "beginner-friendly", "do not use machine learning",
                   "artificial intelligence models", "advanced statistical methods",
                   "complicated visualization libraries"):
        assert phrase.casefold() in result.candidate_text.casefold()


def test_balanced_sits_between_conservative_and_aggressive_on_supported_wording():
    text = "What I mainly need you to do is calculate mean sales. It would also be useful if you could show Python code."
    results = [compare_methods(text, {"methods": ["nlp"], "nlp_mode": mode})[0]
               for mode in ("conservative", "balanced", "aggressive")]
    assert all(result.status != "error" for result in results)
    assert results[0].tokens_saved < results[1].tokens_saved < results[2].tokens_saved


@pytest.mark.parametrize("mode", ["balanced", "maximum"])
def test_added_levels_preserve_subtasks_negations_quantities_and_literals(mode):
    text = ('I would like you to explain photosynthesis and describe chloroplast structures. '
            'Please do not use Python; include exactly 3 examples. '
            'Retain "can be used to" and `Sales = 0` verbatim.')
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": mode})[0]
    assert result.status != "error"
    for phrase in ("explain photosynthesis and describe chloroplast structures", "do not use Python",
                   "exactly 3 examples", '"can be used to"', '`Sales = 0`'):
        assert phrase.casefold() in result.candidate_text.casefold()


def test_maximum_reports_unmet_target_without_dropping_a_short_task():
    text = "Explain photosynthesis and describe chloroplast structures."
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "maximum"})[0]
    assert result.candidate_text == text
    assert result.tokens_saved == 0
    assert any("target not reached" in note for note in result.warnings)


def test_maximum_keeps_an_exact_locked_verbose_request_even_if_target_is_missed():
    text = SALES.read_text(encoding="utf-8").strip()
    result = compare_methods(text, {"methods": ["nlp"], "nlp_mode": "maximum", "locked_spans": [text]})[0]
    assert result.candidate_text == text
    assert any("target not reached" in note for note in result.warnings)
