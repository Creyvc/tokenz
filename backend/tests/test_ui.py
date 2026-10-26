"""User-facing regressions for separate NLP and TF-IDF workbenches."""
from pathlib import Path
from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parents[1] / "app.py")
NLP_TEXT = "Please explain photosynthesis. Please explain photosynthesis."
TFIDF_TEXT = "Explain photosynthesis. The chlorophyll absorbs sunlight for plant growth. Yesterday the weather near the old bus station was cloudy and rainy."


def widget(items, label):
    return next(item for item in items if item.label == label)


def open_app():
    return AppTest.from_file(APP, default_timeout=30).run()


def navigate(app, view):
    widget(app.sidebar.radio, "Test screen").set_value(view).run()
    assert not app.exception


def test_nlp_screen_has_no_tfidf_or_qwen_controls():
    app = open_app()
    assert not app.exception
    assert widget(app.text_area, "NLP prompt").value == ""
    assert not any(item.label in ("Main task", "Token budget", "Sentences to keep")
                   for items in (app.selectbox, app.number_input, app.multiselect) for item in items)
    assert not any("Qwen" in item.label or "main task" in item.label for item in app.checkbox)
    assert widget(app.button, "Run NLP").disabled


def test_nlp_runs_without_task_or_budget():
    app = open_app()
    widget(app.text_area, "NLP prompt").set_value(NLP_TEXT).run()
    widget(app.button, "Run NLP").click().run()
    assert not app.exception
    results = app.session_state.workbench_runs["nlp"]["results"]
    assert len(results) == 1 and results[0].method == "nlp"
    assert results[0].tokens_saved == 6
    assert len(app.metric) == 4


def test_comparison_empty_state_has_no_test_controls():
    app = open_app()
    navigate(app, "compare")
    assert not app.text_area and not app.button and not app.checkbox
    assert any("Run NLP" in item.value for item in app.info)
    assert any("Run TF-IDF" in item.value for item in app.info)
    assert not app.session_state.get("workbench_runs", {})


def test_review_resets_on_new_run():
    app = open_app()
    widget(app.text_area, "NLP prompt").set_value(NLP_TEXT).run()
    widget(app.button, "Run NLP").click().run()
    widget(app.checkbox, "I checked every requested task and constraint").check().run()
    widget(app.button, "Run NLP").click().run()
    assert not widget(app.checkbox, "I checked every requested task and constraint").value


def test_original_display_updates_on_second_prompt():
    app = open_app()
    widget(app.text_area, "NLP prompt").set_value(NLP_TEXT).run()
    widget(app.button, "Run NLP").click().run()
    widget(app.text_area, "NLP prompt").set_value("Please explain gravity.").run()
    widget(app.button, "Run NLP").click().run()
    assert widget(app.text_area, "Original").value == "Please explain gravity."


def test_method_drafts_and_results_survive_switching_without_leaking():
    app = open_app()
    widget(app.text_area, "NLP prompt").set_value(NLP_TEXT).run()
    widget(app.button, "Run NLP").click().run()
    navigate(app, "tfidf")
    assert widget(app.text_area, "TF-IDF prompt").value == ""
    assert not app.metric
    widget(app.button, "Try TF-IDF example").click().run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.button, "Run TF-IDF").click().run()
    assert app.session_state.workbench_runs["tfidf"]["results"][0].tokens_saved == 13
    navigate(app, "nlp")
    assert widget(app.text_area, "NLP prompt").value == NLP_TEXT
    assert app.session_state.workbench_runs["nlp"]["results"][0].tokens_saved == 6
    assert len(app.metric) == 4
    navigate(app, "tfidf")
    assert widget(app.text_area, "TF-IDF prompt").value == TFIDF_TEXT
    assert widget(app.checkbox, "I confirm this is my main task").value
    assert app.session_state.workbench_runs["tfidf"]["results"][0].tokens_saved == 13


def test_example_does_not_run_until_clicked_and_tfidf_needs_confirmation():
    app = open_app()
    widget(app.button, "Try NLP example").click().run()
    assert not app.session_state.get("workbench_runs", {})
    navigate(app, "tfidf")
    widget(app.button, "Try TF-IDF example").click().run()
    assert widget(app.button, "Run TF-IDF").disabled
    widget(app.checkbox, "I confirm this is my main task").check().run()
    assert not widget(app.button, "Run TF-IDF").disabled


def test_tfidf_too_small_budget_blocks_run_and_suggested_budget_recovers():
    app = open_app()
    navigate(app, "tfidf")
    widget(app.button, "Try TF-IDF example").click().run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.number_input, "Token budget").set_value(1).run()
    assert widget(app.button, "Run TF-IDF").disabled
    assert any("at least 4 tokens" in warning.value for warning in app.warning)
    widget(app.button, "Use suggested budget").click().run()
    assert not widget(app.button, "Run TF-IDF").disabled


def test_qwen_consent_does_not_appear_on_local_screens():
    app = open_app()
    navigate(app, "qwen")
    widget(app.checkbox, "Allow this prompt to be sent to Qwen").check().run()
    navigate(app, "nlp")
    assert not any("Qwen" in item.label for item in app.checkbox)
    navigate(app, "tfidf")
    assert not any("Qwen" in item.label for item in app.checkbox)


def test_tfidf_custom_multiline_excerpt_is_supported():
    app = open_app()
    navigate(app, "tfidf")
    task = "Explain gravity.\n\nDescribe mass."
    widget(app.text_area, "TF-IDF prompt").set_value(task + " The café near the bridge was crowded this morning.").run()
    widget(app.selectbox, "Main task").select(-1).run()
    widget(app.text_area, "Exact task excerpt").set_value(task).run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.button, "Run TF-IDF").click().run()
    assert not app.exception
    result = app.session_state.workbench_runs["tfidf"]["results"][0]
    assert task in result.candidate_text
