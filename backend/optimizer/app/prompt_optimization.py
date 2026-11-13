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

RETRY = ('Your rewrite was rejected:\n{problems}\nRewrite the original prompt again, fixing these problems. '
         'Return only the rewritten prompt.')

# A number's limit: "under 500 words" must not become "500 words" or "at least 500 words"
LIMITS = (('at most', r'(?:under|below|less than|fewer than|at most|no more than|up to|not more than|max(?:imum)?|within|<|≤)'),
          ('at least', r'(?:at least|over|above|(?<!no )(?<!not )more than|no less than|no fewer than|min(?:imum)?|>|≥)'),
          ('exactly', r'(?:exactly|precisely)'))
NUMBER = r'\d+(?:[.,]\d+)*'
# "No more than 200" is a limit, not a prohibition: the limit check covers it
NEGATION = re.compile(r"\b(?:not|no)\b(?! (?:more|less|fewer|longer) than)|\b(?:never|none|nor|without|avoid|"
                      r"exclude|excluding|except)\b|n't\b", re.I)
# Capitalised words that carry no requirement of their own, for the acronym check
SHOUTED = {'PLEASE', 'HELP', 'THANKS', 'THANK', 'HI', 'HELLO', 'HEY', 'URGENT', 'VERY', 'REALLY', 'NOT', 'DO',
           'DONT', 'NO', 'AND', 'OR', 'THE', 'YOU', 'ME', 'MY', 'IT', 'IS', 'ALL', 'OK', 'IMPORTANT', 'NOTE'}


def numbers(text):
    """The numbers in a text, with thousands separators removed ("12,000" and "12000" match)."""
    return [re.sub(r'(?<=\d),(?=\d{3}\b)', '', value) for value in re.findall(r'(?<![\w.])' + NUMBER, text)]


# The same limits written after the number and its unit: "500 words max", "3 or more"
LIMITS_AFTER = (('at most', r'(?:max(?:imum)?|or less|or fewer|at most|tops)'),
                ('at least', r'(?:min(?:imum)?|or more|at least|\+)'))


def limits(text):
    """Each number with the limit on it, when it has one."""
    found = {}
    for name, words in LIMITS:
        for match in re.finditer(words + r'\s*(' + NUMBER + r')', text, re.I):
            found[numbers(match.group(1))[0]] = name
    for name, words in LIMITS_AFTER:
        for match in re.finditer(r'(?<![\w.])(' + NUMBER + r')(?:\s*[a-z]+)?\s*' + words + r'(?!\w)', text, re.I):
            found[numbers(match.group(1))[0]] = name
    return found


def rewrite_checks(prompt, completion, counter, original_count):
    """Why a rewrite can't be used, as sentences; empty when it can."""
    candidate = completion.text.strip()
    checks = []
    if not candidate or completion.finish_reason != 'stop':
        checks.append('The rewrite was empty or incomplete.')
    if candidate.startswith('```') or candidate.lower().startswith(('here is the answer', 'the answer is', 'import ')):
        checks.append('The output did not look like a plain rewritten prompt.')
    if set(numbers(prompt)) - set(numbers(candidate)):
        checks.append('An original number was not preserved literally.')
    after = limits(candidate)
    changed = [number for number, limit in limits(prompt).items() if number in numbers(candidate) and after.get(number) != limit]
    if changed:
        checks.append('The limit on ' + ', '.join(changed) + ' changed (for example "under" or "at least" was lost).')
    if NEGATION.search(prompt) and not NEGATION.search(candidate):
        checks.append('A "not", "no" or "without" from the original was lost.')
    quoted = re.findall(r'"[^"\n]+"|“[^”\n]+”|`[^`\n]+`', prompt)
    if any(quote.strip('"“”') not in candidate for quote in quoted):
        checks.append('Quoted text or code was not kept word for word.')
    acronyms = {word for word in re.findall(r'\b[A-Z][A-Z0-9]{1,}\b', prompt) if word not in SHOUTED}
    lost = sorted(word for word in acronyms if not re.search(r'\b' + re.escape(word) + r'\b', candidate, re.I))
    if lost:
        checks.append('A name or acronym was dropped: ' + ', '.join(lost) + '.')
    if candidate and counter.count(candidate) >= original_count:
        checks.append('The rewrite did not save prompt tokens.')
    return checks


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
            provider = make(config)
            messages = [{'role': 'system', 'content': template},
                        {'role': 'user', 'content': json.dumps({'prompt_to_compress': prompt}, ensure_ascii=False)}]
            completion = provider.complete(messages, maximum, integration.temperature)
            checks = rewrite_checks(prompt, completion, counter, original_count)
            # One second try with the reasons, when the first rewrite came back but broke a check
            if checks and completion.text.strip():
                if completion.provider_cost_usd not in (None, 0):
                    raise ProviderError('UNEXPECTED_COST', 'Provider reported a charge. Stopped under the free-only policy.')
                row['first_attempt'] = {'candidate_prompt': completion.text.strip(), 'checks': checks,
                                        'usage': completion.to_dict()}
                completion = provider.complete(messages + [
                    {'role': 'assistant', 'content': completion.text},
                    {'role': 'user', 'content': RETRY.format(problems='\n'.join('- ' + check for check in checks))}],
                    maximum, integration.temperature)
                checks = rewrite_checks(prompt, completion, counter, original_count)
            row['usage'] = completion.to_dict()
            if completion.provider_cost_usd not in (None, 0):
                raise ProviderError('UNEXPECTED_COST', 'Provider reported a charge. Stopped under the free-only policy.')
            candidate = completion.text.strip()
            row['candidate_prompt'] = candidate
            row['candidate_tokens'] = counter.count(candidate)
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
