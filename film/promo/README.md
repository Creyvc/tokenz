# Tokenz promo

Two cuts of the same promo, everything generated (type, prompt cards, chips, shards, light, glass
blocks, counters), no screenshots: `tokenz-promo-16x9.mp4` (1920×1080) and `tokenz-promo-9x16.mp4`
(1080×1920, for social). 60fps, 118 BPM, 94 beats (47.8 s), every cut, slam and shake on a beat.
A light film (paper white, ink, electric blue and violet, Inter), after the launch videos the owner
chose (refs/, never committed): Dexatel's two-weight typing, stacked message cards, solid blue beats
and end card; NIVO's glass, faded background words, gradient curves and isometric tiles. Recreated
in Tokenz's look, not copied: no footage, logos, people or watermarks from them.

| Beats | Picture | Sound |
|---|---|---|
| 0–8 | "Prompts are **getting longer.**" types on; six prompts stack in beside it, each with its real token count | a click per letter, a whoosh per card |
| 8–12 | on electric blue: "27" slams in, "TOKENS" snaps beside it | the beat drops in, stabs |
| 12–16 | the long prompt races in word by word (filler in orange); the counter spins to 27 | a tick per token |
| 16–20 | "Could", "please", "help me", "asking for", each zoomed into and shattered | a pop per shatter, a riser |
| 20–26 | the short prompt snaps together; the counter flips 27 → 19; "−30%" | clicks, ticks, a stab |
| 26–30 | "SHORTER." "FASTER." "CHEAPER." "SAME MEANING.", one a beat | a stab each |
| 30–34 | a tunnel of prompt cards: "Paste any prompt." "Get it back shorter." | a big whoosh |
| 34–38 | rows of drifting filler words and method tiles: "Three ways to trim." "Pick one. Save more." | the lead comes in |
| 38–44 | (swoosh) NLP, "Tidy." drifting behind: the filler chips pop, the rest tidies; 27 → 23 (−15%) | a pop and tick per chip |
| 44–50 | (swoosh) TF‑IDF, "Focus.": the two off-topic sentences slide away; 74 → 43 (−42%) | whooshes, ticks |
| 50–56 | AI rewrite, "Rewrite.": the chips melt into a core and the rewrite forms; 27 → 19 (−30%), "Example" | a reverse swell, a shimmer |
| 56–62 | "FRIDAY", "100 WORDS", "NOT" lock in with a ring of light | stabs, pings |
| 62–64 | "Nothing lost.": a glassy check, confetti | a chime, confetti crackle |
| 64–72 | three gradient curves (Local NLP, TF‑IDF, AI rewrite) merge into one; "Local first." "AI when it counts." | whooshes |
| 72–82 | 27 glass blocks lock into a cube; its 8 corners pop (27 → 19); it compresses and spins | an arpeggio, ticks, a riser |
| 82–84 | it collapses to a point; a beat of silence | silence |
| 84–93 | a blue bloom; the Tokenz mark, "Tokenz" types on beside it; "Save tokens. Keep meaning." in an outlined pill | one big impact, typing |
| 93–94 | blank | cut |

The music, "Glide" (`score.py`), is our own, written to the reference track's shape (measured, not
copied): 118 BPM, a gliding, distorted 808 on a creeping minor line, kick, claps on 2 and 4, rolling
hats, half-beat drop-outs before big cuts; its bass-to-treble balance is within about 2 dB of the reference's.

## The numbers

Token counts are real (tiktoken, o200k_base); NLP's and TF‑IDF's results are the engine's own output (`chips.py`):
- The email prompt: 27 tokens. NLP: 23 ("Help me write a polite email to my professor asking for a
  meeting on Friday. Keep it under 100 words.").
- The history-exam prompt: 74 tokens. TF‑IDF: 43 (the "stressed" and "roommate" sentences dropped).
- The AI rewrite is an example, labelled so on screen: the opening's short prompt ("Write a polite
  email to my professor requesting a Friday meeting. Use fewer than 100 words.", 19 tokens, −30%).
- The opening's six prompt cards show their real counts.

## Files

- `promo.html`: the film, drawn on one canvas. `render(t)` draws the frame at time `t`;
  `?w=1080&h=1920` lays it out for the vertical cut.
- `timeline.js`: every event, in beats. The picture and the sound both read it.
- `chips.js`: real tokens for the method scenes and the opening's cards, written by `chips.py`
  (run it with the backend's Python, which has tiktoken: `../../backend/.venv/bin/python chips.py`).
- `score.py`: writes `score.wav` with the instruments in `../scores.py` (needs numpy).
- `render.js`: `<WxH> preview <dir> t1 t2 …` writes single frames; `<WxH> stream <fps> <from> <to>`
  writes frames to stdout for ffmpeg.
- `make.sh`: renders a cut, blending 16 drawn moments into each frame for motion blur, and adds the music.
- `refs/`: the reference videos and track, for study only (ignored by git).

```sh
python score.py
./make.sh 1920x1080 tokenz-promo-16x9.mp4
./make.sh 1080x1920 tokenz-promo-9x16.mp4
```
