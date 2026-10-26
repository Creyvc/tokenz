"""Detailed visual comparison of saved evidence, without extra model requests."""


import re

import pandas as pd
import plotly.express as px
import streamlit as st

from app.comparison import comparison_metrics, detailed_html_report
from app.study import model_label, result_rows
from dashboard.human_review import render_human_review

COLORS = {'Original': '#78aafa', 'Optimized': '#58d6b5'}


def number(value, suffix='', places=1):
    return 'Not measured' if value is None else f'{value:,.{places}f}{suffix}'


def check_label(value):
    return 'Passed' if value is True else 'Failed' if value is False else 'Not available'


def verdict(row, study):
    decision = result_rows({**study, 'experiments': [row]})[0]['Recommendation']
    if decision == 'Neither passed':
        st.error('Both answers failed the exact check. Neither answer should be used as a correct result.')
    elif decision in {'Use original', 'Keep original'}:
        st.warning('Keep the original for this case. The optimized version did not establish a safe improvement.')
    elif decision == 'Use shorter (AI review)':
        if row.get('automatic_checks', {}).get('optimized_response') is True:
            st.success('The shorter answer passed its exact check and met the AI quality-retention cutoff.')
        else:
            st.info('AI review favors the shorter prompt. No exact answer check is available; correctness is not verified.')
    elif decision == 'Unavailable':
        st.error('This comparison did not finish. Any partial evidence is shown below.')
    else:
        st.info('Review this case first. The available measurements do not establish a winner.')
    if row.get('error'):
        st.error(row['error']['message'])
    if row.get('review_error'):
        st.warning('Quality review did not finish: ' + row['review_error'])


def diff_view(data, prefix, left_title, right_title, highlight):
    st.caption('Red highlights = removed or replaced wording. Green highlights = added or replaced wording. '
               'Unhighlighted wording matched in sequence. Line wrapping is visual only.')
    a, b = st.columns(2)
    for col, side, title in [(a, 'original', left_title), (b, 'optimized', right_title)]:
        with col:
            st.subheader(title)
            st.caption(f'{number(data[prefix + "_" + side + "_words"], places=0)} words · '
                       f'{number(data[prefix + "_" + side + "_characters"], places=0)} characters')
            content = data.get(prefix + '_' + side + '_html')
            if content is None:
                st.info('This version is not available yet.')
            elif highlight:
                st.markdown('<div class="comparison-diff">' + content + '</div>', unsafe_allow_html=True)
            else:
                # The HTML was escaped by the comparison helper, before highlights were inserted.
                import re
                content = re.sub(r'</?mark\b[^>]*>', '', content)
                st.markdown('<div class="comparison-diff">' + content + '</div>', unsafe_allow_html=True)
    if data[prefix + '_available']:
        st.write(f'**{data[prefix + "_retained_words"]} words matched** · '
                 f'**{data[prefix + "_removed_words"]} removed/replaced** · '
                 f'**{data[prefix + "_added_words"]} added/replaced**')


def quality_chart(dimensions):
    values = []
    for item in dimensions:
        for route, key in [('Original', 'baseline'), ('Optimized', 'optimized')]:
            if item[key] is not None:
                values.append({'Criterion': item['dimension'].replace('_', ' ').title(),
                               'Version': route, 'Score / 10': item[key]})
    if not values:
        st.info('No automated rubric scores were recorded. Human assessments are separate and can be entered in Quality review.')
        return
    fig = px.bar(pd.DataFrame(values), y='Criterion', x='Score / 10', color='Version',
                 orientation='h', barmode='group', text_auto='.1f', color_discrete_map=COLORS)
    fig.update_layout(height=490, xaxis_range=[0, 10.8], yaxis_title=None,
                      legend={'orientation': 'h', 'y': 1.1}, margin={'t': 35, 'b': 10, 'l': 0, 'r': 25})
    st.plotly_chart(fig, width='stretch')


