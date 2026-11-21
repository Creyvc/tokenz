// The promo's timeline, in beats at 120 BPM (one beat = 0.5 s; 96 beats = 24 bars = exactly 48 s:
// 2880 frames at 60 fps and 2,304,000 samples at 48 kHz, so picture and sound end on the same
// sample), and it loops: the last frame is the first (the violet diamond), and the last bar runs
// straight back into the first. Shared by promo.html (the picture) and score.py (the sound reads
// this file too), so every flash, shake, whoosh and tick has its sound on the same beat. Plain JSON
// after "window.TL =".
window.TL = {
  "bpm": 120, "beats": 96,
  "scenes": { "open": 0, "s1": 8, "s2": 12, "s3": 16, "s4": 20, "pct": 24, "drop": 26, "tunnel": 30, "rows": 34, "nlp": 38, "tfidf": 44, "ai": 50,
              "s6": 56, "check": 62, "s7": 64, "s8": 72, "s9": 82, "silence": 83.5, "logo": 84, "tagline": 86, "loop": 92, "end": 96 },
  "intro": { "emit": 0.5, "span": 3, "title": 4.25, "eyebrow": 4.75 },
  "words": { "start": 12, "span": 3.4, "curve": 0.55 },
  "tokens": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 25, 27],
  "pops": [16.5, 17.5, 18.5, 19.5],
  "snap": { "start": 20, "span": 2 }, "flip": { "start": 22, "step": 0.125 },
  "punch": [26, 27, 28, 29],
  "tunnelLines": [30, 32], "rowLines": [34, 36],
  "nlpPops": [39, 39.5, 40, 40.5], "nlpReflow": 41,
  "tfDrop": [45.5, 46], "tfClose": 46.5, "tfRoll": { "start": 46.5, "step": 0.125, "steps": 8 },
  "aiMelt": 51, "aiForm": 52, "aiRoll": { "start": 52.5, "step": 0.125, "steps": 8 },
  "details": [56, 58, 60],
  "streams": [64, 65, 66], "burst": 68, "lines": [68, 70],
  "blocks": { "start": 72, "span": 3 }, "corners": { "start": 76, "step": 0.25 }, "compress": 78, "spin": 80,
  "flashes": [24, 26, 68],
  "impacts": [8, 10, 20, 24, 26, 30, 34, 38, 44, 50, 52, 56, 58, 60, 62, 68, 72, 78, 84],
  "whips": [12, 34, 56],
  "cuts": { "8": "iris", "12": "whip", "16": "zoom", "20": "flip", "24": "shutter", "26": "push", "30": "zoom", "34": "whip",
            "38": "swoosh", "44": "wipe", "50": "pixel", "56": "whip", "62": "spin", "64": "iris", "72": "zoom", "84": "bloom" },
  "swooshes": [38],
  "breaks": [7.5, 25.5, 29.5, 63.5, 71.5]
};
