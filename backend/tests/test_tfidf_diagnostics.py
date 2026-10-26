"""Regressions for user-reported TF-IDF setup and sentence-selection failures."""
from pathlib import Path
from streamlit.testing.v1 import AppTest
from compressors.tfidf_compressor import compress_with_tfidf, inspect_tfidf_input
from token_utils import count_tokens

TEXT = "Explain photosynthesis. The chlorophyll absorbs sunlight for plant growth. Yesterday the weather near the old bus station was cloudy and rainy."
TASK = "Explain photosynthesis."
APP = str(Path(__file__).resolve().parents[1] / "app.py")


def widget(items, label):
    return next(item for item in items if item.label == label)


def test_small_budget_reports_required_tokens_and_sentence_scores():
    result = compress_with_tfidf(TEXT, TASK, 1)
    assert result.candidate_text == TEXT
    assert result.selection_info["reason_code"] == "budget_too_small"
    assert result.selection_info["minimum_required_tokens"] == count_tokens(TASK)
    assert all(row["score"] is not None and row["selected"] for row in result.sentences)
    assert any("4 tokens" in warning for warning in result.warnings)


def test_main_task_newlines_preserved_verbatim():
    task = "Explain gravity.\n\nDescribe mass."
    text = task + "\n\nYesterday the old bus was late and the weather was rainy."
    result = compress_with_tfidf(text, task, count_tokens(task))
    assert result.candidate_text == task
    assert result.tokens_saved > 0
    assert result.selection_info["reason_code"] == "selected"


def test_locked_span_across_sentence_boundaries_is_preserved():
    locked = "Explain gravity.\n\nDescribe mass."
    text = locked + "\n\nThe café near the station had freshly baked bread this morning."
    result = compress_with_tfidf(text, "Explain gravity.", count_tokens(locked), locked_spans=[locked])
    assert result.candidate_text == locked
    assert result.tokens_saved > 0
    assert all(row["mandatory_reasons"] for row in result.sentences[:2])


def test_short_duplicate_request_explains_method_limit():
    text = "Please explain photosynthesis. Please explain photosynthesis."
    result = compress_with_tfidf(text, "Please explain photosynthesis.", 16)
    assert result.candidate_text == text
    assert any("at least 3 sentences" in warning and "NLP" in warning for warning in result.warnings)


def test_excess_budget_explains_no_selection():
    result = compress_with_tfidf(TEXT, TASK, 100)
    assert result.selection_info["reason_code"] == "all_sentences_retained"
    assert all(row["selected"] for row in result.sentences)


def test_bad_main_task_returns_actionable_diagnostic():
    result = compress_with_tfidf(TEXT, "explain photosynthesis", 16)
    assert result.selection_info["reason_code"] == "input_not_ready"
    assert not result.selection_info["main_task_valid"]
    assert result.sentences and all(row["score"] is None for row in result.sentences)


def test_preflight_locks_explain_minimum():
    plan = inspect_tfidf_input(TEXT, TASK, [2])
    assert plan["minimum_required_tokens"] > count_tokens(TASK)
    assert "User-locked sentence" in plan["rows"][2]["mandatory_reasons"]


def test_picker_and_feasible_budget_produce_shorter_ui_result():
    app = AppTest.from_file(APP, default_timeout=30).run()
    widget(app.sidebar.radio, "Test screen").set_value("tfidf").run()
    widget(app.text_area, "TF-IDF prompt").set_value(TEXT).run()
    widget(app.selectbox, "Main task").select(0).run()
    assert app.session_state.workbench_drafts["tfidf"]["question"] == TASK
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.number_input, "Token budget").set_value(16).run()
    widget(app.button, "Run TF-IDF").click().run()
    assert not app.exception
    assert any("TF-IDF result" == heading.value for heading in app.subheader)
    assert app.session_state.workbench_runs["tfidf"]["results"][0].tokens_saved > 0


def test_new_prompt_resets_task_confirmation_locks_and_tiny_budget():
    app = AppTest.from_file(APP, default_timeout=30).run()
    widget(app.sidebar.radio, "Test screen").set_value("tfidf").run()
    widget(app.text_area, "TF-IDF prompt").set_value(TEXT).run()
    widget(app.selectbox, "Main task").select(0).run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.multiselect, "Sentences to keep").select(2).run()
    widget(app.number_input, "Token budget").set_value(1).run()
    widget(app.text_area, "TF-IDF prompt").set_value(TEXT + " The river was peaceful near the bridge.").run()
    assert not app.exception
    assert not widget(app.checkbox, "I confirm this is my main task").value
    assert widget(app.multiselect, "Sentences to keep").value == []
    assert app.session_state.workbench_drafts["tfidf"]["question"] == ""
    assert widget(app.number_input, "Token budget").value > 1
