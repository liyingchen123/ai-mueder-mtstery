/* Phase 2 验证 — Game Engine 顺序发言 + 单聊天框 */
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = "http://127.0.0.1:8747/index.html";
const OUT = path.join(__dirname, "output", "playwright");

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("SHOT", name);
}

async function waitMainReady(page) {
  await page.waitForFunction(
    () => {
      const b = document.querySelector("#btn-run-round");
      return b && !b.disabled;
    },
    { timeout: 60000 }
  );
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "msedge", headless: true });
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
  const hero = await page.locator(".hero__title").innerText();
  console.log("HERO:", hero.replace(/\n/g, " "));
  if (!/AI MURDER/i.test(hero)) throw new Error("Hero title missing");
  await shot(page, "01-home.png");

  // 2. Case
  await page.click("#btn-start-case");
  await page.waitForTimeout(400);
  const suspects = await page.locator(".suspect-card").count();
  const lateBadges = await page
    .locator("#evidence-grid .tag--key:has-text('LATE')")
    .count();
  if (suspects < 4) throw new Error("suspects");
  if (lateBadges !== 0) throw new Error("LATE badge leak");
  const publicTimeline = await page.locator("#case-timeline").innerText();
  if (/秘密线索|备用钥匙被借出/.test(publicTimeline))
    throw new Error("public timeline secret leak");
  console.log("CASE_OK suspects=", suspects);
  await shot(page, "02-case.png");

  // 3. Room structure
  await page.click("#btn-enter-room");
  await page.waitForTimeout(400);
  const statusCards = await page.locator(".status-card").count();
  const hasChat = await page.locator("#chat-body").count();
  const hasAvatars = await page.locator(".ai-avatar").count();
  console.log("STATUS_CARDS=", statusCards, "CHAT=", hasChat, "AVATARS=", hasAvatars);
  if (statusCards !== 4) throw new Error("Expected 4 status cards");
  if (hasChat !== 1) throw new Error("Expected single chat");
  if (hasAvatars !== 0) throw new Error("Avatars should be removed (no virtual personas)");

  // names only on strip
  const stripText = await page.locator("#status-strip").innerText();
  for (const n of ["Claude", "Grok", "DeepSeek", "Gemini"]) {
    if (!stripText.includes(n)) throw new Error("Missing name " + n);
  }

  // 4. Round 1 — sequential order Claude→Grok→DeepSeek→Gemini
  await page.click("#btn-run-round");
  await waitMainReady(page);
  let speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("AFTER_R1 speakers:", speakers.join(" → "));
  const expected = ["Claude", "Grok", "DeepSeek", "Gemini"];
  if (speakers.length !== 4) throw new Error("R1 should have 4 messages, got " + speakers.length);
  if (speakers.join(",") !== expected.join(","))
    throw new Error("R1 order wrong: " + speakers.join(","));
  await shot(page, "03-room-round1.png");

  // 5. Step-by-step: one more turn in Round 2
  await page.click("#btn-run-round"); // begin round2 + full play
  await waitMainReady(page);
  speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("AFTER_R2 count:", speakers.length);
  if (speakers.length !== 8) throw new Error("R2 should add 4 msgs");

  await page.click("#btn-run-round"); // round3
  await waitMainReady(page);
  speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("AFTER_R3 count:", speakers.length);
  if (speakers.length !== 12) throw new Error("R3 should add 4 msgs");

  // late evidence system message should exist
  const chatText = await page.locator("#chat-body").innerText();
  if (!chatText.includes("EV-11")) throw new Error("Late evidence system msg missing");

  await page.click("#btn-run-round"); // final accusations
  await waitMainReady(page);
  const btnLabel = await page.locator("#btn-run-round").innerText();
  console.log("BTN after final:", btnLabel);
  if (!/View Accusations/i.test(btnLabel)) throw new Error("Should show View Accusations");
  speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("AFTER_FINAL count:", speakers.length);
  if (speakers.length !== 16) throw new Error("Final should add 4 msgs, got " + speakers.length);
  await shot(page, "03-room-full.png");

  // isolation: secrets must not appear in public chat
  if (/SEC-CLAUDE|SEC-GPT|SEC-DEEPSEEK|SEC-DOUBAO|花园除草|云端草稿/.test(chatText))
    throw new Error("Secret clue leaked into public chat");
  console.log("ISOLATION_OK");

  // 6. Accusations
  await page.click("#btn-run-round");
  await page.waitForTimeout(500);
  const accCards = await page.locator(".accusation-card").count();
  const correct = await page.locator(".accusation-card.correct").count();
  console.log("ACCUSATIONS:", accCards, "correct=", correct);
  if (accCards !== 4 || correct !== 3) throw new Error("Accusation mismatch");
  await shot(page, "04-accusations.png");

  // 7. Reveal + MVP
  await page.click("#btn-show-reveal");
  await page.waitForTimeout(400);
  const killer = await page.locator("#reveal-killer-name").innerText();
  if (killer !== "顾承嗣") throw new Error("Wrong killer");
  console.log("KILLER:", killer);
  await shot(page, "05-reveal.png");

  await page.click('a[href="#/mvp"]');
  await page.waitForTimeout(400);
  const mvp = await page.locator("#mvp-name").innerText();
  const rows = await page.locator("#score-table tbody tr").count();
  console.log("MVP:", mvp, "rows=", rows);
  if (mvp !== "Claude" || rows !== 4) throw new Error("MVP wrong");
  await shot(page, "06-mvp.png");

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "#/room", { waitUntil: "networkidle" });
  await shot(page, "07-mobile-room.png");

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
