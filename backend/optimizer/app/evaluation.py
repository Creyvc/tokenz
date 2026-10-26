import ast
import json
import math
import statistics

DIMENSIONS = ("correctness", "completeness", "relevance", "instruction_following",
              "format_preservation", "factual_consistency")


def quality(scores):
    if set(scores) != set(DIMENSIONS):
        raise ValueError("Provide all six rubric dimensions")
    if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 10 for v in scores.values()):
        raise ValueError("Scores must be finite numbers from 0 to 10")
    return statistics.mean(scores.values())


def manual_evaluation(baseline, optimized, notes="", evaluator="human"):
    a, b = quality(baseline), quality(optimized)
    return {"method": "human", "evaluator": evaluator, "baseline": baseline, "optimized": optimized,
            "baseline_quality": a, "optimized_quality": b,
            "quality_retention_pct": b / a * 100 if a else None, "notes": notes}


def automatic_check(answer, spec):
    """Checks data/syntax only. Never execute model-generated code."""
    kind = spec["kind"]
    if kind == "exact":
        return answer.strip() == str(spec["expected"]).strip()
    if kind == "numeric":
        try:
            result = float(answer.strip())
            return math.isfinite(result) and math.isclose(result, float(spec["expected"]),
                                                         abs_tol=spec.get("tolerance", 1e-6), rel_tol=0)
        except ValueError:
            return False
    if kind == "json":
        try:
            return json.loads(answer) == spec["expected"]
        except ValueError:
            return False
    if kind == "python_syntax":
        try:
            ast.parse(answer)
            return True
        except SyntaxError:
            return False
    raise ValueError("Unknown automatic check")


def summarize(records, group_by="optimizer_provider", min_quality=.95):
    groups = {}
    for row in records:
        if row.get("demo") or row.get("archived_attempt"):
            continue
        key = row.get(group_by) if group_by != "length_group" else row.get("length_group")
        groups.setdefault(key, []).append(row)
    output = []
    for key, rows in groups.items():
        def values(name, rows=rows):
            return [r["metrics"][name] for r in rows if r.get("status") == "completed"
                    and r.get("metrics", {}).get(name) is not None]
        reductions = values("chatgpt_input_reduction_pct")
        retentions = values("quality_retention_pct")
        costs = values("cost_difference_usd")
        latency = values("latency_difference_ms")
        output.append({"group": key, "experiments": len(rows), "token_samples": len(reductions),
                       "quality_samples": len(retentions), "cost_samples": len(costs),
                       "mean_token_reduction": statistics.mean(reductions) if reductions else None,
                       "median_token_reduction": statistics.median(reductions) if reductions else None,
                       "stdev_token_reduction": statistics.stdev(reductions) if len(reductions) > 1 else None,
                       "mean_quality_retention": statistics.mean(retentions) if retentions else None,
                       "median_quality_retention": statistics.median(retentions) if retentions else None,
                       "mean_cost_difference": statistics.mean(costs) if costs else None,
                       "mean_latency_difference_ms": statistics.mean(latency) if latency else None,
                       "failure_rate": sum(r.get("status") != "completed" for r in rows) / len(rows),
                       "net_saving_fraction": sum(c > 0 for c in costs) / len(costs) if costs else None,
                       "quality_drop_fraction": sum(q < min_quality * 100 for q in retentions) / len(retentions)
                       if retentions else None})
    return output
