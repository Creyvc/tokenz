# Tokenz keynote film

> **Removed:** this folder's video was a copy of the current Tokenz ad and has been deleted; the ad is `film/promo/tokenz-promo.mp4` (see `film/promo/README.md`). The notes below describe the earlier film this folder made; its source is kept here, so it can be rendered again.

`tokenz-keynote.mp4`: 40 seconds, 1920×1080, 60fps, with sound. Everything in it is generated
(type, light, particles, counters); there are no screenshots or recordings. Black with slow blue and
violet light, Inter, off-white text, the ease-out cubic-bezier(0.22, 1, 0.36, 1), text arriving from
blur to sharp, a fine film grain.

| Time | Picture | Sound |
|---|---|---|
| 0–4 s | a cursor blinks, then types "Every word costs."; the token counter appears top right at 0 | an Fmaj7 pad, a note as the typing starts |
| 4–10 s | the long prompt, word by word; the counter climbs to 27 (each word's real count) and the words warm up | a quiet tick per token, from the right |
| 10–15 s | "Most of it is noise."; the filler dims, then breaks into dust and drifts away | Dm9, a faint air |
| 15–22 s | what's left closes up, the first line slides into place, the rest comes back sharp with the new words; the counter rolls down to 19; "−30%" | a gentle rising swell, ticks rolling down, a bell chord on −30% |
| 22–28 s | thin rings of light around polite, Friday and 100 words, breathing; "Nothing that matters gets lost." | three soft notes, one per ring |
| 28–34 s | three lines of light (Local NLP, TF‑IDF, AI rewrite) flow in and merge into one; "Local first. AI when it counts." | a note per line, a chord where they meet |
| 34–40 s | "Tokenz", then "Save tokens. Keep meaning."; held 3 s, then black | one clean final chord |

The counts are real (tiktoken, o200k_base): the long prompt is 27 tokens, the short one 19 (−29.6%).

## Files

- `keynote.html`: the film as one web page. `render(t)` draws the frame at time `t` (0 to 40 s).
- `timeline.js`: every time in the film. The picture and the sound both read it, so each tick lands
  on its count; change a time here and both follow.
- `score.py`: writes `score.wav` with the instruments in `../../shared/scores.py` (needs numpy).
- `render.js`: `preview <dir> t1 t2 …` writes single frames to check; `stream <fps> <from> <to>`
  writes frames to stdout for ffmpeg.

## Making the video (with ffmpeg)

Each video frame blends 8 drawn moments (480 a second) for motion blur; the grain is added after,
so it stays crisp. The first encode is near-lossless and very large; the second makes the file.

```sh
python score.py
part() { node render.js stream 480 $1 $2 | ffmpeg -y -f image2pipe -framerate 480 -c:v mjpeg -i - -vf "tmix=frames=8,select='eq(mod(n\,8)\,7)',setpts=N/60/TB,noise=alls=5:allf=t,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -r 60 -c:v libx264 -preset slow -crf 14 -tune grain part$3.mp4; }
part 0 4800 0 & part 4800 9600 1 & part 9600 14400 2 & part 14400 19200 3 & wait
printf "file 'part0.mp4'\nfile 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > parts.txt
ffmpeg -f concat -i parts.txt -i score.wav -c:v copy -af "volume=-2dB,afade=t=out:st=39.2:d=0.8" -c:a aac -b:a 256k -shortest master.mp4
ffmpeg -i master.mp4 -c:v libx264 -preset slow -crf 19 -maxrate 16M -bufsize 32M -tune grain -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:a copy -movflags +faststart tokenz-keynote.mp4
```
