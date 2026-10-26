import json
from dataclasses import replace

import httpx
import pytest
from dotenv import dotenv_values

from app.engine import Engine
from app.live_setup import PILOT_DEFAULTS, readiness, save_environment, validate_live_form
from app.providers import ChatProvider
from app.storage import Repository
from tests.test_core import Fake


def form_values():
    return {**PILOT_DEFAULTS, 'OPENAI_API_KEY': 'test-secret', 'QWEN_API_KEY': 'qwen-secret',
            'QWEN_BASE_URL': 'https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'}


def test_readiness_never_returns_secrets(cfg):
    result = readiness(cfg)
    assert result['configured']
    assert 'secret-not-logged' not in json.dumps(result)


def test_entire_pipeline_preflight_prevents_partial_spending(cfg):
    providers = dict(cfg.providers)
    providers['openai'] = replace(providers['openai'], api_key='')
    cfg = replace(cfg, demo=False, providers=providers)
    optimizer = Fake()
    row = Engine(cfg, Repository(cfg.database), providers={'qwen': optimizer, 'openai': Fake()}).run('A prompt.')
    assert not optimizer.requests
    assert row['error']['code'] == 'CONFIGURATION'
    assert row['paid_calls'] == []


def test_private_environment_atomic_roundtrip(tmp_path):
    path = tmp_path / '.env'
    path.write_text("KEEP_ME='value'\n", encoding='utf-8')
    secret = "some${HOME}$literal\\path'quote"
    save_environment({'OPENAI_API_KEY': secret}, path)
    values = dotenv_values(path, interpolate=False)
    assert values['OPENAI_API_KEY'] == secret
    assert values['KEEP_ME'] == 'value'
    assert not list(tmp_path.glob('.env-*'))


def test_environment_rejects_line_injection(tmp_path):
    with pytest.raises(ValueError):
        save_environment({'OPENAI_API_KEY': 'value\nTOKENZ_DEMO=false'}, tmp_path / '.env')


@pytest.mark.parametrize('url', ['http://workspace.aliyuncs.com/compatible-mode/v1',
                                'https://evil.test/compatible-mode/v1',
                                'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
                                'https://x.aliyuncs.com/compatible-mode/v1?key=secret'])
def test_setup_rejects_wrong_endpoint(url):
    values = form_values()
    values['QWEN_BASE_URL'] = url
    with pytest.raises(ValueError):
        validate_live_form(values)


def test_setup_validates_fields():
    validate_live_form(form_values())
    values = form_values()
    values['TOKENZ_MAX_EXPERIMENT_COST_USD'] = 'NaN'
    with pytest.raises(ValueError):
        validate_live_form(values)


def test_qwen_thinking_disabled_and_openai_reasoning_recorded(cfg):
    seen = []
    def reply(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': 'done'}, 'finish_reason': 'stop'}],
                                        'usage': {'prompt_tokens': 3, 'completion_tokens': 1}})
    transport = httpx.MockTransport(reply)
    qwen = replace(cfg.providers['qwen'], enable_thinking=False)
    openai = replace(cfg.providers['openai'], reasoning_effort='none')
    ChatProvider(qwen, transport=transport).complete([], 20, 0)
    ChatProvider(openai, transport=transport).complete([], 20, None)
    assert seen[0]['enable_thinking'] is False
    assert seen[1]['reasoning_effort'] == 'none'
    assert qwen.public()['enable_thinking'] is False
