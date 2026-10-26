# Measured local evaluation

Executed on 24 synthetic prompts, two local methods (48 runs).
Qwen was not evaluated: live evaluation is deferred for this submission. Mock tests assess control flow only.
Human retention ratings remain pending in results.json; no semantic accuracy claim is made.

| Method | Category | N | Mean token reduction | Mean seconds | Unchanged | Error |
|---|---|---:|---:|---:|---:|---:|
| nlp | ALL | 24 | 16.39% | 0.0462 | 13 | 0 |
| nlp | concise | 4 | 0.00% | 0.2154 | 4 | 0 |
| nlp | polite | 4 | 37.14% | 0.0102 | 0 | 0 |
| nlp | repetitive | 4 | 50.00% | 0.0091 | 0 | 0 |
| nlp | background | 4 | 0.00% | 0.0179 | 4 | 0 |
| nlp | constraints | 4 | 11.17% | 0.0130 | 1 | 0 |
| nlp | adversarial | 4 | 0.00% | 0.0116 | 4 | 0 |
| tfidf | ALL | 24 | 8.60% | 0.0119 | 20 | 0 |
| tfidf | concise | 4 | 0.00% | 0.0525 | 4 | 0 |
| tfidf | polite | 4 | 0.00% | 0.0005 | 4 | 0 |
| tfidf | repetitive | 4 | 0.00% | 0.0003 | 4 | 0 |
| tfidf | background | 4 | 51.58% | 0.0157 | 0 | 0 |
| tfidf | constraints | 4 | 0.00% | 0.0019 | 4 | 0 |
| tfidf | adversarial | 4 | 0.00% | 0.0006 | 4 | 0 |

Timings include first-use model/tokenizer loading and are machine-dependent.
The 60% TF-IDF budget is a test condition, not a recommended universal compression target.
Review each original and candidate against the checklist before drawing retention conclusions.
