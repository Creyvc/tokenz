// node render.js <outdir> <fps> <from> <to>      renders frames from..to-1 (frame n = time n/fps)
// node render.js <outdir> preview t1 t2 ...       renders single frames at those times
const path = require("path");
const fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const [out, mode, ...rest] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "film.html"));
  await page.evaluate(() => window.ready);
  const shot = async (t, file) => {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: file, type: "jpeg", quality: 93 });
  };
  if (mode === "preview") {
    for (const t of rest) await shot(+t, path.join(out, `t${(+t).toFixed(2)}.jpg`));
  } else {
    const fps = +mode, from = +rest[0], to = +rest[1];
    const t0 = Date.now();
    for (let n = from; n < to; n++) await shot(n / fps, path.join(out, String(n + 7 + 1000000).slice(1) + ".jpg"));
    console.log(`frames ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  if (errors.length) console.log("ERRORS", errors);
  await browser.close();
})();
