"""JSON bridge for the Tokenz website's local API (../web_api.py).

The website engine runs this in its own process, so this package's `app` name never meets the
backend's app.py. One request is read from stdin and one JSON reply is written to stdout.

    python -m app.bridge status
    echo '{"prompt": "...", "encoding": "o200k_base"}' | python -m app.bridge optimize

Website runs are not saved (store=False): the website API promises not to keep prompts. Keys and
free-plan confirmations come from this folder's .env, exactly as for the dashboard.
"""
import json
import sys
from dataclasses import replace

from app.config import load_settings
from app.focused import KEYS, LABELS
from app.integration_config import load_integration_settings, optimizer_registry
from app.prompt_optimization import optimize_prompts
from app.storage import Repository

ENCODINGS = ('o200k_base', 'cl100k_base')


def status():
    registry = optimizer_registry(load_integration_settings())
    rows = [{'key': key, 'label': label, 'model': registry[key]['model'],
             'available': registry[key]['available'], 'reason': registry[key]['reason']}
            for key, label in zip(KEYS, LABELS, strict=True)]
    return {'available': all(row['available'] for row in rows), 'optimizers': rows}


def optimize(request):
    prompt = request.get('prompt')
    encoding = request.get('encoding', 'o200k_base')
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('Enter a prompt first.')
    if encoding not in ENCODINGS:
        raise ValueError('Unsupported token counting.')
    ready = status()
    if not ready['available']:
        raise LookupError('Connect Groq and Gemini first: ' + '; '.join(
            row['label'] + ': ' + row['reason'] for row in ready['optimizers'] if not row['available']))
    settings = replace(load_settings(), encoding=encoding, store=False)
    return optimize_prompts(settings, Repository(settings.database, False), prompt)


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