def comparison_table(study, experiments):
    decisions = result_rows({**study, 'experiments': experiments})
    rows = []
    for row, decision in zip(experiments, decisions, strict=True):
        data = comparison_metrics(row)
        human = row.get('human_review') or {}
        rows.append({
            'Task': row.get('prompt_id'), 'Model': model_label(row['target_model']),
            'Shortener': model_label(row['optimizer_model']), 'Decision': decision['Recommendation'],
            'Prompt changed (%)': data['prompt_changed_pct'],
            'Prompt tokens saved (%)': data['prompt_token_reduction_pct'],
            'Model input saved (%)': data['target_input_reduction_pct'],
            'Original quality / 10': data['baseline_quality'], 'Optimized quality / 10': data['optimized_quality'],
            'AI quality retained (%)': data['quality_retention_pct'],
            'Original human quality / 5': human.get('baseline_quality'),
            'Optimized human quality / 5': human.get('optimized_quality'),
            'Human quality retained (%)': human.get('quality_retention_pct'),
            'Intention preserved': human.get('meaning_preserved'),
            'Answer changed (%)': data['answer_changed_pct'],
            'Original exact check': check_label(data['baseline_check']),
            'Optimized exact check': check_label(data['optimized_check']),
            'Original route tokens': data['baseline_total_tokens'], 'Optimized route tokens': data['pipeline_total_tokens'],
        })
    return pd.DataFrame(rows)


