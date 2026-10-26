"""Read-only views for concise presentation without deleting research history."""


def unique_studies(studies):
    """Keep the latest displayed snapshot for each exact study signature.

    The underlying studies and attempts remain untouched. Older trials can still
    be inspected by switching off this display filter.
    """
    seen, rows = set(), []
    for study in sorted(studies, key=lambda item: item.get('created_at', ''), reverse=True):
        key = (study.get('signature') or study['id'], bool(study.get('demo')))
        if key not in seen:
            rows.append(study)
            seen.add(key)
    return rows


def provider_rows(config):
    from app.integration_config import optimizer_registry
    registry = optimizer_registry(config)
    groq = registry['qwen']
    gemini = registry['gemini_flash']
    router = registry['openrouter_free']
    return [
        {'Provider': 'Groq', 'Role': 'Qwen and GPT-OSS optimizers',
         'Key': 'Saved' if config.groq_api_key else 'Missing',
         'Status': 'Ready for a live check' if groq['available'] else groq['reason']},
        {'Provider': 'Gemini', 'Role': 'Gemini Flash optimizer',
         'Key': 'Saved' if config.gemini_api_key else 'Missing',
         'Status': 'Ready for a live check' if gemini['available'] else gemini['reason']},
        {'Provider': 'OpenRouter', 'Role': 'Free optimizer and fixed free answer model',
         'Key': 'Saved' if config.openrouter_api_key else 'Missing',
         'Status': 'Free routes configured' if router['available'] else router['reason']},
        {'Provider': 'OpenAI', 'Role': 'Documented target, disabled in this setup',
         'Key': 'Saved' if config.openai_api_key else 'Missing', 'Status': 'Blocked: no paid API calls'},
    ]
