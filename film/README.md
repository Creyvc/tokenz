# Tokenz film

The 30-second ad at `../tokenz-film.mp4` (1920×1080, 60fps), cut to an edit of the music in
`dont-blink.mp3`. Every change lands on a hit measured from the edited track itself (the
times are the constants at the top of `film.html`; picture and music line up to within a frame):

- the build's pulses: a filler word on each ("Hey!", "Hope", "you're"…)
- the drop: 28 tokens; then "Every" "word" "costs." one per beat
- every beat after that, and faster through the fill: the logo's chevrons squeeze the 28 a notch tighter
- the last hit before the silence: crushed to 8
- after the silence, one step per hit: NLP 41 → 26 tokens, TF-IDF 74 → 43 (both the engine's real output), AI Rewrite's three checks, "Up to 69% fewer tokens." (best result in our tests), "Shorter prompts, Same request."
- the stop: everything squeezes into the logo; the final hit: the Tokenz end card

## Files

- `film.html`: the film as one web page. `render(t)` draws the frame at time `t` (0 to 30 seconds).
- `render.js`: renders frames with Playwright and Chrome, at 480 frames a second; eight are blended into each 60fps frame for motion blur.
- `dont-blink.mp3`: the music. The ad uses 21.2–48.0 s of it, then 114.97 s to the end.
- `synth.py`: an earlier, original soundtrack (made in code, needs numpy), kept in case the film needs music that's free to use.

## Making the video (with ffmpeg)

```sh
node render.js frames 480 -7 14393
ffmpeg -i "dont-blink.mp3" -filter_complex "[0:a]atrim=start=21.2:end=48.0,asetpts=PTS-STARTPTS,afade=t=in:d=0.08[a];[0:a]atrim=start=114.97:end=118.4,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=0.02:c1=tri:c2=tri,atrim=end=30.0,afade=t=out:st=29.4:d=0.6,aresample=48000[o]" -map "[o]" edit.wav
ffmpeg -framerate 480 -i frames/%06d.jpg -i edit.wav -filter_complex "[0:v]tmix=frames=8,select='eq(mod(n\,8)\,7)',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p[v];[1:a]volume=1.7dB[a]" -map "[v]" -map "[a]" -r 60 -c:v libx264 -crf 16 -c:a aac -b:a 256k -movflags +faststart tokenz-film.mp4
```

Split the frame range across several `render.js` runs to render faster.

The music is Apple's, from its "Don't Blink" ad, and isn't licensed for reuse: fine for a class
presentation, but don't publish the video with it.