def render_results(study, repo=None):
    st.markdown("""<style>.comparison-diff {white-space:pre-wrap;overflow-wrap:anywhere;
    line-height:1.65;border:1px solid #344b60;border-radius:10px;padding:18px;
    max-height:420px;overflow-y:auto;} .comparison-diff mark {box-decoration-break:clone;}</style>""",
    unsafe_allow_html=True)
    if study.get('demo'):
        st.warning('Sample responses. These do not measure real model quality.')
    if study.get('error'):
        st.warning(study['error'])
    experiments = study['experiments']
    if not experiments:
        st.info('No answers yet. Start an analysis in Autopilot.')
        return
    st.caption('Each model is compared with its own original answer. AI quality scores are estimates, not verified accuracy.')
    tasks = list(dict.fromkeys(row.get('prompt_id', 'Prompt') for row in experiments))
    task = st.selectbox('Task', tasks) if len(tasks) > 1 else tasks[0]
    rows = [row for row in experiments if row.get('prompt_id', 'Prompt') == task]
    labels = {model_label(row['target_model']): row for row in rows}
    # Current workflow has exactly two rows; old reports remain readable without adding model choices.
    selected = st.selectbox('Inspect prompt and quality details', list(labels))
    row = labels[selected]
    data = comparison_metrics(row)
    comparison, prompts, answers, quality = st.tabs(['Comparison', 'Prompt changes', 'Answer changes', 'Quality review'])
    with comparison:
        st.subheader('Prompt analysis')
        original_count = sum(bool(item.get('baseline', {}).get('text')) for item in rows)
        optimized_count = sum(bool(item.get('optimized_response', {}).get('text')) for item in rows)
        st.write(f'**{original_count} original answer(s) saved · {optimized_count} answers after shortening saved**')
        if study.get('status') != 'completed':
            st.warning('This comparison is incomplete. Saved answers are available below. '
                       'Use Resume unfinished steps to continue without repeating successful requests.')
        for col, item in zip(st.columns(len(rows)), rows, strict=True):
            with col, st.container(border=True):
                values = comparison_metrics(item)
                st.subheader(model_label(item['target_model']))
                st.metric('Prompt tokens saved', number(values['prompt_token_reduction_pct'], '%'))
                st.metric('Prompt wording changed', number(values['prompt_changed_pct'], '%'))
                st.metric('AI quality retained', number(values['quality_retention_pct'], '%'))
                st.caption('Answer wording changed: ' + number(values['answer_changed_pct'], '%'))
                decision = item.get('optimization_decision', '')
                if decision == 'fallback_to_original':
                    reasons = {
                        'CRITICAL_NUMBER_LOST': 'The rewrite did not preserve every original number.',
                        'NO_TOKEN_SAVING': 'The rewrite did not reduce the prompt token count.',
                        'INVALID_OPTIMIZER_OUTPUT': 'The model did not return a usable rewritten prompt.',
                        'OPTIMIZER_TRUNCATED_OR_INCOMPLETE': 'The rewritten prompt was incomplete.',
                    }
                    reason = next((reasons[code] for code in item.get('failures', []) if code in reasons),
                                  'The rewrite did not pass the compression checks.')
                    st.warning(reason + ' The original prompt was kept.')
                elif item.get('optimized_prompt') and item['optimized_prompt'] != item.get('original_prompt'):
                    st.write('A shorter prompt was produced. Check the edits and quality evidence before using it.')
                elif not item.get('optimized_prompt'):
                    st.info('Prompt shortening did not finish. No optimization result is available for this model.')
                else:
                    st.write('The prompt stayed unchanged.')
                if item.get('error'):
                    st.error(item['error']['message'])
                    if item['error'].get('code') == 'RATE_LIMIT':
                        st.caption('The provider limited free requests. Wait for its allowance to recover before resuming.')
                    elif item['error'].get('code') in {'PROVIDER_UNAVAILABLE', 'TIMEOUT'}:
                        st.caption('The provider could not respond. Resume later; the saved work will be reused.')
                    if item.get('baseline', {}).get('text'):
                        st.caption('Your original answer is saved. Open its response section below.')
                        preview = re.sub(r'```[\s\S]*?```', '', item['baseline']['text']).strip()
                        if preview and not preview.startswith(('import ', 'from ')):
                            st.markdown('**Saved original answer · preview**')
                            st.write(preview[:500] + ('…' if len(preview) > 500 else ''))
                if item.get('baseline', {}).get('finish_reason') == 'length':
                    st.warning('The original answer reached its length limit and is incomplete. It is saved as a draft, not a finished result.')
                if item.get('review_error'):
                    st.warning('AI quality review unavailable: ' + item['review_error'])
        with st.expander('Usage and timing'):
            measurements = []
            for item in rows:
                m = comparison_metrics(item)
                measurements.append({'Model': model_label(item['target_model']),
                    'Original prompt tokens': m['original_prompt_tokens'],
                    'Shorter prompt tokens': m['optimized_prompt_tokens'],
                    'Provider input saved (%)': m['target_input_reduction_pct'],
                    'Original route tokens': m['baseline_total_tokens'],
                    'Shorter route tokens including optimizer': m['pipeline_total_tokens'],
                    'Original response time (ms)': m['baseline_latency_ms'],
                    'Shorter response time (ms)': m['optimized_latency_ms'],
                    'Research cost (USD)': item.get('metrics', {}).get('research_spend_usd')})
            st.dataframe(pd.DataFrame(measurements), hide_index=True, width='stretch')
            st.caption('Prompt counts are local estimates. Route tokens include optimizer work and exclude AI review. '
                       'Research cost includes review; native free-tier cost is based on your confirmed account plan.')
        st.caption('Full responses are optional below. Code suggested by a model has not been executed by Tokenz.')
        for item in rows:
            has_answer = bool(item.get('baseline', {}).get('text') or item.get('optimized_response', {}).get('text'))
            if not has_answer:
                continue
            partial_answer = bool(item.get('baseline', {}).get('text') and not item.get('optimized_response', {}).get('text'))
            title = 'Read saved original answer · ' if partial_answer else 'Read responses · '
            with st.expander(title + model_label(item['target_model'])):
                left, right = st.columns(2)
                for column, field, title in [(left, 'baseline', 'Original answer'),
                                               (right, 'optimized_response', 'Answer after shortening')]:
                    with column:
                        st.markdown('**' + title + '**')
                        response = item.get(field, {}).get('text')
                        if response:
                            st.markdown(response)
                        else:
                            st.info('No answer was returned.')
    with prompts:
        st.subheader('What changed in the prompt?')
        highlight = st.toggle('Highlight prompt edits', value=True)
        diff_view(data, 'prompt', 'Original prompt', 'Shorter prompt', highlight)
        st.caption('Wording change counts added and removed word occurrences. It does not measure meaning preservation.')
    with answers:
        st.subheader('What changed in the answer?')
        highlight = st.toggle('Highlight answer edits', value=True)
        diff_view(data, 'answer', 'Original answer', 'Answer after shortening', highlight)
    with quality:
        verdict(row, study)
        a, b, c = st.columns(3)
        a.metric('Original quality', number(data['baseline_quality'], ' / 10', 2))
        b.metric('Optimized quality', number(data['optimized_quality'], ' / 10', 2))
        c.metric('Quality retention', number(data['quality_retention_pct'], '%'))
        a, b = st.columns(2)
        a.metric('Original exact check', check_label(data['baseline_check']))
        b.metric('Optimized exact check', check_label(data['optimized_check']))
        quality_chart(data['quality_dimensions'])
        evaluation = row.get('evaluation') or {}
        st.write(evaluation.get('notes') or 'No AI quality review recorded.')
        st.caption('Retention = optimized score ÷ original score × 100. Above 100% means a higher AI score; '
                   'it does not prove correctness. Each model reviews its own anonymous answer pair.')
        if repo is not None:
            render_human_review(study, row, repo)
    with st.expander('Save report'):
        st.download_button('Download report · HTML', detailed_html_report(study),
                           f'tokenz-{study["id"][:8]}.html', mime='text/html')
