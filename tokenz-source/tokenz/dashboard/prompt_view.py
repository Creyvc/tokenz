"""Prompt comparison and a user-controlled handoff to ChatGPT web."""
import json

import streamlit as st

from app.comparison import text_diff
from app.study import model_label


def handoff_html(prompt):
    encoded = json.dumps(prompt, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return """<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:14px system-ui;color:#dfe8f4;margin:0}button{background:#267b68;color:white;
    border:0;border-radius:8px;padding:11px 17px;cursor:pointer}p{font-size:12px;line-height:1.4}
    </style></head><body><button id="handoff">Copy &amp; open ChatGPT</button>
    <p id="status" role="status">Paste the prompt in ChatGPT and press Send. No API call.</p>
    <script>
    const prompt = """ + encoded + """;
    document.getElementById('handoff').onclick = async () => {
      let job;
      try { job = navigator.clipboard.writeText(prompt); } catch (_) { job = Promise.reject(); }
      window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
      try { await job;
        document.getElementById('status').textContent = 'Copied. In ChatGPT, paste (Ctrl+V) and press Send. If no tab opened, use Open ChatGPT below.';
      } catch (_) {
        document.getElementById('status').textContent = 'Clipboard access was blocked. Use the copy icon on the prompt below, then paste it in ChatGPT.';
      }
    };
    </script></body></html>"""


def prompt_report(study):
    parts = ['# Tokenz prompt comparison', '', 'Answer generation and quality evaluation were not run.',
             '', '## Original prompt', '', study['original_prompt'], '']
    for row in study['optimizations']:
        parts += ['## ' + model_label(row['model']), '', 'Status: ' + row['status'], '']
        if row.get('optimized_prompt'):
            parts += [row['optimized_prompt'], '', f"Estimated tokens: {study['original_tokens']} → {row['optimized_tokens']}",
                      f"Prompt tokens saved: {row['token_saving_pct']:.1f}%", '']
        parts += row.get('checks', [])
        if row.get('error'):
            parts += [row['error']['message']]
    return '\n'.join(parts)


def render_prompt_results(study):
    st.caption('Prompt optimization only. Answers and retained answer quality will be checked later in ChatGPT.')
    st.markdown('<style>.prompt-diff{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;'
                'border:1px solid #344b60;border-radius:10px;padding:16px;max-height:380px;overflow:auto;}</style>',
                unsafe_allow_html=True)
    with st.expander('Original human prompt', expanded=False):
        st.write(study['original_prompt'])
        st.caption(f"{study['original_tokens']} estimated tokens")
    rows = {row['key']: row for row in study['optimizations']}
    accepted = [row for row in rows.values() if row['status'] == 'accepted']
    if accepted:
        smallest = min(accepted, key=lambda row: row['optimized_tokens'])
        tied = [row for row in accepted if row['optimized_tokens'] == smallest['optimized_tokens']]
        if len(tied) > 1:
            st.success(f"Both accepted rewrites use {smallest['optimized_tokens']} tokens. Compare the wording before choosing.")
        else:
            st.success('Smallest accepted rewrite: ' + model_label(smallest['model']) +
                       f" · {smallest['optimized_tokens']} tokens. Review meaning before using it.")
    if study['status'] != 'completed':
        st.warning('One or more optimizers did not finish. Available rewritten prompts remain usable.')
    from app.focused import KEYS
    for col, key in zip(st.columns(2), KEYS, strict=True):
        with col, st.container(border=True):
            row = rows.get(key)
            if not row:
                st.info('This optimizer has not run yet.')
                continue
            st.subheader(model_label(row['model']))
            if row['status'] == 'failed':
                st.error(row['error']['message'])
                st.caption('No rewritten prompt returned. Resume later; no task answer was requested.')
                continue
            if row['status'] == 'running':
                st.info('Rewriting the prompt…')
                continue
            a, b = st.columns(2)
            a.metric('Prompt tokens saved', f"{row['token_saving_pct']:.1f}%")
            b.metric('Wording changed', f"{row['wording_changed_pct']:.1f}%")
            st.caption(f"Estimated tokens: {study['original_tokens']} → {row['optimized_tokens']}")
            if row['status'] == 'rejected':
                st.warning('Original kept: ' + ' '.join(row['checks']))
            else:
                st.caption('Shorter rewrite passed basic format and number checks. Meaning still needs review.')
            st.iframe(handoff_html(row['optimized_prompt']), height=120, alt='Copy selected prompt and open ChatGPT')
            st.code(row['optimized_prompt'], language=None, wrap_lines=True)
            st.link_button('Open ChatGPT', 'https://chatgpt.com/', help='Fallback if the combined handoff button is blocked.')
            st.download_button('Download prompt', row['optimized_prompt'], f'tokenz-{key}.txt', mime='text/plain', key='download-'+key)
            with st.expander('See exact prompt edits'):
                diff = text_diff(study['original_prompt'], row['optimized_prompt'])
                st.caption('Red = removed/replaced; green = added/replaced. Wording change does not measure meaning.')
                st.markdown('**Original**')
                st.markdown('<div class="prompt-diff">' + diff['original_html'] + '</div>', unsafe_allow_html=True)
                st.markdown('**Rewritten**')
                st.markdown('<div class="prompt-diff">' + diff['optimized_html'] + '</div>', unsafe_allow_html=True)
                st.caption(f"{diff['retained_words']} words matched · {diff['removed_words']} removed/replaced · {diff['added_words']} added/replaced")
            if row['status'] == 'rejected' and row.get('candidate_prompt'):
                with st.expander('Why the candidate was not selected'):
                    st.write(row['candidate_prompt'])
                    st.caption('The handoff uses the original prompt, not this rejected candidate.')
    with st.expander('Measurement details and report'):
        st.caption('Token counts use one local tokenizer for both prompts; actual ChatGPT usage can differ. '
                   'Savings are (original − selected) ÷ original × 100. No quality-retention score is measured here.')
        st.download_button('Download comparison report', prompt_report(study), 'tokenz-prompt-comparison.md', mime='text/markdown')
