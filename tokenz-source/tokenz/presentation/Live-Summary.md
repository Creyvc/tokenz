# Tokenz comparison summary

**Real free-model comparison.**

Compared 3 prompt(s), 1 optimizer(s), and 2 answer model(s).
Completed 6 of 6 planned comparisons. 0 attempted comparisons failed.

Best measured input reduction among comparisons retaining at least 95% of the model judge's quality score: North Mini Code with North Mini Code.
Input reduction: 24.5%; quality retained: 101.9%.

3 shortened answers failed exact checks; 2 comparisons fell below the quality-retention cutoff. In 1 case(s), both original and shortened answers failed. Follow the per-case recommendations; neither failed answer should be trusted.

All recorded requests in this study reported or were configured at zero cost (USD 0).

## Results

- writing · North Mini Code → Nemotron 3.5 Lightning: completed; 16.9% input reduction; 111.1% quality retained
- writing · North Mini Code → North Mini Code: completed; 24.5% input reduction; 101.9% quality retained
- reasoning · North Mini Code → North Mini Code: completed; 20.9% input reduction; 100.0% quality retained
- extraction · North Mini Code → Nemotron 3.5 Lightning: completed; 20.6% input reduction; 63.3% quality retained
- extraction · North Mini Code → North Mini Code: completed; 28.0% input reduction; 68.6% quality retained
- reasoning · North Mini Code → Nemotron 3.5 Lightning: completed; 14.4% input reduction; 100.0% quality retained

## What happened

1. Preserved each original prompt and created a shorter candidate.
2. Checked for token savings and used the original if compression failed.
3. Sent both versions to each selected fixed free model.
4. Recorded provider token use, latency, errors and model identities.
5. Applied exact-answer checks where supplied and optional model quality review.
6. Saved this report and the full underlying records.

## Limits

Model judging is an automated estimate, not independent proof. Review important outputs manually. Local token counts use a fallback tokenizer; provider usage is used when available. A smaller target input does not guarantee fewer total system tokens. Only free models are allowed; these results do not measure ChatGPT.