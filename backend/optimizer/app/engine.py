import hashlib
import json
import logging
import re
import uuid
from datetime import UTC, datetime

from app.config import ROOT
from app.evaluation import automatic_check, manual_evaluation
from app.live_setup import is_free_provider, readiness
from app.providers import ChatProvider, DemoProvider, ProviderError
from app.tokens import TokenCounter

log = logging.getLogger("tokenz")
VERSION = "0.2.0"


def cost(inp, out, config):
    if None in (inp, out, config.input_price, config.output_price):
        return None
    return (inp * config.input_price + out * config.output_price) / 1_000_000


def total(usage):
    if not usage or usage.get("input_tokens") is None or usage.get("output_tokens") is None:
        return None
    return usage["input_tokens"] + usage["output_tokens"]


def add_known(*values):
    return sum(values) if all(x is not None for x in values) else None


def metrics(row):
    baseline, optimized = row.get("baseline"), row.get("optimized_response")
    calls = row.get("optimizer_calls", [])
    overhead_tokens = add_known(*(total(c) for c in calls))
    overhead_cost = add_known(*(c.get("cost_usd") for c in calls))
    a, b = total(baseline), total(optimized)
    tokenz_total = add_known(overhead_tokens, b)
    bc = baseline.get("cost_usd") if baseline else None
    tc = add_known(overhead_cost, optimized.get("cost_usd") if optimized else None)
    a_input = baseline.get("input_tokens") if baseline else None
    b_input = optimized.get("input_tokens") if optimized else None
    quality = row.get("evaluation", {})
    result = {
        "text_compression_pct": (1 - row["optimized_prompt_tokens"] / row["original_prompt_tokens"]) * 100
        if row.get("original_prompt_tokens") and row.get("optimized_prompt_tokens") is not None else None,
        "chatgpt_input_reduction_pct": (a_input - b_input) / a_input * 100
        if a_input and b_input is not None else None,
        "optimizer_total_tokens": overhead_tokens, "baseline_total_tokens": a,
        "tokenz_total_tokens": tokenz_total,
        "net_token_difference": a - tokenz_total if a is not None and tokenz_total is not None else None,
        "baseline_cost_usd": bc, "tokenz_cost_usd": tc,
        "cost_difference_usd": bc - tc if bc is not None and tc is not None else None,
        "optimizer_latency_ms": sum(c["latency_ms"] for c in calls),
        "baseline_chatgpt_latency_ms": baseline["latency_ms"] if baseline else None,
        "optimized_chatgpt_latency_ms": optimized["latency_ms"] if optimized else None,
        "total_tokenz_latency_ms": sum(c["latency_ms"] for c in calls) + optimized["latency_ms"]
        if optimized else None,
        "quality_retention_pct": quality.get("quality_retention_pct"),
        "baseline_quality": quality.get("baseline_quality"), "optimized_quality": quality.get("optimized_quality"),
        "research_spend_usd": add_known(*(c.get("cost_usd") for c in row.get("paid_calls", []))),
    }
    result["latency_difference_ms"] = result["total_tokenz_latency_ms"] - baseline["latency_ms"] if baseline and optimized else None
    for name, tokens in (("baseline", a), ("optimized", tokenz_total)):
        score = result[name + "_quality"]
        result[name + "_quality_per_1000_tokens"] = score / tokens * 1000 if tokens and score is not None else None
    return result


class Budget:
    def __init__(self, limit):
        self.limit, self.spent, self.uncertain = limit, 0.0, False

    def restore(self, rows):
        for row in rows:
            for call in row.get("paid_calls", []):
                if call.get("cost_usd") is None:
                    self.uncertain = True
                else:
                    self.spent += call["cost_usd"]
            if row.get("billing_uncertain"):
                self.uncertain = True

    def check(self, messages, max_tokens, cfg):
        if self.uncertain:
            raise ProviderError("BILLING_UNCERTAIN", "Previous request usage is unknown. Reconcile provider billing before continuing.")
        if cfg.input_price is None or cfg.output_price is None:
            raise ProviderError("PRICING_REQUIRED", f"Set both {cfg.name} prices before live calls so the budget can be checked.")
        # Conservative text reservation; provider framing may differ. This is an estimated spend guard.
        input_allowance = sum(len(m["content"].encode("utf-8")) + 128 for m in messages)
        reserve = cost(input_allowance, max_tokens, cfg)
        if self.spent + reserve > self.limit:
            raise ProviderError("BUDGET_EXCEEDED", "Estimated request maximum would exceed this run/batch budget.")


