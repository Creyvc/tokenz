# How to present Tokenz

## Explain the idea

Tokenz tests whether a small AI model can shorten a prompt while preserving useful answers. It compares original and shortened prompts with several free answer models and reports the trade-offs.

## Show the workflow

1. Open Tokenz. Confirm that the connection says Connected.
2. Select **Presentation test: 3 sample prompts**.
3. Open **Models and options** only if you want to explain the model roles. The verified defaults use North Mini Code for shortening and two answer models: Nemotron 3.5 Lightning and North Mini Code.
4. Press **Compare free models**. The three tasks cover writing, structured extraction and numerical reasoning.
5. Show the summary, the comparison table and one expanded before/after answer.
6. Download and open the portable HTML presentation report. It contains all prompts, answers and measured results.

If a free model is busy, show the recorded issue and the successful comparisons. Resume later without repeating completed work. If the key is rejected or the free allowance is exhausted, explain that account access blocks live execution rather than showing preview numbers as research findings.

## Verified live results

Live-Report.html contains the completed three-prompt, two-target study: six real comparisons with automated quality reviews. All requests reported zero cost; the OpenRouter account endpoint also reported USD 0 usage after testing. Today's free allowance was exhausted during validation, so use this saved report for an offline presentation until the allowance resets.

The pilot found useful compression for writing. North Mini Code passed arithmetic; Nemotron failed both arithmetic answers despite a 100% quality-retention ratio. Both shortened extraction answers failed while their original answers passed. The report recommends the original for extraction and Neither passed for Nemotron arithmetic. This demonstrates why exact checks and absolute correctness matter alongside relative quality scores.

## Interpret the result

- Input saved: how much less input the answer model received.
- Total tokens saved: includes optimizer overhead, so it can be negative.
- Quality retained: automated comparison against the original task; not a guarantee.
- Exact answer check: deterministic correctness check where an expected answer is supplied.
- Time: optimizer plus shortened-prompt response latency.

There may be no quality-qualified winner. Negative or inconclusive outcomes are valid research findings.

## Preview files

Sample-Report.html and Sample-Summary.md are explicitly labelled previews with local test responses. They demonstrate the report format only. They must not be presented as real model measurements.
