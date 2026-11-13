"""The Tokenz film's soundtrack: an original 120 BPM track in A minor plus sound design hits that
land on the film's events. 40 seconds, made to loop: anything ringing past the end is wrapped
round onto the start. Writes music.wav (48 kHz, 16-bit stereo)."""
import wave
import numpy as np

SR = 48000
DUR = 40.0
TAIL = 3.0
N = int((DUR + TAIL) * SR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)
SEND = np.zeros(N)          # reverb send (mono)

BEAT = 0.5
BAR = 2.0


def at(t):
    return int(round(t * SR))


def add(sig, t, gain=1.0, pan=0.0, send=0.0):
    """Mix a mono signal in at time t (seconds), pan -1..1, with some sent to the reverb."""
    i = at(t)
    if i >= N:
        return
    sig = sig[: N - i]
    lg = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    rg = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    L[i:i + len(sig)] += sig * gain * lg
    R[i:i + len(sig)] += sig * gain * rg
    if send:
        SEND[i:i + len(sig)] += sig * gain * send


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def onepole(x, cut):
    """Low-pass with a cutoff (Hz) that can change every sample."""
    cut = np.broadcast_to(np.asarray(cut, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for k in range(len(x)):
        acc += a[k] * (x[k] - acc)
        y[k] = acc
    return y


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


# ---------------- drums ----------------
def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * gain


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - onepole(noise, 900)            # high-pass
    noise = onepole(noise, 6000)
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        e += np.where(t >= d, np.exp(-(t - d) / 0.012), 0) * 0.6
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.12), 0)
    return noise * e * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = noise - onepole(noise, 7000)
    return noise * np.exp(-t / (0.09 if open_ else 0.018)) * 0.35


# ---------------- tonal ----------------
def saw(f, n, harmonics=24, decays=None, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, harmonics + 1):
        if f * h > SR / 2.2:
            break
        amp = 1.0 / h
        if decays is not None:
            amp = amp * np.exp(-t / (decays / (1 + 0.35 * (h - 1))))
        out += amp * np.sin(2 * np.pi * f * h * (1 + detune) * t + h)
    return out


def pluck(notes, length=0.32, bright=0.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for nt in notes:
        for d in (-0.004, 0.004):
            out += saw(hz(nt), n, harmonics=18, decays=bright, detune=d)
    return out * np.exp(-t / (length * 0.5)) * np.clip(t / 0.003, 0, 1) * 0.11


def bass_note(note, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(note)
    sub = np.sin(2 * np.pi * f * t)
    grit = saw(f, n, harmonics=8, decays=0.12)
    e = np.clip(t / 0.004, 0, 1) * np.exp(-t / 0.18)
    return np.tanh((sub * 0.9 + grit * 0.45) * e * 1.4) * 0.5


def pad(notes, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for nt in notes:
        for d in (-0.006, 0.0, 0.006):
            out += saw(hz(nt), n, harmonics=10, detune=d)
    e = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 0.5, 0, 1)
    wob = 0.85 + 0.15 * np.sin(2 * np.pi * 0.5 * t)
    return out * e * wob * 0.035


# ---------------- sound design ----------------
def whoosh(length, rise=True, lo=300, hi=7000, gain=0.6):
    n = int(length * SR)
    k = np.linspace(0, 1, n)
    shape = k ** 2 if rise else (1 - k) ** 2
    cut = lo + (hi - lo) * (k if rise else 1 - k) ** 1.5
    noise = rng.standard_normal(n)
    body = onepole(onepole(noise, cut), cut * 1.3)
    e = np.sin(np.pi * np.clip(k, 0, 1)) ** 0.7 if not rise else shape * (1 - np.clip((k - 0.92) / 0.08, 0, 1))
    return body * e * gain


def whip(length=0.35, gain=0.7):
    """A fast pass-by: rises then falls."""
    n = int(length * SR)
    k = np.linspace(0, 1, n)
    cut = 400 + 9000 * np.sin(np.pi * k) ** 2
    noise = rng.standard_normal(n)
    body = onepole(onepole(noise, cut), cut)
    return body * np.sin(np.pi * k) ** 1.5 * gain


def impact(gain=1.0, length=1.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 38 + 60 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    noise = rng.standard_normal(n)
    crack = onepole(noise, 5000) * np.exp(-t / 0.05) * 0.8
    air = (noise - onepole(noise, 3000)) * np.exp(-t / 0.35) * 0.18
    return np.tanh((boom * 1.2 + crack + air) * 1.3) * gain


def tick(f=2400, gain=0.25, length=0.03):
    n = int(length * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) * gain


def thump(pitch=70, gain=0.5):
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = pitch + 160 * np.exp(-t / 0.02)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07)
    snap = rng.standard_normal(n) * np.exp(-t / 0.003) * 0.3
    return (body + snap) * gain


def riser(length, gain=0.5):
    n = int(length * SR)
    k = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    body = onepole(noise, 300 + 8000 * k ** 2)
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * k ** 2) / SR) * 0.25
    return (body + tone) * k ** 2.5 * gain


