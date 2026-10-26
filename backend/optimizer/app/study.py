"""One-button comparison of free optimizers and targets, with resumable reports."""
import hashlib
import json
import time
import uuid
from dataclasses import fields, replace
from datetime import UTC, datetime

from app.config import ROOT, ProviderConfig
from app.connection import check_connection
from app.engine import Engine
from app.free_models import FREE_MODELS
from app.live_setup import is_free_model
from app.providers import ChatProvider, Completion, DemoProvider, ProviderError
from app.tokens import TokenCounter

DEFAULT_TARGETS = ['nvidia/nemotron-3.5-lightning:free', 'cohere/north-mini-code:free']
DEFAULT_OPTIMIZER = 'cohere/north-mini-code:free'
SAMPLES = [
    {"id": "writing", "category": "writing", "prompt": "Hi, I would like you to please write a polite email declining a meeting on 12 November 2026. Offer 14 November at 10:00 UTC instead. Keep it under 100 words and do not invent a reason. Thank you very much."},
    {"id": "extraction", "category": "extraction", "prompt": "Hi, please help me extract the names from this fictional note. Return a JSON array only, without explanation or code fences. Preserve the order and keep duplicates. The note is: Ada met Ben, and Ada returned later. Thank you very much.", "automatic_check": {"kind": "json", "expected": ["Ada", "Ben", "Ada"]}},
    {"id": "reasoning", "category": "reasoning", "prompt": "Hi, I would like you to please solve this arithmetic question carefully. A train travels 120 km at 60 km/h and then another 120 km at 120 km/h. What is its average speed in km/h for the entire journey? Return only the numeric value, with no unit or explanation. Thank you very much.", "automatic_check": {"kind": "numeric", "expected": 80}},
]


class MemoProvider:
    def __init__(self, provider):
        self.provider, self.cache = provider, {}

    def complete(self, messages, max_tokens, temperature):
        key = json.dumps([messages, max_tokens, temperature], sort_keys=True)
        if key in self.cache:
            return replace(self.cache[key], reused=True)
        result = self.provider.complete(messages, max_tokens, temperature)
        self.cache[key] = result
        return result


def model_label(model):
    if model.startswith('qwen/'):
        return 'Qwen · Groq'
    if model.startswith('gemini-'):
        return model.replace('gemini-', 'Gemini ').replace('-flash', ' Flash') + ' · Google'
    return FREE_MODELS.get(model, model).replace(' (free)', '')


