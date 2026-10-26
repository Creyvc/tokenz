"""Comparison is a read-only display of the two individual tests."""
from pathlib import Path
from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parents[1] / "app.py")


def widget(items, label):
    return next(item for item in items if item.label == label)


def navigate(app, view):
    widget(app.sidebar.radio, "Test screen").set_value(view).run()
    assert not app.exception


def test_comparison_displays_completed_tests_without_another_test_form():
    app = AppTest.from_file(APP, default_timeout=30).run()
    widget(app.button, "Try NLP example").click().run()
    widget(app.button, "Run NLP").click().run()
    navigate(app, "tfidf")
    widget(app.button, "Try TF-IDF example").click().run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.button, "Run TF-IDF").click().run()
    navigate(app, "compare")
    assert not app.text_area and not app.number_input and not app.selectbox and not app.checkbox
    assert not any("Run" in item.label or "example" in item.label for item in app.button)
    table = app.dataframe[0].value.set_index("Method")
    assert table.loc["NLP", "Original tokens"] == 10
    assert table.loc["NLP", "Result tokens"] == 4
    assert table.loc["TF-IDF", "Original tokens"] == 26
    assert table.loc["TF-IDF", "Result tokens"] == 13
    assert any("different prompts" in warning.value for warning in app.warning)
    assert set(app.session_state.workbench_runs) == {"nlp", "tfidf"}


def test_same_prompt_unchanged_nlp_is_explained_and_stale_results_are_hidden():
    text = "Explain photosynthesis. The chlorophyll absorbs sunlight for plant growth. Yesterday the weather near the old bus station was cloudy and rainy."
    app = AppTest.from_file(APP, default_timeout=30).run()
    widget(app.text_area, "NLP prompt").set_value(text).run()
    widget(app.button, "Run NLP").click().run()
    navigate(app, "tfidf")
    widget(app.button, "Try TF-IDF example").click().run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.button, "Run TF-IDF").click().run()
    navigate(app, "compare")
    table = app.dataframe[0].value.set_index("Method")
    assert table.loc["NLP", "Result tokens"] == 26
    assert table.loc["TF-IDF", "Result tokens"] == 13
    assert not app.warning
    assert any("NLP saved 0 tokens" in item.value for item in app.info)
    assert any("baseline with no reduction" in item.value for item in app.caption)
    versions = {method: saved["version"] for method, saved in app.session_state.workbench_runs.items()}
    navigate(app, "nlp")
    widget(app.text_area, "NLP prompt").set_value("Please explain gravity.").run()
    navigate(app, "compare")
    assert not app.dataframe
    assert any("NLP settings changed" in item.value for item in app.info)
    assert versions == {method: saved["version"] for method, saved in app.session_state.workbench_runs.items()}
