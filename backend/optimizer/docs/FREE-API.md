# Free API operation

Connection is complete. Tokenz uses the user-approved OpenRouter key stored in local `.env`; no OpenAI or Alibaba key or billing setup is required. No credits were purchased. The account reported USD 0 usage after live testing.

## Tested defaults

- Optimizer: `cohere/north-mini-code:free`.
- Answer models: `nvidia/nemotron-3.5-lightning:free` and `cohere/north-mini-code:free`.

Other free models from the screenshot are available under Models and options. Several returned capacity/access errors during testing. They are not silently substituted into a fixed-model comparison.

## No-payment controls

- `TOKENZ_FREE_ONLY=true` blocks paid providers and non-free IDs.
- Each completion verifies that the selected model is currently listed with zero prices.
- Routing ceilings for prompt, completion and per-request charges are all zero.
- Provider failover stays within the same selected model under those zero-price ceilings. There is no paid fallback model list.
- No paid tools, plugins or credit purchases are requested by Tokenz.
- Reported request costs are saved. An unexpected nonzero cost stops the study for inspection.

The API key has the approved USD 0.01 total cap and a 30-day expiry, on 23 November 2026. The cap did not purchase credits. `.env` is excluded from source archives, logs and reports.

## Free quotas

Live validation exhausted today's free allowance. Authentication remains valid. Saved reports and previews work without completion requests; new comparisons wait for OpenRouter's daily reset. Additional keys or accounts are not used to evade the quota.

Each live case may need optimizer, original-answer, shortened-answer and review requests. Matching baselines and optimizer candidates are reused, preserving request IDs and recorded controls. Completed studies reopen without API requests. Network/provider failures can be resumed without discarding successful comparisons.

## Quality and reproducibility

Original prompts are wrapped as source data. The optimizer must return an `optimized_prompt` JSON field. Invalid output or missing critical numbers causes fallback to the original. Automatic rubric reviews supplement exact-answer checks; neither is presented as a guarantee of general quality.

Optional reasoning is disabled only when supported by the model catalog. Effective request parameters, resolved model IDs, template hashes, usage and timestamps are recorded. Local text counts use a fallback tokenizer for non-OpenAI models; provider usage drives measured target-input changes.

This study measures free-model behavior, not ChatGPT performance. Live-Report.html contains the real mixed findings, including failed extraction and arithmetic checks. Preview files are labelled separately.

## Official references

- [Free variants and free router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- [Provider routing and price ceilings](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Free request limits and account status](https://openrouter.ai/docs/api/reference/limits)
- [Model reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [Current public model catalog](https://openrouter.ai/api/v1/models)
