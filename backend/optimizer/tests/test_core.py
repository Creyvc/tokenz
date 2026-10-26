import json
from dataclasses import replace

import httpx
import pytest

from app.batch import load_dataset, run_batch
from app.config import ROOT, ProviderConfig, load_settings
from app.engine import Budget, Engine, cost, metrics
from app.evaluation import DIMENSIONS, automatic_check, manual_evaluation, summarize
from app.providers import ChatProvider, Completion, ProviderError
from app.storage import Repository
from app.tokens import TokenCounter


class Fake:
    def __init__(self, text='Short prompt', inp=10, out=5, finish='stop', error=None):
        self.text, self.inp, self.out, self.finish, self.error = text, inp, out, finish, error
        self.requests = []

    def complete(self, messages, max_tokens, temperature):
        self.requests.append((messages, max_tokens, temperature))
        if self.error:
            raise self.error
        text = json.dumps({'optimized_prompt':self.text}) if any('OUTPUT CONTRACT v2' in m['content'] for m in messages) else self.text
        return Completion(text, self.inp, self.out, 12., 'request-1', 'test-model', self.finish)


def build(cfg, **kwargs):
    return Engine(cfg, Repository(cfg.database, cfg.store), **kwargs)


def test_startup_without_keys(monkeypatch):
    monkeypatch.setenv('TOKENZ_DEMO', 'true')
    assert load_settings().demo


def test_tokenizer_repeatable_and_special_strings():
    counter = TokenCounter('unknown-model')
    assert counter.count('Hello world') == 2
    assert counter.count('') == 0
    assert counter.count('<|endoftext|>') > 0
    assert counter.count('สวัสดี 世界') == counter.count('สวัสดี 世界')
    assert counter.fallback_used


def test_price_unknown_is_not_free(cfg):
    assert cost(100, 200, cfg.providers['openai']) == .0005
    assert cost(None, 10, cfg.providers['openai']) is None
    assert cost(10, 10, ProviderConfig('qwen')) is None


def test_pipeline_same_target_configuration_and_exact_original(cfg):
    cfg = replace(cfg, demo=False)
    optimizer, target = Fake('Summarize in JSON.'), Fake('answer')
    engine = build(cfg, providers={'qwen': optimizer, 'openai': target})
    prompt = 'Hi ChatGPT, I would like you to please summarize in JSON. Thank you very much.\n'
    row = engine.run(prompt)
    assert row['status'] == 'completed'
    assert row['original_prompt'] == prompt
    assert row['optimized_prompt'] == 'Summarize in JSON.'
    assert target.requests[0][1:] == target.requests[1][1:]
    assert target.requests[0][0][0]['content'] == prompt
    assert row['metrics']['baseline_total_tokens'] == 15
    assert row['metrics']['tokenz_total_tokens'] == 30
    assert row['metrics']['net_token_difference'] == -15
    assert row['metrics']['research_spend_usd'] == pytest.approx(.00006)
    assert engine.repo.get(row['id']) == row
    assert 'secret-not-logged' not in json.dumps(row)


def test_no_savings_falls_back_and_reuses_target(cfg):
    optimizer, target = Fake('a much longer candidate than the prompt'), Fake('answer')
    row = build(cfg, providers={'qwen': optimizer, 'openai': target}).run('Hi')
    assert row['optimized_prompt'] == 'Hi'
    assert row['optimized_response_reused']
    assert len(target.requests) == 1
    assert 'NO_TOKEN_SAVING' in row['failures']


def test_adaptive_skip_does_not_call_optimizer(cfg):
    optimizer, target = Fake(), Fake('answer')
    row = build(cfg, providers={'qwen': optimizer, 'openai': target}).run('Hello', adaptive=True)
    assert not optimizer.requests
    assert len(target.requests) == 1
    assert row['metrics']['optimizer_total_tokens'] == 0


def test_delete_only_enforced(cfg):
    row = build(cfg, providers={'qwen': Fake('Invented!'), 'openai': Fake('answer')}).run(
        'Hello please calculate sales for the North region.', strategy='delete_only')
    assert 'DELETE_ONLY_VIOLATION' in row['failures']


