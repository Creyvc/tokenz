# Human retention review — 15 cases

**Status: unscored. You are the reviewer.** No verdict below has been inferred from token savings or automatic checks.

## How to complete this packet

1. Read the complete original prompt before its suggestion. Identify every requested subtask and explicit constraint yourself.
2. For each criterion replace `pending` with `preserved`, `lost`, `not_applicable`, or `unsure`. Use `not_applicable` only when the original contains no relevant requirement; explain it in Notes.
3. Record any lost requirement using the original wording. A retained keyword does not establish that its meaning or scope survived.
4. Mark the verdict `unacceptable` if any requested subtask or explicit constraint is lost, altered or contradicted. A shorter prompt can be unacceptable.
5. Mark `acceptable` only after all applicable criteria are assessed as preserved. An unresolved criterion means `unsure`, not acceptable.
6. Add your name or reviewer identifier, date, and notes. Save this Markdown file or fill the matching `review_ratings.json`, then return the completed file in this chat for consolidation.

You need complete only one format. The JSON answer sheet is not automatically imported by the app. Keep it with this packet's snapshot; rerunning the experiment may produce a different snapshot.

## Evidence and limits

- Scope: 11 shortened NLP outputs and 4 shortened TF-IDF outputs from the saved 48-run experiment.
- The other 33 outcomes were unchanged and are outside this shortened-output review denominator. They are not assigned human retention ratings.
- Qwen is excluded: live evaluation is deferred; mocks are software evidence only.
- One reviewer, synthetic prompts, visible method labels and no blinding limit the conclusions. Passing this checklist is a human assessment, not proof of universal semantic equivalence.
- `review_cases.json` preserves all 15 source records and the source-file fingerprint. `results.json` remains untouched.
- Source SHA-256: `03447f3fedc36ab14d72981546ddc975a2a5865878e2a09572c8db68743a71fe`.

## Case index