def pop(f=900, gain=0.35):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + 1.2 * np.exp(-t / 0.01))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.035) * gain


# ---------------- arrangement ----------------
CHORDS = [  # per bar (2 s): A minor, F, C, G
    (57, [69, 72, 76]),
    (53, [65, 69, 72]),
    (48, [67, 72, 76]),
    (55, [67, 71, 74]),
]


def drums_off(bt):
    """Beats with no kick or bass: the gap before the count, the build into the wall's drop, and
    the riser back into the loop."""
    return (2.75 <= bt < 3.0) or (33.5 <= bt < 34.5) or (29.75 <= bt < 30.5) or bt >= 39.0


for b in range(int(DUR / BAR)):
    t0 = b * BAR
    root, chord = CHORDS[b % 4]
    for s in range(4):
        bt = t0 + s * BEAT
        if not drums_off(bt):
            add(kick(0.95), bt)
        if 3.0 <= bt < 36.5 and s in (1, 3) and not drums_off(bt):
            add(clap(), bt, gain=0.55, send=0.25)
        if 0.5 <= bt < 39.0:
            add(hat(open_=(s == 3)), bt + 0.25, gain=0.62, pan=0.25)
            # sixteenths through the methods and the results
            if 10.5 <= bt < 30.5 or 34.5 <= bt < 36.5:
                add(hat(), bt + 0.125, gain=0.32, pan=-0.25)
                add(hat(), bt + 0.375, gain=0.32, pan=-0.25)
    for e in range(8):
        et = t0 + e * 0.25
        if et < 0.5 or drums_off(et):
            continue
        note = root - 12 + (12 if e % 4 == 3 else 0)
        add(bass_note(note, 0.24), et, gain=0.8)
    # chord stabs from the count on
    bright = 0.25 if t0 < 10 else 0.45
    for off in (0.25, 0.75, 1.25, 1.5, 1.75):
        pt = t0 + off
        if (3.0 <= pt < 33.5 or 34.55 <= pt < 36.6) and not (29.75 <= pt < 30.5):
            add(pluck(list(chord), 0.3, bright), pt, gain=0.85, pan=(-0.3 if off % 0.5 else 0.3), send=0.35)
    # a sixteenth arpeggio over the methods, the results and the line
    notes = chord + [chord[0] + 12]
    for k in range(16):
        at_ = t0 + k * 0.125
        if 10.5 <= at_ < 29.75 or 34.55 <= at_ < 37.0:
            add(pluck([notes[k % 4] + 12], 0.18, 0.2), at_, gain=0.42, pan=0.5 * np.sin(k), send=0.4)
    # a warm pad under the wall and the line
    if 32 <= t0 < 37:
        add(pad([root, *chord], BAR + 0.4), t0, gain=1.0, send=0.5)

# ---------------- hits that follow the picture ----------------
add(impact(0.9), 0.0, send=0.4)                    # the loop lands on the mark
add(whip(0.45, 0.8), 0.38)                         # the chevrons burst open
for i in range(10):                                # a thump under each filler word
    add(thump(60 + i * 6, 0.55), 0.5 + i * 0.25, pan=(-0.2 if i % 2 else 0.2))
add(whoosh(0.3, True, gain=0.5), 2.72)             # the last word collapses…
add(pop(500, 0.35), 2.98)                          # …into the dot the count grows from
prev = 0
for k in range(1, 900):                            # the count ticking up to 28
    tt = 3.05 + k / 1000
    c = round(28 * (1 - (1 - min(1, (tt - 3.05) / 0.85)) ** 3))
    if c != prev:
        add(tick(2200 + c * 40, 0.22), tt, pan=0.1)
        prev = c
add(pop(700, 0.3), 3.95)
add(whoosh(0.32, True, lo=200, hi=5000, gain=0.7), 5.0, pan=-0.6)
add(whoosh(0.32, True, lo=200, hi=5000, gain=0.7), 5.0, pan=0.6)
add(impact(1.0, 1.6), 5.32, send=0.5)              # 28 squeezed to 8
add(pop(1100, 0.35), 5.45)
add(whoosh(0.55, False, lo=300, hi=6000, gain=0.45), 6.0, send=0.3)     # the light grows out of the 8
for i, tt in enumerate((6.65, 7.6, 8.6)):          # the brackets swap the word
    add(pop(600 + i * 250, 0.4), tt, send=0.2)
    if i:
        add(whoosh(0.18, True, lo=800, hi=7000, gain=0.35), tt - 0.18)
