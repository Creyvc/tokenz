"""The document's single-optimizer study, adapted to the mandatory free target."""

import os
import sqlite3

import pandas as pd
import streamlit as st

from app.integration_config import load_integration_settings, optimizer_registry
from app.live_setup import is_free_model, save_environment
from app.methodology import run_methodology
from app.presentation import provider_rows
from app.study import model_label
from app.tokens import TokenCounter


def render_provider_settings(focused=False):
    config = load_integration_settings()
    st.subheader('Providers')
    rows = provider_rows(config)
    if focused:
        rows = [row for row in rows if row['Provider'] in {'Groq', 'Gemini'}]
        rows[0]['Role'] = 'Qwen prompt optimization'
        rows[1]['Role'] = 'Gemini Flash prompt optimization'
    st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
    st.caption('The free-plan confirmations below are your account declarations, not API verification of billing. '
               'Do not confirm a provider whose billing is enabled. Tokenz does not add payment methods or upgrade plans.')
    for provider, key_name, confirmation, current in [
        ('Groq', 'GROQ_API_KEY', 'TOKENZ_GROQ_FREE_TIER_CONFIRMED', config.groq_free_tier_confirmed),
        ('Gemini', 'GEMINI_API_KEY', 'TOKENZ_GEMINI_FREE_TIER_CONFIRMED', config.gemini_free_tier_confirmed),
    ]:
        with st.expander('Configure ' + provider):
            st.write('1. Create or open your provider account.\n'
                     '2. Check that its plan is free and billing is disabled.\n'
                     '3. Paste the key below and confirm that account status.\n'
                     '4. Save, then choose this optimizer in Autopilot.')
            st.link_button('Open ' + provider + ' billing guide',
                           'https://console.groq.com/docs/billing-faqs' if provider == 'Groq'
                           else 'https://ai.google.dev/gemini-api/docs/billing')
            with st.form('configure-' + provider, clear_on_submit=True):
                secret = st.text_input(provider + ' API key', type='password',
                                       help='Leave blank to keep the saved key.')
                attested = st.checkbox('I confirm this ' + provider + ' account uses the free plan with billing disabled.',
                                        value=current)
                save = st.form_submit_button('Save ' + provider + ' connection')
            if save:
                changes = {confirmation: str(attested).lower()}
                if secret.strip():
                    changes[key_name] = secret.strip()
                if provider == 'Gemini':
                    changes['TOKENZ_ENABLE_GEMINI'] = 'true'
                try:
                    save_environment(changes)
                    os.environ.update(changes)
                    st.rerun()
                except (ValueError, OSError):
                    st.error('Connection settings could not be saved. Check the entered value and try again.')
    if focused:
        st.caption('Configured models: ' + config.qwen_model + ' · ' + config.gemini_model)
        return
    with st.expander('Model IDs and experiment defaults'):
        with st.form('integration-model-settings'):
            qwen = st.text_input('Groq Qwen model ID', config.qwen_model)
            small = st.text_input('Groq GPT-OSS 20B model ID', config.gpt_oss_20b_model)
            large = st.text_input('Groq GPT-OSS 120B model ID', config.gpt_oss_120b_model)
            gemini = st.text_input('Gemini Flash model ID', config.gemini_model)
            router = st.text_input('OpenRouter optimizer model ID', config.openrouter_model)
            minimum = st.number_input('Warn/skip below this many prompt tokens', min_value=0,
                                       value=config.minimum_prompt_tokens, step=10)
            temperature = st.number_input('Optimizer temperature', min_value=0., max_value=2.,
                                           value=float(config.temperature), step=.1)
            timeout = st.number_input('Request timeout in seconds', min_value=1., value=float(config.timeout), step=5.)
            submitted = st.form_submit_button('Save model settings')
        if submitted:
            if not all(text.strip() for text in (qwen, small, large, gemini)) or not is_free_model(router.strip()):
                st.error('Enter model IDs. The OpenRouter optimizer must use openrouter/free or a :free model.')
            else:
                updates = {'GROQ_QWEN_MODEL': qwen.strip(), 'GROQ_GPT_OSS_20B_MODEL': small.strip(),
                           'GROQ_GPT_OSS_120B_MODEL': large.strip(), 'GEMINI_MODEL': gemini.strip(),
                           'OPENROUTER_MODEL': router.strip(), 'TOKENZ_MIN_PROMPT_TOKENS': str(minimum),
                           'TOKENZ_TEMPERATURE': str(temperature), 'TOKENZ_REQUEST_TIMEOUT_SECONDS': str(timeout)}
                try:
                    save_environment(updates)
                    os.environ.update(updates)
                    st.rerun()
                except (ValueError, OSError):
                    st.error('Model settings could not be saved. Please try again.')
    with st.expander('OpenAI integration'):
        st.write('Its key is stored locally, but generation is disabled because this project must make no paid API calls. '
                 'Both answers use the explicitly selected fixed free OpenRouter target instead. '
                 'This is not a ChatGPT measurement.')


