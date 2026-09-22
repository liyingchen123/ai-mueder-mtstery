/* Phase 4 — DeepSeek 接入验证（无 Key 回退 + 代理契约 + 全流程） */
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
    { timeout: 90000 }
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

  // --- API contract (no browser) ---
  const health = await fetch("http://127.0.0.1:8747/api/health").then((r) =>
    r.json()
  );
  console.log("HEALTH:", health);
  if (!health.ok) throw new Error("health failed");

  const proxyRes = await fetch("http://127.0.0.1:8747/api/deepseek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  const proxyBody = await proxyRes.json().catch(() => ({}));
  console.log("PROXY:", proxyRes.status, proxyBody);
  if (health.deepseek === "no_key") {
    if (proxyRes.status !== 503 || proxyBody.error?.code !== "no_key") {
      throw new Error("expected no_key 503");
    }
  }

  const envRes = await fetch("http://127.0.0.1:8747/.env");
  if (envRes.ok) throw new Error(".env must not be served");
  console.log("ENV_STATUS:", envRes.status);

  // --- Browser ---
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
    // 无 Key 时 /api/deepseek 503 属预期（已回退 Mock）
    if (/503/.test(t)) return;
    errors.push("console: " + t);
  });

  await page.goto(BASE + "?t=" + Date.now(), { waitUntil: "networkidle" });

  const regInfo = await page.evaluate(() => {
    const list = AIProviderAPI
      ? null
      : null;
    const hasDS = typeof AIProviderAPI.DeepSeekProvider === "function";
    // registry built in app — check prototype
    return {
      hasDeepSeekProvider: hasDS,
      hasCreate: typeof AIProviderAPI.createDefaultRegistry === "function",
    };
  });
  console.log("REG:", regInfo);
  if (!regInfo.hasDeepSeekProvider) throw new Error("DeepSeekProvider missing");

  // DeepSeek should be live-mode registered (mode set after first speak)
  await page.evaluate(() => {
    location.hash = "#/room";
  });
  await page.waitForTimeout(300);

  await page.click("#btn-run-round");
  // Round1: Claude/Grok/Gemini mock fast; DeepSeek may take longer (proxy fail + fallback)
  await waitChatCount(page, 4);
  let speakers = await page.$$eval(".chat__speaker", (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log("R1 order:", speakers.join(" → "));
  if (speakers.join(",") !== "Claude,Grok,DeepSeek,Gemini") {
    // expected exact
  }
  if (
    speakers[0] !== "Claude" ||
    speakers[1] !== "Grok" ||
    speakers[2] !== "DeepSeek" ||
    speakers[3] !== "Gemini"
  ) {
    throw new Error("order " + speakers.join(","));
  }

  const chat1 = await page.locator("#chat-body").innerText();
  // fallback notice expected when no key
  if (health.deepseek === "no_key") {
    if (!/DeepSeek 已回退 Mock|回退 Mock/.test(chat1)) {
      // may still be live if something else - soft check via status
      console.log("WARN: fallback system message not found yet");
    } else {
      console.log("FALLBACK_NOTICE_OK");
    }
  }

  // status mode for deepseek
  const modes = await page.$$eval(".status-card__turn", (els) =>
    els.map((e) => ({
      t: e.textContent.trim(),
      m: e.getAttribute("data-mode"),
    }))
  );
  console.log("MODES:", JSON.stringify(modes));
  const ds = modes[2];
  if (health.deepseek === "no_key" && ds.m !== "mock") {
    // DeepSeek should be mock after speaking
    throw new Error("DeepSeek mode expected mock, got " + ds.m);
  }

  await shot(page, "04-deepseek-round1.png");

  // full game
  await page.click("#btn-run-round");
  await waitChatCount(page, 8);
  await page.click("#btn-run-round");
  await waitChatCount(page, 12);
  await page.click("#btn-run-round");
  await waitChatCount(page, 16);
  await shot(page, "04-deepseek-full.png");

  await page.click("#btn-run-round");
  await page.waitForTimeout(500);
  const correct = await page.locator(".accusation-card.correct").count();
  console.log("CORRECT:", correct);
  if (correct < 3) throw new Error("accusations broken");

  // no secrets in chat
  const fullChat = await page.locator("#chat-body").innerText();
  if (/SEC-CLAUDE|DEEPSEEK_API_KEY=sk/.test(fullChat)) {
    throw new Error("secret/key leak in chat");
  }

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