def run_study(settings, repo, prompts, optimizers=None, targets=None, judge=True, demo=False,
              progress=None, previous=None, provider_factory=None, connection_check=check_connection,
              on_update=None):
    optimizers, targets = optimizers or [DEFAULT_OPTIMIZER], targets or DEFAULT_TARGETS
    if not prompts or not optimizers or not targets:
        raise ValueError('Provide a prompt, an optimizer and at least one answer model.')
    if any(not is_free_model(m) for m in optimizers + targets) or 'openrouter/free' in targets:
        raise ValueError('Only free models and fixed targets are allowed.')
    if any(not isinstance(p.get('prompt'), str) or not p['prompt'].strip() for p in prompts):
        raise ValueError('Enter a prompt before starting.')
    template_hash = hashlib.sha256((ROOT / f'prompts/optimizer_{settings.strategy}.md').read_bytes()
                                   + (ROOT / 'prompts/optimizer_output.md').read_bytes()).hexdigest()
    signature = hashlib.sha256(json.dumps([prompts, optimizers, targets, judge, demo, template_hash,
                                          settings.max_output, settings.optimizer_max_output,
                                          settings.strategy, settings.min_quality], sort_keys=True).encode()).hexdigest()
    if previous and previous['signature'] != signature:
        raise ValueError('Choose the original settings to resume this comparison.')
    study = previous or {"id": str(uuid.uuid4()), "created_at": datetime.now(UTC).isoformat(),
                         "signature": signature, "demo": demo, "prompts": prompts,
                         "optimizers": optimizers, "targets": targets, "judge": judge,
                         "experiments": [], "status": "running", "min_quality": settings.min_quality}
    study['status'] = 'running'
    study.pop('error', None)

    def publish():
        repo.save_study(study)
        if on_update:
            on_update(study)

    publish()
    planned = len(prompts) * len(optimizers) * len(targets)
    if (len(study['experiments']) == planned and all(r['status'] == 'completed' and not r.get('review_error')
                                                  for r in study['experiments'])):
        study['status'] = 'completed'
        publish()
        if progress:
            progress(planned, planned, 'Loaded completed comparison; no new requests.')
        return study
    key = settings.providers.get('openrouter_target', ProviderConfig('openrouter')).api_key
    if not demo:
        health = connection_check(key)
        if not health['ok']:
            study.update(status='blocked', error=health['message'])
            publish()
            return study
    counter = TokenCounter('', settings.encoding)
    def make(model, optimizer=False):
        config = ProviderConfig('openrouter', model, 'https://openrouter.ai/api/v1', key, 0, 0)
        if provider_factory:
            return provider_factory(config, optimizer)
        return DemoProvider(counter, optimizer) if demo else ChatProvider(config, settings.timeout)
    compressors = {m: MemoProvider(make(m, True)) for m in optimizers}
    template = (ROOT / f'prompts/optimizer_{settings.strategy}.md').read_text(encoding='utf-8')
    template += (ROOT / 'prompts/optimizer_output.md').read_text(encoding='utf-8')
    template = template.replace('{target_percent}', str(round(settings.target_ratio * 100)))
    for prior in study['experiments']:
        optimizer = prior.get('optimizer_model')
        if (optimizer not in compressors or not prior.get('optimizer_calls')
                or prior.get('versions', {}).get('optimizer_template_sha256') != hashlib.sha256(template.encode()).hexdigest()):
            continue
        call = prior['optimizer_calls'][-1]
        cache_key = json.dumps([[{'role':'system','content':template},
                                 {'role':'user','content':json.dumps({'prompt_to_compress':prior['original_prompt']}, ensure_ascii=False)}],
                                settings.optimizer_max_output, settings.optimizer_temperature], sort_keys=True)
        allowed = {f.name for f in fields(Completion)}
        compressors[optimizer].cache[cache_key] = Completion(**{k:v for k,v in call.items() if k in allowed})
    targets_by_model = {m: MemoProvider(make(m)) for m in targets}
    if not demo:
        # Reuse only matching real baseline requests with the same generation controls.
        for prior in repo.all():
            model = prior.get('target_model')
            baseline = prior.get('baseline', {})
            config = prior.get('configuration', {})
            parameters = baseline.get('request_settings') or {}
            if (prior.get('demo') or model not in targets_by_model or not baseline.get('text')
                    or baseline.get('finish_reason') != 'stop'
                    or config.get('max_output') != settings.max_output
                    or config.get('target_temperature') != settings.target_temperature
                    or parameters.get('reasoning') != {'enabled':False}):
                continue
            memo = targets_by_model[model]
            cache_key = json.dumps([[{'role':'user','content':prior['original_prompt']}],
                                     settings.max_output, settings.target_temperature], sort_keys=True)
            if cache_key not in memo.cache:
                allowed = {f.name for f in fields(Completion)}
                memo.cache[cache_key] = Completion(**{k:v for k,v in baseline.items() if k in allowed})
    existing = {r['metadata']['combination']: r for r in study['experiments']}
    total = len(prompts) * len(optimizers) * len(targets)
    completed = 0
    stop = False
    for item in prompts:
        for optimizer in optimizers:
            for target in targets:
                combination = hashlib.sha256(json.dumps([item, optimizer, target], sort_keys=True).encode()).hexdigest()
                old = existing.get(combination)
                if old and old['status'] == 'completed' and not (judge and old.get('review_error')):
                    completed += 1
                    continue
                if progress:
                    progress(completed, total, f"Testing {model_label(target)}â€¦")
                configs = dict(settings.providers)
                configs['openrouter_optimizer'] = ProviderConfig('openrouter', optimizer, 'https://openrouter.ai/api/v1', key, 0, 0)
                configs['openrouter_target'] = ProviderConfig('openrouter', target, 'https://openrouter.ai/api/v1', key, 0, 0)
                cfg = replace(settings, demo=demo, free_only=True, optimizer='openrouter_optimizer',
                              target='openrouter_target', providers=configs)
                engine = Engine(cfg, repo, providers={'openrouter_optimizer': compressors[optimizer],
                                                       'openrouter_target': targets_by_model[target]})
                if not demo and study['experiments'] and settings.delay:
                    time.sleep(min(settings.delay, 15))
                if old and old['status'] == 'completed':
                    # Retry only a missing review, retaining the already completed model answers.
                    row = dict(old)
                    row.pop('review_error', None)
                else:
                    row = engine.run(item['prompt'], prompt_id=item.get('id', 'custom'),
                                     category=item.get('category', 'custom'),
                                     metadata={'study_id': study['id'], 'combination': combination},
                                     auto_check=item.get('automatic_check'))
                if old:
                    study.setdefault('attempt_history', []).append(old)
                    study['experiments'] = [r for r in study['experiments'] if r['metadata']['combination'] != combination]
                study['experiments'].append(row)
                publish()  # Make answers visible before the separate quality-review request.
                if judge and not demo and row['status'] == 'completed':
                    try:
                        engine.judge(row)
                    except (ProviderError, ValueError) as exc:
                        row['review_error'] = str(exc)
                        repo.save(row)
                        if isinstance(exc, ProviderError) and exc.code in {'AUTHENTICATION', 'UNEXPECTED_COST'}:
                            stop = True
                completed += 1
                code = row.get('error', {}).get('code')
                if code in {'AUTHENTICATION', 'UNEXPECTED_COST', 'QUOTA_EXHAUSTED', 'CONFIGURATION'}:
                    study['error'] = row['error']['message']
                    stop = True
                if code == 'RATE_LIMIT':
                    health = connection_check(key)
                    if not health['ok']:
                        study['error'] = health['message']
                        stop = True
                publish()
                if stop:
                    break
            if stop:
                break
        if stop:
            break
    done = all(r['status'] == 'completed' and not r.get('review_error') for r in study['experiments'])
    study['status'] = 'blocked' if stop else 'completed' if done else 'partial'
    if progress:
        progress(completed, total, 'Comparison saved.')
    publish()
    return study


