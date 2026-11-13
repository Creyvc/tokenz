# Tokenz film

The 40-second looping ad. The logo's two chevrons run through the whole film, squeezing everything and handing each scene to the next, and a 3D camera moves through the set: the problem, the three methods (NLP, TF-IDF with its token slider, AI Rewrite), the results, and the end card.

It's at `../tokenz-film.mp4` (1920×1080, 60fps, with sound), made from these files:

- `film.html`: the whole film as one web page. `render(t)` draws the frame at time `t` (0 to 40 seconds), so any frame can be rendered on its own, and t = 40 matches t = 0 for the loop.
- `render.js`: renders frames with Playwright and Chrome. `node render.js frames 480 -7 19193` renders 480 frames a second; eight of them are blended into each 60fps frame for smooth motion blur.
- `synth.py`: makes the soundtrack (`music.wav`): an original 120 BPM track plus sound effects timed to the picture, 40 seconds, wrapped round so it loops. Needs numpy.

To make the video (with ffmpeg):

```sh
node render.js frames 480 -7 19193
python synth.py
ffmpeg -framerate 480 -i frames/%06d.jpg -i music.wav -filter_complex "[0:v]tmix=frames=8,select='eq(mod(n\,8)\,7)',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p[v];[1:a]volume=-5dB[a]" -map "[v]" -map "[a]" -r 60 -c:v libx264 -crf 16 -c:a aac -b:a 256k -movflags +faststart tokenz-film.mp4
```

Split the frame range across several `render.js` runs to render faster. The NLP (41 → 26 tokens) and TF-IDF (74 → 43) scenes show the engine's real output and token counts. The AI Rewrite scene is labelled as an example. The results bars (52%, 48%, 69%) are the best saving each method got in our tests.
