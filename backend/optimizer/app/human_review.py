"""Human assessments are separate evidence, never a replacement for AI scores."""

from copy import deepcopy
from datetime import UTC, datetime

DIMENSIONS = ('correctness', 'completeness', 'instruction_following', 'relevance', 'meaning_preservation')
INTENTIONS = ('Yes', 'Partially', 'No')
MAX_NOTES_LENGTH = 5000


def _scores(values):
    if not isinstance(values, dict) or set(values) != set(DIMENSIONS):
        raise ValueError('Rate every quality criterion for both answers.')
    if any(type(value) is not int or not 1 <= value <= 5 for value in values.values()):
        raise ValueError('Each human rating must be a whole number from 1 to 5.')
    return {name: values[name] for name in DIMENSIONS}


def build_human_review(baseline, optimized, meaning_preserved, notes=''):
    """Validate explicit ratings and calculate relative retention on the 1–5 scale."""
    baseline, optimized = _scores(baseline), _scores(optimized)
    if meaning_preserved not in INTENTIONS:
        raise ValueError('Choose Yes, Partially, or No for intention preservation.')
    if not isinstance(notes, str) or len(notes) > MAX_NOTES_LENGTH:
        raise ValueError(f'Notes must be text of at most {MAX_NOTES_LENGTH} characters.')
    baseline_quality = sum(baseline.values()) / len(DIMENSIONS)
    optimized_quality = sum(optimized.values()) / len(DIMENSIONS)
    return {
        'method': 'human', 'scale': '1–5', 'created_at': datetime.now(UTC).isoformat(),
        'baseline': baseline, 'optimized': optimized,
        'baseline_quality': baseline_quality, 'optimized_quality': optimized_quality,
        'quality_retention_pct': optimized_quality / baseline_quality * 100,
        'meaning_preserved': meaning_preserved, 'notes': notes.strip(),
    }


def review_eligibility(study, row):
    if study.get('demo') or row.get('demo'):
        return 'Sample comparisons cannot be saved as real human reviews.'
    if row.get('status') != 'completed':
        return 'Human review is available after both answers finish.'
    for name in ('baseline', 'optimized_response'):
        answer = row.get(name)
        if not isinstance(answer, dict) or not isinstance(answer.get('text'), str) or not answer['text'].strip():
            return 'Both original and optimized answers are required for human review.'
    return None


def save_human_review(study, row_id, baseline, optimized, meaning_preserved, notes, repo):
    """Persist a copied snapshot before updating the caller's study in memory.

    Repository.save_review provides an atomic row and study transaction. Lightweight
    repository substitutes may implement save/save_study instead, without that guarantee.
    """
    review = build_human_review(baseline, optimized, meaning_preserved, notes)
    updated = deepcopy(study)
    row = next((item for item in updated.get('experiments', []) if item.get('id') == row_id), None)
    if row is None:
        raise ValueError('This comparison could not be found in the study.')
    reason = review_eligibility(updated, row)
    if reason:
        raise ValueError(reason)
    row['human_review'] = review
    if hasattr(repo, 'save_review'):
        repo.save_review(updated, row)
    else:
        repo.save(row)
        repo.save_study(updated)
    original_row = next(item for item in study['experiments'] if item.get('id') == row_id)
    original_row['human_review'] = review
    return review
