"""The keynote film's sound: a soft ambient pad, a few clean piano-like notes, a quiet tick for
every change of the token counter (right of centre, where the counter is), a gentle rising swell
while the prompt shortens, and one clean chord on the wordmark. Made in code with the instruments
in ../../shared/scores.py. Every time comes from timeline.js, the same file the picture reads.

  python score.py      writes score.wav (needs numpy)
"""
import json
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "shared"))
import scores as S
from scores import SR, lp, pad, pluck, bell, click, swell, riser

src = open(os.path.join(HERE, "timeline.js")).read()
T = json.loads(src[src.index("{"): src.rindex("}") + 1])
DUR = T["dur"]

# (the film's mix stops dead at its STOP: here that's past the end)
S.N = int((DUR + 3) * SR)
S.STOP, S.HIT, S.DUR = DUR + 1, DUR + 2, DUR


def soft(sig, attack=1.6, release=1.8):
    """A slower fade in and out than the pad's own, for an ambient bed."""
    n = len(sig); t = np.arange(n) / SR
    return sig * np.clip(t / attack, 0, 1) * np.clip((n / SR - t) / release, 0, 1)


def bed(m, notes, start, length, g=1.0, cut=1800):
    m.add(soft(pad(notes, length, g, cut)), start, send=0.7, duck=False)


def tick(m, at, g=0.22, f=3200):
    m.add(click(m, g, f), at, pan=0.55, send=0.15, duck=False)


def keynote():
    m = S.Mix(91)

    # ---- the bed: one chord after another, overlapping softly ----
    bed(m, [41, 53, 57, 60, 64], 0.0, 11.4, 1.0, 1500)          # Fmaj7: the black screen, the typing, the prompt
    bed(m, [38, 50, 57, 60, 64], 9.8, 6.0, 0.9, 1200)           # Dm9: "Most of it is noise."
    bed(m, [46, 58, 62, 65, 69], 15.0, 3.2, 0.9, 1800)          # Bbmaj7, rising...
    bed(m, [48, 60, 64, 67, 71], 17.6, 4.0, 1.0, 2400)          # ...to C: the short prompt and −30%
    bed(m, [41, 53, 60, 64, 69], 21.0, 7.8, 1.0, 2200)          # Fmaj9: what matters
    bed(m, [45, 57, 60, 64, 67], 28.0, 6.8, 0.9, 2600)          # Am7: the three lines
    bed(m, [41, 53, 60, 64, 67, 69], T["logo"], DUR - T["logo"] + 0.6, 1.1, 2800)   # Fmaj9: the wordmark

    # ---- clean single notes ----
    m.add(pluck([72], 1.4, 0.9), T["typeStart"], send=0.6)
    m.add(pluck([79], 1.6, 0.6), T["counterIn"], send=0.6, pan=0.4)
    m.add(pluck([69, 76], 1.8, 0.8), T["wordT0"], send=0.6)
    m.add(bell([57], 2.0, 0.5), T["noiseIn"], send=0.7)

    # ---- the counter: a quiet tick for every count (two quick ones when a word costs two) ----
    prev = 0
    for i, n in enumerate(T["tokens"]):
        at = T["wordT0"] + i * T["wordStep"]
        for k in range(n - prev):
            tick(m, at + k * 0.05, 0.2 + 0.006 * n)
        prev = n
    last = T["tokens"][-1]
    for s in range(last - T["rollTo"]):
        tick(m, T["roll"] + s * T["rollStep"], 0.2, 2900 - 90 * s)   # rolling down, a touch lower each time

    # ---- the dust drifting away: a faint air ----
    m.add(soft(swell(m, 2.4, 0.18), 0.4, 0.9), T["dissolve"][0], send=0.6, pan=0.3, duck=False)

    # ---- the shortening: a gentle rising swell into −30% ----
    m.add(soft(riser(m, T["pct"] - T["morph"], 0.22), 1.2, 0.3), T["morph"], send=0.5, duck=False)
    m.add(bell([72, 76, 79], 2.4, 0.7), T["pct"], send=0.7)
    m.add(pluck([48, 60], 2.0, 0.7), T["pct"], send=0.5)

    # ---- the rings: three soft notes, rising ----
    for at, note in zip(T["rings"], (76, 79, 84)):
        m.add(bell([note], 1.8, 0.45), at, send=0.7, pan=0.2)

    # ---- the three lines, then one ----
    for at, note in zip(T["lines"], (69, 72, 76)):
        m.add(pluck([note], 1.6, 0.6), at, send=0.6, pan=-0.3)
    m.add(soft(swell(m, 1.2, 0.2), 0.3, 0.2), T["merge"] - 1.2, send=0.5, duck=False)
    m.add(bell([69, 76, 81], 2.6, 0.6), T["merge"], send=0.7)

    # ---- the wordmark: one clean final chord ----
    m.add(pluck([41, 53, 60, 64, 69], 3.0, 1.0), T["logo"] + 0.2, send=0.6)
    m.add(bell([77, 81, 84], 3.2, 0.6), T["logo"] + 0.2, send=0.7)

    m.master(os.path.join(HERE, "score.wav"), duck_depth=0.0, verb=0.7, verb_len=0.9)


if __name__ == "__main__":
    keynote()
