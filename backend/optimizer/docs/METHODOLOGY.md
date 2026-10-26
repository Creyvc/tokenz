# Research method

## Question

Can lightweight prompt optimization reduce a fixed answer model's input tokens while preserving answer quality, and is the total system worthwhile after including preprocessing? The current implementation uses free OpenRouter models; it does not establish findings about ChatGPT.

## Run design

1. Configure a free optimizer and fixed free answer models. Verify current model IDs, supported parameters and zero prices. The tested defaults use North Mini Code as optimizer, and North Mini Code plus Nemotron 3.5 Lightning as targets.
2. First run a small live pilot with one strategy. Inspect exact original/candidate prompts, responses and billing usage.
3. Run the full dataset sequentially. Record dataset hash, template hash, model IDs, request IDs, parameters, UTC timestamp and source version.
4. Score both responses independently with the six-dimension 0–10 rubric. The overall score is their arithmetic mean.
5. Compare Qwen and DeepSeek under matched settings, then expand strategies and target ratios (90%, 75%, 50%, 35%, 25%). Record each configuration distinctly.
6. Review failed transformations and response quality before adding semantic validation or a multi-agent design.

Do not conflate repeated samples from one prompt with independent tasks. For a formal study, add repeat trials, independently blinded human scoring, multiple raters, and uncertainty estimates. Current summaries are descriptive statistics, not significance tests.

## Measurements

- Target input reduction: `(baseline billed input - optimized billed input) / baseline billed input * 100`.
- Text compression uses local tokenizer counts and is separate from billed input reduction.
- Baseline total: target baseline input plus output.
- Tokenz total: every optimizer input/output plus optimized target input/output.
- Net token difference: baseline total minus Tokenz total. Negative is an increase.
- Path cost: each request's input/output tokens multiplied by configured per-million prices. Unknown usage/prices yield null, not zero.
- Research spending: all actual requests, including the comparison baseline and optional judge. Shared/reused responses are counted once here.
- Added latency: optimizer plus optimized-target latency minus baseline-target latency.
- Quality retention: optimized overall quality divided by baseline overall quality times 100. Undefined when baseline quality is zero.
- Quality per 1,000 tokens: path quality divided by path total tokens times 1,000.

Usage counts are provider-reported when available, including provider-reported output reasoning usage. Missing usage is never replaced by local token estimates for billing. Cross-provider token totals describe workload and do not imply equal monetary cost. Flat configured rates omit cache/tier discounts.

## Rubric

| Dimension | What to inspect |
|---|---|
| Correctness | Does the answer solve the original task accurately? |
| Completeness | Are all required parts covered? |
| Relevance | Does it focus on the requested task? |
| Instruction following | Does it obey tools, constraints, limits and conditions? |
| Format preservation | Does it use the requested schema or presentation? |
| Factual consistency | Are names, numbers, dates, code and other critical facts preserved? |

0 means fully failing and 10 means fully satisfying the dimension. Longer answers are not inherently better. Score against the original request, not just the optimized request. Record reviewer identity and notes. Deterministic checks complement these scores but do not replace them automatically.

The model judge receives the original task and anonymous A/B answers with a stable randomized order. Its output is schema-checked locally. Judge parsing errors retain the paid request record. Same-target judging is an optional convenience with known bias, not independent proof.

## Analysis

The dashboard and CLI report mean/median input reduction, sample standard deviation, mean/median quality retention, mean cost and latency differences, execution failure rate, cost-saving fraction, and unacceptable-quality-drop fraction. Each denominator uses the appropriate observed sample count; unknown scores do not become perfect scores. Archive attempts and demo runs are excluded from scientific summaries. Execution failures are counted as incomplete experiments; optimizer rejections/fallback reasons are separately retained.

Group by provider, model, strategy, task category and measured length group. The configurable 95% quality cutoff is an example hypothesis, not a validated threshold. Do not select the shortest candidate automatically or invent a weighted score before collecting evidence.

## Interpretation

Report target input savings, total token changes, estimated financial changes, retained quality and latency together. A shorter target prompt can still increase total tokens, cost or waiting time. Quality must be scored before making a quality-preservation claim. Null quality means unmeasured. Negative results are valid.

Optimization templates reduce accidental answering and preserve required facts, but they cannot guarantee semantic equivalence. The engine checks output completion, token savings and exact delete-only subsequence rules. Other semantic mistakes require quality review. No hidden semantic-validator claim is made.
