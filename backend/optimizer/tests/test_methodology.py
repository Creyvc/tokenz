import json
from dataclasses import replace

import pytest

from app.config import ProviderConfig
from app.human_review import DIMENSIONS, save_human_review
from app.integration_config import IntegrationConfig
from app.methodology import run_methodology
from app.providers import Completion, ProviderError
from app.storage import Repository
from app.study import SAMPLES, result_rows


def setup(cfg):
    target = ProviderConfig('openrouter', 'fixed/target:free', 'https://openrouter.ai/api/v1', 'router-secret', 0, 0)
    cfg = replace(cfg, demo=False, free_only=True, delay=0,
                  providers={**cfg.providers, 'openrouter_target': target})
    integration = IntegrationConfig(groq_api_key='groq-secret', gemini_api_key='gemini-secret',
                                     openrouter_api_key='router-secret', groq_free_tier_confirmed=True,
                                     gemini_free_tier_confirmed=True)
    return cfg, integration, Repository(cfg.database)


def fake_factory(events, broken=None):
    def make(config, optimizer):
        class Fake:
            def complete(self, messages, max_tokens, temperature):
                events.append((config.name, config.model, optimizer, messages, max_tokens, temperature))
                if optimizer and config.model == broken:
                    raise ProviderError('RATE_LIMIT', 'This free model is busy.')
                if optimizer:
                    text = json.loads(messages[-1]['content'])['prompt_to_compress']
                    text = text.replace('Hi, I would like you to please ', '').replace('Thank you very much.', '').strip()
                else:
                    text = 'A controlled model answer.'
                return Completion(text, 80 if not optimizer else 160, 40, 15, model=config.model, finish_reason='stop')
        return Fake()
    return make


def test_independent_optimizers_share_fixed_baseline_and_canonical_prompt(cfg):
    cfg, integration, repo = setup(cfg)
    events = []
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen', 'gpt_oss_20b', 'gemini_flash'],
                            integration=integration, provider_factory=fake_factory(events))
    assert study['status'] == 'completed'
    assert len(study['experiments']) == 3
    assert events[0][2] is False  # Original baseline is generated before any optimization.
    optimizer_events = [event for event in events if event[2]]
    assert len(optimizer_events) == 3
    # All fake optimizers independently produce identical rewrites; the exact
    # target request is reused and marked, rather than spending three requests.
    assert len([event for event in events if not event[2]]) == 2
    assert len({event[3][0]['content'] for event in optimizer_events}) == 1
    for event in optimizer_events:
        assert json.loads(event[3][-1]['content'])['prompt_to_compress'] == SAMPLES[0]['prompt']
    for row in study['experiments']:
        assert row['optimizer_prompt_version'] == 'optimizer_prompt_v1'
        assert row['baseline']['model'] == row['optimized_response']['model'] == 'fixed/target:free'
        assert row['configuration']['target']['provider'] == 'openrouter'
        assert row['free_only'] and not row.get('judge_calls')
        assert row['original_prompt'] == SAMPLES[0]['prompt']
    assert sum(r['optimized_response']['reused'] for r in study['experiments']) == 2
    assert not any(secret in json.dumps(study) for secret in ['router-secret', 'groq-secret', 'gemini-secret'])


@pytest.mark.parametrize('target', ['gpt-5.5', 'openai/gpt-5.5', 'openrouter/free', 'vendor/paid'])
def test_paid_or_dynamic_target_blocked_before_any_dispatch(cfg, target):
    cfg, integration, repo = setup(cfg)
    events = []
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                            target_model=target, provider_factory=fake_factory(events))
    assert study['status'] == 'blocked'
    assert not events and not study['experiments']


def test_no_free_plan_attestation_blocks_whole_experiment_before_baseline(cfg):
    cfg, integration, repo = setup(cfg)
    events = []
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'],
                            integration=replace(integration, groq_free_tier_confirmed=False),
                            provider_factory=fake_factory(events))
    assert study['status'] == 'blocked' and not events


def test_optimizer_outage_preserves_original_answer_and_other_optimizer(cfg):
    cfg, integration, repo = setup(cfg)
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen', 'gpt_oss_20b'], integration=integration,
                            provider_factory=fake_factory([], broken=integration.qwen_model))
    assert study['status'] == 'partial'
    failed, completed = study['experiments']
    assert failed['status'] == 'failed' and failed['baseline']['text']
    assert failed['original_prompt'] == SAMPLES[0]['prompt']
    assert completed['status'] == 'completed'
    assert repo.studies()[0]['id'] == study['id']


def test_short_prompt_skip_and_manual_override(cfg):
    cfg, integration, repo = setup(cfg)
    prompt = [{'id': 'short', 'category': 'writing', 'prompt': 'Hi, I would like you to please explain rain.'}]
    events = []
    skipped = run_methodology(cfg, repo, prompt, ['qwen'], integration=integration,
                              adaptive=True, provider_factory=fake_factory(events))
    assert skipped['experiments'][0]['optimization_decision'] == 'skipped_below_configured_threshold'
    assert len(events) == 1
    events.clear()
    forced = run_methodology(cfg, repo, prompt, ['qwen'], integration=integration,
                             adaptive=False, provider_factory=fake_factory(events))
    assert forced['status'] == 'completed' and any(event[2] for event in events)


def test_resume_validates_generation_controls_and_does_not_repeat_completed_calls(cfg):
    cfg, integration, repo = setup(cfg)
    events = []
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                            provider_factory=fake_factory(events))
    events.clear()
    run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration, previous=study,
                    provider_factory=fake_factory(events))
    assert not events
    with pytest.raises(ValueError, match='original'):
        run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=replace(integration, temperature=.2),
                        previous=study, provider_factory=fake_factory(events))


def test_human_review_is_atomic_separate_and_can_override_failed_intention(cfg):
    from app.comparison import detailed_html_report
    from app.study import summary_text
    from dashboard.comparison_view import comparison_table

    cfg, integration, repo = setup(cfg)
    study = run_methodology(cfg, repo, SAMPLES[:1], ['qwen'], integration=integration,
                            provider_factory=fake_factory([]))
    row = study['experiments'][0]
    save_human_review(study, row['id'], dict.fromkeys(DIMENSIONS, 5), dict.fromkeys(DIMENSIONS, 2),
                       'No', 'A required constraint was lost.', repo)
    assert repo.get(row['id'])['human_review']['meaning_preserved'] == 'No'
    assert repo.studies()[0]['experiments'][0]['human_review'] == row['human_review']
    assert not row.get('evaluation')
    assert result_rows(study)[0]['Recommendation'] == 'Use original'
    exported = comparison_table(study, study['experiments']).iloc[0]
    assert exported['Human quality retained (%)'] == 40
    assert exported['Intention preserved'] == 'No'
    assert 'Human quality review, 1–5 scale' in detailed_html_report(study)
    assert '40.0% retained' in summary_text(study)
