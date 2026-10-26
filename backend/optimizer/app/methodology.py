"""Independent optimizer experiments with a fixed free target and human review.

The specification's paid OpenAI target is deliberately unavailable. Every live
experiment here is explicitly identified as a free-target alternative.
"""

import hashlib
import json
import time
import uuid
from dataclasses import replace
from datetime import UTC, datetime

from app.config import ROOT, ProviderConfig
from app.engine import Engine
from app.integration_config import get_optimizer_config, load_integration_settings, optimizer_registry
from app.integration_providers import make_integration_provider
from app.live_setup import is_free_model
from app.providers import ChatProvider, ProviderError
from app.study import MemoProvider

STRATEGIES = {
    'balanced': ('structured', 'Reduce redundant wording while strongly prioritizing meaning preservation.'),
    'conservative': ('simple', 'Remove only obvious filler and duplication. Prefer keeping every detail over brevity.'),
    'aggressive': ('aggressive', 'Compress strongly, retaining all essential instructions, inputs and constraints.'),
    'target_ratio': ('structured', ('Aim for approximately {target_percent}% of the original prompt tokens, '
                     'without sacrificing information. The ratio is a goal, not a guarantee.')),
}


def run_methodology(settings, repo, prompts, optimizer_keys, integration=None, target_model=None,
                    strategy='balanced', target_ratio=.75, adaptive=False, judge=False,
                    progress=None, on_update=None, previous=None, provider_factory=None,
                    on_event=None, reuse_completed=False):
    integration = integration or load_integration_settings()
    if not optimizer_keys or len(set(optimizer_keys)) != len(optimizer_keys):
        raise ValueError('Select one or more distinct optimizers explicitly.')
    if strategy not in STRATEGIES or not 0 < target_ratio <= 1:
        raise ValueError('Choose a supported strategy and a target ratio greater than zero and at most one.')
    if not prompts or any(not isinstance(p.get('prompt'), str) or not p['prompt'].strip() for p in prompts):
        raise ValueError('Provide at least one nonempty prompt.')
    if len({p.get('id', 'custom') for p in prompts}) != len(prompts):
        raise ValueError('Each prompt needs a distinct ID.')
    registry = optimizer_registry(integration)
    if any(key not in registry for key in optimizer_keys):
        raise ValueError('Unknown optimizer selection. Check the central model registry.')
    original_target = settings.providers.get('openrouter_target', ProviderConfig('openrouter'))
    target_model = target_model or original_target.model
    target_key = integration.openrouter_api_key or original_target.api_key
    target = ProviderConfig('openrouter', target_model, 'https://openrouter.ai/api/v1', target_key, 0, 0)
    configs = {key: get_optimizer_config(integration, key) for key in optimizer_keys}
    template = (ROOT / 'prompts' / 'optimizer_prompt_v1.md').read_text(encoding='utf-8')
    template += '\nStrategy: ' + STRATEGIES[strategy][1]
    signature = hashlib.sha256(json.dumps({
        'prompts': prompts, 'optimizers': {key: cfg.public() for key, cfg in configs.items()},
        'target': target.public(), 'strategy': strategy, 'ratio': target_ratio, 'adaptive': adaptive,
        'judge': judge, 'prompt_sha256': hashlib.sha256(template.encode()).hexdigest(),
        'optimizer_temperature': integration.temperature, 'target_temperature': settings.target_temperature,
        'max_output': settings.max_output, 'optimizer_max_output': settings.optimizer_max_output,
        'minimum_tokens': integration.minimum_prompt_tokens,
    }, sort_keys=True).encode()).hexdigest()
    if previous and previous.get('signature') != signature:
        raise ValueError('Restore the original model, strategy and generation settings before resuming.')
    if reuse_completed and previous is None:
        matching = next((saved for saved in repo.studies() if saved.get('signature') == signature
                         and saved.get('status') == 'completed' and not saved.get('demo')), None)
        if matching:
            if progress:
                count = len(prompts) * len(optimizer_keys)
                progress(count, count, 'Loaded identical completed comparison. No new requests sent.')
            if on_update:
                on_update(matching)
            return matching
    study = previous or {
        'id': str(uuid.uuid4()), 'created_at': datetime.now(UTC).isoformat(), 'signature': signature,
        'demo': False, 'prompts': prompts, 'optimizers': [configs[key].model for key in optimizer_keys],
        'targets': [target_model], 'judge': judge, 'experiments': [], 'min_quality': settings.min_quality,
        'methodology': 'methodology_1_free_target_alternative', 'optimizer_selections': optimizer_keys,
        'compression_strategy': strategy, 'target_ratio': target_ratio, 'adaptive': adaptive,
        'target_disclosure': 'Fixed free OpenRouter target. This does not measure OpenAI or ChatGPT.',
        'evaluation_mode': 'human_1_to_5' if not judge else 'optional_ai_plus_human',
    }
    study.update(status='running')
    study.pop('error', None)

    def publish():
        repo.save_study(study)
        if on_update:
            on_update(study)

    publish()
    issues = [registry[key]['reason'] for key in optimizer_keys if not registry[key]['available']]
    if not target_key:
        issues.append('OPENROUTER_API_KEY is required for the fixed free target.')
    if not is_free_model(target_model) or target_model == 'openrouter/free':
        issues.append('OpenAI API targets and paid models are blocked. Choose an explicit fixed :free target; '
                      'no silent substitution is performed.')
    if issues:
        study.update(status='blocked', error=' '.join(dict.fromkeys(issues)))
        publish()
        return study
    providers = dict(settings.providers)
    providers.update(configs)
    providers['openrouter_target'] = target
    mapped_strategy = STRATEGIES[strategy][0]
    cfg = replace(settings, demo=False, free_only=True, target='openrouter_target',
                  optimizer=optimizer_keys[0], providers=providers, strategy=mapped_strategy,
                  target_ratio=target_ratio, optimizer_temperature=integration.temperature,
                  skip_below=integration.minimum_prompt_tokens)
    make = provider_factory or (lambda config, optimizer: make_integration_provider(config, integration.timeout)
                                if optimizer else ChatProvider(config, integration.timeout))
    target_provider = MemoProvider(make(target, False))
    optimizers = {key: MemoProvider(make(config, True)) for key, config in configs.items()}
    total = len(prompts) * len(optimizer_keys)
    existing = {r['metadata']['combination']: r for r in study['experiments']}
    done, stopped = 0, False
    for item in prompts:
        for key in optimizer_keys:
            combination = hashlib.sha256(json.dumps([item, key], sort_keys=True).encode()).hexdigest()
            old = existing.get(combination)
            if old and old['status'] == 'completed' and not (judge and old.get('review_error')):
                done += 1
                continue
            if progress:
                progress(done, total, f'Comparing optimizer {registry[key]["label"]}…')
            if study['experiments'] and settings.delay:
                time.sleep(min(settings.delay, 15))
            def record_event(event, selected_key=key):
                details = {**event, 'optimizer': selected_key}
                history = study.setdefault('workflow_events', [])
                event_key = (details['experiment_id'], details['stage'])
                for index, prior in enumerate(history):
                    if (prior['experiment_id'], prior['stage']) == event_key:
                        history[index] = details
                        break
                else:
                    history.append(details)
                if on_event:
                    on_event(details)

            engine = Engine(replace(cfg, optimizer=key), repo, providers={
                key: optimizers[key], 'openrouter_target': target_provider}, event_callback=record_event)
            if old and old['status'] == 'completed':
                row = dict(old)
                row.pop('review_error', None)
            else:
                row = engine.run(
                    item['prompt'], prompt_id=item.get('id', 'custom'), category=item.get('category', 'custom'),
                    adaptive=adaptive, metadata={'study_id': study['id'], 'combination': combination,
                                                  'optimizer_key': key, 'methodology': study['methodology']},
                    auto_check=item.get('automatic_check'), optimizer_prompt=template,
                    optimizer_prompt_version='optimizer_prompt_v1', optimizer_output_format='text', baseline_first=True)
            row['optimizer_strategy'] = strategy
            row['optimizer_selection'] = key
            row['optimizer_provider'] = configs[key].name
            row['target_disclosure'] = study['target_disclosure']
            if old:
                study.setdefault('attempt_history', []).append(old)
                study['experiments'] = [r for r in study['experiments'] if r['metadata']['combination'] != combination]
            study['experiments'].append(row)
            publish()
            if judge and row['status'] == 'completed':
                try:
                    engine.judge(row)
                except (ProviderError, ValueError) as exc:
                    row['review_error'] = str(exc)
                    record_event({'stage': 'done', 'state': 'error', 'model': target_model,
                                  'experiment_id': row['id']})
                    repo.save(row)
            code = row.get('error', {}).get('code')
            done += 1
            publish()
            if code in {'AUTHENTICATION', 'UNEXPECTED_COST', 'QUOTA_EXHAUSTED', 'FREE_ONLY', 'BILLING_UNCERTAIN'}:
                study['error'] = row['error']['message']
                stopped = True
                break
        if stopped:
            break
    complete = len(study['experiments']) == total and all(
        row['status'] == 'completed' and not row.get('review_error') for row in study['experiments'])
    study['status'] = 'blocked' if stopped else 'completed' if complete else 'partial'
    publish()
    if progress:
        progress(done, total, 'Comparison saved. Human ratings can now be entered in Results.')
    return study


def methodology_summary(study):
    from app.study import summary_text
    return (summary_text(study) + '\n\nTarget disclosure: ' + study.get('target_disclosure', '')
            + '\n\nHuman reviews are separate 1–5 ratings. Automated reviews, if present, use 0–10. '
            'Neither score is a direct measure of semantic preservation without the corresponding review.\n')
