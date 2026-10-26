import argparse
import csv
import io
import json
import logging
from pathlib import Path

from app.batch import run_batch
from app.config import ROOT, load_settings
from app.engine import Engine
from app.evaluation import summarize
from app.live_setup import readiness
from app.storage import Repository


def export_csv(rows):
    flattened = [{**{k: r.get(k) for k in ("id", "prompt_id", "category", "optimizer_provider", "optimizer_model",
                                                       "strategy", "demo", "status")}, **r.get("metrics", {})} for r in rows]
    if not flattened:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(flattened[0]))
    writer.writeheader()
    # Avoid formula execution when a CSV is opened in a spreadsheet app.
    for row in flattened:
        writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@")) else v
                         for k, v in row.items()})
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description="Tokenz prompt optimization research")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="Validate setup without sending requests")
    sub.add_parser("preflight", help="Report missing live settings without exposing secrets or sending requests")
    count = sub.add_parser("count")
    count.add_argument("text")
    run = sub.add_parser("run")
    run.add_argument("prompt")
    run.add_argument("--provider", choices=["qwen", "deepseek", "openrouter_optimizer"])
    run.add_argument("--strategy", choices=["simple", "structured", "delete_only", "aggressive"])
    run.add_argument("--adaptive", action="store_true")
    batch = sub.add_parser("batch")
    batch.add_argument("--dataset", type=Path, default=ROOT / "datasets/prompts.jsonl")
    batch.add_argument("--providers", nargs="+", choices=["qwen", "deepseek", "openrouter_optimizer"])
    batch.add_argument("--strategies", nargs="+", choices=["simple", "structured", "delete_only", "aggressive"], default=["structured"])
    batch.add_argument("--limit", type=int, default=30)
    batch.add_argument("--failed-only", action="store_true")
    batch.add_argument("--adaptive", action="store_true")
    export = sub.add_parser("export")
    export.add_argument("--format", choices=["json", "csv"], default="json")
    export.add_argument("--output", type=Path, required=True)
    summary = sub.add_parser("summary")
    summary.add_argument("--group", choices=["optimizer_provider", "optimizer_model", "strategy", "category", "length_group"], default="optimizer_provider")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    cfg = load_settings()
    if args.command == "preflight":
        print(json.dumps(readiness(cfg), indent=2))
        return
    if args.command == "check":
        print(json.dumps({"mode": "demo" if cfg.demo else "live", "store_data": cfg.store,
                          "providers": {name: {"model": p.model, "key_configured": bool(p.api_key),
                                                "url_configured": bool(p.base_url)} for name, p in cfg.providers.items()}}))
        return
    repo = Repository(cfg.database, cfg.store)
    if args.command == "export":
        rows = repo.all()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(export_csv(rows) if args.format == "csv" else json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Exported {len(rows)} records to {args.output}")
    elif args.command == "summary":
        print(json.dumps(summarize(repo.all(), args.group, cfg.min_quality), indent=2))
    elif args.command == "batch":
        rows = run_batch(cfg, repo, args.dataset, args.providers or [cfg.optimizer], args.strategies, args.limit, args.failed_only, args.adaptive)
        print(json.dumps({"executed": len(rows), "completed": sum(r["status"] == "completed" for r in rows),
                          "last_error": rows[-1].get("error") if rows else None}))
    else:
        engine = Engine(cfg, repo)
        if args.command == "count":
            print(json.dumps({"tokens": engine.counter.count(args.text), **engine.counter.metadata()}))
        else:
            row = engine.run(args.prompt, provider=args.provider, strategy=args.strategy, adaptive=args.adaptive)
            print(json.dumps(row, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