class Engine:
    def __init__(self, settings, repository, providers=None, budget=None, event_callback=None):
        self.settings, self.repo = settings, repository
        self.counter = TokenCounter(settings.providers[settings.target].model, settings.encoding)
        self.budget = budget or Budget(settings.budget)
        self.event_callback = event_callback
        self.providers = providers or {
            name: DemoProvider(self.counter, optimizer=name != settings.target) if settings.demo
            else ChatProvider(cfg, settings.timeout) for name, cfg in settings.providers.items()}

    def checkpoint(self, row):
        row["metrics"] = metrics(row)
        self.repo.save(row)

    def call(self, row, name, messages, max_tokens, temperature):
        cfg = self.settings.providers[name]
        if self.settings.free_only and not is_free_provider(cfg):
            raise ProviderError("FREE_ONLY", "Paid provider requests are disabled in free-only mode.")
        if not self.settings.demo:
            self.budget.check(messages, max_tokens, cfg)
        # Persist before request: interruption after dispatch may leave provider billing unknown.
        row["billing_uncertain"] = not self.settings.demo and not self.settings.free_only
        self.checkpoint(row)
        if self.event_callback:
            self.event_callback({'stage': row.get('stage'), 'state': 'running', 'model': cfg.model,
                                 'experiment_id': row['id']})
        try:
            completion = self.providers[name].complete(messages, max_tokens, temperature)
        except ProviderError as exc:
            if self.event_callback:
                self.event_callback({'stage': row.get('stage'), 'state': 'error', 'model': cfg.model,
                                     'experiment_id': row['id'], 'error_code': exc.code})
            if exc.code not in {"CONFIGURATION", "AUTHENTICATION", "INVALID_MODEL", "INVALID_REQUEST", "QUOTA_EXHAUSTED"}:
                self.budget.uncertain = not self.settings.demo and not self.settings.free_only
            else:
                row["billing_uncertain"] = False
            raise
        completion.cost_usd = (completion.provider_cost_usd if completion.provider_cost_usd is not None else
                               0 if self.settings.demo or self.settings.free_only else
                               cost(completion.input_tokens, completion.output_tokens, cfg))
        result = completion.to_dict()
        result["provider"] = name
        result['cost_source'] = ('provider' if completion.provider_cost_usd is not None else
                                 'demo' if self.settings.demo else
                                 'user_confirmed_free_tier' if cfg.name in {'groq', 'gemini'} and cfg.free_tier_confirmed else
                                 'configured_free_route' if self.settings.free_only else 'configured_prices')
        if not completion.reused:
            row.setdefault("paid_calls", []).append(result)
        row["billing_uncertain"] = completion.cost_usd is None
        if completion.cost_usd is None:
            self.budget.uncertain = True
        elif not completion.reused:
            self.budget.spent += completion.cost_usd
        self.checkpoint(row)
        unexpected_cost = self.settings.free_only and completion.cost_usd is not None and completion.cost_usd != 0
        if self.event_callback:
            self.event_callback({'stage': row.get('stage'), 'state': 'error' if unexpected_cost else 'complete',
                                 'model': completion.model, 'experiment_id': row['id'], 'reused': completion.reused})
        if unexpected_cost:
            raise ProviderError("UNEXPECTED_COST", "Provider reported nonzero cost despite the zero-price request. Stop and check account activity.")
        return result

    def run(self, prompt, *, prompt_id="manual", category="custom", provider=None, strategy=None,
            adaptive=False, target_ratio=None, run_id=None, metadata=None, auto_check=None,
            optimizer_prompt=None, optimizer_prompt_version=None, optimizer_output_format='json', baseline_first=False):
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Enter a non-empty prompt")
        cfg = self.settings
        provider, strategy = provider or cfg.optimizer, strategy or cfg.strategy
        ratio = target_ratio if target_ratio is not None else cfg.target_ratio
        if provider not in {"qwen", "deepseek", "openrouter_optimizer", "gpt_oss_20b", "gpt_oss_120b", "gemini_flash", "openrouter_free"} or strategy not in {"simple", "structured", "delete_only", "aggressive"}:
            raise ValueError("Unsupported provider or strategy")
        if not 0 < ratio <= 1:
            raise ValueError("Target ratio must be greater than 0 and at most 1")
        if optimizer_output_format not in {'json', 'text'}:
            raise ValueError('Unknown optimizer output format')
        if optimizer_prompt is None:
            template = (ROOT / "prompts" / f"optimizer_{strategy}.md").read_text(encoding="utf-8")
            template += (ROOT / 'prompts/optimizer_output.md').read_text(encoding='utf-8')
        else:
            template = optimizer_prompt
        template = template.replace("{target_percent}", str(round(ratio * 100)))
        count = self.counter.count(prompt)
        row = {"id": run_id or str(uuid.uuid4()), "created_at": datetime.now(UTC).isoformat(),
               "prompt_id": prompt_id, "category": category, "original_prompt": prompt,
               "original_prompt_tokens": count, "optimized_prompt": None, "optimized_prompt_tokens": None,
               "length_group": "short" if count < 100 else "medium" if count <= 500 else "long" if count <= 2000 else "very_long",
               "optimizer_provider": provider, "optimizer_model": cfg.providers[provider].model,
               "strategy": strategy, "target_ratio": ratio, "adaptive": adaptive,
               "demo": cfg.demo, "status": "running", "stage": "optimizer", "failures": [],
               "target_provider": cfg.providers[cfg.target].name, "target_model": cfg.providers[cfg.target].model,
               "free_only": cfg.free_only,
               "optimizer_calls": [], "paid_calls": [], "metadata": metadata or {},
               "versions": {"source": VERSION, "optimizer_template_sha256": hashlib.sha256(template.encode()).hexdigest()},
               "configuration": {"optimizer": cfg.providers[provider].public(), "target": cfg.providers[cfg.target].public(),
                                 "max_output": cfg.max_output, "optimizer_max_output": cfg.optimizer_max_output,
                                 "target_temperature": cfg.target_temperature, "optimizer_temperature": cfg.optimizer_temperature,
                                 "skip_below": cfg.skip_below, "min_quality": cfg.min_quality,
                                 "tokenizer": self.counter.metadata()}}
        self.checkpoint(row)
        if optimizer_prompt_version:
            row['optimizer_prompt_version'] = optimizer_prompt_version
        try:
            if not cfg.demo:
                ready = readiness(cfg, provider)
                if not ready["configured"]:
                    raise ProviderError("CONFIGURATION", "; ".join(ready["issues"]))
            if baseline_first:
                row['stage'] = 'baseline'
                self.checkpoint(row)
                row['baseline'] = self.call(row, cfg.target, [{'role': 'user', 'content': prompt}],
                                            cfg.max_output, cfg.target_temperature)
                row['stage'] = 'optimizer'
                self.checkpoint(row)
            candidate = prompt
            if adaptive and count < cfg.skip_below:
                row["optimization_decision"] = "skipped_below_configured_threshold"
                if self.event_callback:
                    self.event_callback({'stage': 'optimizer', 'state': 'skipped',
                                         'model': cfg.providers[provider].model, 'experiment_id': row['id']})
            else:
                result = self.call(row, provider, [{"role": "system", "content": template},
                                                   {"role": "user", "content": json.dumps({'prompt_to_compress':prompt}, ensure_ascii=False)}],
                                   cfg.optimizer_max_output, cfg.optimizer_temperature)
                row["optimizer_calls"].append(result)
                reason = None
                try:
                    output = result['text'].strip()
                    if output.startswith('```') and output.endswith('```'):
                        output = '\n'.join(output.splitlines()[1:-1])
                    candidate = output if optimizer_output_format == 'text' else json.loads(output)['optimized_prompt']
                    if not isinstance(candidate, str) or not candidate.strip():
                        raise ValueError
                    if optimizer_output_format == 'text' and (
                            candidate.startswith(('```', 'import ', 'from ', '<script'))
                            or candidate.lower().startswith(('here is the answer', 'the answer is'))):
                        raise ValueError
                except (ValueError, KeyError, TypeError):
                    reason = 'INVALID_OPTIMIZER_OUTPUT'
                    candidate = prompt
                if reason is None and any(number not in candidate for number in re.findall(r'\b\d+(?:\.\d+)?\b', prompt)):
                    reason = 'CRITICAL_NUMBER_LOST'
                if result["finish_reason"] != "stop":
                    reason = "OPTIMIZER_TRUNCATED_OR_INCOMPLETE"
                elif reason is None and strategy == "delete_only":
                    iterator = iter(prompt)
                    if not all(any(x == char for x in iterator) for char in candidate):
                        reason = "DELETE_ONLY_VIOLATION"
                if reason is None and self.counter.count(candidate) >= count:
                    reason = "NO_TOKEN_SAVING"
                if reason:
                    row["failures"].append(reason)
                    row["optimization_decision"] = "fallback_to_original"
                    candidate = prompt
                else:
                    row["optimization_decision"] = "accepted_for_evaluation_semantics_unverified"
            row["optimized_prompt"] = candidate
            row["optimized_prompt_tokens"] = self.counter.count(candidate)
            row["stage"] = "baseline"
            self.checkpoint(row)
            if 'baseline' not in row:
                row["baseline"] = self.call(row, cfg.target, [{"role": "user", "content": prompt}],
                                            cfg.max_output, cfg.target_temperature)
            row["stage"] = "optimized_target"
            self.checkpoint(row)
            if candidate == prompt:
                row["optimized_response"] = dict(row["baseline"])
                row["optimized_response_reused"] = True
                if self.event_callback:
                    self.event_callback({'stage': 'optimized_target', 'state': 'complete', 'reused': True,
                                         'model': row['baseline']['model'], 'experiment_id': row['id']})
            else:
                row["optimized_response"] = self.call(row, cfg.target, [{"role": "user", "content": candidate}],
                                                      cfg.max_output, cfg.target_temperature)
            if row["baseline"]["model"] != row["optimized_response"]["model"]:
                raise ProviderError("TARGET_MODEL_MISMATCH", "Target responses came from different resolved models; this comparison is invalid.")
            for name in ("baseline", "optimized_response"):
                if row[name]["finish_reason"] != "stop":
                    row["failures"].append(name.upper() + "_INCOMPLETE")
            if auto_check and not cfg.demo:
                row["automatic_checks"] = {name: automatic_check(row[name]["text"], auto_check)
                                           for name in ("baseline", "optimized_response")}
                row["automatic_check_spec"] = auto_check
            row["status"], row["stage"] = "completed", "done"
        except ProviderError as exc:
            row["status"] = "failed"
            row["error"] = {"code": exc.code, "message": str(exc), "stage": row["stage"]}
            row["failures"].append(exc.code)
        self.checkpoint(row)
        log.info(json.dumps({"event": "experiment_finished", "id": row["id"], "status": row["status"],
                             "demo": row["demo"]}))
        return row

    def evaluate(self, row, baseline, optimized, notes="", evaluator="human"):
        if row["demo"] or row["status"] != "completed":
            raise ValueError("Quality scoring requires a completed real-model experiment")
        evaluation = manual_evaluation(baseline, optimized, notes, evaluator)
        row.setdefault("evaluation_history", []).append(evaluation)
        row["evaluation"] = evaluation
        self.checkpoint(row)
        return row

    def judge(self, row, max_output=None):
        if row["demo"] or row["status"] != "completed":
            raise ValueError("Judge requires a completed real-model experiment")
        template = (ROOT / "prompts/evaluator.md").read_text(encoding="utf-8")
        # Stable anonymous assignment; neither prompt path is disclosed to the judge.
        swapped = int(hashlib.sha256(row["id"].encode()).hexdigest(), 16) % 2 == 1
        a, b = ("optimized_response", "baseline") if swapped else ("baseline", "optimized_response")
        payload = json.dumps({"original_task": row["original_prompt"], "A": row[a]["text"], "B": row[b]["text"]})
        result = self.call(row, self.settings.target, [{"role": "system", "content": template},
                                          {"role": "user", "content": payload}],
                           max_output or self.settings.max_output, self.settings.target_temperature)
        row.setdefault("judge_calls", []).append(result)
        self.checkpoint(row)
        try:
            if result["finish_reason"] != "stop":
                raise ValueError("Judge output was incomplete")
            judge_text = result['text'].strip()
            if judge_text.startswith('```') and judge_text.endswith('```'):
                lines = judge_text.splitlines()
                if lines[0].strip().lower() in {'```', '```json'}:
                    judge_text = '\n'.join(lines[1:-1])
            data = json.loads(judge_text)
            evaluation = manual_evaluation(data["B"] if swapped else data["A"],
                                           data["A"] if swapped else data["B"], data.get("notes", ""), result["model"])
        except (ValueError, TypeError, KeyError) as exc:
            raise ValueError("Judge returned invalid rubric JSON; its request cost was recorded.") from exc
        evaluation["method"] = "llm_judge"
        evaluation["caveat"] = "Same target model family; judge bias remains. Human review recommended."
        row.setdefault("evaluation_history", []).append(evaluation)
        row["evaluation"] = evaluation
        row["versions"]["evaluator_template_sha256"] = hashlib.sha256(template.encode()).hexdigest()
        self.checkpoint(row)
        return row
