
from streamlit.testing.v1 import AppTest

from app.config import ProviderConfig
from app.integration_config import IntegrationConfig


def view(tmp_path, monkeypatch, cfg, connected):
    import dashboard.methodology_view as ui

    integration = IntegrationConfig(
        groq_api_key='groq-ui-secret' if connected else '',
        gemini_api_key='gemini-ui-secret' if connected else '',
        openrouter_api_key='router-ui-secret' if connected else '',
        groq_free_tier_confirmed=connected, gemini_free_tier_confirmed=connected)
    cfg.providers['openrouter_target'] = ProviderConfig(
        'openrouter', 'fixed/answer:free', 'https://openrouter.ai/api/v1', 'router-ui-secret', 0, 0)
    monkeypatch.setattr(ui, 'load_integration_settings', lambda: integration)
    monkeypatch.setattr('app.config.load_settings', lambda: cfg)
    script = tmp_path / 'methodology_view_test.py'
    script.write_text('''
from app.config import load_settings
from app.storage import Repository
from dashboard.methodology_view import render_methodology, render_provider_settings
cfg = load_settings()
render_methodology(cfg, Repository(cfg.database), None)
render_provider_settings()
''', encoding='utf-8')
    return AppTest.from_file(str(script), default_timeout=40).run()


def test_missing_optional_keys_show_clear_disabled_controls(tmp_path, monkeypatch, cfg):
    app = view(tmp_path, monkeypatch, cfg, connected=False)
    assert not app.exception, app.exception
    run = next(button for button in app.button if button.label == 'Run optimizer study')
    assert run.disabled
    assert any('No optimizer is configured' in warning.value for warning in app.warning)
    assert any('OpenAI' in info.value and 'blocked' in info.value for info in app.info)


def test_strategy_threshold_override_and_paid_target_guard(tmp_path, monkeypatch, cfg):
    app = view(tmp_path, monkeypatch, cfg, connected=True)
    assert not app.exception, app.exception
    assert len(app.multiselect[0].options) == 5
    app.text_area(key='methodology_prompt_draft').set_value('Please explain rain.').run()
    assert any('already short' in warning.value for warning in app.warning)
    assert any(box.label == 'Optimize this short prompt anyway' for box in app.checkbox)
    strategy = next(box for box in app.selectbox if box.label == 'Compression strategy')
    strategy.select('target_ratio').run()
    ratio = next(slider for slider in app.slider if slider.label.startswith('Approximate percentage'))
    assert not ratio.disabled
    target = next(field for field in app.text_input if field.label == 'Answer model ID')
    target.set_value('gpt-5.5').run()
    assert next(button for button in app.button if button.label == 'Run optimizer study').disabled
    assert not app.exception, app.exception
    # Secret values are never rendered as ordinary text or provider table cells.
    text = ' '.join(item.value for item in app.markdown)
    assert 'groq-ui-secret' not in text and 'gemini-ui-secret' not in text
