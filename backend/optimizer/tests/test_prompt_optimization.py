import json
import re

import pytest

from app.prompt_optimization import optimize_prompts, rewrite_checks
from app.providers import Completion
from app.tokens import TokenCounter
from app.study import SAMPLES
from dashboard.prompt_view import handoff_html, prompt_report
from tests.test_focused import factory
from tests.test_methodology import setup


def test_exactly_two_rewrite_calls_no_answer_or_quality_generation(cfg):
    cfg, integration, repo = setup(cfg)
    calls = []
    study = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory(calls))
    assert len(calls) == 2 and {call[0] for call in calls} == {'groq', 'gemini'}
    assert all('prompt_to_compress' in json.loads(call[2][-1]['content']) for call in calls)
    assert study['status'] == 'completed'
    assert 'experiments' not in study and not study.get('judge')
    assert all(row['status'] == 'accepted' and row['token_saving_pct'] > 0 for row in study['optimizations'])
    assert all('baseline' not in row and 'evaluation' not in row for row in study['optimizations'])
    def forbidden(*args):
        raise AssertionError('Saved prompt comparison must not dispatch again')
    again = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=forbidden)
    assert again['id'] == study['id'] and len(repo.studies()) == 1


def test_failed_optimizer_does_not_hide_success_and_only_failed_provider_retries(cfg):
    cfg, integration, repo = setup(cfg)
    first = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory([], 'gemini'))
    assert first['status'] == 'partial'
    assert first['optimizations'][0]['status'] == 'accepted'
    calls = []
    resumed = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration, provider_factory=factory(calls))
    assert resumed['id'] == first['id'] and resumed['status'] == 'completed'
    assert len(calls) == 1 and calls[0][0] == 'gemini'


def test_missing_numbers_cannot_be_sent_as_the_selected_prompt(cfg):
    cfg, integration, repo = setup(cfg)
    def make(config):
        class Bad:
            def complete(self, *args):
                return Completion('Write a report.', 30, 5, 10, model=config.model, finish_reason='stop')
        return Bad()
    original = 'Please write a climate report comparing the last 15 years, under 500 words.'
    study = optimize_prompts(cfg, repo, original, integration=integration, provider_factory=make)
    assert study['status'] == 'completed'
    assert all(row['status'] == 'rejected' and row['optimized_prompt'] == original
               and row['token_saving_pct'] == 0 for row in study['optimizations'])
    assert 'quality evaluation were not run' in prompt_report(study)


def test_chatgpt_handoff_escapes_script_injection_and_does_not_put_prompt_in_url():
    prompt = '</script><img src=x onerror=alert(1)> "hello"\nnext line'
    page = handoff_html(prompt)
    assert '</script><img' not in page
    encoded = re.search(r'const prompt = (.*);', page)[1]
    assert json.loads(encoded) == prompt
    assert "window.open('https://chatgpt.com/'" in page
    assert 'chatgpt.com/?' not in page and 'fetch(' not in page


def test_one_optimizer_at_a_time_calls_only_that_provider(cfg):
    cfg, integration, repo = setup(cfg)
    calls = []
    study = optimize_prompts(cfg, repo, SAMPLES[0]['prompt'], integration=integration,
                             provider_factory=factory(calls), keys=('gemini_flash',))
    assert [call[0] for call in calls] == ['gemini']
    assert study['status'] == 'completed' and [row['key'] for row in study['optimizations']] == ['gemini_flash']


def scripted(replies, calls):
    """A provider that answers each request with the next reply, recording what it was sent."""
    def make(config):
        class Scripted:
            def complete(self, messages, *args):
                calls.append((config.name, messages))
                text = replies[min(len([c for c in calls if c[0] == config.name]), len(replies)) - 1]
                return Completion(text, 30, 5, 10, model=config.model, finish_reason='stop')
        return Scripted()
    return make


def test_a_rejected_rewrite_gets_one_retry_with_the_reasons(cfg):
    cfg, integration, repo = setup(cfg)
    original = 'Hi! Could you please write a climate report comparing the last 15 years, in under 500 words? Thanks!'
    calls = []
    study = optimize_prompts(cfg, repo, original, integration=integration, keys=('qwen',),
                             provider_factory=scripted(['Write a climate report.',
                                                        'Write a climate report on the last 15 years, under 500 words.'], calls))
    row = study['optimizations'][0]
    assert len(calls) == 2
    assert 'number was not preserved' in calls[1][1][-1]['content']
    assert calls[1][1][-2] == {'role': 'assistant', 'content': 'Write a climate report.'}
    assert row['status'] == 'accepted' and row['first_attempt']['checks']
    assert row['optimized_prompt'] == 'Write a climate report on the last 15 years, under 500 words.'


def test_a_rewrite_that_passes_first_time_is_not_retried(cfg):
    cfg, integration, repo = setup(cfg)
    calls = []
    study = optimize_prompts(cfg, repo, 'Hi! Please explain recursion in Python. Thanks so much!', integration=integration,
                             keys=('qwen',), provider_factory=scripted(['Explain recursion in Python.'], calls))
    assert len(calls) == 1 and study['optimizations'][0]['status'] == 'accepted'
    assert 'first_attempt' not in study['optimizations'][0]


@pytest.mark.parametrize('original,rewrite,problem', [
    ('Please summarise this in under 200 words.', 'Summarise this in 200 words.', 'limit on 200'),
    ('Please write at least 3 examples for me.', 'Write up to 3 examples.', 'limit on 3'),
    ("Please explain pivot tables. Please don't suggest VBA.", 'Explain pivot tables and VBA.', '"not"'),
    ('Please translate "Good morning, team" into French for me.', 'Translate "Good morning team" into French.', 'Quoted text'),
    ('Please return the result as JSON with keys name and age.', 'Return the result with keys name and age.', 'JSON'),
])
def test_rewrite_checks_catch_changed_limits_negations_quotes_and_acronyms(original, rewrite, problem):
    checks = rewrite_checks(original, Completion(rewrite, 30, 5, 10, model='m', finish_reason='stop'),
                            TokenCounter('', 'o200k_base'), TokenCounter('', 'o200k_base').count(original))
    assert any(problem in check for check in checks)


@pytest.mark.parametrize('original,rewrite', [
    ('The sheet has around 12,000 rows. Please sum them.', 'Sum the sheet (~12000 rows).'),
    ('Please keep it to no more than 200 words, thank you so much.', 'Keep it ≤200 words.'),
    ('Please give me at least 3 sources and do not use Wikipedia, thanks!', 'Give 3+ sources; no Wikipedia.'),
])
def test_rewrite_checks_accept_equivalent_wording(original, rewrite):
    assert rewrite_checks(original, Completion(rewrite, 30, 5, 10, model='m', finish_reason='stop'),
                          TokenCounter('', 'o200k_base'), TokenCounter('', 'o200k_base').count(original)) == []
