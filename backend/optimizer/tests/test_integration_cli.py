"""CLI validation and redaction checks. No test sends real provider requests."""
import json
import os
import subprocess
import sys

import httpx
import pytest

from app.config import ROOT
from app.integration_config import IntegrationConfig
from scripts.check_api_keys import catalog_probe
from scripts.run_experiment import experiment_csv, load_dataset


def cli(script, *args, env=None):
    environment = os.environ.copy()
    environment.update({"GROQ_API_KEY": "", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "",
                        "OPENROUTER_API_KEY": "", "OPENAI_API_KEY": "",
                        "TOKENZ_GROQ_FREE_TIER_CONFIRMED": "false",
                        "TOKENZ_GEMINI_FREE_TIER_CONFIRMED": "false"})
    environment.update(env or {})
    return subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args], env=environment,
                          cwd=ROOT, capture_output=True, text=True, timeout=30, check=False)


@pytest.mark.parametrize("script", ["check_api_keys.py", "run_experiment.py"])
def test_help(script):
    result = cli(script, "--help")
    assert result.returncode == 0
    assert "usage:" in result.stdout


def test_explicit_selection_required_even_for_dry_run():
    result = cli("run_experiment.py", "--dry-run")
    assert result.returncode == 2
    assert "--models" in result.stderr


def test_local_check_does_not_claim_authentication_or_print_keys():
    secret = "synthetic-secret-not-for-output"
    result = cli("check_api_keys.py", env={"GROQ_API_KEY": secret, "OPENAI_API_KEY": secret})
    assert result.returncode == 0
    assert "LOCAL CONFIG ONLY" in result.stdout
    assert "[BLOCKED] OpenAI" in result.stdout
    assert "[SKIP] qwen" in result.stdout
    assert "billing disabled" in result.stdout
    assert secret not in result.stdout + result.stderr


def test_dry_run_missing_configuration_is_safe(tmp_path):
    result = cli("run_experiment.py", "--models", "qwen", "--dry-run", "--output-dir", str(tmp_path / "new"))
    assert result.returncode == 2
    assert "NOT READY" in result.stdout
    assert "API key missing" in result.stdout
    assert not (tmp_path / "new").exists()


def test_dry_run_valid_local_config_never_claims_live_result(tmp_path):
    secret = "synthetic-secret-not-for-output"
    result = cli("run_experiment.py", "--models", "openrouter_free", "--dry-run",
                 "--output-dir", str(tmp_path / "new"),
                 env={"OPENROUTER_API_KEY": secret, "OPENROUTER_MODEL": "openrouter/free"})
    assert result.returncode == 0, result.stdout + result.stderr
    assert "No requests sent" in result.stdout
    assert "not verified" in result.stdout
    assert secret not in result.stdout + result.stderr
    assert not (tmp_path / "new").exists()


@pytest.mark.parametrize("target", ["gpt-5.5", "openrouter/free", "vendor/model"])
def test_nonfree_and_random_targets_are_blocked(target):
    result = cli("run_experiment.py", "--models", "openrouter_free", "--dry-run", "--target-model", target)
    assert result.returncode == 2
    assert "BLOCKED" in result.stdout


@pytest.mark.parametrize("args", [("--limit", "0"), ("--ratio", "nan"), ("--ratio", "1.1")])
def test_cli_invalid_limits(args):
    result = cli("run_experiment.py", "--models", "openrouter_free", "--dry-run", *args)
    assert result.returncode == 2


def test_dataset_has_all_requested_categories_and_distinct_prompts():
    rows = load_dataset(ROOT / "data/test_prompts.json")
    assert 30 <= len(rows) <= 50
    assert len({row["prompt"] for row in rows}) == len(rows)
    assert {"coding", "data_analysis", "writing", "summarization", "explanation", "reasoning",
            "planning", "extraction", "education", "research-style task"} <= {row["category"] for row in rows}
    assert min(len(row["prompt"].split()) for row in rows) < 40
    assert max(len(row["prompt"].split()) for row in rows) > 300


def test_dataset_rejects_duplicate_ids(tmp_path):
    path = tmp_path / "dataset.json"
    path.write_text(json.dumps([{"id": "a", "category": "x", "prompt": "abc"}] * 2))
    with pytest.raises(ValueError, match="unique"):
        load_dataset(path)


def test_catalog_probe_never_forwards_key_to_another_provider():
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"models": [{"name": "models/test-model"}]})

    config = IntegrationConfig(groq_api_key="groq-secret", gemini_api_key="gemini-secret")
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        probe = catalog_probe("gemini", config, client)
        blocked = catalog_probe("openai", config, client)
    assert probe["models"] == {"test-model"}
    assert len(seen) == 1
    assert seen[0].headers["x-goog-api-key"] == "gemini-secret"
    assert "authorization" not in seen[0].headers
    assert "secret" not in str(seen[0].url)
    assert blocked["status"] == "BLOCKED"


def test_catalog_error_body_is_never_returned():
    secret = "private-material"
    with httpx.Client(transport=httpx.MockTransport(
            lambda request: httpx.Response(401, text=secret))) as client:
        probe = catalog_probe("groq", IntegrationConfig(groq_api_key=secret), client)
    assert probe["status"] == "ERROR"
    assert "401" in probe["reason"]
    assert secret not in str(probe)


def test_csv_neutralizes_formulas_and_keeps_full_text():
    csv = experiment_csv([{"id": "x", "original_prompt": "=EVIL()", "optimized_prompt": "short",
                           "baseline": {"text": " @EVIL()"}, "metrics": {"prompt_reduction_pct": 25}}])
    assert "'=EVIL()" in csv
    assert "' @EVIL()" in csv
    assert "short" in csv
