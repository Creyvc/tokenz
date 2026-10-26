"""The JSON bridge the website's local API runs (../web_api.py). No provider is ever called here."""
import io
import json
import sys

import pytest

from app import bridge


@pytest.fixture
def no_keys(monkeypatch):
    for name in ('GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'):
        monkeypatch.setenv(name, '')


def run(monkeypatch, capsys, command, request=None):
    monkeypatch.setattr(sys, 'argv', ['bridge', command])
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps(request or {})))
    bridge.main()
    return json.loads(capsys.readouterr().out.strip().splitlines()[-1])


def test_status_lists_the_two_website_models(monkeypatch, capsys, no_keys):
    reply = run(monkeypatch, capsys, 'status')
    assert reply['available'] is False
    assert [row['key'] for row in reply['optimizers']] == ['qwen', 'gemini_flash', 'gpt_oss_120b']


def test_optimize_without_keys_is_not_configured_and_sends_nothing(monkeypatch, capsys, no_keys):
    monkeypatch.setattr(bridge, 'optimize_prompts', lambda *a, **k: pytest.fail('must not dispatch'))
    reply = run(monkeypatch, capsys, 'optimize', {'prompt': 'Please add 4 and 7.'})
    assert reply['code'] == 'NOT_CONFIGURED' and 'API key missing' in reply['error']


def test_optimize_checks_its_input_first(monkeypatch, capsys):
    assert run(monkeypatch, capsys, 'optimize', {'prompt': ' '})['code'] == 'BAD_REQUEST'
    assert run(monkeypatch, capsys, 'optimize', {'prompt': 'Hi', 'encoding': 'latin1'})['code'] == 'BAD_REQUEST'
    assert run(monkeypatch, capsys, 'nonsense')['code'] == 'BAD_REQUEST'


def test_website_runs_are_not_saved(monkeypatch, capsys):
    seen = {}
    monkeypatch.setattr(bridge, 'status', lambda: {'available': True, 'optimizers': []})

    def fake(settings, repo, prompt, integration, keys):
        seen.update(store=settings.store, repo=repo.enabled, encoding=settings.encoding, prompt=prompt,
                    keys=keys, timeout=integration.timeout)
        return {'status': 'completed', 'original_tokens': 5, 'optimizations': []}
    monkeypatch.setattr(bridge, 'optimize_prompts', fake)
    reply = run(monkeypatch, capsys, 'optimize', {'prompt': 'Hi there, add 4 and 7.', 'encoding': 'cl100k_base'})
    assert reply['status'] == 'completed'
    assert seen == {'store': False, 'repo': False, 'encoding': 'cl100k_base', 'prompt': 'Hi there, add 4 and 7.',
                    'keys': ('qwen', 'gemini_flash'), 'timeout': bridge.WEBSITE_SECONDS}
    run(monkeypatch, capsys, 'optimize', {'prompt': 'Hi', 'models': ['gemini_flash']})
    assert seen['keys'] == ('gemini_flash',)
    run(monkeypatch, capsys, 'optimize', {'prompt': 'Hi', 'models': ['gpt_oss_120b']})
    assert seen['keys'] == ('gpt_oss_120b',)


def test_optimize_rejects_unknown_or_repeated_models(monkeypatch, capsys):
    for models in ([], ['gpt'], ['qwen', 'qwen'], 'qwen', ['openrouter_free']):
        assert run(monkeypatch, capsys, 'optimize', {'prompt': 'Hi', 'models': models})['code'] == 'BAD_REQUEST'
