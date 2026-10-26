from dataclasses import replace

import httpx
import pytest

from app.config import ProviderConfig
from app.engine import Engine
from app.live_setup import free_environment, readiness
from app.providers import ChatProvider, ProviderError
from app.storage import Repository
from tests.test_core import Fake


def config(model='liquid/lfm-2.5-2.6b:free'):
    return ProviderConfig('openrouter', model, 'https://openrouter.ai/api/v1', 'private-test-key', 0, 0)


def test_free_transport_checks_catalog_and_enforces_zero_price():
    calls = []
    def respond(request):
        calls.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json={'data': [{'id': config().model, 'pricing': {'prompt': '0', 'completion': '0'}}]})
        import json
        body = json.loads(request.content)
        assert body['provider']['max_price'] == {'prompt': 0, 'completion': 0, 'request': 0}
        assert body['provider']['allow_fallbacks'] is True
        assert 'models' not in body and 'tools' not in body
        return httpx.Response(200, json={'model': config().model,
                                        'choices': [{'message': {'content': 'result'}, 'finish_reason': 'stop'}],
                                        'usage': {'prompt_tokens': 8, 'completion_tokens': 2, 'cost': 0}})
    result = ChatProvider(config(), transport=httpx.MockTransport(respond)).complete([], 30, None)
    assert len(calls) == 2
    assert result.provider_cost_usd == 0


def test_optional_reasoning_is_disabled_and_parameters_recorded():
    def respond(request):
        if request.method == 'GET':
            return httpx.Response(200, json={'data': [{'id':config().model,'pricing':{'prompt':'0','completion':'0'},
                                                     'reasoning':{'mandatory':False}, 'supported_parameters':['reasoning']}]})
        import json
        assert json.loads(request.content)['reasoning'] == {'enabled':False}
        return httpx.Response(200, json={'model':config().model,'choices':[{'message':{'content':'OK'},'finish_reason':'stop'}],
                                        'usage':{'prompt_tokens':5,'completion_tokens':1,'cost':0}})
    result = ChatProvider(config(), transport=httpx.MockTransport(respond)).complete([],20,None)
    assert result.request_settings['reasoning'] == {'enabled':False}


@pytest.mark.parametrize('model', ['openai/gpt-5.6-terra', 'openrouter/auto', 'google/gemma-4-31b-it:free:nitro'])
def test_paid_model_blocked_before_network(model):
    def unexpected(request):
        pytest.fail('Network must not run for paid IDs')
    with pytest.raises(ProviderError) as caught:
        ChatProvider(config(model), transport=httpx.MockTransport(unexpected)).complete([], 20, None)
    assert caught.value.code == 'FREE_ONLY'


@pytest.mark.parametrize('data', [[], [{'id': config().model, 'pricing': {'prompt': '.001', 'completion': '0'}}],
                                [{'id': config().model, 'pricing': {'prompt': '0', 'completion': '0', 'request': '.01'}}]])
def test_removed_or_repriced_model_never_receives_completion(data):
    def respond(request):
        assert request.method == 'GET'
        return httpx.Response(200, json={'data': data})
    with pytest.raises(ProviderError) as caught:
        ChatProvider(config(), transport=httpx.MockTransport(respond)).complete([], 20, None)
    assert caught.value.code == 'FREE_MODEL_UNAVAILABLE'


def test_free_setup_requires_only_one_key():
    values = free_environment('private-test-key', config().model, 'google/gemma-4-31b-it:free')
    assert values['TOKENZ_FREE_ONLY'] == 'true'
    assert values['OPENROUTER_API_KEY'] == 'private-test-key'
    assert not any(k in values for k in ('OPENAI_API_KEY', 'QWEN_API_KEY'))
    with pytest.raises(ValueError):
        free_environment('key', config().model, 'openrouter/free')


def test_free_pipeline_and_rate_limit_resume(cfg):
    providers = {**cfg.providers, 'openrouter_optimizer': config(),
                 'openrouter_target': config('google/gemma-4-31b-it:free')}
    cfg = replace(cfg, demo=False, free_only=True, target='openrouter_target',
                  optimizer='openrouter_optimizer', providers=providers)
    assert readiness(cfg)['configured']
    assert readiness(cfg)['budget_usd'] == 0
    repo = Repository(cfg.database)
    engine = Engine(cfg, repo, providers={'openrouter_optimizer': Fake('Short'), 'openrouter_target': Fake('Answer')})
    row = engine.run('A considerably longer original prompt with several requirements.')
    assert row['status'] == 'completed'
    assert row['target_provider'] == 'openrouter'
    assert row['metrics']['research_spend_usd'] == 0
    assert row['metrics']['quality_retention_pct'] is None
    limited = Engine(cfg, repo, providers={'openrouter_optimizer': Fake(error=ProviderError('RATE_LIMIT', 'Limit'))})
    failed = limited.run('A longer prompt for a rate limit.')
    assert failed['error']['code'] == 'RATE_LIMIT'
    assert not failed['billing_uncertain']
    assert not limited.budget.uncertain
    blocked = engine.run('A prompt.', provider='qwen')
    assert blocked['status'] == 'failed'
    assert blocked['paid_calls'] == []