def result_rows(study):
    result = []
    for r in study['experiments']:
        m = r.get('metrics', {})
        checks = r.get('automatic_checks', {})
        retention = m.get('quality_retention_pct')
        saved = m.get('chatgpt_input_reduction_pct')
        human = r.get('human_review') or {}
        decision = ('Unavailable' if r['status'] != 'completed' else
                    'Neither passed' if checks.get('baseline') is False and checks.get('optimized_response') is False else
                    'Use original' if human.get('meaning_preserved') == 'No' else
                    'Review first' if human.get('meaning_preserved') == 'Partially' else
                    'Use original' if checks.get('optimized_response') is False or
                    (retention is not None and retention < study.get('min_quality', .95) * 100) else
                    'Keep original' if saved is not None and saved <= 0 else
                    'Review first' if retention is None or saved is None or study.get('demo')
                    or r.get('failures') or r.get('review_error') else 'Use shorter (AI review)')
        result.append({'Prompt': r.get('prompt_id'), 'Optimizer': model_label(r['optimizer_model']),
                       'Answer model': model_label(r['target_model']), 'Status': r['status'],
                       'Recommendation': decision,
                       'Input saved (%)': m.get('chatgpt_input_reduction_pct'),
                       'Quality retained (%)': m.get('quality_retention_pct'),
                       'Original human quality / 5': human.get('baseline_quality'),
                       'Optimized human quality / 5': human.get('optimized_quality'),
                       'Human quality retained (%)': human.get('quality_retention_pct'),
                       'Intention preserved': human.get('meaning_preserved'),
                       'Total tokens saved': m.get('net_token_difference'),
                       'Time (seconds)': m.get('total_tokenz_latency_ms') / 1000 if m.get('total_tokenz_latency_ms') is not None else None,
                       'Exact answer check': ('Pass' if checks.get('optimized_response') is True else
                                              'Fail' if checks.get('optimized_response') is False else 'Not available'),
                       'Issue': r.get('error', {}).get('message') or r.get('review_error') or
                       ('Original kept: no safe token saving.' if 'NO_TOKEN_SAVING' in r.get('failures', []) else
                        ', '.join(r.get('failures', [])))})
    return result


