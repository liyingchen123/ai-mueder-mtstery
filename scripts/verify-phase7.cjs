/**
 * Phase 7+8 — 三轮讨论 + Final Accusation + 信息隔离贯穿
 * 纯 Node，不依赖浏览器。Mock Provider 走完整引擎状态机。
 */
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
global.window = globalThis;

for (const f of [
  "js/data.js",
  "js/provider.js",
  "js/scoring.js",
  "js/engine.js",
  "js/ai-prompt.js",
  "js/live-providers.js",
]) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f });
}

const players = globalThis.AI_PLAYERS;
const truth = globalThis.TRUTH;
const mocks = globalThis.MOCK_ROUNDS;
const secrets = globalThis.SECRET_CLUES;
const Engine =
  globalThis.AIEngine ||
  globalThis.GameEngine ||
  (globalThis.GameEngineAPI && globalThis.GameEngineAPI.GameEngine);
const API = globalThis.AIProviderAPI;

let failed = 0;
function fail(m) {
  failed++;
  console.error("FAIL:", m);
}
function ok(m) {
  console.log("OK:", m);
}

const caseData = {
  meta: globalThis.CASE_META,
  suspects: globalThis.SUSPECTS,
  timeline: [],
  publicEvidence: globalThis.PUBLIC_EVIDENCE,
  lateEvidence: globalThis.LATE_EVIDENCE,
};

const registry = new API.ProviderRegistry();
for (const p of players) {
  registry.register(
    new API.MockProvider({ id: p.id, displayName: p.name, script: mocks, latencyMs: 0 })
  );
}

const engine = new Engine({
  players,
  caseData,
  secretClues: secrets,
  truth,
  providers: registry,
  speakingOrder: (globalThis.GameEngineAPI && globalThis.GameEngineAPI.SPEAKING_ORDER) || undefined,
});

const order = engine.order.slice();
const expectedNames = order.map((id) => (players.find((p) => p.id === id) || {}).name);
ok("speaking order: " + expectedNames.join(" → "));

(async () => {
  const phases = ["round1", "round2", "round3", "final"];
  const systemRounds = [];

  for (const phase of phases) {
    if (!engine.beginPhase()) {
      fail("beginPhase failed at " + phase + " (phase=" + engine.phase + ")");
      break;
    }
    if (engine.phase !== phase) fail("phase mismatch " + engine.phase + " != " + phase);

    // Round 3 应投放 late evidence 系统消息
    if (phase === "round3") {
      const sys = engine.publicLog.filter((m) => m.kind === "system");
      const hasLate = sys.some((m) => /EV-11|Round 3/i.test(m.round + m.text));
      if (!hasLate) fail("Round3 missing late evidence system message");
      else ok("Round3 late evidence announced");
    }

    const speakers = [];
    for (let i = 0; i < order.length; i++) {
      const cur = engine.currentPlayer();
      if (!cur) {
        fail(phase + " missing current player i=" + i);
        break;
      }
      speakers.push(cur.name);

      // 隔离：发言前 context 不含他人秘密
      const ctx = engine.buildContext(cur.id);
      const ctxJson = JSON.stringify(ctx);
      for (const [oid, sec] of Object.entries(secrets)) {
        if (oid === cur.id) continue;
        if (sec.body && ctxJson.includes(sec.body.slice(0, 40))) {
          fail(phase + "/" + cur.id + " context leaked " + oid);
        }
      }

      // Round2 起应能看到更早公开讨论
      if (phase !== "round1" && (!ctx.publicDiscussion || ctx.publicDiscussion.length < 4)) {
        fail(phase + "/" + cur.id + " publicDiscussion too small");
      }

      // Round3 起公共证据应含 late
      if (phase === "round3" || phase === "final") {
        const evIds = (ctx.publicCase.evidence || []).map((e) => e.id);
        if (!evIds.includes("EV-11")) fail(phase + "/" + cur.id + " missing EV-11 in public case");
      }

      const ans = await engine.askAI(cur.id, 5000);
      if (!ans.ok) {
        fail(phase + "/" + cur.id + " askAI: " + ans.error);
        continue;
      }
      const sub = engine.submitTurn(ans.data);
      if (!sub.ok) {
        fail(phase + "/" + cur.id + " submit: " + sub.error + " " + JSON.stringify(sub.details));
        continue;
      }

      // Round2 必须有 challenge 且不指向自己
      if (phase === "round2") {
        const ch = ans.data.challenge;
        if (!ch || !ch.target_ai) fail("round2 " + cur.id + " missing challenge");
        else if (ch.target_ai === cur.id) fail("round2 " + cur.id + " challenged self");
      }
    }

    const expectedSpeakers = expectedNames.join("|");
    if (speakers.join("|") !== expectedSpeakers) {
      fail(phase + " speaker order " + speakers.join(",") + " expected " + expectedSpeakers);
    } else {
      ok(phase + " speakers " + speakers.join(" → "));
    }
  }

  if (engine.phase !== "accusations") fail("final phase not accusations, got " + engine.phase);
  else ok("phase → accusations");

  if (!engine.hasFinalAccusations()) fail("missing final accusations");
  else ok("final accusations locked");

  const finals = engine.finalAccusations();
  const correct = finals.filter((f) => f.correct);
  if (correct.length < 3) fail("expected >=3 correct finals, got " + correct.length);
  else ok("correct finals: " + correct.length + "/4 → " + correct.map((c) => c.name).join(", "));

  // 公开聊天不得含秘密正文
  const chat = engine.publicLog.map((m) => m.text).join("\n");
  for (const [oid, sec] of Object.entries(secrets)) {
    if (sec.body && chat.includes(sec.body.slice(0, 40))) {
      fail("public chat leaked " + oid + " secret");
    }
  }
  if (truth.solution && chat.includes(truth.solution.slice(0, 30))) {
    fail("public chat leaked solution");
  }

  const scores = engine.scoreGame();
  if (!scores || scores.length !== 4) fail("scoreGame failed");
  else {
    const ranked = [...scores].sort((a, b) => b.total - a.total);
    ok("MVP " + ranked[0].name + " " + ranked[0].total);
    if (!ranked[0].correct) fail("MVP should be a correct final in mock script");
  }

  console.log(failed ? "PHASE7_FLOW_FAILED " + failed : "PHASE7_FLOW_OK");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
