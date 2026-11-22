"""The showreel's music, "Drive": our own score, made in code from the same instruments as the
film's (../../shared/scores.py), at 125 BPM, so every cut in the picture lands on its beat.

  bars 0–1   a pluck on every beat, one per word on screen; a ticking hat
  bar 2      kick and snare come in under the arpeggio
  bar 3      "Introducing": a riser and a snare roll into the drop
  bars 4–5   the drop: impact, four-on-the-floor, bass in eighths, gated chords
  bar 6      a breath: a chord, a kick and a clap on each caption
  bars 7–8   the groove (accents on each bar's 1st, 4th and 6th eighths)
  bar 9      a hit on every beat, one per colour card
  bars 10–15 the groove, with a hit on each new screen
  bar 16     a hit on every beat again, one per measure
  bar 17     the groove
  bar 18     the tagline: two hits, then a beat of silence
  bar 19     the end card: the last hit and a chord ringing out to nothing, so it loops

  python score.py      writes score.wav (needs numpy)
"""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared"))
import scores as S
from scores import SR, BEAT, BAR, E8, E16, hz, lp, saw, kick, snare, clap, hat, click, impact, riser, swell, roll, pad, bass, pluck, stab, bell, MINOR

BARS = 20
DUR = BARS * BAR                        # 38.4 s, then it starts again
def bar(n): return n * BAR
def beat(n, k): return bar(n) + k * BEAT

# The film's mix stops dead at its own STOP; this one never does (it only fades its last 0.4 s)
S.N = int((DUR + 3) * SR)
S.STOP, S.HIT = DUR + 1, DUR + 2   # (past the end, which is cut off at DUR)
S.DUR = DUR

CHORDS = MINOR                          # Am F C G, one a bar
ACC = (0, 3, 5)
GROOVE = [4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 17]
HITS_EVERY_BEAT = [9, 16]
NEW_SCREEN = [7, 10, 11, 12, 14, 17]    # a small impact on each new screen


def chord(b):
    root, ch = CHORDS[b % 4]
    return root, ch, ch + [ch[0] + 12]


