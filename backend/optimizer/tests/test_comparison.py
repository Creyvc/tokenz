import html
import json
import re
from pathlib import Path

import pytest

from app.comparison import comparison_metrics, detailed_html_report, text_diff


def test_word_edits_and_reductions_are_distinct():
    result = text_diff("Please write a polite email", "Write a polite email")
    assert result["original_words"] == 5
    assert result["optimized_words"] == 4
    assert result["retained_words"] == 3
    assert result["removed_words"] == 2  # case-sensitive replacement plus deletion
    assert result["added_words"] == 1
    assert result["changed_pct"] == pytest.approx(100 / 3)
    assert result["word_reduction_pct"] == 20
    assert result["character_reduction_pct"] > 0


def test_highlights_escape_xss_and_preserve_text():
    original = '<script>alert("secret")</script> <img src=x onerror=alert(1)>'
    optimized = '<svg onload="alert(2)"> & " >'
    result = text_diff(original, optimized)
    for side, text in (("original", original), ("optimized", optimized)):
        markup = result[f"{side}_html"]
        assert "<script" not in markup
        assert "<img" not in markup
        assert "<svg" not in markup
        assert html.unescape(re.sub(r"</?mark(?:\s[^>]*)?>", "", markup)) == text
    assert "&lt;script&gt;" in result["original_html"]


def test_missing_text_is_not_empty_text_and_zero_denominators():
    missing = text_diff("existing answer", None)
    assert not missing["available"]
    assert missing["original_words"] == 2
    assert missing["optimized_words"] is None
    assert missing["changed_pct"] is None
    assert missing["optimized_html"] is None
    empty = text_diff("", "")
    assert empty["available"]
    assert empty["changed_pct"] == 0
    assert empty["word_reduction_pct"] is None
    assert empty["character_reduction_pct"] is None
    added = text_diff("", "hello")
    assert added["changed_pct"] == 100
    assert added["word_reduction_pct"] is None
    removed = text_diff("hello", "")
    assert removed["changed_pct"] == 100
    assert removed["word_reduction_pct"] == 100


def test_whitespace_change_is_not_word_change():
    result = text_diff("a\n  b", "a b")
    assert result["changed_pct"] == 0
    assert result["character_reduction_pct"] == 40
    assert result["original_html"] == "a\n  b"


def test_repeated_words_and_long_text_keep_exact_counts():
    result = text_diff("Ada Ben Ada", "Ada Ben")
    assert result["retained_words"] == 2
    assert result["removed_words"] == 1
    assert result["changed_pct"] == 20
    long = text_diff("word " * 250, "word " * 249)
    assert long["retained_words"] == 249
    assert long["removed_words"] == 1


def test_missing_usage_and_quality_are_unknown_not_zero():
    result = comparison_metrics({"baseline": {"input_tokens": 0, "output_tokens": 0, "text": ""}})
    assert result["baseline_total_tokens"] == 0
    assert result["optimized_total_tokens"] is None
    assert result["optimizer_total_tokens"] is None
    assert result["pipeline_total_tokens"] is None
    assert result["baseline_quality"] is None
    assert result["optimized_quality"] is None
    assert result["quality_retention_pct"] is None
    assert result["baseline_check"] is None
    assert result["answer_available"] is False
    assert all(item["baseline"] is None for item in result["quality_dimensions"])


def test_quality_ratio_can_exceed_100_but_zero_baseline_is_undefined():
    result = comparison_metrics({"evaluation": {"baseline_quality": 8, "optimized_quality": 10}})
    assert result["quality_retention_pct"] == 125
    assert result["quality_difference"] == 2
    zero = comparison_metrics({"evaluation": {"baseline_quality": 0, "optimized_quality": 0,
                                               "quality_retention_pct": 100}})
    assert zero["baseline_quality"] == 0
    assert zero["quality_retention_pct"] is None


def test_pipeline_counts_optimizer_but_not_judge_and_keeps_unknown_usage():
    row = {"baseline": {"input_tokens": 20, "output_tokens": 10},
           "optimized_response": {"input_tokens": 15, "output_tokens": 12},
           "optimizer_calls": [{"input_tokens": 100, "output_tokens": 15}],
           "judge_calls": [{"input_tokens": 1000, "output_tokens": 1000}]}
    result = comparison_metrics(row)
    assert result["target_input_reduction_pct"] == 25
    assert result["baseline_total_tokens"] == 30
    assert result["optimized_total_tokens"] == 27
    assert result["optimizer_total_tokens"] == 115
    assert result["pipeline_total_tokens"] == 142
    row["optimizer_calls"][0]["output_tokens"] = None
    assert comparison_metrics(row)["pipeline_total_tokens"] is None


def test_real_saved_fixture_preserves_failed_checks_and_quality_dimensions():
    fixture = Path(__file__).resolve().parents[1] / "presentation" / "Live-Results.json"
    study = json.loads(fixture.read_text(encoding="utf-8"))
    rows = study["experiments"]
    assert len(rows) == 6
    for row in rows:
        result = comparison_metrics(row)
        assert result["prompt_available"] and result["answer_available"]
        assert result["prompt_token_reduction_pct"] > 0
        assert result["target_input_reduction_pct"] > 0
        assert result["quality_retention_pct"] == pytest.approx(row["evaluation"]["quality_retention_pct"])
        assert len(result["quality_dimensions"]) == 6
        assert all(item["baseline"] is not None for item in result["quality_dimensions"])
    extraction = next(row for row in rows if row["category"] == "extraction")
    result = comparison_metrics(extraction)
    assert result["baseline_check"] is True
    assert result["optimized_check"] is False
    assert result["quality_retention_pct"] < 95


def test_nonfinite_or_boolean_numbers_are_not_displayed_as_scores():
    result = comparison_metrics({"evaluation": {"baseline_quality": float("nan"), "optimized_quality": True},
                                 "baseline": {"input_tokens": float("inf"), "output_tokens": 0}})
    assert result["baseline_quality"] is None
    assert result["optimized_quality"] is None
    assert result["baseline_total_tokens"] is None


def test_portable_report_escapes_all_dynamic_text_and_keeps_failed_and_null_records():
    attack = '<script>alert("unsafe")</script>'
    study = {"id": attack, "experiments": [None, {
        "status": "failed", "prompt_id": attack, "target_model": attack, "optimizer_model": attack,
        "original_prompt": attack, "optimized_prompt": "", "error": {"message": attack},
        "baseline": {"text": attack}, "evaluation": {"notes": attack, "evaluator": attack, "caveat": attack},
    }]}
    report = detailed_html_report(study)
    assert report.count("<article>") == 2
    assert "<script" not in report
    assert "&lt;script&gt;" in report
    assert "Status: failed" in report
    assert "Not measured" in report
    assert "Empty text" in report
    assert "Recorded error" in report
    assert "<script" not in detailed_html_report(None)


def test_portable_report_includes_real_quality_rubric_and_usage():
    fixture = Path(__file__).resolve().parents[1] / "presentation" / "Live-Results.json"
    report = detailed_html_report(json.loads(fixture.read_text(encoding="utf-8")))
    assert report.count("<article>") == 6
    assert "Instruction Following" in report
    assert "Quality retained relative to original" in report
    assert "Target input reduction (provider request)" in report
    assert "63.33%" in report
    assert "Failed" in report
