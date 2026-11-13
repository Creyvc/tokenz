"""Five more scores for the Tokenz film, each written to the same 125 BPM grid as score.py
("Pulse"), so the picture stays in sync whichever is chosen:

  lead-in 0–0.96 s · intro 4 bars (pulses on the beat, a riser and roll into the drop) · drop 2 bars ·
  break 1 bar · groove 12 bars (accents on each bar's 1st, 4th and 6th eighths) · last bar, stopping
  dead before its 4th beat · the final hit, ringing out.

  python scores.py            writes score_neon.wav, score_rise.wav, score_heroic.wav,
                              score_glass.wav, score_clockwork.wav
"""
import sys
import wave
import numpy as np

SR = 48000
BEAT = 0.48
BAR = 4 * BEAT
E8 = BEAT / 2
E16 = BEAT / 4
T0 = 2 * BEAT
def bar(n): return T0 + n * BAR
DROP, BREAK, GROOVE, LAST = 4, 6, 7, 19
STOP = bar(LAST) + 3 * BEAT
HIT = bar(LAST + 1)
DUR = HIT + 3.2
ACC = (0, 3, 5)
N = int((DUR + 3) * SR)


def hz(n): return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, cut):
    cut = np.broadcast_to(np.asarray(cut, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * np.minimum(cut, SR / 2.2) / SR)
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)):
        acc += a[k] * (x[k] - acc); y[k] = acc
    return y


class Mix:
    def __init__(self, seed):
        self.L = np.zeros(N); self.R = np.zeros(N); self.DL = np.zeros(N); self.DR = np.zeros(N)
        self.SEND = np.zeros(N); self.kicks = []
        self.rng = np.random.default_rng(seed)

    def add(self, sig, t, gain=1.0, pan=0.0, send=0.0, duck=True):
        i = int(round(t * SR))
        if i >= N:
            return
        sig = sig[: N - i]
        lg, rg = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2), np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        Lt, Rt = (self.L, self.R) if duck else (self.DL, self.DR)
        Lt[i:i + len(sig)] += sig * gain * lg; Rt[i:i + len(sig)] += sig * gain * rg
        if send:
            self.SEND[i:i + len(sig)] += sig * gain * send

    def noise(self, n): return self.rng.standard_normal(n)

    def master(self, path, duck_depth=0.4, verb=0.5, verb_len=0.45):
        side = np.ones(N)
        for kt in self.kicks:
            i = int(kt * SR); n = int(0.22 * SR)
            if 0 <= i and i + n < N:
                side[i:i + n] = np.minimum(side[i:i + n], 1 - duck_depth + duck_depth * (np.arange(n) / n) ** 0.6)
        L = self.L * side; R = self.R * side
        ir_n = int(2.2 * SR); ir_t = np.arange(ir_n) / SR
        ir = lp(self.rng.standard_normal(ir_n) * np.exp(-ir_t / verb_len), 6500); ir /= np.sqrt((ir ** 2).sum())
        size = 1 << int(np.ceil(np.log2(N + ir_n)))
        wet = np.fft.irfft(np.fft.rfft(self.SEND, size) * np.fft.rfft(ir, size), size)[:N] * verb
        L = L + self.DL + wet; R = R + self.DR + np.roll(wet, int(0.013 * SR))
        # the stop is a real stop
        i0, i1 = int(STOP * SR), int(HIT * SR); f = np.linspace(1, 0, int(0.015 * SR))
        for c in (L, R):
            c[i0:i0 + len(f)] *= f; c[i0 + len(f):i1] *= 0.05
        n_out = int(DUR * SR)
        mix = np.stack([L[:n_out], R[:n_out]])
        mix[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))
        mix = np.tanh(mix * 0.85); mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
        with wave.open(path, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
        print("wrote", path)


# ---------------- shared sounds ----------------
def saw(f, n, harm=30, decay=None, det=0.0, ph=0.0):
    t = np.arange(n) / SR; out = np.zeros(n)
    for h in range(1, harm + 1):
        if f * h > SR / 2.3:
            break
        a = 1 / h
        if decay is not None:
            a = a * np.exp(-t / (decay / (1 + 0.5 * (h - 1))))
        out += a * np.sin(2 * np.pi * f * h * (1 + det) * t + ph * h)
    return out


def env(n, a, d, s=0.0, length=None):
    t = np.arange(n) / SR
    e = np.clip(t / max(a, 1e-4), 0, 1) * (s + (1 - s) * np.exp(-t / d))
    if length:
        e *= np.clip((length - t) / 0.02, 0, 1)
    return e


def kick(m, g=1.0, low=44, punch=140, dec=0.26):
    n = int(0.55 * SR); t = np.arange(n) / SR
    f = low + punch * np.exp(-t / 0.035) + 40 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / dec)
    click = m.noise(n) * np.exp(-t / 0.0025) * 0.5
    return np.tanh((body * 1.1 + click) * 1.8) * g


