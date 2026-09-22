/* Phase 10/11 — 浏览器端：全流程 + MVP 实时计分 + 隔离 + 错误态 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const BASE = "http://127.0.0.1:8747/index.html";
const OUT = path.join(__dirname, "output", "playwright");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("SHOT", name);
}

async function waitMainReady(page, timeout = 180000) {
  await page.waitForFunction(
    () => {
      const b = document.querySelector("#btn-run-round");
      return b && !b.disabled;
    },
    { timeout }
  );
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/503|502|Failed to load resource|net::/.test(t)) return;
    errors.push("console: " + t);
  });

  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "networkidle" });

  const api = await page.evaluate(() => ({
    scoring: typeof ScoringEngine !== "undefined",
    engine: typeof GameEngineAPI !== "undefined",
    scoreFn:
      typeof ScoringEngine !== "undefined" &&
      typeof ScoringEngine.computeScoresFromResults === "function",
  }));
  console.log("API", api);
  if (!api.scoring || !api.engine || !api.scoreFn) throw new Error("scoring/engine missing in browser");

  await shot(page, "10-home.png");

  // MVP demo page（未开局也应显示公式计分）
  await page.evaluate(() => {
    location.hash = "#/mvp";
  });
  await page.waitForTimeout(400);
  const demoSource = await page.locator("#mvp-source").innerText();
  const demoTotal = await page.locator("#mvp-total").innerText();
  console.log("MVP_DEMO", demoSource, demoTotal);
  if (!/DEMO|LIVE|PRESET/i.test(demoSource)) throw new Error("mvp source badge missing");
  if (!(Number(demoTotal) > 0)) throw new Error("demo mvp total invalid");
  await shot(page, "10-mvp-demo.png");

  // 全流程
  await page.evaluate(() => {
    location.hash = "#/room";
  });
  await page.waitForTimeout(300);
  await page.click("#btn-run-round");
  await waitMainReady(page);
  let count = await page.locator(".chat__speaker").count();
  console.log("R1_COUNT", count);

  await page.click("#btn-run-round");
  await waitMainReady(page);
  count = await page.locator(".chat__speaker").count();
  console.log("R2_COUNT", count);

  await page.click("#btn-run-round");
  await waitMainReady(page);
  count = await page.locator(".chat__speaker").count();
  console.log("R3_COUNT", count);
  const chatR3 = await page.locator("#chat-body").innerText();
  if (!/EV-11|台球室/.test(chatR3)) throw new Error("late evidence not discussed in room");
  if (/花园除草|SEC-CLAUDE|备用钥匙被借出，签名/.test(chatR3)) {
    throw new Error("secret leaked into room chat");
  }
  await shot(page, "10-room-r3.png");

  await page.click("#btn-run-round");
  await waitMainReady(page);
  count = await page.locator(".chat__speaker").count();
  console.log("FINAL_COUNT", count);

  await page.click("#btn-run-round");
  await page.waitForTimeout(800);
  const accCount = await page.locator(".accusation-card").count();
  const correct = await page.locator(".accusation-card.correct").count();
  console.log("ACCUSATIONS", accCount, "CORRECT", correct);
  if (accCount !== 4) throw new Error("accusation cards != 4");
  if (correct < 3) throw new Error("correct accusations < 3");
  await shot(page, "10-accusations.png");

  // 揭示
  await page.click("#btn-show-reveal");
  await page.waitForTimeout(400);
  const killer = await page.locator("#reveal-killer-name").innerText();
  console.log("KILLER", killer);
  if (!killer.includes("顾承嗣")) throw new Error("reveal killer wrong");
  await shot(page, "10-reveal.png");

  // MVP — 本局 live 计分
  await page.evaluate(() => {
    location.hash = "#/mvp";
  });
  await page.waitForTimeout(500);
  const liveSource = await page.locator("#mvp-source").innerText();
  const liveName = await page.locator("#mvp-name").innerText();
  const liveTotal = await page.locator("#mvp-total").innerText();
  console.log("MVP_LIVE", liveSource, liveName, liveTotal);
  if (!/LIVE/i.test(liveSource)) throw new Error("expected LIVE scoring after playthrough, got " + liveSource);
  if (!(Number(liveTotal) > 0)) throw new Error("live mvp total invalid");
  const rows = await page.locator("#score-table tbody tr").count();
  if (rows !== 4) throw new Error("score table rows " + rows);
  await shot(page, "10-mvp-live.png");

  // 移动端
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    location.hash = "#/";
  });
  await page.waitForTimeout(300);
  await shot(page, "10-mobile-home.png");
  await page.evaluate(() => {
    location.hash = "#/mvp";
  });
  await page.waitForTimeout(300);
  await shot(page, "10-mobile-mvp.png");

  if (errors.length) {
    console.log("JS ERRORS:\n" + errors.join("\n"));
    process.exit(2);
  }
  console.log("PHASE10_E2E_OK");
  await browser.close();
})().catch(async (e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