| Case | Method | Prompt | Tokens before → after | Reduction | Human verdict |
|---|---|---|---:|---:|---|
| [R01](#r01) | NLP | polite-1 | 7 → 4 | 42.86% | pending |
| [R02](#r02) | NLP | polite-2 | 5 → 4 | 20.00% | pending |
| [R03](#r03) | NLP | polite-3 | 7 → 4 | 42.86% | pending |
| [R04](#r04) | NLP | polite-4 | 7 → 4 | 42.86% | pending |
| [R05](#r05) | NLP | repetitive-1 | 6 → 3 | 50.00% | pending |
| [R06](#r06) | NLP | repetitive-2 | 8 → 4 | 50.00% | pending |
| [R07](#r07) | NLP | repetitive-3 | 8 → 4 | 50.00% | pending |
| [R08](#r08) | NLP | repetitive-4 | 6 → 3 | 50.00% | pending |
| [R09](#r09) | TFIDF | background-1 | 22 → 11 | 50.00% | pending |
| [R10](#r10) | TFIDF | background-2 | 21 → 11 | 47.62% | pending |
| [R11](#r11) | TFIDF | background-3 | 24 → 11 | 54.17% | pending |
| [R12](#r12) | TFIDF | background-4 | 22 → 10 | 54.55% | pending |
| [R13](#r13) | NLP | constraints-1 | 11 → 10 | 9.09% | pending |
| [R14](#r14) | NLP | constraints-2 | 11 → 8 | 27.27% | pending |
| [R15](#r15) | NLP | constraints-3 | 12 → 11 | 8.33% | pending |

## R01

**Method:** NLP · **Prompt:** polite-1 · **Category:** polite
**Measured tokens:** 7 → 4 (3 saved, 42.86% reduction)

### Original

```text
Could you please explain photosynthesis?
```

### Suggestion

```text
Explain photosynthesis.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R02

**Method:** NLP · **Prompt:** polite-2 · **Category:** polite
**Measured tokens:** 5 → 4 (1 saved, 20.00% reduction)

### Original

```text
Please describe binary search.
```

### Suggestion

```text
Describe binary search.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R03

**Method:** NLP · **Prompt:** polite-3 · **Category:** polite
**Measured tokens:** 7 → 4 (3 saved, 42.86% reduction)

### Original

```text
Can you please explain natural selection?
```

### Suggestion

```text
Explain natural selection.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R04

**Method:** NLP · **Prompt:** polite-4 · **Category:** polite
**Measured tokens:** 7 → 4 (3 saved, 42.86% reduction)

### Original

```text
Would you please explain database normalization?
```

### Suggestion

```text
Explain database normalization.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R05

**Method:** NLP · **Prompt:** repetitive-1 · **Category:** repetitive
**Measured tokens:** 6 → 3 (3 saved, 50.00% reduction)

### Original

```text
Explain gravity. Explain gravity.
```

### Suggestion

```text
Explain gravity.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R06

**Method:** NLP · **Prompt:** repetitive-2 · **Category:** repetitive
**Measured tokens:** 8 → 4 (4 saved, 50.00% reduction)

### Original

```text
Describe photosynthesis. Describe photosynthesis.
```

### Suggestion

```text
Describe photosynthesis.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R07

**Method:** NLP · **Prompt:** repetitive-3 · **Category:** repetitive
**Measured tokens:** 8 → 4 (4 saved, 50.00% reduction)

### Original

```text
Explain binary search. Explain binary search.
```

### Suggestion

```text
Explain binary search.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R08

**Method:** NLP · **Prompt:** repetitive-4 · **Category:** repetitive
**Measured tokens:** 6 → 3 (3 saved, 50.00% reduction)

### Original

```text
Define entropy. Define entropy.
```

### Suggestion

```text
Define entropy.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R09

**Method:** TFIDF · **Prompt:** background-1 · **Category:** background
**Measured tokens:** 22 → 11 (11 saved, 50.00% reduction)

### Original

```text
Explain photosynthesis. Plants absorb sunlight through chlorophyll. Yesterday the bus was late and the weather was rainy.
```

### Suggestion

```text
Explain photosynthesis. Plants absorb sunlight through chlorophyll.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R10

**Method:** TFIDF · **Prompt:** background-2 · **Category:** background
**Measured tokens:** 21 → 11 (10 saved, 47.62% reduction)

### Original

```text
Explain binary search. The data is sorted before searching. The cafeteria was crowded and the tables were full.
```

### Suggestion

```text
Explain binary search. The data is sorted before searching.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R11

**Method:** TFIDF · **Prompt:** background-3 · **Category:** background
**Measured tokens:** 24 → 11 (13 saved, 54.17% reduction)

### Original

```text
Describe natural selection. Populations have heritable variation. The curtains in the classroom were green and the chairs were wooden.
```

### Suggestion

```text
Describe natural selection. Populations have heritable variation.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R12

**Method:** TFIDF · **Prompt:** background-4 · **Category:** background
**Measured tokens:** 22 → 10 (12 saved, 54.55% reduction)

### Original

```text
Explain database normalization. Relations can contain redundant data. The campus garden has flowers and a fountain near the walkway.
```

### Suggestion

```text
Explain database normalization. Relations can contain redundant data.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R13

**Method:** NLP · **Prompt:** constraints-1 · **Category:** constraints
**Measured tokens:** 11 → 10 (1 saved, 9.09% reduction)

### Original

```text
Please explain SQL without code using 3 bullet points.
```

### Suggestion

```text
Explain SQL without code using 3 bullet points.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R14

**Method:** NLP · **Prompt:** constraints-2 · **Category:** constraints
**Measured tokens:** 11 → 8 (3 saved, 27.27% reduction)

### Original

```text
Could you please define entropy for a beginner in English?
```

### Suggestion

```text
Define entropy for a beginner in English.
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending


## R15

**Method:** NLP · **Prompt:** constraints-3 · **Category:** constraints
**Measured tokens:** 12 → 11 (1 saved, 8.33% reduction)

### Original

```text
Please explain recursion and include the exact phrase "base case".
```

### Suggestion

```text
Explain recursion and include the exact phrase "base case".
```

### Your assessment

**Reviewer:** pending  
**Review date:** pending

| Criterion | Rating |
|---|---|
| Every requested task and subtask is preserved (`tasks_and_subtasks`) | pending |
| Named topics, concepts and requested examples are preserved (`concepts`) | pending |
| Negations, quantities, conditions and limits are preserved (`constraints`) | pending |
| Audience, language, answer structure and format are preserved (`audience_and_format`) | pending |
| No new or contradictory requirements were introduced (`no_new_requirements`) | pending |

**Verdict:** pending

**Lost or altered requirements (quote the original, or write none after reviewing):** pending

**Notes (including uncertainty or why a criterion is not applicable):** pending

