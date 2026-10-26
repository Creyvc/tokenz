from pathlib import Path
from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parents[1] / "app.py")


def widget(items, label):
    return next(item for item in items if item.label == label)


def test_aggressive_option_changes_result_and_invalidates_old_comparison():
    app = AppTest.from_file(APP, default_timeout=30).run()
    text = "What I mainly need you to do is calculate mean sales. I would also like you to show Python code."
    widget(app.text_area, "NLP prompt").set_value(text).run()
    widget(app.button, "Run NLP").click().run()
    before = app.session_state.workbench_runs["nlp"]["results"][0].tokens_saved
    mode = widget(app.selectbox, "NLP reduction")
    assert mode.value == "conservative"
    mode.select("aggressive").run()
    assert not app.metric
    widget(app.button, "Run NLP").click().run()
    assert not app.exception
    assert app.session_state.workbench_runs["nlp"]["results"][0].tokens_saved > before
    assert app.session_state.workbench_runs["nlp"]["nlp_mode"] == "aggressive"
    widget(app.sidebar.radio, "Test screen").set_value("tfidf").run()
    widget(app.button, "Try TF-IDF example").click().run()
    widget(app.checkbox, "I confirm this is my main task").check().run()
    widget(app.button, "Run TF-IDF").click().run()
    widget(app.sidebar.radio, "Test screen").set_value("compare").run()
    assert app.dataframe[0].value.set_index("Method").loc["NLP", "NLP mode"] == "Aggressive"
    widget(app.sidebar.radio, "Test screen").set_value("nlp").run()
    assert widget(app.selectbox, "NLP reduction").value == "aggressive"
    widget(app.selectbox, "NLP reduction").select("conservative").run()
    widget(app.sidebar.radio, "Test screen").set_value("compare").run()
    assert not app.dataframe
    assert any("NLP settings changed" in item.value for item in app.info)


def test_four_levels_and_maximum_target_feedback():
    app = AppTest.from_file(APP, default_timeout=30).run()
    mode = widget(app.selectbox, "NLP reduction")
    assert len(mode.options) == 4
    mode.select("maximum").run()
    sales = Path(APP).parent / "tests" / "fixtures" / "sales_request.txt"
    widget(app.text_area, "NLP prompt").set_value(sales.read_text(encoding="utf-8").strip()).run()
    widget(app.button, "Run NLP").click().run()
    assert not app.exception
    assert any("20% target reached" in item.value for item in app.success)
    widget(app.text_area, "NLP prompt").set_value("Explain gravity.").run()
    assert not app.metric
    widget(app.button, "Run NLP").click().run()
    assert any("20% target not reached" in item.value for item in app.info)
    assert app.session_state.workbench_runs["nlp"]["results"][0].candidate_text == "Explain gravity."