def test_optimizer_answer_or_missing_numbers_falls_back(cfg):
    class AnsweredTask(Fake):
        def complete(self, *args):
            return Completion('["Ada","Ben"]',10,5,1,finish_reason='stop')
    row = build(cfg, providers={'qwen':AnsweredTask(), 'openai':Fake()}).run('Extract Ada and Ben. Return JSON only.')
    assert 'INVALID_OPTIMIZER_OUTPUT' in row['failures']
    row = build(cfg, providers={'qwen':Fake('Write an email.'), 'openai':Fake()}).run('Write an email about a meeting on 12 November 2026.')
    assert 'CRITICAL_NUMBER_LOST' in row['failures']


def test_truncated_optimizer_falls_back(cfg):
    row = build(cfg, providers={'qwen': Fake('Short', finish='length'), 'openai': Fake()}).run('Some longer original prompt.')
    assert 'OPTIMIZER_TRUNCATED_OR_INCOMPLETE' in row['failures']
    assert row['optimized_prompt'] == row['original_prompt']


def test_partial_failure_is_saved(cfg):
    cfg = replace(cfg, demo=False)
    engine = build(cfg, providers={'qwen': Fake('Short'), 'openai': Fake(error=ProviderError('TIMEOUT', 'Timed out'))})
    row = engine.run('Some longer original prompt with instructions.')
    assert row['status'] == 'failed'
    assert len(row['optimizer_calls']) == 1
    assert row['billing_uncertain']
    assert engine.repo.get(row['id'])['error']['stage'] == 'baseline'
    assert engine.budget.uncertain


def test_missing_usage_remains_unknown_and_blocks_next_call(cfg):
    cfg = replace(cfg, demo=False)
    row = build(cfg, providers={'qwen': Fake('Short', inp=None), 'openai': Fake()}).run('Some longer prompt to optimize.')
    assert row['error']['code'] == 'BILLING_UNCERTAIN'
    assert row['metrics']['optimizer_total_tokens'] is None
    assert row['metrics']['research_spend_usd'] is None


def test_budget_prevents_request(cfg):
    cfg = replace(cfg, demo=False, budget=.000001)
    fake = Fake()
    row = build(cfg, providers={'qwen': fake, 'openai': Fake()}).run('Some prompt.')
    assert row['error']['code'] == 'BUDGET_EXCEEDED'
    assert not fake.requests


def test_budget_restores_attempts(cfg):
    budget = Budget(5)
    budget.restore([{'paid_calls': [{'cost_usd': .2}]}, {'paid_calls': [{'cost_usd': .3}]}])
    assert budget.spent == .5
    budget.restore([{'billing_uncertain': True}])
    with pytest.raises(ProviderError, match='unknown'):
        budget.check([], 5, cfg.providers['openai'])


def test_quality_zero_and_invalid():
    zero, ten = dict.fromkeys(DIMENSIONS, 0), dict.fromkeys(DIMENSIONS, 10)
    assert manual_evaluation(zero, ten)['quality_retention_pct'] is None
    assert manual_evaluation(ten, ten)['quality_retention_pct'] == 100
    with pytest.raises(ValueError):
        manual_evaluation(ten, {**ten, 'correctness': float('nan')})
    with pytest.raises(ValueError):
        manual_evaluation(ten, {**ten, 'correctness': None})


def test_quality_recalculates_metrics(cfg):
    cfg = replace(cfg, demo=False)
    engine = build(cfg, providers={'qwen': Fake(), 'openai': Fake()})
    row = engine.run('Original prompt containing much more detailed instructions than the candidate.')
    engine.evaluate(row, dict.fromkeys(DIMENSIONS, 10), dict.fromkeys(DIMENSIONS, 9))
    assert row['metrics']['quality_retention_pct'] == 90
    assert len(row['evaluation_history']) == 1


@pytest.mark.parametrize('kind,answer,expected', [('numeric','2.0',True),('numeric','NaN',False),
                                               ('json','{"x":2}',True), ('json','oops',False),
                                               ('exact','Hello',True), ('python_syntax','def x(:',False)])
