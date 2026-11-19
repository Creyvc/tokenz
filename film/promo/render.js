// node render.js <WxH> preview <outdir> t1 t2 ...   single frames at those times, for checking
// node render.js <WxH> stream <fps> <from> <to>      JPEG frames from..to-1 (frame n = time n/fps) to stdout, for ffmpeg
// WxH: 1920x1080 (16:9) or 1080x1920 (9:16)
const path = require("path");
const fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const [size, mode, ...rest] = process.argv.slice(2);
  const [w, h] = size.split("x").map(Number);
  const browser = await chromium.launch({ channel: "chrome", args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "promo.html") + `?w=${w}&h=${h}`);
  await page.evaluate(() => window.ready);
  const canvas = await page.$("canvas");
  if (mode === "preview") {
    const out = rest[0]; fs.mkdirSync(out, { recursive: true });
    for (const t of rest.slice(1)) {
      await page.evaluate((t) => window.render(t), +t);
      await canvas.screenshot({ path: path.join(out, `t${(+t).toFixed(3).padStart(7, "0")}.jpg`), type: "jpeg", quality: 85 });
    }
  } else {
    const [fps, from, to] = rest.map(Number);
    const t0 = Date.now();
    for (let n = from; n < to; n++) {
      await page.evaluate((t) => window.render(t), n / fps);
      const buf = await canvas.screenshot({ type: "jpeg", quality: 92 });
      if (!process.stdout.write(buf)) await new Promise((r) => process.stdout.once("drain", r));
    }
    process.stderr.write(`frames ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  if (errors.length) process.stderr.write("ERRORS " + errors.join("; ") + "\n");
  await browser.close();
})();
