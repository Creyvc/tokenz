# Tokenz showreel

`tokenz-showreel.mp4`: 38.4 seconds, 1920×1080, 60fps, made to loop (it ends on black and starts
again on the first word). The music is our own score, "Drive" (`score.py`), at 125 BPM. Every cut
in the picture lands on its beat, and only one scene is on screen at a time.

| Bars | Picture |
|---|---|
| 0–1 | the filler from a real prompt, a phrase per beat: "Hi!", "I hope", "you're doing", "well.", "Could you", "please", "thank you", "so much!" |
| 2 | "Every word" / "costs **tokens.**" |
| 3 | "Introducing", then the mark, and "Tokenz" sliding out from behind it |
| 4–5 | the drop: Home's first screen flies up in a browser window |
| 6 | "Three methods." / "One click." |
| 7–8 | Three Methods, then NLP, TF‑IDF and AI Rewrite, each pushing the last one out |
| 9 | colour cards, one a beat: NLP. TF‑IDF. AI Rewrite. Your pick. |
| 10–11 | Compare: the prompt, then the NLP result (34.5%), then the AI rewrite's (49.1%) |
| 12–13 | 55 tokens counting down to 28, then "−49%" (labelled as a real run) |
| 14–15 | Results: the three methods side by side and the chart |
| 16 | What We Measure, one a beat: Total tokens, Messages, Cost, Quality |
| 17 | the FAQ |
| 18 | "Shorter prompts, / Same request." as on Home |
| 19 | the end card, folding back to black for the loop |

All the numbers are from real runs of the three methods on one prompt (`compare-shots.js`).

## Files

- `showreel.html`: the film as one web page. `render(t)` draws the frame at time `t` (0 to 38.4 s).
- `score.py`: writes `score.wav` with the instruments in `../scores.py` (needs numpy).
- `shots/`: screenshots of the site at 1440×900 ×2. `shots.js` takes Home's (scrolled to each
  point; the backend must be serving the site at 127.0.0.1:8000), and `compare-shots.js` runs a
  prompt through all three methods on Compare, then takes Compare and Results.
- `render.js`: `preview <dir> t1 t2 …` writes single frames to check; `stream <fps> <from> <to>`
  writes frames to stdout for ffmpeg.

## Making the video (with ffmpeg)

Each video frame blends 16 drawn moments (960 a second), for smooth motion blur:

```sh
python score.py
part() { node render.js stream 960 $1 $2 | ffmpeg -y -f image2pipe -framerate 960 -c:v mjpeg -i - -vf "tmix=frames=16,select='eq(mod(n\,16)\,15)',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -r 60 -c:v libx264 -preset slow -crf 15 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 part$3.mp4; }
part 0 9216 0 & part 9216 18432 1 & part 18432 27648 2 & part 27648 36864 3 & wait
printf "file 'part0.mp4'\nfile 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > parts.txt
ffmpeg -f concat -i parts.txt -i score.wav -c:v copy -af volume=-4dB -c:a aac -b:a 256k -shortest -movflags +faststart tokenz-showreel.mp4
```
