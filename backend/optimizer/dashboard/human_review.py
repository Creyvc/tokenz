"""A manual quality assessment, with no model or provider requests."""

import sqlite3

import streamlit as st

from app.human_review import (
    DIMENSIONS,
    INTENTIONS,
    MAX_NOTES_LENGTH,
    review_eligibility,
    save_human_review,
)


def _saved_review(review):
    st.caption('Human assessment · 1–5 scale · saved separately from AI review')
    original, optimized, retained = st.columns(3)
    original.metric('Original human quality', f"{review['baseline_quality']:.1f} / 5")
    optimized.metric('Optimized human quality', f"{review['optimized_quality']:.1f} / 5")
    retained.metric('Human quality retained', f"{review['quality_retention_pct']:.1f}%")
    st.caption('Retention compares the two mean ratings. High retention does not establish correctness.')
    st.table([
        {'Criterion': name.replace('_', ' ').title(),
         'Original / 5': review['baseline'][name], 'Optimized / 5': review['optimized'][name]}
        for name in DIMENSIONS
    ])
    st.write('**Original intention preserved:** ' + review['meaning_preserved'])
    if review.get('notes'):
        st.text(review['notes'])
    st.caption('Saved at ' + review['created_at'])


def render_human_review(study, row, repo):
    """Render editable ratings for a single completed real comparison."""
    with st.expander('Your quality assessment', expanded=False):
        reason = review_eligibility(study, row)
        if reason:
            st.info(reason)
            return
        review = row.get('human_review')
        if review:
            _saved_review(review)
        else:
            st.info('Not rated yet. The initial slider positions are placeholders until you submit your review.')
        st.caption('Rate both answers from 1 (poor) to 5 (excellent). Check the prompts and answers above first.')
        scope = f"human_{study['id']}_{row['id']}"
        with st.form(scope):
            scores = {}
            for column, name, label in zip(st.columns(2), ('baseline', 'optimized'),
                                           ('Original answer', 'Optimized answer'), strict=True):
                with column:
                    st.subheader(label)
                    scores[name] = {
                        dimension: st.slider(
                            dimension.replace('_', ' ').title(), 1, 5,
                            int(review[name][dimension]) if review else 3,
                            key=f'{scope}_{name}_{dimension}',
                        ) for dimension in DIMENSIONS
                    }
            intention = st.radio(
                'Did the optimized prompt preserve the original intention?', INTENTIONS,
                index=INTENTIONS.index(review['meaning_preserved']) if review else None,
                key=f'{scope}_intention',
            )
            notes = st.text_area('What information was lost or changed? (optional)',
                                 value=review.get('notes', '') if review else '',
                                 max_chars=MAX_NOTES_LENGTH, key=f'{scope}_notes')
            submitted = st.form_submit_button('Save human assessment', type='primary')
        if submitted:
            try:
                saved = save_human_review(study, row['id'], scores['baseline'], scores['optimized'],
                                          intention, notes, repo)
            except ValueError as exc:
                st.error(str(exc))
            except (OSError, sqlite3.Error):
                st.error('Your assessment could not be saved. Please try again.')
            else:
                st.success('Human assessment saved. AI scores have been kept separately.')
                _saved_review(saved)
