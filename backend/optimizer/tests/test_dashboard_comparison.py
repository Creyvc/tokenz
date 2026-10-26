from pathlib import Path

from streamlit.testing.v1 import AppTest


def dashboard(tmp_path):
    fixture = Path(__file__).resolve().parents[1] / 'presentation' / 'Live-Results.json'
    code = f'''
import json
from pathlib import Path
from dashboard.comparison_view import render_results
render_results(json.loads(Path({str(fixture)!r}).read_text(encoding='utf-8')))
'''
    script = tmp_path / 'comparison_test_app.py'
    script.write_text(code, encoding='utf-8')
    return AppTest.from_file(str(script), default_timeout=40).run()


def test_real_result_view_shows_diffs_quality_and_comparable_charts(tmp_path):
    app = dashboard(tmp_path)
    assert not app.exception, app.exception
    assert [tab.label for tab in app.tabs] == [
        'Comparison', 'Prompt changes', 'Answer changes', 'Quality review']
    assert len(app.get('plotly_chart')) == 1
    values = {metric.label: metric.value for metric in app.metric}
    assert values['Prompt tokens saved'] == '24.5%'
    assert values['Quality retention'] == '111.1%'
    assert {metric.value for metric in app.metric if metric.label == 'AI quality retained'} == {'111.1%', '101.9%'}
    assert values['Original quality'] == '9.00 / 10'
    assert any('comparison-diff' in m.value and '<mark' in m.value for m in app.markdown)
    assert len(app.get('download_button')) == 1


def test_task_and_model_switch_preserve_failed_exact_check(tmp_path):
    app = dashboard(tmp_path)
    app.selectbox[0].select('reasoning').run()
    # reasoning order in the saved fixture is North Mini Code then Nemotron.
    app.selectbox[1].select(app.selectbox[1].options[-1]).run()
    assert not app.exception, app.exception
    assert any('Both answers failed' in item.value for item in app.error)
    values = {metric.label: metric.value for metric in app.metric}
    assert values['AI quality retained'] == '100.0%'
    assert values['Original exact check'] == 'Failed'
    assert values['Optimized exact check'] == 'Failed'
    app.toggle[0].set_value(False).run()
    assert not app.exception, app.exception


def test_main_website_opens_prompt_only_results_without_answer_calls(cfg, monkeypatch):
    from app.prompt_optimization import optimize_prompts
    from app.study import SAMPLES
    from tests.test_focused import factory
    from tests.test_methodology import setup
    cfg, integration, repo = setup(cfg)
    study = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory([]))
    monkeypatch.setattr('app.config.load_settings', lambda: cfg)
    monkeypatch.setattr('dashboard.autopilot.load_integration_settings', lambda: integration)
    root = Path(__file__).resolve().parents[1]
    app = AppTest.from_file(str(root / 'dashboard/streamlit_app.py'), default_timeout=40).run()
    assert not app.exception
    next(button for button in app.button if button.label == 'View results').click().run()
    assert not app.exception
    assert app.title[0].value == 'Results'
    assert len(app.code) == 2 and not app.tabs
    assert not any('quality' in metric.label.lower() for metric in app.metric)
    assert all(code.value == study['optimizations'][0]['optimized_prompt'] for code in app.code)


def test_partial_prompt_rewrite_remains_visible_and_resume_restores_input(cfg, monkeypatch):
    from app.prompt_optimization import optimize_prompts
    from app.study import SAMPLES
    from tests.test_focused import factory
    from tests.test_methodology import setup
    cfg, integration, repo = setup(cfg)
    partial = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory([], 'groq'))
    monkeypatch.setattr('app.config.load_settings', lambda: cfg)
    monkeypatch.setattr('dashboard.autopilot.load_integration_settings', lambda: integration)
    root = Path(__file__).resolve().parents[1]
    app = AppTest.from_file(str(root / 'dashboard/streamlit_app.py'), default_timeout=40).run()
    assert app.session_state['study']['id'] == partial['id']
    next(button for button in app.button if button.label == 'View results').click().run()
    assert not app.exception
    assert len(app.code) == 1
    next(button for button in app.button if button.label == 'Resume unfinished steps').click().run()
    assert not app.exception
    assert app.session_state['autopilot_step'] == 2
    assert app.session_state['autopilot_plan']['prompt'] == SAMPLES[0]['prompt']
    linked = AppTest.from_file(str(root / 'dashboard/streamlit_app.py'), default_timeout=40)
    linked.query_params['study'] = partial['id']
    linked.run()
    assert not linked.exception
    assert linked.session_state['study']['id'] == partial['id']


def test_failed_shortening_does_not_claim_success_and_exposes_saved_answer(tmp_path):
    root = Path(__file__).resolve().parents[1]
    fixture = root / 'presentation' / 'Live-Results.json'
    script = tmp_path / 'partial_result_test.py'
    script.write_text(f'''
import json
from pathlib import Path
from dashboard.comparison_view import render_results
study = json.loads(Path({str(fixture)!r}).read_text(encoding='utf-8'))
study['status'] = 'partial'
study['experiments'] = study['experiments'][:2]
for index, row in enumerate(study['experiments']):
    row.update(status='failed', optimized_prompt=None, optimized_prompt_tokens=None)
    row.pop('optimized_response', None)
    row['error'] = {{'code': 'RATE_LIMIT', 'message': 'Free request limit reached.'}}
    if index:
        row.pop('baseline', None)
render_results(study)
''', encoding='utf-8')
    app = AppTest.from_file(str(script), default_timeout=40).run()
    assert not app.exception
    text = ' '.join(item.value for item in app.markdown)
    assert '1 original answer(s) saved · 0 answers after shortening saved' in text
    assert 'Saved original answer · preview' in text
    assert 'A shorter prompt was produced' not in text
    assert len([item for item in app.expander if item.label.startswith('Read saved original answer')]) == 1
