"""The Tokenz film's music: an original 125 BPM track, written to the film's own grid.

Shape (inspired by the energy of Apple's "Don't Blink" ads, not copied from them):
  lead-in   0.00 – 0.96   two quiet beats
  intro     4 bars        staccato chord pulses on the beat, claps joining, a riser into the drop
  drop      2 bars        kick, bass, stabs, open hats: the logo reveal
  break     1 bar         almost nothing: a held chord and a reverse swell
  groove    12 bars       a syncopated breakbeat: accents on each bar's 1st, 4th and 6th eighths
  last bar  1 bar         the line; the music stops dead on its last beat
  final hit               one big chord and impact, ringing out
Writes score.wav (48 kHz stereo) and prints the grid.
"""
import wave
import numpy as np

SR = 48000
BPM = 125.0
BEAT = 60 / BPM            # 0.48 s
BAR = 4 * BEAT             # 1.92 s
E8 = BEAT / 2
T0 = 2 * BEAT              # the first downbeat
def bar(n): return T0 + n * BAR

INTRO, DROP, BREAK, GROOVE, LAST = 0, 4, 6, 7, 19
STOP = bar(LAST) + 3 * BEAT          # the music stops before the last bar's 4th beat...
HIT = bar(LAST + 1)                  # ...and lands one big hit on the next downbeat
DUR = HIT + 3.2

N = int((DUR + 3) * SR)
L = np.zeros(N); R = np.zeros(N); SEND = np.zeros(N); SIDE = np.ones(N)
rng = np.random.default_rng(11)


def add(sig, t, gain=1.0, pan=0.0, send=0.0, duck=True):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    sig = sig[: N - i]
    lg, rg = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2), np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    target = (L, R) if duck else (DL, DR)
    target[0][i:i + len(sig)] += sig * gain * lg
    target[1][i:i + len(sig)] += sig * gain * rg
    if send:
        SEND[i:i + len(sig)] += sig * gain * send


DL = np.zeros(N); DR = np.zeros(N)   # things the kick doesn't duck (drums themselves)


def hz(n): return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, cut):
    cut = np.broadcast_to(np.asarray(cut, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)):
        acc += a[k] * (x[k] - acc); y[k] = acc
    return y


def saw(f, n, harm=30, decay=None, det=0.0, phase=0.0):
    t = np.arange(n) / SR; out = np.zeros(n)
    for h in range(1, harm + 1):
        if f * h > SR / 2.3:
            break
        amp = 1 / h
        if decay is not None:
            amp = amp * np.exp(-t / (decay / (1 + 0.5 * (h - 1))))
        out += amp * np.sin(2 * np.pi * f * h * (1 + det) * t + phase * h)
    return out


# ---------------- instruments ----------------
def kick(g=1.0):
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 44 + 140 * np.exp(-t / 0.035) + 40 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = rng.standard_normal(n) * np.exp(-t / 0.0025) * 0.5
    return np.tanh((body * 1.1 + click) * 1.8) * g


def snare(g=1.0):
    n = int(0.4 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.6
    noise = rng.standard_normal(n)
    noise = lp(noise - lp(noise, 1200), 9000) * np.exp(-t / 0.11)
    return np.tanh((body + noise * 0.9) * 1.5) * 0.55 * g


def clap(g=1.0):
    n = int(0.3 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n); noise = lp(noise - lp(noise, 1000), 7000)
    e = np.zeros(n)
    for d in (0, 0.009, 0.019):
        e += np.where(t >= d, np.exp(-(t - d) / 0.008), 0)
    e += np.where(t >= 0.028, np.exp(-(t - 0.028) / 0.09), 0)
    return noise * e * 0.4 * g


def hat(open_=False, g=1.0):
    n = int((0.3 if open_ else 0.05) * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n); noise = noise - lp(noise, 8000)
    return noise * np.exp(-t / (0.11 if open_ else 0.014)) * 0.32 * g


def bass(note, length, g=1.0):
    n = int(length * SR); t = np.arange(n) / SR; f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * saw(f, n, 10, decay=0.15)
    e = np.clip(t / 0.003, 0, 1) * np.clip((length - t) / 0.02, 0, 1)
    return np.tanh(x * e * 1.6) * 0.5 * g


def stab(notes, length=0.22, bright=0.25, g=1.0):
    """A short, bright staccato chord, like a brass or piano hit."""
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.006, 0.0, 0.006):
            out += saw(hz(nt), n, 26, decay=bright, det=d, phase=d * 50)
    e = np.clip(t / 0.002, 0, 1) * np.exp(-t / (length * 0.45))
    return np.tanh(out * e * 0.5) * 0.28 * g


