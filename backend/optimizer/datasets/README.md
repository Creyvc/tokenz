# Dataset v1

30 synthetic tasks, three in each category: coding, data analysis, explanation, writing, summarization, extraction, classification, multi-constraint instructions, reasoning, and structured output.

Rows preserve original prompts exactly, with stable IDs, expected constraints, and optional deterministic checks. Some prompts contain intentional verbosity; others are concise. Long tasks include synthetic tables, catalogs and logs rather than repeated padding. Data is fictional. Each batch records a SHA-256 hash of the full dataset file.

This is a prototype dataset, not a statistically representative evaluation suite. Length groups are assigned from the actual target text tokenizer, never word estimates. Use `docs/dataset-profile.json` for counts measured during development. Expand and preregister a 50–100 prompt study before making general claims.

Supported automatic checks: exact response, numeric value with absolute tolerance, JSON equality, and Python syntax only. Syntax success does not establish functional correctness. Generated code is never executed automatically. Task check outcomes are stored separately from six-dimension quality scores and do not masquerade as a full quality rating.
