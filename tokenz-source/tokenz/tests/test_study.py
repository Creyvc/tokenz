import json
from dataclasses import replace

import httpx

from app.config import ProviderConfig
from app.connection import check_connection
from app.evaluation import DIMENSIONS
from app.providers import Completion, DemoProvider, ProviderError
from app.report import html_report
from app.storage import Repository
from app.study import DEFAULT_TARGETS, SAMPLES, result_rows, run_study, summary_text
from app.tokens import TokenCounter


def settings(cfg):
    providers = dict(cfg.providers)
    providers['openrouter_target'] = ProviderConfig('openrouter', DEFAULT_TARGETS[0],
                                                   'https://openrouter.ai/api/v1', 'private-test-key', 0, 0)
    return replace(cfg, providers=providers, delay=0)


class Target:
    def __init__(self, cfg, calls):
        self.cfg, self.calls = cfg, calls

    def complete(self, messages, max_tokens, temperature):
        self.calls.append(self.cfg.model)
        prompt = messages[-1]['content']
        if messages[0]['role'] == 'system':
            text = json.dumps({'A': dict.fromkeys(DIMENSIONS, 9), 'B': dict.fromkeys(DIMENSIONS, 9),
                               'notes': 'Preserves required answer.'})
        elif 'train' in prompt:
            text = '80'
        elif 'Ada' in prompt:
            text = '["Ada", "Ben", "Ada"]'
        else:
            text = 'I cannot attend on 12 November 2026. Could we meet on 14 November at 10:00 UTC instead?'
        return Completion(text, TokenCounter().count(prompt), TokenCounter().count(text), 5,
                          'request-' + str(len(self.calls)), self.cfg.model, 'stop', provider_cost_usd=0)


def test_real_shaped_matrix_checks_scores_and_reports(cfg):
    cfg = settings(cfg)
    repo, calls = Repository(cfg.database), []
    optimizer_calls = []
    def factory(config, optimizer):
        if not optimizer:
            return Target(config, calls)
        demo = DemoProvider(TokenCounter(), True)
        class Compressor:
            def complete(self, *args):
                optimizer_calls.append(1)
                return demo.complete(*args)
        return Compressor()
    study = run_study(cfg, repo, SAMPLES, targets=DEFAULT_TARGETS[:2], provider_factory=factory,
                      connection_check=lambda key: {'ok': True})
    assert study['status'] == 'completed'
    assert len(study['experiments']) == 6
    assert len(optimizer_calls) == 3  # one candidate per prompt, shared across targets
    assert all(row['metrics']['quality_retention_pct'] == 100 for row in study['experiments'])
    assert all(row['automatic_checks']['optimized_response'] for row in study['experiments'] if row.get('automatic_checks'))
    assert all(r['metrics']['research_spend_usd'] == 0 for r in study['experiments'])
    text = summary_text(study)
    assert 'Completed 6 of 6' in text
    assert 'Best measured' in text
    assert 'private-test-key' not in json.dumps(study)
    assert repo.studies()[0]['id'] == study['id']
    assert len(result_rows(study)) == 6
    def no_network(key):
        raise AssertionError('Completed studies must not call the provider again')
    resumed = run_study(cfg, repo, SAMPLES, targets=DEFAULT_TARGETS[:2], provider_factory=factory,
                        connection_check=no_network, previous=study)
    assert resumed['status'] == 'completed'


def test_invalid_key_blocks_all_model_calls(cfg):
    cfg = settings(cfg)
    def unexpected(*args):
        raise AssertionError('No completion should run')
    study = run_study(cfg, Repository(cfg.database), SAMPLES[:1], provider_factory=unexpected,
                      connection_check=lambda key: {'ok': False, 'message': 'Replace key'})
    assert study['status'] == 'blocked'
    assert not study['experiments']
    assert f'Completed 0 of {len(DEFAULT_TARGETS)}' in summary_text(study)


def test_resume_keeps_successful_comparisons(cfg):
    cfg, calls = settings(cfg), []
    repo = Repository(cfg.database)
    def first(config, optimizer):
        if optimizer:
            return DemoProvider(TokenCounter(), True)
        if config.model == DEFAULT_TARGETS[0]:
            class Broken:
                def complete(self, *args):
                    raise ProviderError('PROVIDER_UNAVAILABLE', 'Busy')
            return Broken()
        return Target(config, calls)
    study = run_study(cfg, repo, SAMPLES[:1], targets=DEFAULT_TARGETS[:2], judge=False,
                      provider_factory=first, connection_check=lambda key: {'ok': True})
    assert study['status'] == 'partial'
    success_id = next(r['id'] for r in study['experiments'] if r['status'] == 'completed')
    def second(config, optimizer):
        return DemoProvider(TokenCounter(), True) if optimizer else Target(config, calls)
    resumed = run_study(cfg, repo, SAMPLES[:1], targets=DEFAULT_TARGETS[:2], judge=False, previous=study,
                        provider_factory=second, connection_check=lambda key: {'ok': True})
    assert resumed['status'] == 'completed'
    assert success_id in [r['id'] for r in resumed['experiments']]
    assert len(resumed['attempt_history']) == 1


