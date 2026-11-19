// The promo's timeline, in beats at 118 BPM (one beat = 60/118 s; 94 beats = 47.8 s). Shared by
// promo.html (the picture) and score.py (the sound reads this file too), so every flash, shake,
// whoosh and tick has its sound on the same beat. Plain JSON after "window.TL =".
window.TL = {
  "bpm": 118, "beats": 94,
  "scenes": { "open": 0, "s1": 8, "s2": 12, "s3": 16, "s4": 20, "pct": 24, "drop": 26, "tunnel": 30, "rows": 34, "nlp": 38, "tfidf": 44, "ai": 50,
              "s6": 56, "check": 62, "s7": 64, "s8": 72, "s9": 82, "silence": 83, "logo": 84, "tagline": 86, "end": 93 },
  "openType": { "start": 0.25, "span": 3 }, "openCards": [1, 2, 3, 4, 5, 6],
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
  "flashes": [8, 24, 26, 68, 84],
  "impacts": [8, 10, 20, 24, 26, 30, 34, 38, 44, 50, 52, 56, 58, 60, 62, 68, 72, 78, 84],
  "whips": [12, 16, 34, 50, 56, 64, 72],
  "swooshes": [38, 44],
  "breaks": [7.5, 25.5, 29.5, 63.5, 71.5]
};
