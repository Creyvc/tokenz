import json
from dataclasses import replace
from pathlib import Path

from streamlit.testing.v1 import AppTest

from app.integration_config import IntegrationConfig
from app.methodology import run_methodology
from app.presentation import provider_rows, unique_studies
from app.study import SAMPLES
from tests.test_methodology import fake_factory, setup


def test_four_provider_rows_keep_secrets_private_and_unknown_billing_disabled():
    config = IntegrationConfig(groq_api_key='secret-groq', gemini_api_key='secret-gemini',
                               openrouter_api_key='secret-router', openai_api_key='secret-openai')
    rows = provider_rows(config)
    assert [row['Provider'] for row in rows] == ['Groq', 'Gemini', 'OpenRouter', 'OpenAI']
    assert 'secret-' not in json.dumps(rows)
    assert 'confirm' in rows[0]['Status'].lower() and 'confirm' in rows[1]['Status'].lower()
    assert 'Blocked' in rows[-1]['Status']


def test_history_deduplicates_display_without_deleting_trials():
    rows = [{'id': 'a', 'signature': 'same', 'created_at': '1', 'demo': False},
            {'id': 'b', 'signature': 'same', 'created_at': '2', 'demo': False},
            {'id': 'c', 'signature': 'same', 'created_at': '3', 'demo': True}]
    assert [row['id'] for row in unique_studies(rows)] == ['c', 'b']
    assert len(rows) == 3


def test_completed_run_reuse_sends_no_requests_and_creates_no_duplicate(cfg):
    cfg, integration, repo = setup(cfg)
    calls, events = [], []
    first = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                            provider_factory=fake_factory(calls), on_event=events.append, reuse_completed=True)
    assert first['status'] == 'completed'
    assert [e['stage'] for e in events if e['state'] == 'complete'] == [
        'baseline', 'optimizer', 'optimized_target']
    assert len(first['workflow_events']) == 3
    assert all(e['state'] == 'complete' for e in first['workflow_events'])
    count = len(calls)
    def forbidden(*args):
        raise AssertionError('Reusing a saved result must not create providers')
    reused = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                             provider_factory=forbidden, reuse_completed=True)
    assert reused['id'] == first['id'] and len(calls) == count
    assert len(repo.studies()) == 1
    # Changing a material parameter creates a different experiment.
    changed = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=replace(integration, temperature=.5),
                              provider_factory=fake_factory(calls), reuse_completed=True)
    assert changed['id'] != first['id'] and len(repo.studies()) == 2


def test_failure_trace_keeps_original_and_shows_failed_optimizer(cfg):
    cfg, integration, repo = setup(cfg)
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                            provider_factory=fake_factory([], broken=integration.qwen_model))
    assert study['experiments'][0]['baseline']['text']
    assert [(e['stage'], e['state']) for e in study['workflow_events']] == [
        ('baseline', 'complete'), ('optimizer', 'error')]


def test_wizard_options_free_guard_run_and_saved_steps(cfg, monkeypatch):
    from app.prompt_optimization import optimize_prompts
    from tests.test_focused import factory
    cfg, integration, repo = setup(cfg)
    monkeypatch.setattr('app.config.load_settings', lambda: cfg)
    monkeypatch.setattr('dashboard.autopilot.load_integration_settings', lambda: integration)
    calls = []
    def controlled(*args, **kwargs):
        return optimize_prompts(*args, **kwargs, provider_factory=factory(calls))
    monkeypatch.setattr('dashboard.autopilot.optimize_prompts', controlled)
    root = Path(__file__).resolve().parents[1]
    app = AppTest.from_file(str(root / 'dashboard/streamlit_app.py'), default_timeout=40).run()
    assert not app.exception, app.exception
    next(b for b in app.button if b.label == 'Continue to prompt').click().run()
    assert not app.multiselect and not app.text_input and not app.number_input and not app.checkbox
    app.text_area(key='autopilot_prompt').set_value(SAMPLES[0]['prompt']).run()
    next(b for b in app.button if b.label == 'Continue to run').click().run()
    next(b for b in app.button if b.label == 'Run autopilot').click().run()
    assert not app.exception, app.exception
    assert app.session_state['autopilot_step'] == 3
    assert app.session_state['study']['status'] == 'completed'
    assert any(e.label == 'Steps completed in this run' for e in app.expander)
    next(b for b in app.button if b.label == 'Prepare another prompt').click().run()
    assert app.text_area(key='autopilot_prompt').value == SAMPLES[0]['prompt']
    next(b for b in app.button if b.label == 'Continue to run').click().run()
    count = len(calls)
    next(b for b in app.button if b.label == 'Run autopilot').click().run()
    assert not app.exception, app.exception
    assert len(calls) == count and len(repo.studies()) == 1
    assert 'No new requests' in app.session_state['autopilot_last_message']
