"""JSON bridge for the Tokenz website's local API (../web_api.py).

The website engine runs this in its own process, so this package's `app` name never meets the
backend's app.py. One request is read from stdin and one JSON reply is written to stdout.

    python -m app.bridge status
    echo '{"prompt": "...", "encoding": "o200k_base", "models": ["qwen"]}' | python -m app.bridge optimize

Website runs are not saved (store=False): the website API promises not to keep prompts. Keys and
free-plan confirmations come from this folder's .env, exactly as for the dashboard.
"""
import json
import sys
from dataclasses import replace

from app.config import load_settings
from app.integration_config import load_integration_settings, optimizer_registry
from app.prompt_optimization import optimize_prompts
from app.storage import Repository

ENCODINGS = ('o200k_base', 'cl100k_base')
# Gemini's free plan sometimes queues a request for most of a minute; on the website a model gets
# this long before its card says it took too long (the other model's result still shows)
WEBSITE_SECONDS = 30
# The models the website offers, in this order. All free: Groq runs Qwen and GPT-OSS on one key.
MODELS = (('qwen', 'Qwen · Groq'), ('gemini_flash', 'Gemini Flash · Google'), ('gpt_oss_120b', 'GPT-OSS 120B · Groq'))
KEYS = tuple(key for key, _ in MODELS)


def status():
    registry = optimizer_registry(load_integration_settings())
    rows = [{'key': key, 'label': label, 'model': registry[key]['model'],
             'available': registry[key]['available'], 'reason': registry[key]['reason']}
            for key, label in MODELS]
    return {'available': any(row['available'] for row in rows), 'optimizers': rows}


def optimize(request):
    prompt = request.get('prompt')
    encoding = request.get('encoding', 'o200k_base')
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('Enter a prompt first.')
    if encoding not in ENCODINGS:
        raise ValueError('Unsupported token counting.')
    models = request.get('models', ['qwen', 'gemini_flash'])
    if not isinstance(models, list) or not models or len(set(models)) != len(models) or \
            any(model not in KEYS for model in models):
        raise ValueError('Choose one or more of: ' + ', '.join(KEYS) + '.')
    missing = [row for row in status()['optimizers'] if row['key'] in models and not row['available']]
    if missing:
        raise LookupError('Set this model up first: ' + '; '.join(
            row['label'] + ': ' + row['reason'] for row in missing))
    integration = load_integration_settings()
    integration = replace(integration, timeout=min(integration.timeout, WEBSITE_SECONDS))
    settings = replace(load_settings(), encoding=encoding, store=False)
    return optimize_prompts(settings, Repository(settings.database, False), prompt,
                            integration=integration, keys=tuple(models))


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    try:
        if command == 'status':
            reply = status()
        elif command == 'optimize':
            reply = optimize(json.loads(sys.stdin.read() or '{}'))
        else:
            raise ValueError('Use: python -m app.bridge status|optimize')
    except LookupError as exc:
        reply = {'error': str(exc), 'code': 'NOT_CONFIGURED'}
    except (ValueError, json.JSONDecodeError) as exc:
        reply = {'error': str(exc), 'code': 'BAD_REQUEST'}
    sys.stdout.write(json.dumps(reply, ensure_ascii=False, default=str) + '\n')


if __name__ == '__main__':
    main()