def test_automatic_checks(kind, answer, expected):
    target = {'numeric':2, 'json':{'x':2}, 'exact':'Hello', 'python_syntax':None}[kind]
    assert automatic_check(answer, {'kind':kind, 'expected':target}) is expected


def test_data_storage_can_be_disabled(cfg):
    cfg = replace(cfg, store=False)
    engine = build(cfg)
    row = engine.run('Hi ChatGPT, please do a short explanation.')
    assert row['status'] == 'completed'
    assert engine.repo.all() == []
    assert not cfg.database.exists()


@pytest.mark.parametrize('status,code', [(401,'AUTHENTICATION'), (429,'RATE_LIMIT'), (402,'QUOTA_EXHAUSTED'), (404,'INVALID_MODEL'), (500,'PROVIDER_UNAVAILABLE')])
def test_transport_errors_do_not_echo_secrets(cfg, status, code):
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json={'error':'secret-not-logged'}))
    provider = ChatProvider(cfg.providers['qwen'], transport=transport)
    with pytest.raises(ProviderError) as caught:
        provider.complete([{'role':'user', 'content':'Hi'}], 20, 0)
    assert caught.value.code == code
    assert 'secret-not-logged' not in str(caught.value)


def test_transport_usage_and_payload(cfg):
    def respond(request):
        body = json.loads(request.content)
        assert body['max_completion_tokens'] == 30
        assert 'temperature' not in body
        return httpx.Response(200, json={'id':'id1', 'model':'resolved-model',
                                       'choices':[{'message':{'content':'  Exact response\n'}, 'finish_reason':'stop'}],
                                       'usage':{'prompt_tokens':12, 'completion_tokens':9}})
    response = ChatProvider(cfg.providers['openai'], transport=httpx.MockTransport(respond)).complete([],30,None)
    assert response.text == '  Exact response\n'
    assert response.input_tokens == 12
    assert response.model == 'resolved-model'


def test_malformed_transport_response(cfg):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={'choices':[]}))
    with pytest.raises(ProviderError) as caught:
        ChatProvider(cfg.providers['qwen'], transport=transport).complete([],10,0)
    assert caught.value.code == 'INVALID_RESPONSE'


def test_dataset_categories_and_unique_ids():
    rows, digest = load_dataset(ROOT / 'datasets/prompts.jsonl')
    assert len(rows) == 30 and len(digest) == 64
    assert len({r['category'] for r in rows}) == 10
    for category in {r['category'] for r in rows}:
        assert sum(r['category'] == category for r in rows) == 3


def test_batch_resume(cfg):
    repo = Repository(cfg.database)
    first = run_batch(cfg, repo, ROOT / 'datasets/prompts.jsonl', ['qwen'], ['structured'], limit=3)
    second = run_batch(cfg, repo, ROOT / 'datasets/prompts.jsonl', ['qwen'], ['structured'], limit=3)
    assert len(first) == 3 and len(second) == 0
    assert len(repo.all()) == 3


def test_statistics_exclude_demos_and_archived_attempts():
    base = {'status':'completed', 'optimizer_provider':'qwen', 'metrics':{
        'chatgpt_input_reduction_pct':30, 'quality_retention_pct':90, 'cost_difference_usd':-.01,
        'latency_difference_ms':500}}
    rows = [base, {**base, 'demo':True}, {**base, 'archived_attempt':True},
            {'status':'failed', 'optimizer_provider':'qwen', 'metrics':{}}]
    result = summarize(rows)[0]
    assert result['experiments'] == 2
    assert result['failure_rate'] == .5
    assert result['quality_samples'] == 1
    assert result['quality_drop_fraction'] == 1
    assert result['net_saving_fraction'] == 0


def test_cost_metrics_include_every_optimizer_attempt():
    call = {'input_tokens':10,'output_tokens':5,'cost_usd':.01,'latency_ms':10}
    row = {'optimizer_calls':[call,call], 'baseline':call,'optimized_response':call,
           'original_prompt_tokens':20,'optimized_prompt_tokens':10}
    result = metrics(row)
    assert result['tokenz_total_tokens'] == 45
    assert result['tokenz_cost_usd'] == .03
    assert result['total_tokenz_latency_ms'] == 30
