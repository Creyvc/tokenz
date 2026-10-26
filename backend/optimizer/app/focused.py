"""Two fixed free models, each evaluated independently on the same task."""

import hashlib
import json
import uuid
from copy import deepcopy
from dataclasses import fields, replace
from datetime import UTC, datetime

from app.config import ROOT
from app.engine import Engine
from app.integration_config import get_optimizer_config, load_integration_settings, optimizer_registry
from app.integration_providers import make_integration_provider
from app.providers import Completion, ProviderError
from app.study import MemoProvider
from app.tokens import TokenCounter

KEYS = ("qwen", "gemini_flash")
LABELS = ("Qwen · Groq", "Gemini Flash · Google")


def run_focused(
    settings,
    repo,
    prompt,
    *,
    integration=None,
    judge=True,
    on_update=None,
    on_event=None,
    progress=None,
    provider_factory=None,
):
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Enter a prompt first.")
    integration = integration or load_integration_settings()
    registry = optimizer_registry(integration)
    issues = [registry[key]["reason"] for key in KEYS if not registry[key]["available"]]
    if issues:
        raise ValueError("Connect Groq and Gemini: " + "; ".join(dict.fromkeys(issues)))
    configs = [get_optimizer_config(integration, key) for key in KEYS]
    models = [config.model for config in configs]
    prompt_tokens = TokenCounter('', settings.encoding).count(prompt)
    settings = replace(settings, optimizer_temperature=integration.temperature, timeout=integration.timeout,
                       optimizer_max_output=min(settings.optimizer_max_output, max(256, prompt_tokens + 128)),
                       max_output=max(settings.max_output, 4096))
    template = (ROOT / "prompts/optimizer_prompt_v1.md").read_text(encoding="utf-8")
    signature = hashlib.sha256(
        json.dumps(
            {
                "workflow": "groq_gemini_v1",
                "prompt": prompt,
                "providers": [config.public() for config in configs],
                "judge": judge,
                "max_output": settings.max_output,
                "optimizer_max_output": settings.optimizer_max_output,
                "target_temperature": settings.target_temperature,
                "optimizer_temperature": settings.optimizer_temperature,
                "min_quality": settings.min_quality,
                "template": template,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()
    previous = next(
        (s for s in repo.studies() if s.get("signature") == signature and not s.get("demo")),
        None,
    )
    if previous and previous.get("status") == "completed":
        if on_update:
            on_update(previous)
        if progress:
            progress(2, 2, "Opened the saved analysis. No new requests sent.")
        return previous
    study = previous or {
        "id": str(uuid.uuid4()),
        "signature": signature,
        "created_at": datetime.now(UTC).isoformat(),
        "status": "running",
        "demo": False,
        "workflow": "groq_gemini_v1",
        "prompts": [{"id": "my_prompt", "category": "custom", "prompt": prompt}],
        "optimizers": models,
        "targets": models,
        "judge": judge,
        "planned_comparisons": 2,
        "min_quality": settings.min_quality,
        "experiments": [],
        "workflow_events": [],
        "target_disclosure": "Each model rewrites the original independently and answers both versions. Only these two free models are used.",
    }
    study["status"] = "running"
    study.pop("error", None)

    def publish():
        repo.save_study(study)
        if on_update:
            on_update(study)

    def record(event):
        identity = (event["experiment_id"], event["stage"])
        events = study["workflow_events"]
        for index, old in enumerate(events):
            if (old["experiment_id"], old["stage"]) == identity:
                events[index] = event
                break
        else:
            events.append(event)
        if on_event:
            on_event(event)

    publish()
    make = provider_factory or (lambda config: make_integration_provider(config, integration.timeout))
    for index, provider in enumerate(configs):
        model = provider.model
        old = next((row for row in study["experiments"] if row["target_model"] == model), None)
        if old and old["status"] == "completed" and not old.get("review_error"):
            continue
        if old:
            study.setdefault("attempt_history", []).append(deepcopy(old))
            study["experiments"] = [row for row in study["experiments"] if row["id"] != old["id"]]
            if old["status"] != "completed":
                study["workflow_events"] = [
                    event for event in study["workflow_events"] if event["experiment_id"] != old["id"]
                ]
        if progress:
            progress(index, 2, "Analysing " + LABELS[index] + "...")
        active = replace(
            settings,
            demo=False,
            free_only=True,
            target="openrouter_target",
            optimizer="openrouter_optimizer",
            strategy="structured",
            providers={**settings.providers, "openrouter_optimizer": provider, "openrouter_target": provider},
        )
        memo = MemoProvider(make(provider))
        if old and old['status'] != 'completed':
            # Exact signature matching above guarantees identical generation controls.
            # Restore successful requests only; failed/truncated requests are not cached.
            allowed = {field.name for field in fields(Completion)}

            def restore(call, messages, maximum, temperature, cached=memo, valid_fields=allowed):
                if call and call.get('text') and call.get('finish_reason') == 'stop':
                    cache_key = json.dumps([messages, maximum, temperature], sort_keys=True)
                    cached.cache[cache_key] = Completion(**{key: value for key, value in call.items() if key in valid_fields})

            restore(old.get('baseline'), [{'role': 'user', 'content': prompt}],
                    active.max_output, active.target_temperature)
            calls = old.get('optimizer_calls', [])
            if calls:
                restore(calls[-1], [
                    {'role': 'system', 'content': template.replace('{target_percent}', str(round(active.target_ratio * 100)))},
                    {'role': 'user', 'content': json.dumps({'prompt_to_compress': prompt}, ensure_ascii=False)}],
                    active.optimizer_max_output, active.optimizer_temperature)
        engine = Engine(
            active,
            repo,
            providers={"openrouter_optimizer": memo, "openrouter_target": memo},
            event_callback=record,
        )
        if old and old["status"] == "completed":
            row = dict(old)
            row.pop("review_error", None)
        else:
            row = engine.run(
                prompt,
                prompt_id="my_prompt",
                category="custom",
                baseline_first=True,
                optimizer_prompt=template,
                optimizer_prompt_version="optimizer_prompt_v1",
                optimizer_output_format="text",
                metadata={"study_id": study["id"], "combination": model},
            )
        study["experiments"].append(row)
        publish()
        if judge and row["status"] == "completed":
            try:
                engine.judge(row, max_output=min(active.max_output, 768))
            except (ProviderError, ValueError) as exc:
                row["review_error"] = str(exc)
                record({"stage": "done", "state": "error", "model": model, "experiment_id": row["id"]})
                repo.save(row)
                if isinstance(exc, ProviderError) and exc.code in {
                    "UNEXPECTED_COST",
                    "FREE_ONLY",
                    "BILLING_UNCERTAIN",
                }:
                    study["error"] = str(exc)
                    break
        publish()
        if row.get("error", {}).get("code") in {"UNEXPECTED_COST", "FREE_ONLY", "BILLING_UNCERTAIN"}:
            study["error"] = row["error"]["message"]
            break
    study["status"] = (
        "completed"
        if len(study["experiments"]) == 2
        and all(r["status"] == "completed" and not r.get("review_error") for r in study["experiments"])
        else "partial"
    )
    publish()
    if progress:
        progress(2, 2, "Analysis saved.")
    return study
