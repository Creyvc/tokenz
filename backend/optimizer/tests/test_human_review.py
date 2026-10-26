from copy import deepcopy
from datetime import datetime

import pytest

from app.human_review import DIMENSIONS, build_human_review, save_human_review


def scores(value=3):
    return dict.fromkeys(DIMENSIONS, value)


def study_fixture():
    return {'id': 'study-1', 'demo': False, 'experiments': [
        {'id': 'row-1', 'status': 'completed', 'baseline': {'text': 'Original answer'},
         'optimized_response': {'text': 'Optimized answer'},
         'evaluation': {'baseline_quality': 8, 'optimized_quality': 9},
         'metrics': {'quality_retention_pct': 112.5}},
    ]}


class MemoryRepo:
    def __init__(self):
        self.saved = []

    def save_review(self, study, row):
        self.saved.append((deepcopy(study), deepcopy(row)))


def test_human_mean_retention_and_metadata():
    baseline, optimized = scores(4), scores(5)
    result = build_human_review(baseline, optimized, 'Partially', ' Changed tone ')
    assert result['baseline_quality'] == 4
    assert result['optimized_quality'] == 5
    assert result['quality_retention_pct'] == 125
    assert result['method'] == 'human'
    assert result['scale'] == '1–5'
    assert result['notes'] == 'Changed tone'
    assert datetime.fromisoformat(result['created_at']).utcoffset().total_seconds() == 0
    baseline['correctness'] = 1
    assert result['baseline']['correctness'] == 4


@pytest.mark.parametrize('value', [True, False, 0, 6, 3.0, '3', None, float('nan'), float('inf')])
def test_reject_invalid_rating(value):
    invalid = scores()
    invalid['correctness'] = value
    with pytest.raises(ValueError):
        build_human_review(invalid, scores(), 'Yes')
    with pytest.raises(ValueError):
        build_human_review(scores(), invalid, 'Yes')


@pytest.mark.parametrize('invalid', [None, [], {}, {'correctness': 3}, {**scores(), 'other': 2}])
def test_require_all_five_scores_only(invalid):
    with pytest.raises(ValueError):
        build_human_review(invalid, scores(), 'Yes')


@pytest.mark.parametrize('intention', [None, '', 'yes', True])
def test_intention_required(intention):
    with pytest.raises(ValueError):
        build_human_review(scores(), scores(), intention)


@pytest.mark.parametrize('notes', [None, 3, 'x' * 5001])
def test_notes_validated(notes):
    with pytest.raises(ValueError):
        build_human_review(scores(), scores(), 'No', notes)


def test_saved_review_keeps_ai_and_comparison_evidence_and_supports_editing():
    study, repo = study_fixture(), MemoryRepo()
    original = deepcopy(study['experiments'][0])
    review = save_human_review(study, 'row-1', scores(4), scores(3), 'Partially', 'Missing detail', repo)
    row = study['experiments'][0]
    assert row['human_review'] == review
    assert {key: value for key, value in row.items() if key != 'human_review'} == original
    assert repo.saved[0][0]['experiments'][0] == repo.saved[0][1] == row
    save_human_review(study, 'row-1', scores(5), scores(5), 'Yes', '', repo)
    assert row['human_review']['quality_retention_pct'] == 100
    assert row['human_review']['notes'] == ''


@pytest.mark.parametrize('change', ['study-demo', 'row-demo', 'incomplete', 'missing-original', 'missing-optimized'])
def test_only_completed_real_comparisons_can_be_rated(change):
    study, repo = study_fixture(), MemoryRepo()
    row = study['experiments'][0]
    if change == 'study-demo':
        study['demo'] = True
    elif change == 'row-demo':
        row['demo'] = True
    elif change == 'incomplete':
        row['status'] = 'failed'
    elif change == 'missing-original':
        row['baseline'] = {'text': ' '}
    else:
        row.pop('optimized_response')
    with pytest.raises(ValueError):
        save_human_review(study, 'row-1', scores(), scores(), 'Yes', '', repo)
    assert repo.saved == []
    assert 'human_review' not in row


def test_unknown_row_and_persistence_failure_do_not_mutate_study():
    study, repo = study_fixture(), MemoryRepo()
    original = deepcopy(study)
    with pytest.raises(ValueError):
        save_human_review(study, 'absent', scores(), scores(), 'Yes', '', repo)
    assert study == original

    class BrokenRepo:
        def save_review(self, study, row):
            raise OSError('disk full')

    with pytest.raises(OSError):
        save_human_review(study, 'row-1', scores(), scores(), 'Yes', '', BrokenRepo())
    assert study == original


def test_repository_fallback():
    class FakeRepo:
        def save(self, row):
            self.row = deepcopy(row)

        def save_study(self, study):
            self.study = deepcopy(study)

    study, repo = study_fixture(), FakeRepo()
    save_human_review(study, 'row-1', scores(), scores(), 'Yes', '', repo)
    assert repo.row == repo.study['experiments'][0] == study['experiments'][0]


def test_form_requires_intention_and_saves_explicit_human_scores(tmp_path):
    from streamlit.testing.v1 import AppTest

    script = tmp_path / 'human_review_app.py'
    script.write_text('''
import streamlit as st
from dashboard.human_review import render_human_review
from tests.test_human_review import MemoryRepo, study_fixture
if 'study' not in st.session_state:
    st.session_state.study = study_fixture()
    st.session_state.repo = MemoryRepo()
render_human_review(st.session_state.study, st.session_state.study['experiments'][0], st.session_state.repo)
''', encoding='utf-8')
    page = AppTest.from_file(str(script), default_timeout=40).run()
    assert not page.exception
    assert len(page.slider) == 10
    assert page.radio[0].value is None
    assert 'Not rated yet' in page.info[0].value
    page.button[0].click().run()
    assert 'Choose Yes' in page.error[0].value
    assert not page.session_state.study['experiments'][0].get('human_review')
    page.slider[0].set_value(5)
    page.radio[0].set_value('Partially')
    page.text_area[0].set_value('Preserved the topic but lost a detail.')
    page.button[0].click().run()
    assert not page.exception
    saved = page.session_state.study['experiments'][0]['human_review']
    assert saved['baseline']['correctness'] == 5
    assert saved['meaning_preserved'] == 'Partially'
    assert page.success
    page.run()
    assert page.slider[0].value == 5
    assert page.radio[0].value == 'Partially'
    assert not page.exception
