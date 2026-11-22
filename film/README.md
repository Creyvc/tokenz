# Film

The Tokenz ads, each made in code: a web page draws every frame, a Python script writes the music on
the same beat grid, and `ffmpeg` joins them. None of this is part of the website; the site plays its
own copies of the finished ad from `frontend/assets/video/`.

| Folder | What it is |
| --- | --- |
| `promo/` | **The current ad** (48 s, loops). `tokenz-promo.mp4` is the finished film; `make.sh` renders it again. See [promo/README.md](promo/README.md). |
| `shared/` | The music toolkit every film's `score.py` uses: `scores.py` (instruments, mixing, mastering) and `synth.py` (an earlier synth). |
| `archive/` | Earlier films the promo replaced, kept so they can be rendered again: `teaser/` (the first ad), `keynote/` and `showreel/`. Their videos were deleted. |

`promo/refs/` (reference videos and music) and every `score.wav` stay on this computer: they're
git-ignored.
