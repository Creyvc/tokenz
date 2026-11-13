# Tokenz film

The 42-second ad at `../tokenz-film.mp4` (4K: 3840×2160, 60fps; `../tokenz-film-1080p.mp4` is the
same at 1080p, for slower players). The music is our own score, made in code ("Neon", synthwave,
in `scores.py`), at 125 BPM, so every change in the picture lands exactly on its beat.

| Time | Music | Picture |
|---|---|---|
| 0–1 s | lead-in | a violet text cursor blinking on the beat (the loop point) |
| bars 1–2 | synth arpeggio | "Every word you send / costs tokens." a phrase on every other beat |
| bar 3 | arpeggio, kick | a chatty prompt types itself in an eighth note at a time; its token count races 2 → 28 (real counts) |
| bar 4 | riser, snare roll | the filler lights up orange a phrase per beat; the words that matter go violet |
| drop | kick, bass, gated chords | the prompt squeezes to "Write a short poem about the ocean." (28 → 8 tokens), then "−71%" slams in, "Fewer tokens." a word per beat |
| break | a held chord | "Three ways to trim a prompt." |
| groove, 9 bars | syncopated breakbeat (accents on each bar's 1st, 4th and 6th eighths) | NLP, TF-IDF and AI Rewrite, each on its prompt's own tokens; NLP 41 → 26 and TF-IDF 74 → 43 are the engine's real output, AI Rewrite is marked as an example |
| groove, 3 bars | the same groove | the graph: tokens saved on average in our tests (NLP 34%, TF-IDF 43%, AI Rewrite 60%), each method's best result marked, "Up to 69% fewer tokens." |
| last bar, the stop | the music cuts dead | "Shorter prompts, Same request." The logo comes back and squeezes it shut as the music stops |
| final hit | impact, held chord | the end card: the mark slides left and "Tokenz" slides out from behind it; at the end the word slides back in and the mark folds into the cursor the film opens on, so it loops |

The logo only appears at the end. The words land on the beat by themselves; the whole frame only
gives a soft punch on the big moments (the drop, each new section, the final hit). Each scene grows
out of the last one's key element.

The graph's averages come from the prompts we benchmarked: NLP on 5, TF-IDF on 2, AI Rewrite on 6.

## Files

- `film.html`: the film as one web page. `render(t)` draws the frame at time `t` (0 to 42.56 seconds). The beat grid is at the top of its script and matches `scores.py`.
- `scores.py`: writes the music. `python scores.py neon` writes `score_neon.wav`, the film's track. It also has
  four other scores on the same beat grid (`rise`, `heroic`, `glass`, `clockwork`), any of which fits the picture. Needs numpy.
- `score.py`: "Pulse", the earlier house score, on the same grid.
- `render4k.js`: streams 4K frames (480 a second) into ffmpeg, which blends each eight into one 60fps frame for motion blur.
- `render.js`: the same at 1080p into image files, for quick previews (`node render.js out preview 12.5`).
- `dont-blink.mp3` and `synth.py`: the earlier music (Apple's track, the inspiration) and an earlier score. Not used by the film any more.

## Making the video (with ffmpeg)

```sh
python scores.py neon
part() { node render4k.js 480 $1 $2 | ffmpeg -f image2pipe -framerate 480 -c:v mjpeg -i - -vf "tmix=frames=8,select='eq(mod(n\,8)\,7)',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -r 60 -c:v libx264 -crf 14 part$3.mp4; }
part -7 5105 0 & part 5105 10209 1 & part 10209 15313 2 & part 15313 20417 3 & wait
printf "file 'part0.mp4'\nfile 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > parts.txt
ffmpeg -f concat -i parts.txt -i score_neon.wav -c:v copy -af volume=-5.5dB -c:a aac -b:a 256k -movflags +faststart tokenz-film.mp4
```