add(whip(0.45, 0.7), 10.0, pan=0.4)                # on into NLP
# NLP
add(whoosh(0.5, False, lo=500, hi=4000, gain=0.25), 10.55)
add(whoosh(0.55, True, lo=2000, hi=9000, gain=0.35), 11.35, pan=-0.3)  # strike-throughs
add(whoosh(0.6, False, lo=600, hi=8000, gain=0.6), 12.1, pan=0.3)      # filler squeezed out
add(pop(880, 0.35), 13.2, send=0.3)
add(pluck([69, 72, 76, 81], 0.6, 0.6), 13.2, gain=1.1, send=0.5)
add(whip(0.5, 0.75), 15.05, pan=0.5)               # pan to TF-IDF
# TF-IDF
for i in range(5):                                 # cards fly in
    add(whoosh(0.2, True, lo=1000, hi=7000, gain=0.18), 15.6 + i * 0.07, pan=-0.4 + 0.2 * i)
prevb = 74
for k in range(0, 2000):                           # the slider ticking down token by token
    tt = 16.9 + k / 1000
    bb = round(74 + (43 - 74) * (lambda x: 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2)(min(1, (tt - 16.9) / 1.9)))
    if bb != prevb:
        add(tick(1500 + (bb - 43) * 25, 0.14, 0.02), tt, pan=0.2)
        prevb = bb
for tt in (16.95, 17.75):                          # each off-topic card falls away
    add(whoosh(0.6, False, lo=300, hi=3000, gain=0.5), tt)
    add(thump(48, 0.45), tt + 0.05)
add(pop(990, 0.4), 19.0, send=0.3)                 # 74 -> 43
add(whip(0.5, 0.75), 21.05, pan=0.5)               # pan to AI Rewrite
# AI Rewrite
for i in range(3):                                 # the prompt goes out to each model
    add(riser(0.35, 0.18), 22.0 + i * 0.05)
for k in range(46):                                # typing
    add(tick(3200 + (k % 5) * 180, 0.07, 0.015), 22.5 + k * 0.034, pan=-0.5 + (k % 3) * 0.5)
for i in range(3):
    for j in range(3):                             # checks
        add(pop(1200 + j * 220, 0.22), 23.7 + i * 0.12 + j * 0.09, pan=-0.5 + i * 0.5)
add(impact(0.6, 0.8), 24.35, send=0.3)             # the shortest wins
add(pop(1320, 0.4), 24.75, send=0.4)
add(whip(0.5, 0.75), 26.05, pan=0.5)               # pan to the results
# results
for i in range(3):                                 # each bar rises
    add(riser(0.5, 0.3), 26.85 + i * 0.16)
    add(thump(70 + i * 15, 0.4), 27.3 + i * 0.16)
add(riser(0.75, 0.6), 29.75)                       # diving into 69%…
add(impact(1.0, 1.4), 30.5, send=0.5)              # …violet
for tt in (32.0, 32.5, 33.0):                      # three hard cuts
    add(impact(0.7, 0.6), tt, send=0.3)
add(whip(0.4, 0.7), 33.42)                         # the wall rushes in
add(riser(0.7, 0.5), 33.85)
add(whoosh(0.4, True, lo=200, hi=6000, gain=0.6), 34.15, pan=-0.6)     # the chevrons crush it
add(whoosh(0.4, True, lo=200, hi=6000, gain=0.6), 34.15, pan=0.6)
add(impact(1.0, 1.5), 34.55, send=0.5)             # the line opens out
add(whoosh(0.35, True, gain=0.55), 36.68)
add(pop(1300, 0.4), 36.92, send=0.4)               # the diamond pops out
add(impact(0.95, 1.6), 37.0, send=0.6)             # the end card
add(pluck([57, 69, 72, 76, 81], 1.2, 0.8), 37.0, gain=1.3, send=0.6)
add(riser(0.75, 0.6), 39.25)                       # back into the loop

# ---------------- reverb (a decaying-noise impulse), then wrap the tail round ----------------
ir_len = int(1.4 * SR)
ir_t = np.arange(ir_len) / SR
ir = rng.standard_normal(ir_len) * np.exp(-ir_t / 0.35)
ir = onepole(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))
size = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.fft.irfft(np.fft.rfft(SEND, size) * np.fft.rfft(ir, size), size)[:N] * 0.6
L += wet
R += np.roll(wet, int(0.011 * SR))

loop = int(DUR * SR)
for ch in (L, R):
    ch[: N - loop] += ch[loop:]
L, R = L[:loop], R[:loop]

# glue: gentle saturation, then peak at -1 dB
mix = np.stack([L, R])
mix = np.tanh(mix * 0.9)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
pcm = (mix.T * 32767).astype(np.int16)
with wave.open("music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("music.wav", pcm.shape[0] / SR, "s")