def test_preview_never_claims_winner(cfg):
    study = run_study(settings(cfg), Repository(cfg.database), SAMPLES[:1], targets=DEFAULT_TARGETS[:2], demo=True)
    text = summary_text(study)
    assert study['status'] == 'completed'
    assert 'Sample preview' in text
    assert 'Best measured' not in text
    study['experiments'][0]['original_prompt'] = '<script>alert(1)</script>'
    html = html_report(study)
    assert '<script>' not in html
    assert '&lt;script&gt;' in html
    assert 'Sample preview' in html


def test_failed_exact_check_recommends_original(cfg):
    study = run_study(settings(cfg), Repository(cfg.database), SAMPLES[:1], targets=DEFAULT_TARGETS[:1], demo=True)
    study['demo'] = False
    row = study['experiments'][0]
    row['automatic_checks'] = {'baseline':True,'optimized_response':False}
    assert result_rows(study)[0]['Recommendation'] == 'Use original'
    assert '1 shortened answers failed exact checks' in summary_text(study)
    row['automatic_checks']['baseline'] = False
    assert result_rows(study)[0]['Recommendation'] == 'Neither passed'


def test_account_health_codes_and_secret_safety():
    secret = 'sk-or-test-private-never-display-123'
    invalid = check_connection(secret, httpx.MockTransport(lambda r: httpx.Response(401, json={'error': secret})))
    assert invalid['code'] == 'AUTHENTICATION'
    assert secret not in json.dumps(invalid)
    quota = check_connection('secret', httpx.MockTransport(lambda r: httpx.Response(200, json={'data': {'free_model_daily_requests': {'remaining': 0}}})))
    assert quota['code'] == 'DAILY_LIMIT'
    assert quota['authenticated'] and not quota['ok']
    valid = check_connection('secret', httpx.MockTransport(lambda r: httpx.Response(200, json={'data': {}})))
    assert valid['ok']


def test_failed_review_resumes_without_regenerating_answers(cfg):
    cfg, calls, reject_judge = settings(cfg), [], [True]
    repo = Repository(cfg.database)
    def factory(config, optimizer):
        if optimizer:
            return DemoProvider(TokenCounter(), True)
        target = Target(config, calls)
        class FlakyReview:
            def complete(self, messages, *args):
                if messages[0]['role'] == 'system' and reject_judge[0]:
                    raise ProviderError('RATE_LIMIT', 'Reviewer busy')
                return target.complete(messages, *args)
        return FlakyReview()
    first = run_study(cfg, repo, SAMPLES[:1], targets=DEFAULT_TARGETS[:1], provider_factory=factory,
                      connection_check=lambda key: {'ok': True})
    assert first['status'] == 'partial'
    assert len(calls) == 2
    request_id = first['experiments'][0]['baseline']['request_id']
    reject_judge[0] = False
    resumed = run_study(cfg, repo, SAMPLES[:1], targets=DEFAULT_TARGETS[:1], provider_factory=factory,
                        connection_check=lambda key: {'ok': True}, previous=first)
    assert resumed['status'] == 'completed'
    assert len(calls) == 3  # only the review was added
    assert resumed['experiments'][0]['baseline']['request_id'] == request_id


def test_answers_published_before_quality_review_finishes(cfg):
    cfg, calls, updates = settings(cfg), [], []

    def factory(config, optimizer):
        return DemoProvider(TokenCounter(), True) if optimizer else Target(config, calls)

    def observe(study):
        updates.append({'status': study['status'], 'answered': any(
            r.get('optimized_response', {}).get('text') and not r.get('evaluation')
            for r in study['experiments'])})

    study = run_study(cfg, Repository(cfg.database), SAMPLES[:1], targets=DEFAULT_TARGETS[:1],
                      provider_factory=factory, connection_check=lambda key: {'ok': True}, on_update=observe)
    assert study['status'] == 'completed'
    assert any(update['answered'] and update['status'] == 'running' for update in updates)
    assert updates[-1]['status'] == 'completed'
