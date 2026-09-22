/* Phase 3 验证 — AIProvider 抽象 + Engine askAI 全流程 */
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = "http://127.0.0.1:8747/index.html";
const OUT = path.join(__dirname, "output", "playwright");

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("SHOT", name);
}

async function waitChatCount(page, n) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".chat__speaker").length >= count,
    n,
    { timeout: 60000 }
  );
  await page.waitForFunction(
    () => {
      const b = document.querySelector("#btn-run-round");
      return b && !b.disabled;
    },
    { timeout: 30000 }
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

  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "networkidle" });

  // Provider API surface
  const api = await page.evaluate(() => {
    const A = window.AIProviderAPI;
    if (!A) return { has: false };
    const reg = A.createDefaultRegistry(
      (typeof MOCK_ROUNDS !== "undefined" ? MOCK_ROUNDS : null),
      typeof AI_PLAYERS !== "undefined" ? AI_PLAYERS : []
    );
    return {
      has: true,
      list: reg.list(),
      hasCall: typeof A.callProvider === "function",
      hasMock: typeof A.MockProvider === "function",
      hasBase: typeof A.AIProvider === "function",
    };
  });
  console.log("PROVIDER_API:", JSON.stringify(api));
  if (!api.has || !api.hasCall || !api.hasMock) throw new Error("AIProviderAPI incomplete");
  if (!api.list || api.list.length !== 4) throw new Error("registry should have 4");
  // engine must be constructible only with providers
  const engineCheck = await page.evaluate(() => {
    try {
      // @ts-ignore
      new GameEngineAPI.GameEngine({
        caseData: {},
        players: [],
        secretClues: {},
        truth: {},
        providers: null,
      });
      return { throws: false };
    } catch (e) {
      return { throws: true, msg: String(e.message) };
    }
  });
  console.log("ENGINE_REQUIRES_PROVIDERS:", engineCheck);
  if (!engineCheck.throws) throw new Error("Engine should require providers");

  // Full playthrough via askAI path
  await page.evaluate(() => {
    location.hash = "#/room";
  });
  await page.waitForTimeout(300);

  await page.click("#btn-run-round");
  await waitChatCount(page, 4);
  let speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  const expected = ["Claude", "Grok", "DeepSeek", "Gemini"];
  console.log("R1:", speakers.join(" → "));
  if (speakers.join(",") !== expected.join(",")) throw new Error("order");

  await page.click("#btn-run-round");
  await waitChatCount(page, 8);
  await page.click("#btn-run-round");
  await waitChatCount(page, 12);
  const chatText = await page.locator("#chat-body").innerText();
  if (!chatText.includes("EV-11")) throw new Error("late evidence msg");
  if (/SEC-CLAUDE|花园除草|云端草稿/.test(chatText)) throw new Error("secret leak");

  await page.click("#btn-run-round");
  await waitChatCount(page, 16);
  await shot(page, "03-provider-room-full.png");

  // no mockResults field on engine — askAI only
  const noMock = await page.evaluate(() => {
    // re-init access via UI path is enough; check no fetchMock
    return typeof GameEngineAPI.GameEngine.prototype.fetchMockForCurrentTurn === "undefined";
  });
  console.log("NO_FETCH_MOCK:", noMock);
  if (!noMock) throw new Error("fetchMock should be removed");

  await page.click("#btn-run-round");
  await page.waitForTimeout(500);
  const correct = await page.locator(".accusation-card.correct").count();
  if (correct !== 3) throw new Error("correct=" + correct);
  await shot(page, "04-provider-accusations.png");

  if (errors.length) {
    console.log("JS ERRORS:\n" + errors.join("\n"));
    process.exit(2);
  }
  console.log("ALL_CHECKS_PASSED");
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
