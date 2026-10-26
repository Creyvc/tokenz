"""Read-only comparison views, with no provider calls or semantic claims."""

import html
import json
import math
import re
from difflib import SequenceMatcher

from app.evaluation import DIMENSIONS


def _number(value):
    return value if type(value) in (int, float) and math.isfinite(value) else None


def _reduction(original, optimized):
    if original is None or optimized is None or original <= 0:
        return None
    return (original - optimized) / original * 100


def _highlight(text, matches, operations, side):
    """Escape all user/model text before adding only fixed, trusted markup."""
    cursor, parts = 0, []
    for tag, a0, a1, b0, b1 in operations:
        start, end = (a0, a1) if side == "original" else (b0, b1)
        if start == end:
            continue
        left, right = matches[start].start(), matches[end - 1].end()
        parts.append(html.escape(text[cursor:left]))
        value = html.escape(text[left:right])
        if tag != "equal":
            color = "#ffd9d2" if side == "original" else "#c8f3df"
            value = f'<mark style="background:{color};color:#152638;border-radius:3px;padding:1px 2px">{value}</mark>'
        parts.append(value)
        cursor = right
    parts.append(html.escape(text[cursor:]))
    return "".join(parts)


def text_diff(original, optimized):
    """Compare case-sensitive whitespace-delimited words, not meaning.

    changed_pct = 100 * (removed + added) / (original words + new words).
    A replacement counts once on each side. Whitespace changes are excluded
    from that percentage but remain visible in character counts and highlights.
    Two available empty texts have zero change; a missing text is unknown.
    Word and character reduction percentages are undefined for an empty original.
    """
    available = isinstance(original, str) and isinstance(optimized, str)
    original_matches = list(re.finditer(r"\S+", original)) if isinstance(original, str) else None
    optimized_matches = list(re.finditer(r"\S+", optimized)) if isinstance(optimized, str) else None
    result = {
        "available": available,
        "original_words": len(original_matches) if original_matches is not None else None,
        "optimized_words": len(optimized_matches) if optimized_matches is not None else None,
        "original_characters": len(original) if isinstance(original, str) else None,
        "optimized_characters": len(optimized) if isinstance(optimized, str) else None,
        "retained_words": None, "removed_words": None, "added_words": None,
        "changed_pct": None, "word_reduction_pct": None, "character_reduction_pct": None,
        "original_html": html.escape(original) if isinstance(original, str) else None,
        "optimized_html": html.escape(optimized) if isinstance(optimized, str) else None,
    }
    if not available:
        return result
    operations = SequenceMatcher(
        None, [m.group() for m in original_matches], [m.group() for m in optimized_matches],
        autojunk=False,
    ).get_opcodes()
    retained = sum(a1 - a0 for tag, a0, a1, _, _ in operations if tag == "equal")
    removed, added = len(original_matches) - retained, len(optimized_matches) - retained
    denominator = len(original_matches) + len(optimized_matches)
    result.update({
        "retained_words": retained, "removed_words": removed, "added_words": added,
        "changed_pct": (removed + added) / denominator * 100 if denominator else 0.0,
        "word_reduction_pct": _reduction(len(original_matches), len(optimized_matches)),
        "character_reduction_pct": _reduction(len(original), len(optimized)),
        "original_html": _highlight(original, original_matches, operations, "original"),
        "optimized_html": _highlight(optimized, optimized_matches, operations, "optimized"),
    })
    return result


def _mapping(value):
    return value if isinstance(value, dict) else {}


def _first_number(*values):
    return next((number for value in values if (number := _number(value)) is not None), None)


def _total(call):
    a, b = _number(call.get("input_tokens")), _number(call.get("output_tokens"))
    return a + b if a is not None and b is not None else None


