"""The promo's track, "Glide": a hard-hitting SaaS-teaser beat in the manner of the reference the owner
chose (refs/), written from scratch: 120 BPM (from timeline.js), a deep 808 sub that glides between
notes on a creeping minor line, a punchy kick, claps on 2 and 4, rolling hi-hats, half-beat drop-outs
before the big cuts. Every hit sits on the picture's beats (timeline.js): a pop per token chip as
the opening's diamond throws them out, a pop per shattered word, a tick per count, a whoosh on
every transition, a half-beat drop before the logo with a swell into it, then one big impact; the
groove carries on under the end card and runs straight back into the first bar.

  python score.py      writes score.wav (needs numpy)
"""
import json
import os
import sys
import wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import scores as S
from scores import SR, hz, lp, saw, kick, snare, clap, hat, click, impact, riser, swell, pad, pluck, stab, bell

src = open(os.path.join(HERE, "timeline.js")).read()
T = json.loads(src[src.index("{"): src.rindex("}") + 1])
SCN = T["scenes"]
B = 60 / T["bpm"]
BAR = 4 * B
DUR = T["beats"] * B
def at(b): return b * B

S.N = int((DUR + 3) * SR)
S.STOP, S.HIT, S.DUR = at(SCN["silence"]), at(SCN["logo"]), DUR   # the half-beat drop before the logo

# Our own line: two 808 notes a bar, creeping up by half steps and falling back (A minor)
LINE = [(33, 34), (35, 36), (33, 31), (30, 35), (33, 34), (35, 38), (36, 35), (31, 33)]
CHORDS = [[57, 60, 64], [58, 62, 65], [59, 62, 67], [60, 64, 67], [57, 60, 64], [59, 62, 67], [60, 64, 67], [55, 59, 62]]
SCALE = [69, 72, 74, 76, 79, 81, 84]                                     # A minor pentatonic, for the lead


def whoosh(m, length=0.32, g=1.0):
    n = int(length * SR); k = np.linspace(0, 1, n); nz = m.noise(n)
    body = lp(nz, 400 + 7000 * np.sin(np.pi * k) ** 2) - lp(nz, 250)
    return body * np.sin(np.pi * k) ** 1.5 * 0.9 * g


def boom(m, g=1.0):
    n = int(0.9 * SR); t = np.arange(n) / SR
    f = 38 + 60 * np.exp(-t / 0.06)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * 1.8) * 0.8 * g


def pop(m, g=1.0):
    n = int(0.35 * SR); t = np.arange(n) / SR; nz = m.noise(n)
    burst = (nz - lp(nz, 2500)) * np.exp(-t / 0.05)
    glass = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.08) for f in (3100, 4650, 6900)) * 0.15
    return (burst * 0.8 + glass) * g


def sub808(note, length, prev=None, g=1.0):
    """An 808: a sine with a click on top, gliding up or down from the last note, long and saturated."""
    n = int(length * SR); t = np.arange(n) / SR
    f1 = hz(note); f0 = hz(prev) if prev is not None else f1
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t / 1.1) * np.clip((length - t) / 0.03, 0, 1)
    knock = np.sin(2 * np.pi * 160 * t) * np.exp(-t / 0.012) * 0.6
    x = np.tanh((body * env + knock * env * 0.6) * 1.7) * 0.7 * g
    return lp(x, 420)


def keyclick(m, g=1.0):
    n = int(0.03 * SR); t = np.arange(n) / SR; nz = m.noise(n)
    return (nz - lp(nz, 3500)) * np.exp(-t / 0.004) * 0.5 * g


