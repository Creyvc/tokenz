# Test NLP and TF-IDF separately

Choose a screen in the left sidebar. Each screen has its own prompt, settings and results.

## NLP

1. Choose **NLP**.
2. Click **Try NLP example**.
3. Click **Run NLP**.
4. The example should reduce from **10 to 4 tokens**, producing `Explain photosynthesis.`

No main task, budget or sentence locks are needed. **Conservative** is the default. For stronger editing, choose **Aggressive** under **NLP reduction**, then click **Run NLP** again. Try “What I mainly need you to do is calculate mean sales. I would also like you to show Python code.” Compare the two modes on the same text. Aggressive shortens supported request framing and merges sentences that become identical; it does not summarize arbitrary paragraphs. Both modes run locally. Concise prompts can correctly remain unchanged.

For more control, **NLP reduction** now offers **1 · Conservative**, **2 · Balanced**, **3 · Aggressive**, and **4 · Maximum (20%+ target)**. Balanced adds request-opening edits. Maximum also compacts supported introductory framing and personal rationale; it may remove source nouns in that wording, so review the entire suggestion.

For the supplied long sales-analysis prompt, the default encoding measured Conservative **659 → 653**, Balanced **659 → 639**, Aggressive **659 → 617**, and Maximum **659 → 508 (22.9%)**. Select Maximum and run: a message should show **20% target reached**. Then try `Explain gravity.`: the app should retain it and show **20% target not reached**, with no artificial deletion. Lock the entire sales prompt under Advanced settings to check that the target does not override an exact lock.

These are development examples, not formal retention ratings. Inspect all requirements, especially the Region/Sales calculation, pandas, missing values, beginner explanations, example output, answer order and prohibited techniques. Add an exact protected phrase under Advanced settings when wording must be retained.

Changing the mode hides old results until rerun. The mode persists when switching screens, and the comparison table identifies the mode that produced the saved NLP result.

## TF-IDF

1. Choose **TF-IDF**.
2. Click **Try TF-IDF example**.
3. The example's photosynthesis task is selected. Check **I confirm this is my main task**.
4. Leave the **Token budget** at **16**.
5. Click **Run TF-IDF**.
6. The example should reduce from **26 to 13 tokens**. The sentence table shows the weather sentence removed.

For your own prompt, use at least three sentences and explicitly choose the main task. To keep multiple task sentences verbatim, choose **Use a custom excerpt…** and paste their exact wording.

## Locks and budgets

Open **Lock or restore sentences**, select a sentence to keep, and run again. If the locks need more tokens than the current budget, Run TF-IDF is disabled and the message names the required count. Raise the budget or click **Use suggested budget**. No locked content is removed just to fit a budget.

**Advanced settings** contains optional protected phrases and the token counting encoding. The default is `o200k_base`; both example counts above use it.

## Switching screens

Switch back to NLP after testing TF-IDF. Your NLP prompt and result should still be there, without TF-IDF settings. Return to TF-IDF to resume its own draft. Editing settings hides stale results until you rerun that test.

To compare visually, run NLP and TF-IDF on their own screens in the same browser tab, then choose **Compare methods**. There is no additional test form. Use the same original prompt and encoding for both methods; copy the TF-IDF example into the NLP prompt for a simple shared-input check. Expect Original = 26, NLP = 26 and TF-IDF = 13 tokens. NLP correctly saves zero here because there is no supported polite opening or exact duplicate sentence. Its own example still reduces 10 to 4 tokens.

Different prompts display a warning and each method's own baseline. Different encodings require choosing the same encoding and rerunning. Editing a tested prompt or setting hides its stale comparison until rerun. Results belong to this browser session; navigate with the sidebar rather than opening a second tab. Qwen has its own optional screen and is excluded from this visual comparison. Local tests do not require a Qwen account.

Review every requested task and explicit constraint before approving a suggestion. The review acknowledgment enables the download; it does not fill the formal study ratings.
