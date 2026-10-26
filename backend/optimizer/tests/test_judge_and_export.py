import json
from dataclasses import replace

import pytest

from app.engine import Engine
from app.evaluation import DIMENSIONS
from app.main import export_csv
from app.providers import Completion
from app.storage import Repository
from tests.test_core import Fake


class JudgeFake(Fake):
    def complete(self, messages, max_tokens, temperature):
        if messages[0]['role'] == 'system':
            return Completion(json.dumps({'A':dict.fromkeys(DIMENSIONS,8), 'B':dict.fromkeys(DIMENSIONS,9),
                                           'notes':'Both considered against original task.'}),
                              200,100,15,'judge-request','test-model','stop')
        return super().complete(messages,max_tokens,temperature)


def test_judge_cost_is_research_overhead_not_production_cost(cfg):
    cfg = replace(cfg, demo=False)
    engine = Engine(cfg, Repository(cfg.database), providers={'qwen':Fake(), 'openai':JudgeFake()})
    row = engine.run('Original prompt containing much more information than the short candidate.')
    path_cost = row['metrics']['tokenz_cost_usd']
    initial_spend = row['metrics']['research_spend_usd']
    engine.judge(row)
    assert row['evaluation']['method'] == 'llm_judge'
    assert row['metrics']['tokenz_cost_usd'] == path_cost
    assert row['metrics']['research_spend_usd'] == pytest.approx(initial_spend + .0004)
    assert len(row['judge_calls']) == 1
    assert row['versions']['evaluator_template_sha256']


def test_malformed_judge_still_records_spend(cfg):
    cfg = replace(cfg, demo=False)
    engine = Engine(cfg, Repository(cfg.database), providers={'qwen':Fake(), 'openai':Fake('not JSON')})
    row = engine.run('Original prompt containing much more information than the short candidate.')
    with pytest.raises(ValueError,match='invalid rubric JSON'):
        engine.judge(row)
    assert len(engine.repo.get(row['id'])['judge_calls']) == 1


def test_fenced_judge_json_is_accepted(cfg):
    cfg = replace(cfg, demo=False)
    target = JudgeFake()
    engine = Engine(cfg, Repository(cfg.database), providers={'qwen':Fake(), 'openai':target})
    row = engine.run('Original prompt containing much more information than the short candidate.')
    original = target.complete
    def fenced(*args):
        result = original(*args)
        result.text = '```json\n' + result.text + '\n```'
        return result
    target.complete = fenced
    engine.judge(row)
    assert row['evaluation']['method'] == 'llm_judge'


def test_export_csv_escapes_formulas():
    text = export_csv([{'id':'=malicious()', 'prompt_id':'@bad', 'metrics':{}}])
    assert "'=malicious()" in text
    assert "'@bad" in text