def glide():
    m = S.Mix(T["bpm"])
    L = SCN
    bars = int(np.ceil(L["silence"] / 4))
    LOOP_IN = L["logo"]                                       # the end card's three bars, back into bar one

    # ---- the 808: two notes a bar, gliding, from the opening to the silence ----
    prev = None
    for bar_ in range(bars):
        a, b2 = LINE[bar_ % 8]
        for half, note in enumerate((a, b2)):
            st = bar_ * 4 + half * 2
            if st >= L["silence"]: break
            length = min(2, L["silence"] - st)
            m.add(sub808(note, at(length) + 0.05, prev, 0.24 if st >= L["s1"] else 0.2), at(st))
            # a growl an octave up, following the same line: the 808's grit, in the low-mids
            if st >= L["s1"]:
                n_ = int((at(length) + 0.05) * SR); tt = np.arange(n_) / SR
                gr = lp(saw(hz(note + 12), n_, 12, det=0.004) + saw(hz(note + 12), n_, 12, det=-0.004), 700)
                m.add(gr * np.exp(-tt / 0.9) * np.clip(tt / 0.01, 0, 1) * np.clip((n_ / SR - tt) / 0.03, 0, 1) * 0.15, at(st), pan=0.15)
            prev = note

    # ---- drums: kick on 1 and the "and" of 3, plus 3 in the busier bars; claps on 2 and 4; rolling hats ----
    for bar_ in range(bars):
        b0 = bar_ * 4
        busy = b0 >= L["s1"]
        for kb in ((0, 2.5) if not busy else (0, 1.75, 2.5)):
            if b0 + kb < L["silence"]:
                m.kicks.append(at(b0 + kb)); m.add(kick(m, 1.0 if kb == 0 else 0.85, low=46, punch=150, dec=0.22), at(b0 + kb), duck=False)
        for cb in (1, 3):
            if busy and b0 + cb < L["silence"]: m.add(clap(m, 1.05), at(b0 + cb), send=0.35, duck=False)
        # hats: eighths, and a quick roll of 16ths (then 32nds) into the next bar
        for e in range(8):
            hb = b0 + e / 2
            if hb >= L["silence"]: break
            m.add(lp(hat(m, g=0.4 if e % 2 else 0.26), 11000), at(hb), pan=0.25, duck=False)
        if busy and b0 + 4 <= L["silence"]:
            roll_from = b0 + 3.5
            for k in range(6):
                hb = roll_from + k * (0.125 if k < 2 else 0.0625)
                m.add(lp(hat(m, g=0.26 + 0.035 * k), 11000), at(hb), pan=-0.2, duck=False)
        if busy and bar_ % 2: m.add(hat(m, True, 0.4), at(b0 + 1.5), pan=0.3, duck=False)

    # under the end card: the 808 line and a lighter groove, running straight back into bar one (so
    # the track never stops: only the half-beat drop before the logo)
    prev = None
    for bar_ in range(LOOP_IN // 4, T["beats"] // 4):
        a, b2 = LINE[bar_ % 8]
        for half, note in enumerate((a, b2)):
            st = bar_ * 4 + half * 2
            m.add(sub808(note, at(2) + 0.05, prev, 0.3), at(st)); prev = note
        b0 = bar_ * 4
        for kb in (0, 2.5):
            m.kicks.append(at(b0 + kb)); m.add(kick(m, 0.85, low=46, punch=150, dec=0.22), at(b0 + kb), duck=False)
        for cb in (1, 3): m.add(clap(m, 0.8), at(b0 + cb), send=0.35, duck=False)
        for e in range(8): m.add(lp(hat(m, g=0.34 if e % 2 else 0.22), 11000), at(b0 + e / 2), pan=0.25, duck=False)

    # ---- a warm chord bed under everything, a bar at a time ----
    for bar_ in range(T["beats"] // 4):
        if bar_ * 4 >= L["silence"] and bar_ * 4 < L["logo"]: continue
        ch = CHORDS[bar_ % 8]
        m.add(pad([ch[0] - 12] + ch, BAR + 0.15, 0.55, 1600), at(bar_ * 4), send=0.6)

    # ---- deep hits on the big cuts ----
    for b in (8, 12, 16, 20, 24, 26, 30, 34, 38, 44, 50, 56, 62, 64, 68, 72, 78):
        m.add(boom(m, 0.65), at(b), duck=False)
    for b in (8, 24, 26, 30, 44, 52, 62, 68):
        m.add(impact(m, 0.6, 1.4), at(b), send=0.35, duck=False)

    # ---- the opening: a soft pop per token chip as the diamond throws it out, rising a little in
    # pitch as they come; a whoosh as the line slams in ----
    it = T["intro"]; chips = 27
    for i in range(chips):
        tt = at(it["emit"]) + i * at(it["span"]) / chips
        m.add(pop(m, 0.32 + 0.1 * (i % 4 == 0)), tt, pan=0.45 * np.sin(i * 1.7), duck=False)
        m.add(click(m, 0.16, 2600 + 30 * i), tt + 0.02, pan=0.45 * np.sin(i * 1.7), duck=False)
    m.add(whoosh(m, 0.45, 0.8), at(it["title"]) - 0.25, duck=False)
    m.add(click(m, 0.3, 2400), at(it["eyebrow"]), pan=-0.3, duck=False)
    m.add(swell(m, at(1.5), 0.7), at(L["s1"] - 1.5), send=0.3, duck=False)

    # ---- a whoosh and a click on every shape transition (the iris, the flip, the shutters, the
    # wipe and the pixels) ----
    for b, kind in T["cuts"].items():
        if kind in ("iris", "flip", "shutter", "wipe", "pixel"):
            m.add(whoosh(m, 0.4, 0.85), at(float(b)) - 0.26, pan=0.2, duck=False)
            m.add(click(m, 0.3, 2000), at(float(b)), duck=False)

    # ---- "27" / "TOKENS" ----
    m.add(stab([45, 57, 64, 69, 72], 0.3, 0.7, 1.1), at(L["s1"]), send=0.35)
    m.add(stab([45, 57, 64, 69, 72, 76], 0.3, 0.7, 1.0), at(L["s1"] + 1), send=0.35)

    # ---- the prompt races in: a tick per token ----
    w = T["words"]
    def word_time(i): return at(w["start"]) + at(w["span"]) * (i / len(T["tokens"])) ** w["curve"]
    prevn = 0
    for i, n in enumerate(T["tokens"]):
        for k in range(n - prevn):
            m.add(click(m, 0.3, 3400 + 40 * n), word_time(i) + k * 0.03, pan=0.5, duck=False)
        prevn = n

    # ---- the shatters, and the riser into the snap ----
    for b in T["pops"]:
        m.add(pop(m, 1.0), at(b), send=0.3, duck=False)
        m.add(snare(m, 0.8, dec=0.14), at(b), send=0.3, duck=False)
    m.add(riser(m, at(4), 0.8), at(L["s3"]), send=0.2, duck=False)

    # ---- the snap, the flip, −30% ----
    for j in range(15):
        m.add(click(m, 0.26, 2200), at(T["snap"]["start"]) + at(T["snap"]["span"]) * j / 15 + 0.16, pan=0.3 * np.sin(j), duck=False)
    for s in range(8):
        m.add(click(m, 0.34, 3000 - 120 * s), at(T["flip"]["start"] + s * T["flip"]["step"]), pan=0.2, duck=False)
    m.add(stab([45, 57, 64, 69, 72, 76], 0.6, 0.9, 1.3), at(L["pct"]), send=0.5)

    # ---- the four words, the tunnel, the rows ----
    for b in T["punch"] + T["tunnelLines"] + T["rowLines"]:
        ch = CHORDS[int(b // 4) % 8]
        m.add(stab(ch + [ch[0] + 12], 0.28, 0.6, 1.1), at(b), send=0.35)
    m.add(whoosh(m, 0.9, 1.0), at(L["tunnel"]) - 0.2, duck=False)

    # ---- a bright lead through the rows and the methods ----
    lead = [0, 2, 4, 2, 5, 4, 2, 1]
    for b in range(L["rows"], L["s6"]):
        for e in range(2):
            m.add(pluck([SCALE[lead[(2 * b + e) % 8]]], 0.28, 0.9), at(b) + e * B / 2, pan=0.35 * (-1) ** e, send=0.35)
    for b in T["swooshes"]:
        m.add(whoosh(m, 0.7, 1.1), at(b) - 0.35, duck=False)

    # ---- NLP ----
    for b in T["nlpPops"]:
        m.add(pop(m, 0.8), at(b), pan=0.2, duck=False)
        m.add(click(m, 0.34, 3000), at(b), pan=0.4, duck=False)
    m.add(pluck([72, 76, 79, 84], 0.6, 0.8), at(T["nlpReflow"]), send=0.4)
    m.add(bell([84], 1.0, 0.6), at(T["nlpReflow"] + 0.5), send=0.5)
    # ---- TF-IDF ----
    for i, b in enumerate(T["tfDrop"]):
        m.add(whoosh(m, 0.35, 0.8), at(b) - 0.05, pan=0.5 if i == 0 else -0.5, duck=False)
    m.add(click(m, 0.4, 2200), at(T["tfClose"]), duck=False)
    for name in ("tfRoll", "aiRoll"):
        r = T[name]
        for s_ in range(r["steps"]):
            m.add(click(m, 0.32, 3200 - 90 * s_), at(r["start"] + s_ * r["step"]), pan=0.4, duck=False)
        m.add(bell([86], 1.0, 0.6), at(r["start"] + r["steps"] * r["step"]), send=0.5)
    # ---- AI rewrite ----
    m.add(swell(m, at(T["aiForm"] - T["aiMelt"]), 0.9), at(T["aiMelt"]), send=0.4, duck=False)
    m.add(bell([76, 83, 88], 1.6, 0.7), at(T["aiForm"]), send=0.6)

    # ---- the details, the check ----
    for b in T["details"]:
        ch = CHORDS[int(b // 4) % 8]
        m.add(stab(ch + [ch[0] + 12], 0.3, 0.6, 1.1), at(b), send=0.35)
        m.add(bell([ch[2] + 12], 0.9, 0.6), at(b + 0.5), send=0.5)
    m.add(bell([72, 79, 84, 88], 2.0, 0.9), at(L["check"]), send=0.6)
    rr_ = np.random.default_rng(5)
    for k in range(40):
        m.add(click(m, 0.1 + 0.1 * rr_.random(), 4000 + 3000 * rr_.random()), at(L["check"]) + 0.05 + 0.9 * rr_.random() ** 1.6, pan=rr_.random() * 2 - 1, duck=False)

    # ---- streams, the cube ----
    for b in T["streams"]:
        span = at(T["burst"]) - at(b)
        m.add(whoosh(m, 0.5, 0.8), at(b) + 0.55 * span - 0.25, pan=-0.4 + 0.4 * (b - T["streams"][0]), duck=False)
    for b in T["lines"]:
        ch = CHORDS[int(b // 4) % 8]
        m.add(stab(ch + [ch[0] + 12], 0.3, 0.6, 1.1), at(b), send=0.35)
    blk = T["blocks"]
    for s_ in range(12):
        m.add(pluck([SCALE[s_ % 7] - 12 + 12 * (s_ // 7)], 0.25, 0.8), at(blk["start"]) + s_ * at(blk["span"]) / 12, pan=0.3 * np.sin(s_), send=0.3)
    c = T["corners"]
    for s_ in range(8):
        tt = at(c["start"] + s_ * c["step"])
        m.add(click(m, 0.38, 3200 - 100 * s_), tt, pan=0.3 * (-1) ** s_, duck=False)
        m.add(pop(m, 0.4), tt, pan=0.3 * (-1) ** s_, duck=False)
    m.add(riser(m, at(L["s9"] - T["spin"]), 0.8), at(T["spin"]), send=0.2, duck=False)

    # ---- whip pans ----
    for b in T["whips"]:
        m.add(whoosh(m, 0.3, 0.9), at(b) - 0.15, duck=False)

    # ---- collapse, the half-beat drop, a swell into the logo ----
    m.add(whoosh(m, at(1), 0.9), at(L["s9"]), duck=False)
    m.add(swell(m, at(1.5), 0.6), at(L["logo"] - 1.5), send=0.3, duck=False)
    m.add(impact(m, 1.4, 3.0), at(L["logo"]), send=0.6, duck=False)
    m.add(boom(m, 1.2), at(L["logo"]), duck=False)
    m.add(stab([45, 57, 64, 69, 72, 76, 81], 1.6, 1.0, 1.4), at(L["logo"]), send=0.6)
    m.add(pad([45, 57, 64, 69, 72], at(4) + 0.3, 1.0, 2600), at(L["logo"]), send=0.6)
    # the chevrons sliding in and locking round the diamond, and the mark opening again at the end
    m.add(whoosh(m, 0.35, 0.6), at(L["logo"]), pan=-0.4, duck=False)
    m.add(whoosh(m, 0.35, 0.6), at(L["logo"]), pan=0.4, duck=False)
    m.add(click(m, 0.45, 1800), at(L["logo"] + 0.75), duck=False)
    m.add(whoosh(m, at(2), 0.55), at(L["loop"] + 0.5), duck=False)
    for i in range(6):                                                    # "Tokenz" typing on
        m.add(keyclick(m, 0.6), at(L["logo"] + 1) + 0.1 + i * 0.5 / 6, duck=False)
    line = "Save tokens. Keep meaning."
    for i in range(len(line)):                                            # the line typing on
        if line[i] != " ": m.add(keyclick(m, 0.4), at(L["tagline"]) + 0.1 + i * 0.8 / len(line), duck=False)

    master_loop(m, os.path.join(HERE, "score.wav"))


def master_loop(m, path):
    """Like scores.Mix.master, without its hard tanh: the kick ducks the bed, a short room reverb,
    the half-beat drop before the logo, then a gentle bus compressor and a soft ceiling (its level
    worked out round the loop, so the end and the start are at the same level). Everything that rings on past
    the end is folded back onto the start, so the loop point is seamless. Loudness is set later, when
    the video is made (ffmpeg's loudnorm, to -16 LUFS)."""
    N = S.N
    side = np.ones(N)
    for kt in m.kicks:
        i = int(kt * SR); n = int(0.2 * SR)
        if 0 <= i and i + n < N: side[i:i + n] = np.minimum(side[i:i + n], 0.6 + 0.4 * (np.arange(n) / n) ** 0.6)
    Lc = m.L * side; Rc = m.R * side
    ir_n = int(1.6 * SR); ir_t = np.arange(ir_n) / SR
    ir = lp(m.rng.standard_normal(ir_n) * np.exp(-ir_t / 0.42), 7000); ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(N + ir_n)))
    wet = np.fft.irfft(np.fft.rfft(m.SEND, size) * np.fft.rfft(ir, size), size)[:N] * 0.4
    Lc = Lc + m.DL + wet; Rc = Rc + m.DR + np.roll(wet, int(0.017 * SR))
    # the half-beat drop before the logo
    i0, i1 = int(S.STOP * SR), int(S.HIT * SR); f = np.linspace(1, 0, int(0.012 * SR))
    for c in (Lc, Rc):
        c[i0:i0 + len(f)] *= f; c[i0 + len(f):i1] *= 0.03
    # fold the tail past the end onto the start
    n_out = int(round(DUR * SR))
    mix = np.stack([Lc[:n_out].copy(), Rc[:n_out].copy()])
    tail = np.stack([Lc[n_out:], Rc[n_out:]])
    mix[:, :tail.shape[1]] += tail[:, :n_out]
    # the half-beat drop-outs before the big cuts (the reference's little breaks)
    fd = int(0.006 * SR)
    for b in T["breaks"]:
        i, j = int((at(b) + 0.02) * SR), int((at(b + 0.5) - 0.01) * SR)
        mix[:, i:i + fd] *= np.linspace(1, 0.08, fd); mix[:, i + fd:j] *= 0.08; mix[:, j:j + fd] *= np.linspace(0.08, 1, fd)
    # bus glue: a slow, gentle compressor (2:1 above -14 dB of the peak)
    peak = np.max(np.abs(mix)) + 1e-9; x = mix / peak
    def round_smooth(v, n):
        # a moving average that wraps round the loop: the end is smoothed with the start
        pad_ = n
        return np.convolve(np.concatenate([v[-pad_:], v, v[:pad_]]), np.ones(n) / n, mode="same")[pad_:-pad_]
    env = np.sqrt(round_smooth((x ** 2).mean(0), int(0.05 * SR))) + 1e-9
    thr = 10 ** (-14 / 20)
    gain = np.where(env > thr, (env / thr) ** (1 / 2 - 1), 1.0)
    gain = round_smooth(gain, int(0.03 * SR))
    x = x * gain
    # a soft ceiling: untouched below 0.6 of the peak, rounded off above
    a_ = np.abs(x); x = np.where(a_ < 0.6, x, np.sign(x) * (0.6 + 0.4 * np.tanh((a_ - 0.6) / 0.4)))
    x *= 10 ** (-1 / 20) / np.max(np.abs(x))
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype(np.int16).tobytes())
    print("wrote", path, "·", round(n_out / SR, 3), "s, looping")


if __name__ == "__main__":
    glide()
