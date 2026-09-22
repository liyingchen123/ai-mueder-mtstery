/* Phase 1 临时验证脚本 — 检查各页面渲染与核心流程 */
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = "http://127.0.0.1:8747/index.html";
const OUT = path.join(__dirname, "output", "playwright");

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("SHOT", name);
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    channel: "msedge",
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
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  // 1. Home
  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "networkidle" });
  const title = await page.title();
  const hero = await page.locator(".hero__title").innerText();
  console.log("TITLE:", title);
  console.log("HERO:", hero.replace(/\n/g, " "));
  if (!/AI MURDER/i.test(hero)) throw new Error("Hero title missing");
  await shot(page, "01-home.png");

  // 2. Case intro
  await page.click("#btn-start-case");
  await page.waitForTimeout(400);
  const caseTitle = await page.locator("#case-title").innerText();
  const suspects = await page.locator(".suspect-card").count();
  const evidence = await page.locator("#evidence-grid .evidence-card").count();
  console.log("CASE:", caseTitle, "suspects=", suspects, "evidence=", evidence);
  if (suspects < 4 || evidence < 8) throw new Error("Case data incomplete");
  // public evidence must NOT show LATE badge; public timeline must not leak secrets
  const lateBadges = await page.locator("#evidence-grid .tag--key:has-text('LATE')").count();
  const publicTimeline = await page.locator("#case-timeline").innerText();
  console.log("PUBLIC_LATE_BADGES:", lateBadges);
  if (lateBadges !== 0) throw new Error("Public evidence wrongly marked LATE");
  if (/秘密线索|备用钥匙被借出|云端草稿/.test(publicTimeline)) {
    throw new Error("Public timeline leaks secret clues");
  }
  await shot(page, "02-case.png");

  // 3. Room + run all rounds
  await page.click("#btn-enter-room");
  await page.waitForTimeout(300);
  const panels = await page.locator(".ai-panel").count();
  console.log("PANELS:", panels);
  if (panels !== 4) throw new Error("Expected 4 AI panels");

  // Run rounds 1-4 (button advances; after step4 goes to accusations)
  for (let i = 0; i < 3; i++) {
    await page.click("#btn-run-round");
    // wait until not disabled (running finished) or step label changes
    await page.waitForFunction(
      () => {
        const b = document.querySelector("#btn-run-round");
        return b && !b.disabled;
      },
      { timeout: 30000 }
    );
    const step = await page.locator("#round-step").innerText();
    console.log("AFTER RUN step=", step);
    await page.waitForTimeout(200);
  }
  // fourth click: submit final → step 4
  const label4 = await page.locator("#btn-run-round").innerText();
  console.log("BTN before final:", label4);
  await page.click("#btn-run-round");
  await page.waitForFunction(
    () => {
      const b = document.querySelector("#btn-run-round");
      return b && !b.disabled && /View Accusations/i.test(b.textContent || "");
    },
    { timeout: 30000 }
  );
  const feedCount = await page.locator(".feed-item").count();
  console.log("FEED items:", feedCount);
  if (feedCount < 8) throw new Error("Feed too short: " + feedCount);
  await shot(page, "03-room.png");

  // 4. Accusations
  await page.click("#btn-run-round"); // navigates to accusations
  await page.waitForTimeout(500);
  const accCards = await page.locator(".accusation-card").count();
  const correct = await page.locator(".accusation-card.correct").count();
  console.log("ACCUSATIONS:", accCards, "correct=", correct);
  if (accCards !== 4 || correct !== 3) throw new Error("Accusation mismatch");
  await shot(page, "04-accusations.png");

  // 5. Reveal
  await page.click("#btn-show-reveal");
  await page.waitForTimeout(400);
  const killer = await page.locator("#reveal-killer-name").innerText();
  console.log("KILLER:", killer);
  if (killer !== "顾承嗣") throw new Error("Wrong killer reveal");
  await shot(page, "05-reveal.png");

  // 6. MVP
  await page.click('a[href="#/mvp"]');
  await page.waitForTimeout(400);
  const mvp = await page.locator("#mvp-name").innerText();
  const total = await page.locator("#mvp-total").innerText();
  const rows = await page.locator("#score-table tbody tr").count();
  console.log("MVP:", mvp, total, "rows=", rows);
  if (mvp !== "Claude" || rows !== 4) throw new Error("MVP page wrong");
  await shot(page, "06-mvp.png");

  // mobile responsive smoke
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "#/case", { waitUntil: "networkidle" });
  await shot(page, "07-mobile-case.png");

  await browser.close();

  if (errors.length) {
    console.log("JS ERRORS:\n" + errors.join("\n"));
    process.exit(2);
  }
  console.log("ALL_CHECKS_PASSED");
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