def render_methodology(settings, repo, results_page):
    st.title('Compare prompt optimizers')
    st.caption('One original task. Independent optimizer rewrites. The same fixed free answer model.')
    st.info('Free-target alternative to the document. OpenAI API calls are blocked; these results do not measure ChatGPT.')
    config = load_integration_settings()
    registry = optimizer_registry(config)
    ready = {key: item for key, item in registry.items() if item['available']}
    prompt = st.text_area('Your original prompt', height=220, key='methodology_prompt_draft',
                          placeholder='Paste the complete task, inputs, constraints and required output format.')
    available_keys = list(ready)
    preferred = config.default_optimizer if config.default_optimizer in ready else next(iter(ready), None)
    selected = st.multiselect('Optimizer models', available_keys, default=[preferred] if preferred else [],
                              format_func=lambda key: ready[key]['label'])
    with st.expander('Provider availability'):
        for item in registry.values():
            st.write('**' + item['label'] + '** · ' + ('Configured' if item['available'] else item['reason']))
        st.caption('Add optional provider keys in Settings. Unavailable models are not silently substituted.')
    if not ready:
        st.warning('No optimizer is configured. Add a free provider connection in Settings.')
    strategy = st.selectbox('Compression strategy', ['balanced', 'conservative', 'aggressive', 'target_ratio'],
                            format_func=lambda value: value.replace('_', ' ').title())
    ratio = st.slider('Approximate percentage of original prompt to keep', 10, 100, 75, 5,
                      disabled=strategy != 'target_ratio') / 100
    st.caption('Balanced prioritizes information. Conservative removes obvious filler. Aggressive accepts more risk. '
               'Target ratio is an approximate goal, not a guarantee.')
    with st.expander('Fixed free answer model'):
        target = st.text_input('Answer model ID', settings.providers['openrouter_target'].model)
        st.caption('Both prompt versions use this exact selected model. Dynamic openrouter/free and paid models are blocked here.')
    count = TokenCounter('', settings.encoding).count(prompt) if prompt else 0
    st.caption(f'Original prompt: {count:,} estimated tokens. Local tokenizer counts can differ from provider usage.')
    short = bool(prompt and count < config.minimum_prompt_tokens)
    force = False
    if short:
        st.warning('This prompt is already short. Optimization may provide little benefit.')
        force = st.checkbox('Optimize this short prompt anyway')
    st.caption('Human quality review is available after the answers return. No automatic judge requests are made in this study.')
    enabled = bool(prompt.strip() and selected and is_free_model(target) and target != 'openrouter/free'
                   and config.openrouter_api_key)
    run = st.button('Run optimizer study', type='primary', disabled=not enabled)
    previous = st.session_state.get('study')
    resume = False
    if previous and previous.get('methodology') and previous['status'] in {'running', 'blocked', 'partial'}:
        resume = st.button('Resume this optimizer study')
    if not (run or resume):
        return
    progress = st.progress(0, text='Preparing fixed-target comparison…')
    preview = st.empty()

    def update(done, total, text):
        progress.progress(min(done / total, 1.), text=text)

    def publish(study):
        st.session_state.study = study
        answered = [row for row in study['experiments'] if row.get('optimized_response') or row.get('baseline')]
        if answered:
            latest = answered[-1]
            with preview.container():
                st.write('**Available answer · ' + model_label(latest['target_model']) + '**')
                st.text(latest.get('optimized_response', {}).get('text') or latest.get('baseline', {}).get('text'))

    try:
        if resume:
            prompts, selected, target, strategy, ratio, adaptive = (
                previous['prompts'], previous['optimizer_selections'], previous['targets'][0],
                previous['compression_strategy'], previous['target_ratio'], previous['adaptive'])
        else:
            prompts = [{'id': 'my_prompt', 'category': 'custom', 'prompt': prompt}]
            adaptive = short and not force
        with st.spinner('Generating a baseline, rewriting independently, and comparing answers…'):
            st.session_state.study = run_methodology(
                settings, repo, prompts, selected, integration=config, target_model=target,
                strategy=strategy, target_ratio=ratio, adaptive=adaptive, judge=False,
                progress=update, on_update=publish, previous=previous if resume else None)
        st.switch_page(results_page)
    except (ValueError, OSError, sqlite3.Error) as exc:
        st.error(f'Optimizer study could not finish: {exc}')