def comparison_metrics(row):
    """Flatten a saved experiment for display without fabricating missing values.

    prompt_* and answer_* keys contain all text_diff fields. Target totals use
    provider request usage; pipeline_total_tokens additionally includes optimizer
    calls, but excludes the separate evaluation call. Quality remains a rubric
    estimate, independent of deterministic answer checks.
    """
    row = _mapping(row)
    baseline, optimized = _mapping(row.get("baseline")), _mapping(row.get("optimized_response"))
    saved, evaluation = _mapping(row.get("metrics")), _mapping(row.get("evaluation"))
    result = {}
    for name, original, shortened in (
        ("prompt", row.get("original_prompt"), row.get("optimized_prompt")),
        ("answer", baseline.get("text"), optimized.get("text")),
    ):
        result.update({f"{name}_{key}": value for key, value in text_diff(original, shortened).items()})
    for key in ("original_prompt_tokens", "optimized_prompt_tokens"):
        result[key] = _number(row.get(key))
    for name, call in (("baseline", baseline), ("optimized", optimized)):
        for key in ("input_tokens", "output_tokens", "latency_ms"):
            result[f"{name}_{key}"] = _number(call.get(key))
        result[f"{name}_total_tokens"] = _total(call)
    calls = row.get("optimizer_calls")
    totals = [_total(_mapping(call)) for call in calls] if isinstance(calls, list) else None
    overhead = sum(totals) if totals is not None and all(n is not None for n in totals) else None
    result["optimizer_total_tokens"] = overhead
    target = result["optimized_total_tokens"]
    result["pipeline_total_tokens"] = overhead + target if overhead is not None and target is not None else None
    result["prompt_token_reduction_pct"] = _reduction(
        result["original_prompt_tokens"], result["optimized_prompt_tokens"])
    result["target_input_reduction_pct"] = _reduction(
        result["baseline_input_tokens"], result["optimized_input_tokens"])
    dimensions = []
    for dimension in DIMENSIONS:
        a = _number(_mapping(evaluation.get("baseline")).get(dimension))
        b = _number(_mapping(evaluation.get("optimized")).get(dimension))
        dimensions.append({"dimension": dimension, "baseline": a, "optimized": b,
                           "difference": b - a if a is not None and b is not None else None})
    result["quality_dimensions"] = dimensions
    for name in ("baseline", "optimized"):
        scores = [item[name] for item in dimensions]
        average = sum(scores) / len(scores) if all(n is not None for n in scores) else None
        result[f"{name}_quality"] = _first_number(
            evaluation.get(f"{name}_quality"), average, saved.get(f"{name}_quality"))
    a, b = result["baseline_quality"], result["optimized_quality"]
    result["quality_retention_pct"] = b / a * 100 if a is not None and a > 0 and b is not None else None
    # Old records can have a retained ratio without the underlying rubric scores.
    if a is None or b is None:
        result["quality_retention_pct"] = _first_number(
            evaluation.get("quality_retention_pct"), saved.get("quality_retention_pct"))
    result["quality_difference"] = b - a if a is not None and b is not None else None
    checks = _mapping(row.get("automatic_checks"))
    for name, key in (("baseline", "baseline"), ("optimized", "optimized_response")):
        value = checks.get(key)
        result[f"{name}_check"] = value if type(value) is bool else None
    return result


