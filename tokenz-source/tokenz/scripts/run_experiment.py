"""Explicitly selected, bounded integration experiments. All targets must be free."""
import argparse
import csv
import io
import json
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ROOT, load_settings
from app.integration_config import load_integration_settings, optimizer_registry
from app.live_setup import is_free_model
from app.storage import Repository


def load_dataset(path):
    rows = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list) or not rows:
        raise ValueError("Dataset must be a nonempty JSON array")
    identifiers = set()
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"].strip()
                or row["id"] in identifiers or not isinstance(row.get("category"), str)
                or not row["category"].strip() or not isinstance(row.get("prompt"), str)
                or not row["prompt"].strip()):
            raise ValueError("Each dataset row needs a unique ID, category and nonempty prompt")
        identifiers.add(row["id"])
    return rows


def experiment_csv(rows):
    """Include full text and metrics; neutralize spreadsheet formula cells."""
    flat = []
    for row in rows:
        fields = {key: row.get(key) for key in (
            "id", "prompt_id", "category", "status", "original_prompt", "optimized_prompt",
            "original_prompt_tokens", "optimized_prompt_tokens", "optimizer_provider", "optimizer_model",
            "optimizer_strategy", "optimizer_prompt_version", "target_model", "strategy")}
        fields.update(baseline_answer=row.get("baseline", {}).get("text"),
                      optimized_answer=row.get("optimized_response", {}).get("text"))
        fields.update(row.get("metrics", {}))
        for prefix, name in [('baseline', 'baseline'), ('optimized_target', 'optimized_response')]:
            call = row.get(name) or {}
            fields.update({prefix + '_' + field: call.get(field)
                           for field in ('input_tokens', 'output_tokens', 'latency_ms', 'cost_usd', 'usage_source')})
        calls = row.get('optimizer_calls')
        for field in ('input_tokens', 'output_tokens'):
            counts = [call.get(field) for call in calls] if isinstance(calls, list) else None
            fields['optimizer_' + field] = (sum(counts) if counts is not None
                                             and all(value is not None for value in counts) else None)
        human = row.get('human_review') or {}
        fields.update({
            'human_baseline_quality_1_to_5': human.get('baseline_quality'),
            'human_optimized_quality_1_to_5': human.get('optimized_quality'),
            'human_quality_retention_pct': human.get('quality_retention_pct'),
            'meaning_preserved': human.get('meaning_preserved'), 'human_notes': human.get('notes'),
        })
        flat.append(fields)
    if not flat:
        return ""
    output = io.StringIO()
    headers = list(dict.fromkeys(key for row in flat for key in row))
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for row in flat:
        writer.writerow({key: "'" + value if isinstance(value, str) and
                         value.lstrip().startswith(("=", "+", "-", "@")) else value
                         for key, value in row.items()})
    return output.getvalue()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run explicitly selected Tokenz optimizers with a fixed free target")
    parser.add_argument("--models", required=True, help="Comma-separated registry keys, e.g. openrouter_free")
    parser.add_argument("--dataset", type=Path, default=ROOT / "data/test_prompts.json")
    parser.add_argument("--target-model", help="A fixed OpenRouter model ending in :free; never openrouter/free")
    parser.add_argument("--strategy", choices=["balanced", "conservative", "aggressive", "target_ratio"], default="balanced")
    parser.add_argument("--ratio", type=float, default=.75, help="Approximate retained prompt fraction (0, 1]")
    parser.add_argument("--limit", type=int, default=1, help="Number of dataset prompts; default 1")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "results/integration")
    parser.add_argument("--include-gemini", action="store_true")
    parser.add_argument("--include-openrouter", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Validate local readiness; no network, storage or inference")
    args = parser.parse_args(argv)
    if args.limit < 1 or not 0 < args.ratio <= 1:
        parser.error("--limit must be positive and --ratio must be within (0, 1]")
    keys = list(dict.fromkeys(item.strip() for item in args.models.split(",") if item.strip()))
    if not keys:
        parser.error("--models must explicitly select at least one optimizer")
    for include, key in ((args.include_gemini, "gemini_flash"), (args.include_openrouter, "openrouter_free")):
        if include and key not in keys:
            keys.append(key)
    try:
        dataset = load_dataset(args.dataset)[:args.limit]
        integration = load_integration_settings()
        registry = optimizer_registry(integration)
        settings = load_settings()
    except Exception:  # noqa: BLE001 - raw provider/config errors may contain credentials
        print("Configuration or dataset invalid. Check the file and settings; no requests sent or secrets shown.")
        return 2
    if any(key not in registry for key in keys):
        print("Unknown optimizer selection. Use qwen, gpt_oss_20b, gpt_oss_120b, gemini_flash or openrouter_free.")
        return 2
    target = args.target_model or settings.providers["openrouter_target"].model
    if not is_free_model(target) or target == "openrouter/free":
        print("BLOCKED: the target must be a fixed :free OpenRouter model. OpenAI paid targets are disabled.")
        return 2
    blocked = []
    for key in keys:
        if not registry[key]["available"]:
            blocked.append(f"{key}: {registry[key]['reason']}")
    if not integration.openrouter_api_key:
        blocked.append("Free target: OPENROUTER_API_KEY is not configured")
    print("OpenAI/ChatGPT API path BLOCKED by free-only policy. The selected answer model is an OpenRouter alternative.")
    print(f"Plan: {len(dataset)} prompt(s), {len(keys)} independently selected optimizer(s), one fixed free target.")
    print("No AI judge requested. Human quality ratings remain unmeasured until entered.")
    if blocked:
        for message in blocked:
            print("NOT READY: " + message)
        return 2
    if args.dry_run:
        print("DRY RUN valid locally. No requests sent; authentication, model availability and results not verified.")
        return 0
    from app.methodology import run_methodology
    from app.study import summary_text

    settings = replace(settings, demo=False, free_only=True, store=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    repo = Repository(settings.database, enabled=True)
    try:
        study = run_methodology(settings, repo, dataset, keys, integration=integration,
                                target_model=target, strategy=args.strategy, target_ratio=args.ratio,
                                adaptive=False, judge=False)
    except Exception:  # noqa: BLE001 - raw provider/config errors may contain credentials
        print("Experiment could not start. Check provider readiness in Settings. No raw provider error shown.")
        return 1
    stem = args.output_dir / study["id"]
    stem.with_suffix(".json").write_text(json.dumps(study, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    stem.with_suffix(".csv").write_text(experiment_csv(study["experiments"]), encoding="utf-8-sig")
    stem.with_suffix(".md").write_text(summary_text(study), encoding="utf-8")
    completed = sum(row.get("status") == "completed" for row in study["experiments"])
    print(f"Saved {completed}/{len(dataset) * len(keys)} completed comparisons to JSON, CSV, Markdown and SQLite.")
    print(f"Report directory: {args.output_dir.resolve()}")
    return 0 if completed == len(dataset) * len(keys) else 1


if __name__ == "__main__":
    raise SystemExit(main())
