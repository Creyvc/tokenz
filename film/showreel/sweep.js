// node sweep.js <outdir>   small screenshots of Home every quarter window, to pick the moments for the showreel
const path = require("path"), fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.5 });
  await page.addInitScript(() => { sessionStorage.setItem("tokenz_intro_played", "1"); localStorage.setItem("tokenz_consent", "denied"); });
  await page.goto("http://127.0.0.1:8000/index.html");
  await page.waitForTimeout(2500);
  let y = 0;
  for (let i = 0; i < 70; i++) {
    const target = i * 225;
    while (y < target) { y = Math.min(target, y + 60); await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(16); }
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, "y" + String(target).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 70 });
  }
  console.log("max", await page.evaluate(() => document.documentElement.scrollHeight));
  await browser.close();
})();
