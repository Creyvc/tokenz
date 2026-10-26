# TokenSaver

TokenSaver compares educational prompt-text compression methods and their effects on learning requirements.

## Language

**Original prompt**:
The student's educational request before a compression method is applied.
_Avoid_: Input tokens, original question when the prompt contains multiple requirements

**Compression suggestion**:
A proposed shorter version of an original prompt that still needs human assessment of its meaning.
_Avoid_: Equivalent prompt, guaranteed optimization

**Unchanged outcome**:
A method outcome that retains the original prompt and reports no prompt-text reduction. It is a valid comparison outcome when its reason is explained.
_Avoid_: Successful compression, automatic failure

**Prompt-text reduction**:
The decrease in measured text tokens between an original prompt and a compression suggestion, using the same measurement basis.
_Avoid_: Subscription savings, semantic accuracy

**Retention assessment**:
A human judgment about whether a suggestion preserves the original learning task and essential requirements.
_Avoid_: Token savings, mechanical validation

**Acceptable suggestion**:
A compression suggestion that preserves every requested subtask and explicit constraint. Losing any of these makes it unacceptable, even when the main topic survives.
_Avoid_: Shorter output, passed automatic checks

**Removable background**:
Context that a human judges can be omitted without losing a requested subtask or explicit constraint.
_Avoid_: Any low-relevance sentence, unimportant keywords

**Confirmed main task**:
The task the student explicitly identifies as the focus of relevance filtering.
_Avoid_: Automatically inferred intent, the only requirement

**Protected requirement**:
A constraint or phrase that must remain present in a suggestion, such as a negation, quantity, requested answer format, or student lock.
_Avoid_: Proven meaning preservation

## Relationships

- An **original prompt** can produce an **unchanged outcome** or a **compression suggestion** for each method.
- **Prompt-text reduction** and **retention assessment** measure different properties of a suggestion.
- A **compression suggestion** becomes an **acceptable suggestion** through retention assessment, not through token reduction alone.
- A **confirmed main task** focuses relevance filtering without replacing the original prompt's other requirements.
