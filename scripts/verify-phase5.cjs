/* Phase 5 — 四 Provider 代理健康检查 + 全流程（有 Key 则 LIVE，无则 MOCK 回退） */
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
    { timeout: 120000 }
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

  const health = await fetch("http://127.0.0.1:8747/api/health").then((r) =>
    r.json()
  );
  console.log("HEALTH:", JSON.stringify(health));
  if (!health.ok) throw new Error("health failed");
  for (const id of ["deepseek", "openai", "doubao", "anthropic"]) {
    if (!(id in health)) throw new Error("health missing " + id);
  }

  // each proxy should answer (200 live or 503 no_key)
  for (const id of ["deepseek", "openai", "doubao", "anthropic"]) {
    const r = await fetch("http://127.0.0.1:8747/api/" + id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Return json: {\"ok\":true}" }],
        timeoutMs: 15000,
        max_tokens: 32,
        temperature: 0,
      }),
    });
    const body = await r.json().catch(() => ({}));
    console.log("PROXY", id, r.status, body.error ? body.error.code : "ok");
    if (r.status !== 200 && r.status !== 503 && r.status !== 502 && r.status !== 401) {
      throw new Error("unexpected status for " + id + ": " + r.status);
    }
    if (r.status === 200 && typeof body.content !== "string") {
      throw new Error(id + " missing content");
    }
  }

  const envRes = await fetch("http://127.0.0.1:8747/.env");
  if (envRes.ok) throw new Error(".env must not be served");
  console.log("ENV_BLOCKED", envRes.status);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
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
    if (/503|502|Failed to load resource/.test(t)) return;
    errors.push("console: " + t);
  });

  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "networkidle" });

  const liveApi = await page.evaluate(() => ({
    hasLive: typeof AIProviderAPI.createLiveRegistry === "function",
    hasOpenAI: typeof AIProviderAPI.OpenAICompatProvider === "function",
    hasAnthropic: typeof AIProviderAPI.AnthropicCompatProvider === "function",
    hasPrompt: typeof AIPrompt !== "undefined",
  }));
  console.log("LIVE_API", liveApi);
  if (!liveApi.hasLive || !liveApi.hasOpenAI || !liveApi.hasAnthropic || !liveApi.hasPrompt) {
    throw new Error("live provider modules missing");
  }

  await page.evaluate(() => {
    location.hash = "#/room";
  });
  await page.waitForTimeout(300);

  // full playthrough — order + isolation
  await page.click("#btn-run-round");
  await waitChatCount(page, 4);
  let speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  const expected = ["Claude", "Grok", "DeepSeek", "Gemini"];
  console.log("R1:", speakers.join(" → "));
  if (speakers.join("|") !== expected.join("|")) {
    throw new Error("order " + speakers.join(","));
  }

  const modes = await page.$$eval(".status-card__turn", (els) =>
    els.map((e) => ({ m: e.getAttribute("data-mode"), t: e.textContent.trim() }))
  );
  console.log("MODES_R1:", JSON.stringify(modes));

  await shot(page, "05-round1.png");

  await page.click("#btn-run-round");
  await waitChatCount(page, 8);
  await page.click("#btn-run-round");
  await waitChatCount(page, 12);
  await page.click("#btn-run-round");
  await waitChatCount(page, 16);
  await shot(page, "05-full.png");

  const chatText = await page.locator("#chat-body").innerText();
  if (/SEC-CLAUDE|花园除草|DEEPSEEK_API_KEY=sk-|OPENAI_API_KEY=sk-/.test(chatText)) {
    throw new Error("secret/key leak in chat");
  }

  await page.click("#btn-run-round");
  await page.waitForTimeout(500);
  const correct = await page.locator(".accusation-card.correct").count();
  console.log("CORRECT", correct);
  if (correct < 3) throw new Error("accusations broken");

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
