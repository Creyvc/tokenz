// node compare-shots.js <outdir>   Compare and Results at 1440×900 ×2, with real runs of all three methods
const path = require("path"), fs = require("fs");
const { chromium } = require("/Users/creybluu/.nvm/versions/node/v24.19.0/lib/node_modules/@playwright/cli/node_modules/playwright");
const PROMPT = "Hi! I hope you're doing well. Could you please help me write a short, friendly email to my team letting them know that our weekly meeting has been moved from Tuesday to Thursday at 3 PM? Please keep it brief and positive. Thank you so much in advance!";
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { sessionStorage.setItem("tokenz_intro_played", "1"); });
  const hide = () => page.addStyleTag({ content: ".consent { display: none !important; }" });
  const shot = (name) => page.screenshot({ path: path.join(out, name + ".png") });
  await page.goto("http://127.0.0.1:8000/compare.html"); await hide();
  await page.waitForTimeout(3500);
  await shot("compare-empty");
  await page.click("[data-prompt]");
  await page.keyboard.type(PROMPT, { delay: 4 });
  await page.waitForTimeout(1500);
  await shot("compare-typed");
  for (const method of ["nlp", "tfidf", "ai"]) {
    await page.click(`.wb-segmented label:has(input[value="${method}"])`);
    await page.waitForTimeout(900);
    if (method === "tfidf") { await page.waitForTimeout(1500); }
    await page.click("[data-run]");
    try { await page.waitForSelector("[data-result]:not([hidden])", { timeout: 60000 }); } catch (e) { console.log("no result for", method); }
    await page.waitForTimeout(method === "ai" ? 15000 : 4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await shot("compare-" + method);
    const r = await page.$("[data-result]");
    if (r) { await r.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await shot("compare-" + method + "-result"); }
    console.log(method, await page.evaluate(() => (document.querySelector("[data-result]") || {}).innerText?.slice(0, 200)));
  }
  await page.goto("http://127.0.0.1:8000/results.html"); await hide();
  await page.waitForTimeout(4500);
  await shot("results");
  console.log("runs", await page.evaluate(() => sessionStorage.getItem("tokenz_runs")?.slice(0, 1500)));
  await page.click(".wb-details summary").catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector(".wb-details")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(600);
  await shot("results-texts");
  await browser.close();
})();
