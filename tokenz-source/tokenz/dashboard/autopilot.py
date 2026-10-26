"""A minimal guided two-model comparison."""
import sqlite3

import pandas as pd
import streamlit as st

from app.focused import KEYS, LABELS
from app.integration_config import load_integration_settings, optimizer_registry
from app.prompt_optimization import optimize_prompts
from app.study import model_label

STEPS = ['1 · Connection', '2 · Your prompt', '3 · Optimize', '4 · Compare']
PHASES = {'optimizer': 'Optimize prompt'}


def _next(step):
    st.session_state.autopilot_step = step


def _sample():
    return ('Please write a short, friendly email to a customer explaining that their order will arrive '
            'on Friday instead of Wednesday. Apologize once, keep it under 100 words, and do not invent '
            'a reason for the delay. Please make sure to mention the new delivery day clearly. '
            'I would like the email to have a subject line and a polite closing. '
            'Please do not add discounts or promises that were not mentioned above.')


def _set_sample():
    st.session_state.autopilot_prompt = _sample()


def render_autopilot(settings, repo, results_page, connections_page):
    config = load_integration_settings()
    registry = optimizer_registry(config)
    ready = all(registry[key]['available'] for key in KEYS)
    if 'autopilot_next_step' in st.session_state:
        st.session_state.autopilot_step = st.session_state.pop('autopilot_next_step')
    st.title('Tokenz Autopilot')
    st.caption('One human prompt. Two optimizers. Compare rewrites and send your choice to ChatGPT.')
    step = st.radio('Walkthrough', range(4), format_func=lambda index: STEPS[index],
                    horizontal=True, key='autopilot_step', label_visibility='collapsed')
    if step == 0:
        st.subheader('1. Check the connection')
        st.write('**Models:** ' + ' and '.join(LABELS))
        st.write('Two direct connections: Groq and Google Gemini. No other models or paid fallbacks.')
        for key, label in zip(KEYS, LABELS, strict=True):
            st.caption(label + ': ' + ('Configured for free-tier use' if registry[key]['available'] else registry[key]['reason']))
        st.page_link(connections_page, label='Manage connection', icon=':material/key:')
        st.button('Continue to prompt', type='primary', on_click=_next, args=(1,),
                  disabled=not ready)
        if st.session_state.get('study') and st.button('View results'):
            st.switch_page(results_page)
        return
    if step == 1:
        previous = st.session_state.get('autopilot_plan', {})
        st.session_state.setdefault('autopilot_prompt', previous.get('prompt', ''))
        st.subheader('2. Enter your prompt')
        st.button('Use a prepared example', on_click=_set_sample)
        prompt = st.text_area('What should the AI do?', height=200, key='autopilot_prompt')
        st.session_state.autopilot_plan = {'prompt': prompt}
        st.button('Continue to run', type='primary', on_click=_next, args=(2,),
                  disabled=not bool(prompt.strip() and ready))
        return
    if step == 2:
        st.subheader('3. Follow the analysis')
        plan = st.session_state.get('autopilot_plan')
        if not plan or not plan['prompt'].strip():
            st.button('Enter a prompt', on_click=_next, args=(1,))
            return
        st.write('Original prompt → two independent rewrites → compare tokens and edits → hand off to ChatGPT.')
        st.caption('Two optimizer calls only. No task answers or AI quality reviews. Identical completed runs are reused.')
        if not st.button('Run autopilot', type='primary'):
            st.button('Back to prompt', on_click=_next, args=(1,))
            return
        trace, progress = st.empty(), st.progress(0, text='Preparing…')
        events = {}
        messages = []

        def event_update(event):
            events[(event['optimizer'], event['stage'])] = {
                'Model': model_label(event['model']), 'Step': PHASES.get(event['stage'], event['stage']),
                'Status': 'Reused' if event.get('reused') else event['state'].title()}
            trace.dataframe(pd.DataFrame(events.values()), hide_index=True, width='stretch')

        def update(done, total, text):
            progress.progress(done / total, text=text)
            messages.append(text)

        def publish(study):
            st.session_state.study = study

        try:
            result = optimize_prompts(settings, repo, plan['prompt'], integration=config,
                                      on_update=publish, on_event=event_update, progress=update)
            st.session_state.study = result
            st.session_state.autopilot_last_message = messages[-1] if messages else 'Saved.'
            st.session_state.autopilot_next_step = 3
            st.rerun()
        except (ValueError, OSError, sqlite3.Error) as exc:
            st.error(f'Analysis could not finish: {exc}')
        return
    st.subheader('4. Your prompt comparison is saved')
    study = st.session_state.get('study')
    if not study:
        st.button('Enter a prompt', on_click=_next, args=(1,))
        return
    st.caption(st.session_state.get('autopilot_last_message', study['status'].title()))
    if study.get('workflow_events'):
        with st.expander('Steps completed in this run'):
            st.dataframe(pd.DataFrame([{'Model': model_label(event['model']),
                'Step': PHASES.get(event['stage'], event['stage']), 'Status': event['state'].title()}
                for event in study['workflow_events']]), hide_index=True, width='stretch')
    if st.button('Open my result', type='primary'):
        st.switch_page(results_page)
    st.button('Prepare another prompt', on_click=_next, args=(1,))
