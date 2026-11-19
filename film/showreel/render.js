// node render.js preview <outdir> t1 t2 ...    single 1080p frames at those times, for checking
// node render.js stream <fps> <from> <to> [scale] JPEG frames from..to-1 (frame n = time n/fps) to stdout,
//                                                 for ffmpeg (scale 1 = 1920×1080, 2 = 3840×2160)
const path = require("path");
const fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  const scale = mode === "stream" ? +(rest[3] || 1) : 1;
  const browser = await chromium.launch({ channel: "chrome", args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "showreel.html"));
  await page.evaluate(() => window.ready);
  if (mode === "preview") {
    const out = rest[0]; fs.mkdirSync(out, { recursive: true });
    for (const t of rest.slice(1)) {
      await page.evaluate((t) => window.render(t), +t);
      await page.screenshot({ path: path.join(out, `t${(+t).toFixed(2).padStart(6, "0")}.jpg`), type: "jpeg", quality: 85 });
    }
  } else {
    const [fps, from, to] = rest.map(Number);
    const t0 = Date.now();
    for (let n = from; n < to; n++) {
      await page.evaluate((t) => window.render(t), n / fps);
      const buf = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!process.stdout.write(buf)) await new Promise((r) => process.stdout.once("drain", r));
    }
    process.stderr.write(`frames ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  if (errors.length) process.stderr.write("ERRORS " + errors.join("; ") + "\n");
  await browser.close();
})();