def detailed_html_report(study):
    """Portable, offline comparison report. All dynamic text is escaped."""
    study = _mapping(study)

    def escape(value):
        return html.escape(str(value)) if value is not None else "Not measured"

    def number(value, suffix=""):
        value = _number(value)
        return f"{value:,.2f}{suffix}" if value is not None else "Not measured"

    def check(value):
        return "Passed" if value is True else "Failed" if value is False else "Not measured"

    def table(headers, rows):
        head = "".join(f"<th scope='col'>{escape(h)}</th>" for h in headers)
        body = "".join("<tr>" + "".join(f"<td>{escape(v)}</td>" for v in row) + "</tr>" for row in rows)
        return f"<div class='table-scroll'><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>"

    def text_pair(label, metrics, prefix):
        panels = []
        for name, title in (("original", "Original"), ("optimized", "Shortened")):
            value = metrics[f"{prefix}_{name}_html"]
            content = value if value is not None else "<em>Not measured</em>"
            if value == "":
                content = "<em>Empty text</em>"
            panels.append(f"<section><h4>{title}</h4><pre>{content}</pre></section>")
        return f"<h3>{escape(label)}</h3><div class='pair'>{''.join(panels)}</div>"

    entries = []
    records = study.get("experiments")
    records = records if isinstance(records, list) else []
    for index, raw in enumerate(records, 1):
        row = _mapping(raw)
        metrics = comparison_metrics(row)
        evaluation = _mapping(row.get("evaluation"))
        title = f"{index}. {row.get('prompt_id') or row.get('category') or 'Comparison'}"
        details = table(["Measure", "Original", "Shortened"], [
            ["Prompt tokens (local counter)", number(metrics["original_prompt_tokens"]),
             number(metrics["optimized_prompt_tokens"])],
            ["Target input tokens (provider request)", number(metrics["baseline_input_tokens"]),
             number(metrics["optimized_input_tokens"])],
            ["Target answer tokens", number(metrics["baseline_output_tokens"]),
             number(metrics["optimized_output_tokens"])],
            ["Target total tokens", number(metrics["baseline_total_tokens"]),
             number(metrics["optimized_total_tokens"])],
            ["Target latency (ms)", number(metrics["baseline_latency_ms"]),
             number(metrics["optimized_latency_ms"])],
            ["Quality score / 10", number(metrics["baseline_quality"]), number(metrics["optimized_quality"])],
            ["Exact answer check", check(metrics["baseline_check"]), check(metrics["optimized_check"])],
        ])
        changes = table(["Measure", "Prompt", "Answer"], [
            ["Text changed", number(metrics["prompt_changed_pct"], "%"),
             number(metrics["answer_changed_pct"], "%")],
            ["Word reduction", number(metrics["prompt_word_reduction_pct"], "%"),
             number(metrics["answer_word_reduction_pct"], "%")],
            ["Character reduction", number(metrics["prompt_character_reduction_pct"], "%"),
             number(metrics["answer_character_reduction_pct"], "%")],
            ["Retained words", number(metrics["prompt_retained_words"]), number(metrics["answer_retained_words"])],
            ["Removed words", number(metrics["prompt_removed_words"]), number(metrics["answer_removed_words"])],
            ["Added words", number(metrics["prompt_added_words"]), number(metrics["answer_added_words"])],
        ])
        rubric = table(["Quality dimension / 10", "Original", "Shortened", "Change in points"], [
            [item["dimension"].replace("_", " ").title(), number(item["baseline"]),
             number(item["optimized"]), number(item["difference"])] for item in metrics["quality_dimensions"]
        ])
        headline = table(["Summary measure", "Measured value"], [
            ["Prompt token reduction (local counter)", number(metrics["prompt_token_reduction_pct"], "%")],
            ["Target input reduction (provider request)", number(metrics["target_input_reduction_pct"], "%")],
            ["Quality retained relative to original", number(metrics["quality_retention_pct"], "%")],
            ["Optimizer overhead tokens", number(metrics["optimizer_total_tokens"])],
            ["Shortened pipeline tokens including optimizer", number(metrics["pipeline_total_tokens"])],
        ])
        error = row.get("error")
        error_html = ""
        if error is not None:
            error_html = f"<p class='error'><strong>Recorded error:</strong> {escape(json.dumps(error))}</p>"
        spec = row.get("automatic_check_spec")
        spec_html = f"<p><strong>Exact check:</strong> {escape(json.dumps(spec))}</p>" if spec is not None else ""
        human = _mapping(row.get('human_review'))
        human_html = ''
        if human:
            human_html = ('<h3>Human quality review, 1–5 scale</h3>' + table(
                ['Criterion', 'Original / 5', 'Optimized / 5'], [
                    [name.replace('_', ' ').title(), number(_mapping(human.get('baseline')).get(name)),
                     number(_mapping(human.get('optimized')).get(name))]
                    for name in ('correctness', 'completeness', 'instruction_following', 'relevance', 'meaning_preservation')])
                + '<p>Human mean quality: ' + number(human.get('baseline_quality')) + ' original, '
                + number(human.get('optimized_quality')) + ' optimized. Human quality retained: '
                + number(human.get('quality_retention_pct'), '%') + '.</p><p>Intention preserved: '
                + escape(human.get('meaning_preserved')) + '</p><p>' + escape(human.get('notes')) + '</p>')
        mode = "Sample data" if row.get("demo", study.get("demo")) else "Recorded experiment"
        entries.append(
            f"<article><h2>{escape(title)}</h2>"
            f"<p>{escape(mode)} | Status: {escape(row.get('status'))}</p>"
            f"<p><strong>Target model:</strong> {escape(row.get('target_model'))}<br>"
            f"<strong>Optimizer:</strong> {escape(row.get('optimizer_model'))}</p>"
            f"{error_html}{headline}<h3>Usage and answer checks</h3>{details}"
            f"{text_pair('Prompt before and after', metrics, 'prompt')}"
            f"{text_pair('Answer before and after', metrics, 'answer')}"
            f"<h3>Text change details</h3>{changes}"
            f"<h3>Quality details</h3>{rubric}{spec_html}"
            f"<p><strong>Reviewer:</strong> {escape(evaluation.get('evaluator'))}"
            f" | <strong>Method:</strong> {escape(evaluation.get('method'))}</p>"
            f"<p><strong>Review notes:</strong> {escape(evaluation.get('notes'))}</p>"
            f"<p>{escape(evaluation.get('caveat') or 'Rubric scores are estimates. Review the actual answers and exact checks.')}</p>"
            f"{human_html}</article>"
        )
    if not entries:
        entries.append("<p>No comparison records are available.</p>")
    styles = """
        :root { color-scheme: light; font-family: system-ui, sans-serif; color: #152638; background: #f4f7fb; }
        * { box-sizing: border-box; } body { margin: 0; line-height: 1.55; }
        main { max-width: 1180px; margin: auto; padding: 40px 24px; }
        h1 { font-size: 2.5rem; margin-bottom: 10px; } h2 { font-size: 1.65rem; } h3 { margin-top: 28px; }
        article { background: white; padding: 28px; margin-top: 32px; border: 1px solid #ccd7e4; border-radius: 12px; }
        .pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; }
        .pair section { min-width: 0; } pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere;
        background: #f4f7fb; padding: 18px; border: 1px solid #dce4ef; border-radius: 8px; }
        table { border-collapse: collapse; width: 100%; margin: 12px 0; font-variant-numeric: tabular-nums; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #dce4ef; vertical-align: top; }
        th { background: #eaf0f8; } .table-scroll { overflow-x: auto; } .error { color: #952d22; }
        .guide { border-left: 4px solid #148467; padding-left: 18px; }
        @media(max-width:700px) { .pair { grid-template-columns: 1fr; } article { padding: 18px; } }
        @media print { body { background: white; } main { padding: 0; } article { border: 0; border-top: 1px solid #999;
        border-radius: 0; padding: 10px 0; } h2,h3,h4 { break-after: avoid; } tr,pre { break-inside: avoid; } }
    """
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>Tokenz detailed comparison</title><style>{styles}</style></head><body><main>"
        "<h1>Tokenz comparison report</h1>"
        f"<p>Study: {escape(study.get('id'))} | Created: {escape(study.get('created_at'))}</p>"
        "<div class='guide'><p>Red highlights show removed or replaced words. Green highlights show added or replaced words.</p>"
        "<p>Text changed = 100 × (removed words + added words) ÷ (original words + shortened words). "
        "Words are compared with case and punctuation preserved. This measures wording, not meaning. "
        "Whitespace changes do not count as word changes.</p>"
        "<p>Reduction = 100 × (original count − shortened count) ÷ original count. "
        "Negative reduction means growth. Local prompt tokens and provider request tokens can differ.</p>"
        "<p>Quality retention = shortened score ÷ original score × 100. It can exceed 100%. "
        "A zero original score gives no defined ratio. High retention can occur when both answers are wrong. "
        "Exact checks test only their specified requirements. Not measured means unavailable, not zero.</p>"
        "<p>Pipeline usage includes optimizer and shortened target calls, excluding the separate quality review. "
        "Shorter target inputs do not guarantee fewer pipeline tokens or financial savings.</p></div>"
        f"{''.join(entries)}</main></body></html>"
    )
