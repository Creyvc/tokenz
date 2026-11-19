"""Writes chips.js: the real tokens (o200k_base) of the prompts in the method scenes, and the
engine's real outputs for NLP (the email prompt) and TF-IDF (the history-exam prompt); the AI
rewrite is an example, with which original tokens each method drops.

  ../../backend/.venv/bin/python chips.py
"""
import difflib
import json
import os
import tiktoken

enc = tiktoken.get_encoding("o200k_base")
toks = lambda s: [enc.decode([t]) for t in enc.encode(s)]

EMAIL = "Could you please help me write a polite email to my professor asking for a meeting on Friday? Please keep it under 100 words."
NLP_OUT = "Help me write a polite email to my professor asking for a meeting on Friday. Keep it under 100 words."
# (an example rewrite, the same short prompt as the opening, so the numbers agree all the way through)
AI_OUT = "Write a polite email to my professor requesting a Friday meeting. Use fewer than 100 words."
TF_ROWS = ["What I mainly need you to do is summarize the causes of World War I in 5 bullet points.",
           " I am currently studying for my history exam and I feel a bit stressed about it.",
           " Please focus on alliances, militarism, imperialism and nationalism.",
           " Do not include anything about World War II.",
           " My roommate keeps playing loud music, which makes it hard to concentrate."]
TF_KEEP = [0, 2, 3]

src, out = toks(EMAIL), toks(NLP_OUT)
# which source tokens go (popped), and where each kept one ends up
sm = difflib.SequenceMatcher(a=[s.strip().lower() for s in src], b=[o.strip().lower() for o in out], autojunk=False)
to = [None] * len(src)
for a, b, n in sm.get_matching_blocks():
    for k in range(n): to[a + k] = b + k
# a changed token in place ("?" → ".", " help" → "Help") counts as kept, not popped
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "replace":
        for k in range(min(i2 - i1, j2 - j1)): to[i1 + k] = j1 + k
# the opening's stack of incoming prompts: each with its real token count
CARDS = ["Hi! I hope you're doing well today.", "Could you please kindly help me with something?",
         "Thank you so much in advance!", "Just wondering if you could maybe take a look.",
         "Please make sure to keep it short and clear.", "Sorry for the long message, but basically..."]
data = {
    "cards": [[c, len(enc.encode(c))] for c in CARDS],
    "email": src, "nlp": out, "nlpTo": to,
    "ai": toks(AI_OUT),
    "tfRows": [toks(r) for r in TF_ROWS], "tfKeep": TF_KEEP,
    "counts": {"email": len(src), "nlp": len(out), "ai": len(toks(AI_OUT)),
               "tf": len(toks("".join(TF_ROWS))), "tfOut": len(toks("".join(TF_ROWS[i] for i in TF_KEEP)))},
}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "chips.js"), "w") as f:
    f.write("// Written by chips.py: real tokens and the engine's real outputs for the method scenes.\nwindow.CHIPS = " + json.dumps(data) + ";\n")
print(data["counts"]); print([(s, to[i]) for i, s in enumerate(src)])
