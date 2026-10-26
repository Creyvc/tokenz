import hashlib
import json
import time

from app.config import ROOT
from app.engine import VERSION, Budget, Engine


def load_dataset(path):
    raw = path.read_bytes()
    rows = [json.loads(line) for line in raw.decode("utf-8-sig").splitlines() if line.strip()]
    ids = set()
    for row in rows:
        if not isinstance(row.get("id"), str) or row["id"] in ids or not row.get("category"):
            raise ValueError("Dataset needs unique string IDs and categories")
        if not isinstance(row.get("prompt"), str) or not row["prompt"].strip():
            raise ValueError("Each dataset row needs a nonempty prompt")
        ids.add(row["id"])
    return rows, hashlib.sha256(raw).hexdigest()


def run_batch(settings, repo, path, providers, strategies, limit=30, failed_only=False, adaptive=False):
    if not settings.store:
        raise ValueError("Batch resume requires TOKENZ_STORE_DATA=true")
    dataset, dataset_hash = load_dataset(path)
    if limit < 1:
        raise ValueError("Limit must be positive")
    fingerprints = {s: hashlib.sha256((ROOT / "prompts" / f"optimizer_{s}.md").read_bytes()).hexdigest()
                    for s in strategies}
    job_config = {"dataset": dataset_hash, "providers": {p: settings.providers[p].public() for p in providers},
                  "target": settings.providers[settings.target].public(), "strategies": fingerprints,
                  "free_only": settings.free_only,
                  "demo": settings.demo, "ratio": settings.target_ratio, "adaptive": adaptive,
                  "skip": settings.skip_below, "target_temperature": settings.target_temperature,
                  "optimizer_temperature": settings.optimizer_temperature,
                  "max_output": settings.max_output, "optimizer_max_output": settings.optimizer_max_output,
                  "encoding": settings.encoding, "source_version": VERSION}
    job = hashlib.sha256(json.dumps(job_config, sort_keys=True).encode()).hexdigest()
    existing = [r for r in repo.all() if r.get("metadata", {}).get("batch_id") == job]
    budget = Budget(settings.budget)
    budget.restore(existing)
    engine = Engine(settings, repo, budget=budget)
    results = []
    for item in dataset[:limit]:
        for provider in providers:
            for strategy in strategies:
                key = hashlib.sha256(f"{job}:{item['id']}:{provider}:{strategy}".encode()).hexdigest()
                old = repo.get(key)
                if old and old["status"] == "completed":
                    continue
                if failed_only and (not old or old["status"] != "failed"):
                    continue
                # Keep all attempts for cost recovery and audit; never erase a billed failure.
                if old:
                    archived = dict(old)
                    archived["id"] = key + ":attempt:" + str(time.time_ns())
                    archived["archived_attempt"] = True
                    repo.save(archived)
                row = engine.run(item["prompt"], prompt_id=item["id"], category=item["category"],
                                 provider=provider, strategy=strategy, adaptive=adaptive, run_id=key,
                                 metadata={"batch_id": job, "dataset_sha256": dataset_hash, "dataset_version": "v1"},
                                 auto_check=item.get("automatic_check"))
                results.append(row)
                code = row.get("error", {}).get("code")
                if code in {"BUDGET_EXCEEDED", "BILLING_UNCERTAIN", "PRICING_REQUIRED", "AUTHENTICATION",
                            "CONFIGURATION", "QUOTA_EXHAUSTED", "RATE_LIMIT", "FREE_ONLY", "FREE_MODEL_UNAVAILABLE", "UNEXPECTED_COST"} or row.get("billing_uncertain"):
                    return results
                time.sleep(settings.delay)
    return results
