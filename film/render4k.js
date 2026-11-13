// node render4k.js <fps> <from> <to>  writes JPEG frames from..to-1 (frame n = time n/fps) to
// stdout at 3840×2160 (the page's 1920×1080 at twice the pixel density), for ffmpeg to read
const path = require("path");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const [fps, from, to] = process.argv.slice(2).map(Number);
  const browser = await chromium.launch({ channel: "chrome", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "film.html"));
  await page.evaluate(() => window.ready);
  const t0 = Date.now();
  for (let n = from; n < to; n++) {
    await page.evaluate((t) => window.render(t), n / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!process.stdout.write(buf)) await new Promise((r) => process.stdout.once("drain", r));
  }
  process.stderr.write(`frames ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(1)}s ${errors.length ? "ERRORS " + errors.join("; ") : ""}\n`);
  await browser.close();
})();