def snare(m, g=1.0, tone=190, dec=0.11):
    n = int(0.5 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * tone * t) * np.exp(-t / 0.05) * 0.6
    nz = m.noise(n); nz = lp(nz - lp(nz, 1200), 9000) * np.exp(-t / dec)
    return np.tanh((body + nz * 0.9) * 1.5) * 0.55 * g


def clap(m, g=1.0):
    n = int(0.3 * SR); t = np.arange(n) / SR
    nz = m.noise(n); nz = lp(nz - lp(nz, 1000), 7000); e = np.zeros(n)
    for d in (0, 0.009, 0.019):
        e += np.where(t >= d, np.exp(-(t - d) / 0.008), 0)
    e += np.where(t >= 0.028, np.exp(-(t - 0.028) / 0.09), 0)
    return nz * e * 0.4 * g


def hat(m, open_=False, g=1.0):
    n = int((0.3 if open_ else 0.05) * SR); t = np.arange(n) / SR
    nz = m.noise(n); nz = nz - lp(nz, 8000)
    return nz * np.exp(-t / (0.11 if open_ else 0.014)) * 0.32 * g


def click(m, g=1.0, f=1800):
    n = int(0.04 * SR); t = np.arange(n) / SR
    nz = m.noise(n); nz = nz - lp(nz, 3000)
    return (nz * 0.5 + np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.005) * 0.35 * g


def impact(m, g=1.0, length=2.4):
    n = int(length * SR); t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t / 0.09)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    nz = m.noise(n); crash = (nz - lp(nz, 4000)) * np.exp(-t / 0.9) * 0.35
    return np.tanh((boom * 1.3 + crash + nz * np.exp(-t / 0.02) * 0.6) * 1.2) * g


def riser(m, length, g=1.0):
    n = int(length * SR); k = np.linspace(0, 1, n); nz = m.noise(n)
    body = lp(nz, 300 + 9000 * k ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * k ** 2) / SR) * 0.2
    return (body + tone) * k ** 2.2 * 0.5 * g


def swell(m, length, g=1.0):
    n = int(length * SR); k = np.linspace(0, 1, n); nz = m.noise(n)
    return (nz - lp(nz, 3000)) * k ** 3 * 0.35 * g


def roll(m, start, length, g=1.0, snd=None):
    t = start
    while t < start + length - 0.01:
        k = (t - start) / length
        m.add((snd or snare)(m, 0.35 + 0.65 * k), t, gain=g, send=0.2, duck=False)
        t += 0.12 if k < 0.5 else 0.06 if k < 0.8 else 0.03


def pad(notes, length, g=1.0, cut=2400):
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.008, 0, 0.008):
            out += saw(hz(nt), n, 8, det=d, ph=d * 30)
    e = np.clip(t / 0.4, 0, 1) * np.clip((length - t) / 0.4, 0, 1)
    return lp(out, cut) * e * 0.05 * g


def bass(note, length, g=1.0, grit=0.35):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(note)
    x = np.sin(2 * np.pi * f * t) + grit * saw(f, n, 10, decay=0.15)
    e = np.clip(t / 0.003, 0, 1) * np.clip((length - t) / 0.02, 0, 1)
    return np.tanh(x * e * 1.6) * 0.5 * g


