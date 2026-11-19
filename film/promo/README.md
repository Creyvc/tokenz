# Tokenz promo

`tokenz-promo.mp4`: everything generated (type, prompt cards, chips, shards, light, glass blocks,
counters), no screenshots. 1920×1080, 60fps, 118 BPM, 96 beats (24 bars, 48.8 s), and it loops:
the end card dives into the mark's violet diamond, which shrinks into the blinking caret the film
opens on, and the music's last bar runs straight back into its first. The camera never stops: a slow
push and drift through every scene, and a transition at every cut (zoom-through, whip, spin, push,
swoosh, bloom), each on a beat.
A light film (paper white, ink, electric blue and violet, Inter), after the launch videos the owner
chose (refs/, never committed): Dexatel's two-weight typing, stacked message cards, solid blue beats
and end card; NIVO's glass, faded background words, gradient curves and isometric tiles. Recreated
in Tokenz's look, not copied: no footage, logos, people or watermarks from them.

| Beats | Picture | Sound |
|---|---|---|
| 0–8 | a caret blinks; "Prompts are **getting longer.**" types on; a deck of glass prompt cards stacks up beside it, each with its real token count | a click per letter, a whoosh per card |
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
| 64–72 | three coloured ribbons of light, labelled in glass pills (Local NLP and TF‑IDF "Local", AI rewrite "Cloud"), race in with light flowing along them and merge at a glowing node holding the Tokenz mark; "Local first." "AI when it counts." | whooshes |
| 72–82 | 27 glass blocks lock into a cube; its 8 corners pop (27 → 19); it compresses and spins | an arpeggio, ticks, a riser |
| 82–84 | it collapses to a point; a beat of silence | silence |
| 84–92 | a blue bloom; the Tokenz mark, "Tokenz" types on beside it; "Save tokens. Keep meaning." in an outlined pill | one big impact, typing; the groove comes back |
| 92–96 | the camera dives into the mark's violet diamond; the violet shrinks into the opening's caret | the last bar, back into the first |

The music, "Glide" (`score.py`), is our own, written to the reference track's shape (measured, not
copied): 118 BPM, a gliding, warm 808 on a creeping minor line, kick, claps on 2 and 4, rolling hats,
a chord bed, half-beat drop-outs before big cuts. Mastered without hard clipping (gentle bus
compression, a soft ceiling), at about −17 LUFS with peaks under −0.9 dBFS (the reference is −9
LUFS, much louder); tails past the end are folded onto the start, so the loop is seamless.

## The numbers

Token counts are real (tiktoken, o200k_base); NLP's and TF‑IDF's results are the engine's own output (`chips.py`):
- The email prompt: 27 tokens. NLP: 23 ("Help me write a polite email to my professor asking for a
  meeting on Friday. Keep it under 100 words.").
- The history-exam prompt: 74 tokens. TF‑IDF: 43 (the "stressed" and "roommate" sentences dropped).
- The AI rewrite is an example, labelled so on screen: the opening's short prompt ("Write a polite
  email to my professor requesting a Friday meeting. Use fewer than 100 words.", 19 tokens, −30%).
- The opening's six prompt cards show their real counts.

## Files

- `promo.html`: the film, drawn on one canvas. `render(t)` draws the frame at time `t`.
- `timeline.js`: every event, in beats. The picture and the sound both read it.
- `chips.js`: real tokens for the method scenes and the opening's cards, written by `chips.py`
  (run it with the backend's Python, which has tiktoken: `../../backend/.venv/bin/python chips.py`).
- `score.py`: writes `score.wav` with the instruments in `../scores.py` (needs numpy).
- `render.js`: `<WxH> preview <dir> t1 t2 …` writes single frames; `<WxH> stream <fps> <from> <to>`
  writes frames to stdout for ffmpeg.
- `make.sh`: renders the film, blending 16 drawn moments into each frame for motion blur, and adds the music.
- `refs/`: the reference videos and track, for study only (ignored by git).

```sh
python score.py
./make.sh 1920x1080 tokenz-promo.mp4
```