def summary_text(study):
    rows = study['experiments']
    completed = [r for r in rows if r['status'] == 'completed']
    requested = study.get('planned_comparisons', len(study['prompts']) * len(study['optimizers']) * len(study['targets']))
    lines = ['# Tokenz comparison summary', '',
             '**Sample preview â€” no real model results.**' if study['demo'] else '**Real free-model comparison.**', '',
             f"Compared {len(study['prompts'])} prompt(s), {len(study['optimizers'])} optimizer(s), and {len(study['targets'])} answer model(s).",
             f"Completed {len(completed)} of {requested} planned comparisons. {len(rows) - len(completed)} attempted comparisons failed.", '']
    if study.get('error'):
        lines += ['Connection or quota issue: ' + study['error'], '']
    if study['demo']:
        lines += ['The preview demonstrates the workflow only. It cannot identify a winning model or prove quality or token savings.', '']
    elif completed:
        cutoff = study.get('min_quality', .95) * 100
        qualified = [r for r in completed if result_rows({**study, 'experiments': [r]})[0]['Recommendation']
                     == 'Use shorter (AI review)']
        if qualified:
            best = max(qualified, key=lambda r: r['metrics'].get('chatgpt_input_reduction_pct') or 0)
            lines += [f"Best measured input reduction among comparisons retaining at least {cutoff:g}% of the model judge's quality score: {model_label(best['target_model'])} with {model_label(best['optimizer_model'])}.",
                      f"Input reduction: {best['metrics']['chatgpt_input_reduction_pct']:.1f}%; quality retained: {best['metrics']['quality_retention_pct']:.1f}%.", '']
        else:
            lines += ['No quality-qualified winner is established yet. Review the answers and missing quality scores.', '']
        failed_checks = sum(r.get('automatic_checks', {}).get('optimized_response') is False for r in completed)
        below_cutoff = sum(r.get('metrics', {}).get('quality_retention_pct') is not None and
                           r['metrics']['quality_retention_pct'] < study.get('min_quality', .95) * 100 for r in completed)
        if failed_checks or below_cutoff:
            both_failed = sum(r.get('automatic_checks', {}).get('baseline') is False and
                               r.get('automatic_checks', {}).get('optimized_response') is False for r in completed)
            lines += [(f'{failed_checks} shortened answers failed exact checks; {below_cutoff} comparisons fell below the quality-retention cutoff. '
                       f'In {both_failed} case(s), both original and shortened answers failed. Follow the per-case recommendations; neither failed answer should be trusted.'), '']
        calls = [call for r in rows + study.get('attempt_history', []) for call in r.get('paid_calls', [])]
        if calls and all(call.get('cost_usd') == 0 for call in calls):
            lines += ['All recorded requests in this study reported or were configured at zero cost (USD 0).', '']
    lines += ['## Results', '']
    for row in result_rows(study):
        saved, quality = row['Input saved (%)'], row['Quality retained (%)']
        lines.append(f"- {row['Prompt']} Â· {row['Optimizer']} â†’ {row['Answer model']}: {row['Status']}; "
                     + (f"{saved:.1f}% input reduction" if saved is not None else 'input savings unknown')
                     + '; ' + (f"{quality:.1f}% quality retained" if quality is not None else 'quality not measured')
                     + (f"; {row['Issue']}" if row['Issue'] else ''))
        if row.get('Human quality retained (%)') is not None:
            lines.append(f"  Human scores: {row['Original human quality / 5']:.2f}/5 original, "
                         f"{row['Optimized human quality / 5']:.2f}/5 optimized; "
                         f"{row['Human quality retained (%)']:.1f}% retained; "
                         f"intention preserved: {row['Intention preserved']}.")
    lines += ['', '## What happened', '',
              '1. Preserved each original prompt and created a shorter candidate.',
              '2. Checked for token savings and used the original if compression failed.',
              '3. Sent both versions to each selected fixed free model.',
              '4. Recorded provider token use, latency, errors and model identities.',
              '5. Applied exact-answer checks where supplied and optional model quality review.',
              '6. Saved this report and the full underlying records.', '',
              '## Limits', '',
              ('Model judging is an automated estimate, not independent proof. Review important outputs manually. '
              'Local token counts use a fallback tokenizer; provider usage is used when available. '
              'A smaller target input does not guarantee fewer total system tokens. '
              'Only free models are allowed; these results do not measure ChatGPT.')]
    return '\n'.join(lines)