def pluck(notes, length=0.5, g=1.0):
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        for h, a in ((1, 1.0), (2, 0.45), (3, 0.2), (4, 0.12), (5.02, 0.06)):
            out += a * np.sin(2 * np.pi * f * h * t) * np.exp(-t / (0.5 / h))
    return out * np.clip(t / 0.003, 0, 1) * 0.11 * g


def stab(notes, length=0.22, bright=0.25, g=1.0):
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.006, 0.0, 0.006):
            out += saw(hz(nt), n, 26, decay=bright, det=d, ph=d * 50)
    e = np.clip(t / 0.002, 0, 1) * np.exp(-t / (length * 0.45))
    return np.tanh(out * e * 0.5) * 0.28 * g


def bell(notes, length=1.2, g=1.0, ratio=3.5, index=2.5):
    """FM bell: bright at the strike, mellowing as it rings."""
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t / 0.25)
        out += np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (length * 0.4))
    return out * np.clip(t / 0.002, 0, 1) * 0.09 * g


def marimba(notes, g=1.0):
    n = int(0.6 * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        out += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.25) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.04) + 0.12 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t / 0.015)
    return out * np.clip(t / 0.001, 0, 1) * 0.16 * g


def taiko(m, g=1.0, low=70):
    n = int(1.0 * SR); t = np.arange(n) / SR
    f = low + 90 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    skin = lp(m.noise(n), 1500) * np.exp(-t / 0.04)
    return np.tanh((body * 1.3 + skin * 0.8) * 1.5) * 0.8 * g


def braam(notes, length=2.0, g=1.0):
    """A low, wide brass blast that opens up and growls."""
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.012, -0.004, 0.004, 0.012):
            out += saw(hz(nt), n, 40, det=d, ph=d * 70)
    cut = 300 + 2500 * np.clip(t / 0.25, 0, 1) * np.exp(-t / 1.2)
    x = lp(out * 0.3, cut)
    e = np.clip(t / 0.02, 0, 1) * np.exp(-t / (length * 0.55))
    return np.tanh(x * e * 2.5) * 0.45 * g


def strings(notes, length, g=1.0, cut=1600):
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.005, 0.005):
            out += saw(hz(nt), n, 18, det=d, ph=d * 40)
    e = np.clip(t / 0.01, 0, 1) * np.exp(-t / (length * 0.7)) * np.clip((length - t) / 0.02, 0, 1)
    return lp(out, cut) * e * 0.09 * g