def pluck(notes, length=0.5, g=1.0):
    """A soft piano-like pulse: each note a few partials that die away, the high ones first."""
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        f = hz(nt)
        for h, a in ((1, 1.0), (2, 0.45), (3, 0.2), (4, 0.12), (5.02, 0.06)):
            out += a * np.sin(2 * np.pi * f * h * t) * np.exp(-t / (0.5 / h))
    return out * np.clip(t / 0.003, 0, 1) * 0.11 * g


def pad(notes, length, g=1.0):
    n = int(length * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for nt in notes:
        for d in (-0.008, 0, 0.008):
            out += saw(hz(nt), n, 8, det=d, phase=d * 30)
    e = np.clip(t / 0.4, 0, 1) * np.clip((length - t) / 0.4, 0, 1)
    return lp(out, 2400) * e * 0.05 * g


def riser(length, g=1.0):
    n = int(length * SR); k = np.linspace(0, 1, n); noise = rng.standard_normal(n)
    body = lp(noise, 300 + 9000 * k ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * k ** 2) / SR) * 0.2
    return (body + tone) * k ** 2.2 * 0.5 * g


def swell(length, g=1.0):
    """A reverse cymbal: noise that grows into the next downbeat."""
    n = int(length * SR); k = np.linspace(0, 1, n); noise = rng.standard_normal(n)
    return (noise - lp(noise, 3000)) * k ** 3 * 0.35 * g


def impact(g=1.0, length=2.4):
    n = int(length * SR); t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t / 0.09)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    noise = rng.standard_normal(n)
    crash = (noise - lp(noise, 4000)) * np.exp(-t / 0.9) * 0.35
    return np.tanh((boom * 1.3 + crash + noise * np.exp(-t / 0.02) * 0.6) * 1.2) * g


def roll(start, length, g=1.0):
    """A snare roll that speeds up and grows."""
    t = start
    while t < start + length - 0.01:
        k = (t - start) / length
        add(snare(0.35 + 0.65 * k), t, gain=g, send=0.2, duck=False)
        t += 0.12 if k < 0.5 else 0.06 if k < 0.8 else 0.03


# ---------------- arrangement ----------------
CHORDS = [(57, [69, 72, 76]), (53, [69, 72, 77]), (48, [67, 72, 76]), (55, [67, 71, 74])]   # Am F C G
def chord(n): return CHORDS[n % 4]


# intro: a staccato pulse on every beat, growing; claps from bar 2; hats from bar 3; a riser in bar 4
for b in range(INTRO, DROP):
    root, ch = chord(b)
    for q in range(4):
        tq = bar(b) + q * BEAT
        add(pluck(ch + [ch[0] + 12], 0.45, 0.7 + 0.1 * b), tq, pan=-0.15 + 0.1 * q, send=0.35)
        if b >= 1 and q in (1, 3):
            add(clap(0.6 + 0.15 * b), tq, send=0.3, duck=False)
        if b >= 2:
            add(hat(g=0.6), tq + E8, pan=0.3, duck=False)
        if b >= 2 and q in (0, 2):
            add(kick(0.55 + 0.15 * (b - 2)), tq, duck=False)
add(riser(BAR), bar(DROP - 1), send=0.2)
roll(bar(DROP - 1) + 2 * BEAT, 2 * BEAT, 0.8)

# the drop: four on the floor, bass, stabs on every off-beat, an impact on the downbeat
add(impact(1.0, 2.0), bar(DROP), send=0.5, duck=False)
for b in range(DROP, BREAK):
    root, ch = chord(b)
    for q in range(4):
        tq = bar(b) + q * BEAT
        add(kick(1.0), tq, duck=False)
        if q in (1, 3):
            add(snare(0.9), tq, send=0.25, duck=False); add(clap(0.6), tq, duck=False)
        add(hat(open_=True, g=0.7), tq + E8, pan=0.25, duck=False)
        add(stab(ch + [ch[0] + 12], 0.2, 0.3), tq + E8, pan=-0.2 if q % 2 else 0.2, send=0.3)
        for e in range(2):
            add(bass(root - 12 + 12 * e, E8 * 0.9, 0.9), tq + e * E8)

