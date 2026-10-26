"""Independent prompt rewrites only. No task answers or quality-judge calls."""
import hashlib
import json
import re
import uuid
from copy import deepcopy
from datetime import UTC, datetime

from app.comparison import text_diff
from app.config import ROOT
from app.focused import KEYS
from app.integration_config import get_optimizer_config, load_integration_settings, optimizer_registry
from app.integration_providers import make_integration_provider
from app.providers import ProviderError
from app.tokens import TokenCounter

WORKFLOW = 'prompt_optimization_v1'


def optimize_prompts(settings, repo, prompt, *, integration=None, provider_factory=None,
                     on_update=None, on_event=None, progress=None, keys=KEYS):
    # keys: Qwen and Gemini by default; the website asks for each chosen model separately, so each
    # shows as it lands. Any optimizer in the registry works.
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('Enter a prompt first.')
    integration = integration or load_integration_settings()
    registry = optimizer_registry(integration)
    keys = tuple(keys)
    if not keys or len(set(keys)) != len(keys) or any(key not in registry for key in keys):
        raise ValueError('Choose one or more known optimizers.')
    configs = [get_optimizer_config(integration, key) for key in keys]
    counter = TokenCounter('', settings.encoding)
    original_count = counter.count(prompt)
    maximum = min(settings.optimizer_max_output, max(256, original_count + 128))
    template = (ROOT / 'prompts/optimizer_only.md').read_text(encoding='utf-8')
    signature = hashlib.sha256(json.dumps({'workflow': WORKFLOW, 'prompt': prompt,
        'configs': [config.public() for config in configs], 'temperature': integration.temperature,
        'maximum': maximum, 'template': template, 'encoding': settings.encoding}, sort_keys=True).encode()).hexdigest()
    previous = next((s for s in repo.studies() if s.get('signature') == signature and not s.get('demo')), None)
    if previous and previous['status'] == 'completed':
        if on_update:
            on_update(previous)
        if progress:
            progress(len(keys), len(keys), 'Opened the saved prompt comparison. No new requests sent.')
        return previous
    study = previous or {'id': str(uuid.uuid4()), 'created_at': datetime.now(UTC).isoformat(),
        'workflow': WORKFLOW, 'signature': signature, 'demo': False, 'original_prompt': prompt,
        'original_tokens': original_count, 'models': [config.model for config in configs],
        'optimizations': [], 'workflow_events': [], 'quality_status': 'Not evaluated; deferred to ChatGPT',
        'tokenizer': counter.metadata()}
    study['status'] = 'running'

    def publish():
        repo.save_study(study)
        if on_update:
            on_update(study)

    def event(key, model, state):
        record = {'optimizer': key, 'model': model, 'stage': 'optimizer', 'state': state}
        study['workflow_events'] = [item for item in study['workflow_events'] if item['optimizer'] != key] + [record]
        if on_event:
            on_event(record)

    publish()
    make = provider_factory or (lambda config: make_integration_provider(config, integration.timeout))
    for index, (key, config) in enumerate(zip(keys, configs, strict=True)):
        old = next((row for row in study['optimizations'] if row['key'] == key), None)
        if old and old['status'] in {'accepted', 'rejected'}:
            continue
        if old:
            study.setdefault('attempt_history', []).append(deepcopy(old))
            study['optimizations'] = [row for row in study['optimizations'] if row['key'] != key]
        row = {'key': key, 'provider': config.name, 'model': config.model, 'status': 'running',
               'optimized_prompt': None, 'candidate_prompt': None, 'optimized_tokens': None,
               'token_saving_pct': None, 'wording_changed_pct': None, 'checks': [], 'usage': None}
        study['optimizations'].append(row)
        event(key, config.model, 'running')
        publish()
        if progress:
            progress(index, len(keys), 'Optimizing with ' + config.name.title() + '…')
        try:
            if not registry[key]['available']:
                raise ProviderError('CONFIGURATION', registry[key]['reason'])
            completion = make(config).complete([
                {'role': 'system', 'content': template},
                {'role': 'user', 'content': json.dumps({'prompt_to_compress': prompt}, ensure_ascii=False)}],
                maximum, integration.temperature)
            row['usage'] = completion.to_dict()
            if completion.provider_cost_usd not in (None, 0):
                raise ProviderError('UNEXPECTED_COST', 'Provider reported a charge. Stopped under the free-only policy.')
            candidate = completion.text.strip()
            row['candidate_prompt'] = candidate
            row['candidate_tokens'] = counter.count(candidate)
            checks = []
            if not candidate or completion.finish_reason != 'stop':
                checks.append('The rewrite was empty or incomplete.')
            if candidate.startswith('```') or candidate.lower().startswith(('here is the answer', 'the answer is', 'import ')):
                checks.append('The output did not look like a plain rewritten prompt.')
            numbers = set(re.findall(r'\b\d+(?:\.\d+)?\b', prompt))
            if numbers - set(re.findall(r'\b\d+(?:\.\d+)?\b', candidate)):
                checks.append('An original number was not preserved literally.')
            if row['candidate_tokens'] >= original_count:
                checks.append('The rewrite did not save prompt tokens.')
            row['status'] = 'rejected' if checks else 'accepted'
            row['checks'] = checks
            chosen = prompt if checks else candidate
            row['optimized_prompt'] = chosen
            row['optimized_tokens'] = counter.count(chosen)
            row['token_saving_pct'] = (1 - row['optimized_tokens'] / original_count) * 100
            row['wording_changed_pct'] = text_diff(prompt, chosen)['changed_pct']
            event(key, config.model, row['status'])
        except ProviderError as exc:
            row.update(status='failed', error={'code': exc.code, 'message': str(exc)})
            event(key, config.model, 'error')
            if exc.code in {'UNEXPECTED_COST', 'FREE_ONLY', 'BILLING_UNCERTAIN'}:
                publish()
                break
        publish()
    study['status'] = 'completed' if len(study['optimizations']) == len(keys) and all(
        row['status'] in {'accepted', 'rejected'} for row in study['optimizations']) else 'partial'
    publish()
    if progress:
        progress(len(keys), len(keys), 'Prompt comparison saved.' if study['status'] == 'completed' else 'Saved available prompts; one or more providers did not finish.')
    return study
