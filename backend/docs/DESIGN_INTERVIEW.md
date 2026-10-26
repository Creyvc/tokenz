# TokenSaver design interview

This records the completed grill-with-docs interview. User answers are marked explicitly. The user confirmed the complete scope in Q6 on 24 October 2026; document alignment and the review packet follow that confirmed scope.

## Existing user constraints

- Complete local MVP, with backend priority and room for another team's frontend.
- New project on the user's PC.
- Five-day deadline; report, architecture diagram and recorded demo requested.
- No Alibaba Cloud account or configured endpoint was available when development began.

## Confirmed answers

### Q1 — What counts as project success?

**User answer:** Keep the comparison MVP: compare all three methods honestly; unchanged is valid with a clear reason and evaluation evidence.

**Implication:** Do not force a shorter result to make the demo look successful. Report reduction, unchanged/error outcomes and retention evidence separately. Q2 below resolves whether live Qwen evidence will be gathered.

### Q2 — Live Qwen evidence before submission?

**User answer:** Defer live Qwen. Keep its integration and mock tests, and clearly report that the measured experiment covers only NLP and TF-IDF.

**Implication:** No account setup, paid calls or Qwen performance claims are required for this submission. Describe Qwen's implementation and mocked control-flow evidence separately from the two-method experiment. A future live experiment remains outside the current delivery scope.

### Q3 — Human retention evidence?

**User answer:** Personally review all 15 shortened outputs and record any lost requirements.

**Implication:** Assess all 11 shortened NLP outputs and all 4 shortened TF-IDF outputs from the saved local experiment. These ratings are planned, not yet completed. Retention conclusions will be based on the recorded assessments and will identify the single-reviewer limitation. Q4 below settles the acceptability rule.

### Q4 — What makes a suggestion acceptable?

**User answer:** Every requested subtask and explicit constraint must survive. A suggestion losing any of these is unacceptable even if the main topic survives. Removable background can be deleted.

**Implication:** Human retention assessment must check the complete original request, not just its main-task excerpt or retained keywords. Count a failed retention assessment separately from token reduction and automatic validation. Do not describe a shorter rejected suggestion as a successful meaning-preserving compression.

### Q5 — Frontend handoff boundary?

**User answer:** Keep the existing Python interface. Hand over functions, result schema, examples and tests; add no server.

**Implication:** The submission includes the callable backend and minimal Streamlit frontend. The frontend team can reuse the Python interface and serialized result contract. A separately hosted browser frontend and any HTTP adapter are outside the agreed MVP.

### Q6 — Final shared-understanding confirmation

**User answer:** Confirm the scope. Prepare the 15-case review packet and align the deliverables.

**Implication:** The interview is complete. Prepare review materials without filling human ratings, align submission claims and handoff documents, and update the ZIP. No additional scope approval is needed for that agreed work.

## Confirmed delivery scope

1. Deliver an honest local comparison MVP; explained unchanged outcomes are valid.
2. Offer all three method integrations in the application, but measure only NLP and TF-IDF for this submission. Qwen remains implemented and mock-tested; live evaluation is deferred.
3. The user personally reviews all 15 shortened local outputs. Ratings remain pending until the user completes them.
4. An acceptable suggestion preserves every requested subtask and explicit constraint. Removing background is permitted only when those requirements survive.
5. Retain the Python-callable backend and JSON result contract; add no HTTP server.
6. Deliver the report, architecture diagram, demo, backend handoff and reproducible evidence within the existing five-day scope.

The prepared materials are `evaluation/RETENTION_REVIEW.md`, `evaluation/review_cases.json` and `evaluation/review_ratings.json`. The report and handoff use the confirmed scope. Ratings remain unfilled. No ADR is proposed: these answers clarify the existing MVP scope rather than introduce a new costly architectural commitment.

## Evidence checked for this interview

A read-only independent agent inspected the current source and saved artifacts. It did not rerun tests or perform provider calls.

- NLP removes supported polite openings and exact duplicate sentences; it is not a general paraphraser.
- TF-IDF removes whole sentences while retaining the confirmed task and mandatory content. A detailed prompt can have little safely removable background.
- Saved local evaluation: 24 synthetic prompts, two local methods, 48 executions. Human assessment fields are all unfilled.
- Saved test log: 59 tests passed. This does not establish semantic retention or live Qwen performance.
- The report states that Qwen was not evaluated live. The project has no root `.env`; this alone does not establish what credentials may exist elsewhere or in process environment variables.

## Design tree

```text
Submission success: honest comparison MVP [Q1 settled]
├── Evidence for Qwen [Q2 settled: live evaluation deferred]
│   └── Integration + mocks; no measured Qwen performance claims
├── Retention evaluation [Q3 settled: user reviews all 15 shortened outputs]
│   └── Acceptability rule [Q4 settled: all requested subtasks and explicit constraints survive]
├── TF-IDF interpretation [Q4 settled]
│   └── Only removable background is eligible for acceptable deletion
└── Delivery acceptance
    └── Frontend handoff boundary [Q5 settled: existing Python interface, no HTTP server]
```

The design-question frontier is empty, shared understanding is confirmed, and the interview is complete. The outstanding human action is completion of the 15-case review packet; it is not further design approval.

## Subsequent user steering — separate local test screens

The user found the shared form confusing and explicitly requested separate NLP and TF-IDF test interfaces. The frontend now has dedicated method workbenches with independent prompts, settings and results. NLP shows neither TF-IDF controls nor provider consent; TF-IDF guides task selection and budget feasibility. Comparison remains an optional separate screen, and Qwen keeps its own consent. This UI change does not alter the confirmed experiment scope, backend contract, source evaluation records or unfilled human ratings.

## Subsequent comparison-view request
The user requested no additional test form in comparison. It now displays completed NLP and TF-IDF tests from the individual screens, with an original baseline, source/encoding checks, stale-result guidance and an explanation of valid zero-savings NLP results. Qwen remains on its separate optional screen.

## Optional stronger NLP mode
The user authorized adding an Aggressive NLP option. Conservative remains the default. The added local phrase editor uses bounded wording substitutions and normalized exact duplicates, with human retention review still required. Comparison identifies the saved NLP mode. The existing experiment and 15-case review packet continue to describe Conservative NLP only.

## Four NLP intensity levels and 20% target
The user requested additional intensity options and a level reducing at least 20%. The UI now offers Conservative, Balanced, Aggressive and Maximum (20%+ target). The supplied sales example measures 659 -> 508 tokens in Maximum (22.9%). Maximum compacts supported framing/rationale and relaxes all-source-noun checks, with explicit human review. Concise/locked prompts may miss the target; the app reports that rather than forcing deletion. The saved comparison records the selected mode. Prior formal study records remain Conservative only.
