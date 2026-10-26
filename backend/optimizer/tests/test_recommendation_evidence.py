from copy import deepcopy

import pytest

from app.study import result_rows, summary_text


def record():
    return {'status': 'completed', 'prompt_id': 'test', 'optimizer_model': 'shortener:free',
            'target_model': 'answer:free', 'failures': [],
            'metrics': {'quality_retention_pct': 100, 'chatgpt_input_reduction_pct': 20}}


def study(row):
    return {'experiments': [row], 'demo': False, 'min_quality': .95, 'prompts': [{}],
            'optimizers': ['shortener:free'], 'targets': ['answer:free']}


@pytest.mark.parametrize('update', [
    {'failures': ['OPTIMIZED_RESPONSE_INCOMPLETE']},
    {'review_error': 'review failed'},
    {'metrics': {'quality_retention_pct': 110}},
])
def test_incomplete_evidence_never_recommends_shorter(update):
    row = deepcopy(record())
    row.update(update)
    assert result_rows(study(row))[0]['Recommendation'] == 'Review first'
    assert 'Best measured' not in summary_text(study(row))


def test_high_retention_cannot_override_failed_exact_answer():
    row = record()
    row['metrics']['quality_retention_pct'] = 600
    row['automatic_checks'] = {'baseline': False, 'optimized_response': False}
    assert result_rows(study(row))[0]['Recommendation'] == 'Neither passed'


def test_partial_exact_check_is_unknown_and_not_failure():
    row = record()
    row['automatic_checks'] = {'baseline': True}
    assert result_rows(study(row))[0]['Exact answer check'] == 'Not available'
