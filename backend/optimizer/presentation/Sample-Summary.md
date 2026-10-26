# Tokenz comparison summary

**Sample preview — no real model results.**

Compared 3 prompt(s), 1 optimizer(s), and 2 answer model(s).
Completed 6 of 6 planned comparisons. 0 attempted comparisons failed.

The preview demonstrates the workflow only. It cannot identify a winning model or prove quality or token savings.

## Results

- writing · North Mini Code → Nemotron 3.5 Lightning: completed; 18.9% input reduction; quality not measured
- writing · North Mini Code → North Mini Code: completed; 18.9% input reduction; quality not measured
- extraction · North Mini Code → Nemotron 3.5 Lightning: completed; 10.0% input reduction; quality not measured
- extraction · North Mini Code → North Mini Code: completed; 10.0% input reduction; quality not measured
- reasoning · North Mini Code → Nemotron 3.5 Lightning: completed; 14.9% input reduction; quality not measured
- reasoning · North Mini Code → North Mini Code: completed; 14.9% input reduction; quality not measured

## What happened

1. Preserved each original prompt and created a shorter candidate.
2. Checked for token savings and used the original if compression failed.
3. Sent both versions to each selected fixed free model.
4. Recorded provider token use, latency, errors and model identities.
5. Applied exact-answer checks where supplied and optional model quality review.
6. Saved this report and the full underlying records.

## Limits

Model judging is an automated estimate, not independent proof. Review important outputs manually. Local token counts use a fallback tokenizer; provider usage is used when available. A smaller target input does not guarantee fewer total system tokens. Only free models are allowed; these results do not measure ChatGPT.