def gong(m, g=1.0):
    n = int(3.0 * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f, a in ((92, 1), (137, 0.6), (211, 0.45), (298, 0.3), (433, 0.2), (611, 0.12)):
        out += a * np.sin(2 * np.pi * f * t * (1 + 0.003 * np.exp(-t))) * np.exp(-t / 1.4)
    return out * np.clip(t / 0.005, 0, 1) * 0.25 * g


MINOR = [(57, [69, 72, 76]), (53, [69, 72, 77]), (48, [67, 72, 76]), (55, [67, 71, 74])]   # Am F C G
MAJOR = [(48, [67, 72, 76]), (55, [67, 71, 74]), (57, [69, 72, 76]), (53, [69, 72, 77])]   # C G Am F


def groove_times(b):
    return [bar(b) + e * E8 for e in range(8) if bar(b) + e * E8 < STOP - 0.001]


# ================= Neon: synthwave =================
def neon():
    m = Mix(21)
    for b in range(0, DROP):
        root, ch = MINOR[b % 4]
        notes = ch + [ch[0] + 12]
        for s in range(16):
            ts = bar(b) + s * E16
            cut = 600 + 600 * b + 300 * (s / 16)
            sig = lp(saw(hz(notes[s % 4] + 12), int(0.14 * SR), 20, decay=0.08), cut) * 0.16
            m.add(sig, ts, pan=0.35 * np.sin(s), send=0.3)
        for q in range(4):
            if b >= 1: m.add(kick(m, 0.4 + 0.15 * b), bar(b) + q * BEAT, duck=False)
            if b >= 2 and q in (1, 3): m.add(snare(m, 0.6, dec=0.18), bar(b) + q * BEAT, send=0.4, duck=False)
    m.add(riser(m, BAR), bar(DROP - 1), send=0.2); roll(m, bar(DROP - 1) + 2 * BEAT, 2 * BEAT, 0.8)
    m.add(impact(m, 1.0, 2.0), bar(DROP), send=0.5, duck=False)
    for b in range(DROP, BREAK):
        root, ch = MINOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT; m.kicks.append(tq)
            m.add(kick(m), tq, duck=False)
            if q in (1, 3): m.add(snare(m, 1.0, dec=0.22), tq, send=0.45, duck=False)
            for s in range(4):
                gate = stab(ch + [ch[0] + 12], E16 * 0.8, 0.5, 0.8)
                m.add(gate, tq + s * E16, pan=0.2 * (-1) ** s, send=0.2)
            for e in range(2): m.add(bass(root - 12 + 12 * e, E8 * 0.85, 0.9), tq + e * E8)
    root, ch = MINOR[BREAK % 4]
    m.add(pad([root, *ch], BAR + 0.3, 1.4, 3500), bar(BREAK), send=0.6)
    m.add(swell(m, BAR * 0.75), bar(BREAK + 1) - BAR * 0.75, send=0.3)
    for b in range(GROOVE, LAST + 1):
        root, ch = MINOR[b % 4]; notes = ch + [ch[0] + 12]
        for e, te in enumerate(groove_times(b)):
            if e in ACC:
                m.kicks.append(te); m.add(kick(m, 1.0 if e == 0 else 0.85), te, duck=False)
                m.add(stab(ch + [ch[0] + 12], 0.2, 0.45), te, pan=(-0.25, 0.25, 0)[ACC.index(e)], send=0.3)
            if e in (2, 6): m.add(snare(m, 1.0, dec=0.22), te, send=0.45, duck=False)
            m.add(bass(root - 12 + (12 if e % 2 else 0), E8 * 0.85, 0.85), te)
            for s in range(2):
                sig = lp(saw(hz(notes[(2 * e + s) % 4] + 12), int(0.14 * SR), 20, decay=0.08), 2600) * 0.14
                m.add(sig, te + s * E16, pan=0.4 * np.sin(e + s), send=0.3)
            m.add(hat(m, g=0.4), te + E16, duck=False)
        if b in (GROOVE, 10, 13, 16): m.add(impact(m, 0.5, 1.2), bar(b), send=0.3, duck=False)
    roll(m, bar(LAST) + BEAT, 2 * BEAT, 0.7)
    m.add(impact(m, 1.1, 3.0), HIT, send=0.7, duck=False)
    m.add(stab([45, 57, 64, 69, 72, 76], 1.6, 1.2, 1.4), HIT, send=0.6)
    m.add(pad([45, 57, 64, 69, 72], 3.0, 1.3, 4000), HIT, send=0.7)
    m.master("score_neon.wav", verb=0.6, verb_len=0.6)


# ================= Rise: epic trailer =================
def rise():
    m = Mix(31)
    for b in range(0, DROP):
        root, ch = MINOR[b % 4]
        for s in range(16 if b >= 1 else 8):
            ts = bar(b) + s * (E16 if b >= 1 else E8)
            m.add(strings([root, root + 12], E16 * 0.9, 0.7 + 0.15 * b, 900 + 400 * b), ts, pan=0.2 * (-1) ** s, send=0.3)
        for q in range(4):
            if q % (1 if b >= 2 else 2) == 0: m.add(taiko(m, 0.5 + 0.15 * b), bar(b) + q * BEAT, send=0.4, duck=False)
    m.add(riser(m, BAR), bar(DROP - 1), send=0.3)
    roll(m, bar(DROP - 1) + 2 * BEAT, 2 * BEAT, 0.8, snd=lambda mm, g: taiko(mm, g * 0.6, 110))
    m.add(braam([33, 45, 52], 2.6, 1.3), bar(DROP), send=0.4)
    m.add(impact(m, 1.0, 2.5), bar(DROP), send=0.5, duck=False)
    for b in range(DROP, BREAK):
        root, ch = MINOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT
            m.add(taiko(m, 1.0 if q in (0, 2) else 0.7, 60 if q in (0, 2) else 95), tq, send=0.4, duck=False)
            for s in range(4): m.add(strings([root, root + 12, root + 19], E16 * 0.9, 1.0, 2200), tq + s * E16, send=0.3)
        m.add(braam([root - 24, root - 12], BAR * 0.9, 0.9), bar(b) + BAR * 0.5, send=0.3)
    root, ch = MINOR[BREAK % 4]
    m.add(strings([*ch, ch[0] + 12], BAR + 0.4, 1.5, 3000), bar(BREAK), send=0.7)
    m.add(swell(m, BAR * 0.75), bar(BREAK + 1) - BAR * 0.75, send=0.3)
    for b in range(GROOVE, LAST + 1):
        root, ch = MINOR[b % 4]
        for e, te in enumerate(groove_times(b)):
            if e in ACC:
                m.add(taiko(m, 1.0 if e == 0 else 0.85, 60), te, send=0.4, duck=False)
                m.add(stab([root, root + 7, root + 12], 0.25, 0.3, 0.9), te, send=0.4)
            if e in (2, 6): m.add(taiko(m, 0.7, 120), te, send=0.4, duck=False)
            for s in range(2):
                m.add(strings([root, root + 12], E16 * 0.9, 0.9, 2000 if b < 16 else 3000), te + s * E16, pan=0.25 * (-1) ** s, send=0.25)
        if b % 2 == 1: m.add(braam([root - 24, root - 12], BAR * 0.8, 0.7), bar(b), send=0.3)
        if b in (GROOVE, 10, 13, 16): m.add(impact(m, 0.6, 1.5), bar(b), send=0.3, duck=False)
    roll(m, bar(LAST) + BEAT, 2 * BEAT, 0.8, snd=lambda mm, g: taiko(mm, g * 0.6, 110))
    m.add(braam([33, 45, 52, 57], 3.0, 1.5), HIT, send=0.5)
    m.add(gong(m, 1.2), HIT, send=0.6, duck=False)
    m.add(impact(m, 1.1, 3.0), HIT, send=0.7, duck=False)
    m.master("score_rise.wav", duck_depth=0.15, verb=0.8, verb_len=0.8)


# ================= Heroic: bright, major-key fanfare =================
def heroic():
    m = Mix(41)
    for b in range(0, DROP):
        root, ch = MAJOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT
            m.add(stab(ch, 0.18, 0.3, 0.55 + 0.12 * b), tq, pan=0.15 * (-1) ** q, send=0.4)
            if b >= 1: m.add(taiko(m, 0.45 + 0.12 * b, 85), tq, send=0.3, duck=False)
            if b >= 2: m.add(snare(m, 0.5, dec=0.15), tq + E8, send=0.3, duck=False)
    m.add(riser(m, BAR), bar(DROP - 1), send=0.2); roll(m, bar(DROP - 1) + 2 * BEAT, 2 * BEAT, 0.9)
    m.add(impact(m, 1.0, 2.0), bar(DROP), send=0.5, duck=False)
    for b in range(DROP, BREAK):
        root, ch = MAJOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT; m.kicks.append(tq)
            m.add(kick(m, 1.0, low=50), tq, duck=False)
            if q in (1, 3): m.add(snare(m, 1.0, dec=0.18), tq, send=0.4, duck=False)
            m.add(stab(ch + [ch[0] + 12], 0.3, 0.5, 1.0), tq, send=0.4)
            m.add(bass(root - 12, BEAT * 0.9, 0.9), tq)
            m.add(hat(m, open_=True, g=0.6), tq + E8, duck=False)
    root, ch = MAJOR[BREAK % 4]
    m.add(pad([root, *ch], BAR + 0.3, 1.4, 3500), bar(BREAK), send=0.7)
    m.add(bell([ch[0] + 12, ch[2] + 12], 1.8, 1.0), bar(BREAK), send=0.6)
    m.add(swell(m, BAR * 0.75), bar(BREAK + 1) - BAR * 0.75, send=0.3)
    for b in range(GROOVE, LAST + 1):
        root, ch = MAJOR[b % 4]
        for e, te in enumerate(groove_times(b)):
            if e in ACC:
                m.kicks.append(te); m.add(kick(m, 1.0, low=50), te, duck=False)
                m.add(stab(ch + [ch[0] + 12, ch[1] + 12], 0.26, 0.45, 1.0), te, pan=(-0.2, 0.2, 0)[ACC.index(e)], send=0.4)
                m.add(bass(root - 12, E8 * 2 * 0.9, 0.95), te)
            if e in (2, 6): m.add(snare(m, 1.0, dec=0.18), te, send=0.4, duck=False)
            m.add(hat(m, g=0.6 if e % 2 else 0.8), te, pan=0.3, duck=False)
            if b >= 16 and e % 2 == 0: m.add(bell([ch[(e // 2) % 3] + 24], 0.6, 0.9), te, send=0.4)
        if b in (GROOVE, 10, 13, 16): m.add(impact(m, 0.55, 1.2), bar(b), send=0.3, duck=False)
    roll(m, bar(LAST) + BEAT, 2 * BEAT, 0.8)
    m.add(impact(m, 1.1, 3.0), HIT, send=0.7, duck=False)
    m.add(stab([48, 60, 64, 67, 72, 76], 1.8, 1.2, 1.5), HIT, send=0.6)
    m.add(pad([48, 60, 64, 67, 72], 3.0, 1.3, 4000), HIT, send=0.7)
    m.master("score_heroic.wav", verb=0.65, verb_len=0.6)


# ================= Glass: minimal, Apple-like =================
def glass():
    m = Mix(51)
    for b in range(0, DROP):
        root, ch = MINOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT
            m.add(pluck([ch[q % 3] + 12], 0.8, 1.1), tq, pan=0.3 * np.sin(q + b), send=0.5)
            if b >= 1: m.add(click(m, 0.6 + 0.1 * b), tq + E8, pan=0.4, duck=False)
            if b >= 2: m.add(click(m, 0.5, 2600), tq + 3 * E16, pan=-0.4, duck=False)
    m.add(riser(m, BAR, 0.6), bar(DROP - 1), send=0.3)
    for s in range(8): m.add(click(m, 0.4 + 0.08 * s, 2200), bar(DROP - 1) + 2 * BEAT + s * E16, duck=False)
    m.add(bass(33, BAR * 1.8, 1.0, 0.1), bar(DROP))
    m.add(bell([69, 76, 81], 2.0, 1.4), bar(DROP), send=0.6)
    for b in range(DROP, BREAK):
        root, ch = MINOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT; m.kicks.append(tq)
            m.add(kick(m, 0.8, low=40, punch=90, dec=0.3), tq, duck=False)
            m.add(click(m, 0.9, 2000), tq + E8, duck=False)
            m.add(bell([ch[q % 3] + 12], 0.5, 0.8, ratio=2.0, index=1.5), tq + E8, send=0.4, pan=0.3 * (-1) ** q)
    root, ch = MINOR[BREAK % 4]
    m.add(bell([*ch, ch[0] + 12], 2.2, 1.3), bar(BREAK), send=0.7)
    for b in range(GROOVE, LAST + 1):
        root, ch = MINOR[b % 4]
        for e, te in enumerate(groove_times(b)):
            if e in ACC:
                m.kicks.append(te); m.add(kick(m, 0.85, low=40, punch=90, dec=0.3), te, duck=False)
                m.add(bell([ch[ACC.index(e)] + 12], 0.7, 0.9, ratio=2.0, index=1.6), te, send=0.45, pan=(-0.3, 0.3, 0)[ACC.index(e)])
                m.add(bass(root - 12, E8 * 2 * 0.9, 0.8, 0.08), te)
            if e in (2, 6): m.add(click(m, 1.0, 1500), te, send=0.2, duck=False)
            m.add(click(m, 0.35, 3200), te + E16, pan=0.5, duck=False)
            if b >= 16: m.add(pluck([ch[e % 3] + 24], 0.4, 0.6), te, send=0.5, pan=0.4 * np.sin(e))
    m.add(bass(33, 2.8, 1.0, 0.1), HIT)
    m.add(bell([57, 69, 72, 76, 81], 3.0, 1.6), HIT, send=0.7)
    m.add(impact(m, 0.6, 2.4), HIT, send=0.4, duck=False)
    m.master("score_glass.wav", duck_depth=0.3, verb=0.7, verb_len=0.7)


# ================= Clockwork: marimba and wood =================
def clockwork():
    m = Mix(61)
    for b in range(0, DROP):
        root, ch = MAJOR[b % 4]
        for s in range(8):
            ts = bar(b) + s * E8
            m.add(marimba([ch[s % 3] + (12 if s % 4 == 3 else 0)], 0.8 + 0.1 * b), ts, pan=0.3 * np.sin(s), send=0.3)
            m.add(click(m, 0.5 if s % 2 else 0.7, 1200 if s % 2 else 900), ts, pan=-0.3 if s % 2 else 0.3, duck=False)
        if b >= 2:
            for q in (1, 3): m.add(clap(m, 0.8), bar(b) + q * BEAT, send=0.3, duck=False)
    m.add(riser(m, BAR, 0.6), bar(DROP - 1), send=0.3)
    for s in range(8): m.add(click(m, 0.5 + 0.07 * s, 900 + 120 * s), bar(DROP - 1) + 2 * BEAT + s * E16, duck=False)
    m.add(impact(m, 0.7, 1.6), bar(DROP), send=0.4, duck=False)
    for b in range(DROP, BREAK):
        root, ch = MAJOR[b % 4]
        for q in range(4):
            tq = bar(b) + q * BEAT; m.kicks.append(tq)
            m.add(kick(m, 0.9, low=48, punch=110), tq, duck=False)
            if q in (1, 3): m.add(clap(m, 1.0), tq, send=0.3, duck=False)
            for s in range(2): m.add(marimba([ch[(q + s) % 3] + 12], 1.0), tq + s * E8, send=0.3, pan=0.3 * (-1) ** s)
            m.add(bass(root - 12, BEAT * 0.5, 0.8, 0.2), tq)
    root, ch = MAJOR[BREAK % 4]
    m.add(marimba([*ch], 1.2), bar(BREAK), send=0.6); m.add(pad([root, *ch], BAR, 1.0, 2500), bar(BREAK), send=0.6)
    for b in range(GROOVE, LAST + 1):
        root, ch = MAJOR[b % 4]
        for e, te in enumerate(groove_times(b)):
            if e in ACC:
                m.kicks.append(te); m.add(kick(m, 0.95, low=48, punch=110), te, duck=False)
                m.add(marimba([ch[0] + 12, ch[2] + 12], 1.1), te, send=0.3, pan=(-0.3, 0.3, 0)[ACC.index(e)])
                m.add(bass(root - 12, E8 * 0.9, 0.85, 0.2), te)
            if e in (2, 6): m.add(clap(m, 1.0), te, send=0.3, duck=False)
            m.add(click(m, 0.45, 1300), te + E16, pan=0.4, duck=False)
            if e not in ACC: m.add(marimba([ch[e % 3] + 24], 0.55), te, send=0.3, pan=0.4 * np.sin(e))
    m.add(marimba([48, 60, 64, 67, 72], 1.6), HIT, send=0.6)
    m.add(impact(m, 0.8, 2.4), HIT, send=0.5, duck=False)
    m.add(pad([48, 60, 64, 67, 72], 3.0, 1.2, 3000), HIT, send=0.6)
    m.master("score_clockwork.wav", duck_depth=0.3, verb=0.55, verb_len=0.5)


if __name__ == "__main__":
    which = sys.argv[1:] or ["neon", "rise", "heroic", "glass", "clockwork"]
    for name in which:
        globals()[name]()
