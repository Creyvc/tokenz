# Tokenz film

The 37-second ad at `../tokenz-film.mp4` (4K: 3840×2160, 60fps; `../tokenz-film-1080p.mp4` is the same at 1080p, for slower players), cut to an edit of the music in
`dont-blink.mp3`. Every change lands on the music's own beat grid, measured from the track (the constants at the top
of `film.html`): 127.0 BPM before the silence, 125.0 BPM after it, where each bar's three accents (its 1st,
4th and 6th eighth notes) carry the steps. Picture and music line up to within about a frame.

- the build's pulses: a filler word on each ("Hey!", "Hope", "you're"…)
- the drop: 28 tokens; then "Every" "word" "costs." one per beat
- every beat after that, and faster through the fill: the logo's chevrons squeeze the 28 a notch tighter
- the last hit before the silence: crushed to 8
- after the silence, one step per hit, each method shown on its prompt's own tokens (o200k_base, one chip per token):
  - NLP: the filler tokens light up orange and are thrown out, the rest close up; 41 → 26 tokens, the engine's real output
  - TF-IDF: one row of chips per sentence; the two off-topic rows slide out; 74 → 43, the engine's real output
  - AI Rewrite (marked as an example): the 28-token prompt collapses into a point and "Write a short ocean poem." bursts out of it, then the three checks
- "Up to 69% fewer tokens." (best result in our tests), then "Shorter prompts, Same request."
- the stop: everything squeezes into the logo; the final hit: the Tokenz end card

The whole frame punches and shakes a little on every beat (more on the big ones), and breathes slowly in between.
Each scene grows out of the last one's key element (the violet 26 becomes TF-IDF's violet, its black −42% tag
becomes AI Rewrite's black, and so on), and the end closes back into the opening frame, so it loops.

## Files

- `film.html`: the film as one web page. `render(t)` draws the frame at time `t` (0 to 37 seconds).
- `render.js`: renders frames with Playwright and Chrome, at 480 frames a second; eight are blended into each 60fps frame for motion blur.
- `dont-blink.mp3`: the music. The ad uses 21.2–54.835 s of it (to a bar line), then 114.97 s to the end.
- `synth.py`: an earlier, original soundtrack (made in code, needs numpy), kept in case the film needs music that's free to use.

## Making the video (with ffmpeg)

The music edit:

```sh
ffmpeg -i "dont-blink.mp3" -filter_complex "[0:a]atrim=start=21.2:end=54.835,asetpts=PTS-STARTPTS,afade=t=in:d=0.08[a];[0:a]atrim=start=114.97:end=118.4,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.02:c1=tri:c2=tri,afade=t=out:st=36.4:d=0.6,atrim=end=37.0,aresample=48000[o]" -map "[o]" edit.wav
```

The picture, in 4K: `render4k.js` streams 480 frames a second into ffmpeg, which blends each eight
into one 60fps frame (motion blur). Render it in four parts at once, then join them and add the music:

```sh
part() { node render4k.js 480 $1 $2 | ffmpeg -f image2pipe -framerate 480 -c:v mjpeg -i - -vf "tmix=frames=8,select='eq(mod(n\,8)\,7)',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -r 60 -c:v libx264 -crf 15 part$3.mp4; }
part -7 4433 0 & part 4433 8873 1 & part 8873 13313 2 & part 13313 17753 3 & wait
printf "file 'part0.mp4'\nfile 'part1.mp4'\nfile 'part2.mp4'\nfile 'part3.mp4'\n" > parts.txt
ffmpeg -f concat -i parts.txt -i edit.wav -c:v copy -af volume=1.6dB -c:a aac -b:a 256k -movflags +faststart tokenz-film.mp4
```

`render.js` does the same at 1080p into image files, for quick previews (`node render.js out preview 12.5`).

The music is Apple's, from its "Don't Blink" ad, and isn't licensed for reuse: fine for a class
presentation, but don't publish the video with it.