# the break: a held chord and a reverse swell into the groove
root, ch = chord(BREAK)
add(pad([root, *ch], BAR + 0.3, 1.3), bar(BREAK), send=0.6)
add(pluck(ch, 1.6, 1.2), bar(BREAK), send=0.6)
add(swell(BAR * 0.75), bar(BREAK + 1) - BAR * 0.75, send=0.3)

# the groove: accents on eighths 0, 3 and 5 of every bar (kick + stab + bass), snare on 2 and 4,
# sixteenth hats; an arpeggio over the graph; it stops dead before the last beat
ACC = (0, 3, 5)
for b in range(GROOVE, LAST + 1):
    root, ch = chord(b)
    for e in range(8):
        te = bar(b) + e * E8
        if te >= STOP - 0.001:
            break
        if e in ACC:
            add(kick(1.0 if e == 0 else 0.85), te, duck=False)
            add(stab(ch + [ch[0] + 12], 0.18, 0.35 if b < 16 else 0.5), te, pan=(-0.25, 0.25, 0)[ACC.index(e)], send=0.3)
            add(bass(root - 12, E8 * (3 if e == 0 else 2) * 0.92, 0.95), te)
        if e in (2, 6):
            add(snare(1.0), te, send=0.25, duck=False)
        add(hat(g=0.55 if e % 2 else 0.75), te, pan=0.3, duck=False)
        add(hat(g=0.35), te + E8 / 2, pan=-0.3, duck=False)
        if b >= 16:
            notes = ch + [ch[0] + 12]
            for s in range(2):
                add(pluck([notes[(2 * e + s) % 4] + 12], 0.25, 0.8), te + s * E8 / 2, pan=0.4 * np.sin(e + s), send=0.4)
    if b in (GROOVE, 10, 13, 16):
        add(impact(0.55, 1.2), bar(b), send=0.3, duck=False)
roll(bar(LAST) + BEAT, 2 * BEAT, 0.7)

# the stop, then the final hit
add(impact(1.1, 3.0), HIT, send=0.7, duck=False)
add(stab([45, 57, 64, 69, 72, 76], 1.6, 1.2, 1.4), HIT, send=0.6)
add(pad([45, 57, 64, 69, 72], 3.0, 1.2), HIT, send=0.7)

# ---------------- mix: sidechain from the kicks, reverb, glue ----------------
kick_times = []
for b in range(DROP, BREAK):
    kick_times += [bar(b) + q * BEAT for q in range(4)]
for b in range(GROOVE, LAST + 1):
    kick_times += [bar(b) + e * E8 for e in ACC if bar(b) + e * E8 < STOP]
for kt in kick_times:
    i = int(kt * SR); n = int(0.22 * SR)
    if i + n < N:
        SIDE[i:i + n] = np.minimum(SIDE[i:i + n], 0.35 + 0.65 * (np.arange(n) / n) ** 0.6)
L *= SIDE; R *= SIDE

ir_n = int(1.6 * SR); ir_t = np.arange(ir_n) / SR
ir = lp(rng.standard_normal(ir_n) * np.exp(-ir_t / 0.4), 6000); ir /= np.sqrt((ir ** 2).sum())
size = 1 << int(np.ceil(np.log2(N + ir_n)))
wet = np.fft.irfft(np.fft.rfft(SEND, size) * np.fft.rfft(ir, size), size)[:N] * 0.5
L += DL + wet; R += DR + np.roll(wet, int(0.013 * SR))

# the stop is a real stop: silence between STOP and HIT (apart from the reverb tail)
i0, i1 = int(STOP * SR), int(HIT * SR)
fade = np.linspace(1, 0, int(0.015 * SR))
for ch_ in (L, R):
    ch_[i0:i0 + len(fade)] *= fade
    ch_[i0 + len(fade):i1] *= 0.06

n_out = int(DUR * SR)
mix = np.stack([L[:n_out], R[:n_out]])
mix[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))
mix = np.tanh(mix * 0.85)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
with wave.open("score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print(f"score.wav {DUR:.2f}s  T0={T0} BEAT={BEAT} BAR={BAR}")
for name, b in (("intro", INTRO), ("drop", DROP), ("break", BREAK), ("groove", GROOVE), ("last bar", LAST)):
    print(f"  {name:9s} bar {b:2d} at {bar(b):6.2f}s")
print(f"  stop {STOP:.2f}s  hit {HIT:.2f}s  end {DUR:.2f}s")
