import json
import re

from app.prompt_optimization import optimize_prompts
from app.providers import Completion
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
