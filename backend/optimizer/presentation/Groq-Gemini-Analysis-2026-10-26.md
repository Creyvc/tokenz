# Tokenz comparison summary

**Real free-model comparison.**

Compared 1 prompt(s), 2 optimizer(s), and 2 answer model(s).
Completed 2 of 2 planned comparisons. 0 attempted comparisons failed.

Best measured input reduction among comparisons retaining at least 95% of the model judge's quality score: Qwen · Groq with Qwen · Groq.
Input reduction: 36.1%; quality retained: 193.5%.

All recorded requests in this study reported or were configured at zero cost (USD 0).

## Results

- my_prompt Â· Qwen · Groq â†’ Qwen · Groq: completed; 36.1% input reduction; 193.5% quality retained
- my_prompt Â· Gemini 3.6 Flash · Google â†’ Gemini 3.6 Flash · Google: completed; 0.0% input reduction; 100.0% quality retained; CRITICAL_NUMBER_LOST

## What happened

1. Preserved each original prompt and created a shorter candidate.
2. Checked for token savings and used the original if compression failed.
3. Sent both versions to each selected fixed free model.
4. Recorded provider token use, latency, errors and model identities.
5. Applied exact-answer checks where supplied and optional model quality review.
6. Saved this report and the full underlying records.

## Limits

Model judging is an automated estimate, not independent proof. Review important outputs manually. Local token counts use a fallback tokenizer; provider usage is used when available. A smaller target input does not guarantee fewer total system tokens. Only free models are allowed; these results do not measure ChatGPT.