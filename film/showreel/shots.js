// node shots.js <outdir> <scale> <y1> <y2> ...   screenshots of Home (1440×900 at <scale>) once it has
// been scrolled, gently, to each y in turn (the page's scroll effect needs a smooth scroll to keep up)
const path = require("path"), fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const [out, scale, ...ys] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: +scale });
  await ctx.addCookies([{ name: "tokenz_consent", value: "denied", url: "http://127.0.0.1:8000" }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => { sessionStorage.setItem("tokenz_intro_played", "1"); });
  await page.goto("http://127.0.0.1:8000/index.html");
  await page.addStyleTag({ content: ".consent { display: none !important; }" });
  await page.waitForTimeout(2500);
  let y = 0;
  for (const t of ys.map(Number)) {
    while (y < t) { y = Math.min(t, y + 60); await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(16); }
    await page.waitForTimeout(+(process.env.WAIT || 1200));
    const big = +scale >= 1, name = "home-" + String(t).padStart(5, "0") + (big ? ".png" : ".jpg");
    await page.screenshot(big ? { path: path.join(out, name) } : { path: path.join(out, name), type: "jpeg", quality: 70 });
  }
  await browser.close();
})();