def drive():
    m = S.Mix(57)

    # ---- bars 0–1: a pluck per word, a ticking hat, the bass on the downbeats ----
    for b in (0, 1):
        root, ch, notes = chord(b)
        for k in range(4):
            m.add(pluck([notes[k % 4] + 12, notes[(k + 2) % 4] + 12], 0.6, 1.4), beat(b, k), pan=0.3 * (-1) ** k, send=0.45)
            m.add(click(m, 0.5, 2400), beat(b, k), duck=False)
            for s in range(4):
                m.add(hat(m, g=0.25 + 0.15 * (s == 2)), beat(b, k) + s * E16, pan=0.3, duck=False)
        m.add(bass(root - 12, BEAT * 1.6, 0.6, 0.15), bar(b))
        if b == 1:
            for k in range(4):
                m.add(kick(m, 0.45), beat(b, k), duck=False)

    # ---- bar 2: the arpeggio, kick and snare ----
    b = 2
    root, ch, notes = chord(b)
    for s in range(16):
        sig = lp(saw(hz(notes[s % 4] + 12), int(0.14 * SR), 20, decay=0.08), 1200 + 120 * s) * 0.16
        m.add(sig, bar(b) + s * E16, pan=0.35 * np.sin(s), send=0.3)
    for k in range(4):
        m.kicks.append(beat(b, k)); m.add(kick(m, 0.75), beat(b, k), duck=False)
        if k in (1, 3): m.add(snare(m, 0.8, dec=0.18), beat(b, k), send=0.4, duck=False)
    m.add(stab(ch + [ch[0] + 12], 0.3, 0.5, 1.0), beat(2, 2), send=0.4)
    m.add(bass(root - 12, BAR * 0.9, 0.7), bar(b))

    # ---- bar 3: Introducing. A swell, the logo's hit on beat 3, a riser and a roll into the drop ----
    b = 3
    root, ch, notes = chord(b)
    m.add(pad([root, *ch], BAR + 0.2, 1.2, 3000), bar(b), send=0.6)
    m.add(riser(m, BAR), bar(b), send=0.2)
    m.add(impact(m, 0.45, 1.0), beat(3, 1), send=0.4, duck=False)
    roll(m, beat(3, 2), 2 * BEAT, 0.8)

    # ---- the drop and the groove ----
    m.add(impact(m, 1.0, 2.0), bar(4), send=0.5, duck=False)
    for b in GROOVE:
        root, ch, notes = chord(b)
        straight = b in (4, 5, 14, 15)       # four-on-the-floor; the rest is the syncopated groove
        for e in range(8):
            te = bar(b) + e * E8
            if straight:
                if e % 2 == 0:
                    m.kicks.append(te); m.add(kick(m), te, duck=False)
                if e in (2, 6): m.add(snare(m, 1.0, dec=0.22), te, send=0.45, duck=False)
                for s in range(2):
                    m.add(stab(ch + [ch[0] + 12], E16 * 0.8, 0.5, 0.75), te + s * E16, pan=0.2 * (-1) ** s, send=0.2)
            else:
                if e in ACC:
                    m.kicks.append(te); m.add(kick(m, 1.0 if e == 0 else 0.85), te, duck=False)
                    m.add(stab(ch + [ch[0] + 12], 0.2, 0.45), te, pan=(-0.25, 0.25, 0)[ACC.index(e)], send=0.3)
                if e in (2, 6): m.add(snare(m, 1.0, dec=0.22), te, send=0.45, duck=False)
                for s in range(2):
                    sig = lp(saw(hz(notes[(2 * e + s) % 4] + 12), int(0.14 * SR), 20, decay=0.08), 2600) * 0.13
                    m.add(sig, te + s * E16, pan=0.4 * np.sin(e + s), send=0.3)
            m.add(bass(root - 12 + (12 if e % 2 else 0), E8 * 0.85, 0.85), te)
            m.add(hat(m, g=0.4), te + E16, duck=False)
        if b in NEW_SCREEN: m.add(impact(m, 0.45, 1.1), bar(b), send=0.3, duck=False)
    m.add(swell(m, BAR * 0.5), bar(4) - BAR * 0.5, send=0.3)

    # ---- bar 6: a breath, a clap on each caption ----
    b = 6
    root, ch, notes = chord(b)
    m.add(pad([root, *ch], BAR + 0.3, 1.4, 3500), bar(b), send=0.6)
    for k in (0, 2):
        m.kicks.append(beat(b, k)); m.add(kick(m, 0.9), beat(b, k), duck=False)
        m.add(clap(m, 1.0), beat(b, k), send=0.4, duck=False)
        m.add(stab(ch + [ch[0] + 12], 0.35, 0.6, 0.9), beat(b, k), send=0.4)
    m.add(swell(m, BAR * 0.5), bar(7) - BAR * 0.5, send=0.3)

    # ---- bars 9 and 16: a hit on every beat ----
    for b in HITS_EVERY_BEAT:
        root, ch, notes = chord(b)
        for k in range(4):
            tq = beat(b, k)
            m.kicks.append(tq); m.add(kick(m, 1.0), tq, duck=False)
            m.add(clap(m, 0.9), tq, send=0.3, duck=False)
            m.add(stab([n + 12 * (k % 2) for n in ch] + [ch[0] + 12], 0.3, 0.55, 1.1), tq, pan=0.3 * (-1) ** k, send=0.35)
            m.add(bass(root - 12, BEAT * 0.8, 0.9), tq)
            m.add(hat(m, True, 0.5), tq + E8, duck=False)
        m.add(impact(m, 0.6, 1.2), bar(b), send=0.3, duck=False)

    # ---- bar 18: the tagline, two hits, then a beat of silence ----
    b = 18
    root, ch, notes = chord(b)
    for k in (0, 2):
        m.kicks.append(beat(b, k)); m.add(kick(m, 1.0), beat(b, k), duck=False)
        m.add(impact(m, 0.7, 1.0), beat(b, k), send=0.4, duck=False)
        m.add(stab(ch + [ch[0] + 12, ch[1] + 12], 0.5, 0.8, 1.2), beat(b, k), send=0.5)
        m.add(bass(root - 12, BEAT * 1.6, 0.9), beat(b, k))
    roll(m, beat(18, 2) + E8, BEAT * 0.5, 0.6)

    # ---- bar 19: the end card, one last hit and a chord ringing out to nothing ----
    m.add(impact(m, 1.1, 2.4), bar(19), send=0.7, duck=False)
    m.add(stab([45, 57, 64, 69, 72, 76], 1.4, 1.2, 1.3), bar(19), send=0.6)
    m.add(pad([45, 57, 64, 69, 72], BAR - 0.1, 1.3, 4000), bar(19), send=0.7)
    m.add(bell([81, 88], 1.2, 0.8), beat(19, 2), send=0.6)

    m.master(os.path.join(os.path.dirname(os.path.abspath(__file__)), "score.wav"), verb=0.55, verb_len=0.55)


if __name__ == "__main__":
    drive()
