import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import streamlit as st

from app.config import load_settings
from app.presentation import unique_studies
from app.storage import Repository
from dashboard.autopilot import render_autopilot
from dashboard.methodology_view import render_provider_settings
from dashboard.prompt_view import render_prompt_results

st.set_page_config(page_title='Tokenz', page_icon='◈', layout='wide')
st.markdown("""<style>.block-container {max-width:1150px;padding-top:2.5rem;}
[data-testid="stAppViewContainer"] {background:#101722;}
[data-testid="stMetric"] {padding:10px;border-radius:10px;}
h1 {letter-spacing:-1px;}</style>""", unsafe_allow_html=True)
try:
    cfg = load_settings()
    repo = Repository(cfg.database, cfg.store)
except (ValueError, OSError, sqlite3.Error):
    st.error('Local settings could not be loaded. Check configuration and restart Tokenz.')
    st.stop()
saved = [study for study in repo.studies() if study.get('workflow') == 'prompt_optimization_v1']
if st.session_state.get('active_workflow_revision') != 'prompt_optimization_v1':
    st.session_state.pop('study', None)
    st.session_state.active_workflow_revision = 'prompt_optimization_v1'
requested = st.query_params.get('study')
if requested:
    selected = next((study for study in saved if study['id'] == requested), None)
    if selected:
        st.session_state.study = selected
    st.query_params.pop('study', None)
if not st.session_state.get('study') or st.session_state.study.get('workflow') != 'prompt_optimization_v1':
    if saved:
        st.session_state.study = saved[0]
    else:
        st.session_state.pop('study', None)


def overview():
    render_autopilot(cfg, repo, results_page, settings_page)


def results():
    st.title('Results')
    study = st.session_state.get('study')
    if not study:
        st.info('Start a Groq and Gemini analysis in Autopilot. Older answer comparisons are archived locally.')
        if st.button('Start analysis', type='primary'):
            st.switch_page(overview_page)
        return
    render_prompt_results(study)
    if study['status'] != 'completed':
        st.caption('Available rewritten prompts are retained when another optimizer fails.')
        if st.button('Resume unfinished steps', type='primary'):
            st.session_state.autopilot_plan = {'prompt': study['original_prompt']}
            st.session_state.autopilot_next_step = 2
            st.switch_page(overview_page)


def history():
    st.title('History')
    if not saved:
        st.info('Your Groq and Gemini analyses will appear here.')
        return
    displayed = unique_studies(saved)
    labels = {study['created_at'][:16].replace('T', ' ') + ' · ' + study['status'] + ' · ' + study['id'][:8]:
              study for study in displayed}
    selected = st.selectbox('Saved analysis', list(labels))
    if st.button('Open results', type='primary'):
        st.session_state.study = labels[selected]
        st.switch_page(results_page)


def settings():
    st.title('Connections')
    st.caption('Only Groq Qwen and Gemini Flash are active. Keys stay on this computer.')
    render_provider_settings(focused=True)


overview_page = st.Page(overview, title='Autopilot', icon=':material/home:', default=True)
results_page = st.Page(results, title='Results', icon=':material/bar_chart:', url_path='results')
history_page = st.Page(history, title='History', icon=':material/history:', url_path='history')
settings_page = st.Page(settings, title='Connections', icon=':material/settings:', url_path='settings')
legacy_compare = st.Page(overview, title='Previous comparison link', url_path='compare', visibility='hidden')
legacy_optimizers = st.Page(overview, title='Previous study link', url_path='optimizers', visibility='hidden')
page = st.navigation([overview_page, results_page, history_page, settings_page, legacy_compare, legacy_optimizers], position='top')
page.run()
