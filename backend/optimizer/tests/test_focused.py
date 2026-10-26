import json
from dataclasses import replace

import pytest

from app.evaluation import DIMENSIONS
from app.focused import run_focused
from app.providers import Completion, ProviderError
from app.study import SAMPLES, summary_text
from tests.test_methodology import setup


def factory(calls, failure=None):
    def make(config):
        assert config.name in {'groq', 'gemini'}
        class Fake:
            def complete(self, messages, max_tokens, temperature):
                calls.append((config.name, config.model, messages))
                if config.name == failure:
                    raise ProviderError('AUTHENTICATION', 'Test provider rejected access.')
                try:
                    payload = json.loads(messages[-1]['content'])
                except ValueError:
                    payload = {}
                if 'prompt_to_compress' in payload:
                    text = payload['prompt_to_compress'].replace('Hi, I would like you to please ', '').replace('Thank you very much.', '').strip()
                elif 'A' in payload:
                    text = json.dumps({'A': dict.fromkeys(DIMENSIONS, 9),
                                       'B': dict.fromkeys(DIMENSIONS, 9), 'notes': 'Controlled quality estimate.'})
                else:
                    text = 'A controlled answer.'
                return Completion(text, 100, 20, 15, model=config.model, finish_reason='stop')
        return Fake()
    return make


def test_two_native_models_independent_pairing_and_no_duplicate_dispatch(cfg):
    cfg, integration, repo = setup(cfg)
    calls, events = [], []
    study = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration,
                        provider_factory=factory(calls), on_event=events.append)
    assert study['status'] == 'completed' and len(study['experiments']) == 2
    assert {call[0] for call in calls} == {'groq', 'gemini'} and len(calls) == 8
    for row in study['experiments']:
        assert row['optimizer_model'] == row['target_model']
        assert row['original_prompt'] == SAMPLES[0]['prompt']
        assert row['metrics']['quality_retention_pct'] == 100
    assert len(study['workflow_events']) == 8
    assert 'Completed 2 of 2' in summary_text(study)
    def forbidden(*args):
        raise AssertionError('No providers may be created for an identical saved comparison')
    again = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=forbidden)
    assert again['id'] == study['id'] and len(repo.studies()) == 1


def test_unknown_free_plan_blocks_before_provider_creation(cfg):
    cfg, integration, repo = setup(cfg)
    calls = []
    with pytest.raises(ValueError, match='free-tier'):
        run_focused(cfg, repo, SAMPLES[0]['prompt'],
                    integration=replace(integration, gemini_free_tier_confirmed=False), provider_factory=factory(calls))
    assert not calls and not repo.studies()


def test_native_outage_does_not_hide_other_provider_answer(cfg):
    cfg, integration, repo = setup(cfg)
    study = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory([], 'groq'))
    assert study['status'] == 'partial'
    assert study['experiments'][0]['error']['code'] == 'AUTHENTICATION'
    assert study['experiments'][1]['optimized_response']['text']
    calls = []
    resumed = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory(calls))
    assert resumed['id'] == study['id'] and resumed['status'] == 'completed'
    assert {call[0] for call in calls} == {'groq'}
    assert len(repo.studies()) == 1 and len(resumed['attempt_history']) == 1


@pytest.mark.parametrize('stage', ['optimizer', 'target'])
def test_resume_reuses_successful_requests_inside_failed_model(cfg, stage):
    cfg, integration, repo = setup(cfg)
    calls = []
    def broken(config):
        inner = factory(calls)(config)
        answers = 0
        class Broken:
            def complete(self, messages, max_tokens, temperature):
                nonlocal answers
                is_answer = len(messages) == 1
                answers += int(is_answer)
                if config.name == 'groq' and ((stage == 'optimizer' and len(messages) > 1)
                                             or (stage == 'target' and is_answer and answers == 2)):
                    raise ProviderError('RATE_LIMIT', 'Test free limit reached.')
                return inner.complete(messages, max_tokens, temperature)
        return Broken()
    first = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=broken)
    assert first['status'] == 'partial' and first['experiments'][0]['baseline']['text']
    calls.clear()
    resumed = run_focused(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory(calls))
    assert resumed['status'] == 'completed' and resumed['id'] == first['id']
    assert len(calls) == (3 if stage == 'optimizer' else 2)
    assert all(call[0] == 'groq' for call in calls)
    restored = next(row for row in resumed['experiments'] if row['target_provider'] == 'groq')
    assert restored['baseline']['reused']
    if stage == 'target':
        assert restored['optimizer_calls'][0]['reused']
    assert restored['configuration']['optimizer_max_output'] == 256
    assert restored['configuration']['max_output'] == 4096
