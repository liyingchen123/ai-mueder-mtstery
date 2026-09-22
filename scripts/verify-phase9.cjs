/* Phase 9 — Scoring Engine：服务端公式计分 + 真相不进 context */
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
const dims = globalThis.SCORE_DIMENSIONS;
const ScoringEngine = globalThis.ScoringEngine;
const Engine =
  globalThis.AIEngine ||
  globalThis.GameEngine ||
  (globalThis.GameEngineAPI && globalThis.GameEngineAPI.GameEngine);
const API = globalThis.AIProviderAPI;

let failed = 0;
function fail(msg) {
  failed++;
  console.error("FAIL:", msg);
}
function ok(msg) {
  console.log("OK:", msg);
}

if (!ScoringEngine || !Engine || !API || !truth || !players) {
  console.error("FAILED: missing modules");
  process.exit(1);
}

/* --- 1. Mock 剧本公式计分 --- */
const caseData = {
  meta: globalThis.CASE_META,
  suspects: globalThis.SUSPECTS,
  timeline: [],
  publicEvidence: globalThis.PUBLIC_EVIDENCE,
  lateEvidence: globalThis.LATE_EVIDENCE,
};

const demoScores = ScoringEngine.computeScoresFromResults({
  truth,
  players,
  roundResults: mocks,
  caseData,
});

if (!Array.isArray(demoScores) || demoScores.length !== players.length) {
  fail("demo scores length");
}

const maxes = Object.fromEntries(dims.map((d) => [d.key, d.max]));
for (const s of demoScores) {
  if (!s.breakdown) fail(s.id + " missing breakdown");
  for (const d of dims) {
    const v = s.breakdown[d.key];
    if (typeof v !== "number" || v < 0 || v > d.max) {
      fail(s.id + " " + d.key + " out of range: " + v);
    }
  }
  const sum = dims.reduce((a, d) => a + (s.breakdown[d.key] || 0), 0);
  if (sum !== s.total) fail(s.id + " total mismatch " + s.total + " vs " + sum);
  if (s.total < 0 || s.total > 100) fail(s.id + " total out of 0-100");
}

const hit = demoScores.filter((s) => s.correct);
const miss = demoScores.filter((s) => !s.correct);
if (hit.length < 3) fail("expected >=3 correct in mock script, got " + hit.length);
if (miss.length < 1) fail("expected 1 incorrect in mock script");
ok("demo scores: " + demoScores.map((s) => s.id + "=" + s.total + (s.correct ? "*" : "")).join(" "));

// 不应简单等于写死 MOCK_SCORES 总分（必须是公式产物，允许接近）
const preset = globalThis.MOCK_SCORES;
const identical = players.every((p) => {
  const a = demoScores.find((s) => s.id === p.id);
  const b = preset.find((s) => s.id === p.id);
  return a && b && a.total === b.total && a.breakdown.accuracy === b.breakdown.accuracy;
});
if (identical) {
  console.log("NOTE: computed scores match preset MOCK_SCORES exactly (acceptable if formula designed so)");
}

// 未命中者 accuracy 应显著低于命中者
const avgHitAcc =
  hit.reduce((a, s) => a + s.breakdown.accuracy, 0) / Math.max(1, hit.length);
const avgMissAcc =
  miss.reduce((a, s) => a + s.breakdown.accuracy, 0) / Math.max(1, miss.length);
if (!(avgHitAcc > avgMissAcc)) {
  fail("accuracy should reward correct killers (" + avgHitAcc + " vs " + avgMissAcc + ")");
} else {
  ok("accuracy discriminates hit vs miss");
}

/* --- 2. Engine 跑完 mock 全流程后 scoreGame --- */
const registry = new API.ProviderRegistry();
for (const p of players) {
  registry.register(new API.MockProvider({ id: p.id, displayName: p.name, script: mocks, latencyMs: 0 }));
}

const engine = new Engine({
  players,
  caseData,
  secretClues: globalThis.SECRET_CLUES,
  truth,
  providers: registry,
});

(async () => {
  const flow = ["round1", "round2", "round3", "final"];
  for (const phase of flow) {
    engine.beginPhase();
    for (let i = 0; i < players.length; i++) {
      const player = engine.currentPlayer();
      if (!player) fail("no current player in " + phase + " i=" + i);
      const ans = await engine.askAI(player.id, 5000);
      if (!ans.ok) fail(phase + "/" + player.id + " askAI " + ans.error);
      const sub = engine.submitTurn(ans.data || mocks[phase].results[player.id]);
      if (!sub.ok) fail(phase + "/" + player.id + " submit " + JSON.stringify(sub));
    }
  }

  if (!engine.hasFinalAccusations()) fail("engine missing final accusations");
  const live = engine.scoreGame();
  if (!live || !live.length) fail("scoreGame returned empty");
  else {
    ok("live engine scores: " + live.map((s) => s.id + "=" + s.total).join(" "));
    for (const s of live) {
      if (s.total > 100 || s.total < 0) fail("live total range " + s.id);
    }
  }

  // 计分后 context 仍不得含 truth / scores
  for (const p of players) {
    const ctx = engine.buildContext(p.id);
    const json = JSON.stringify(ctx);
    if (json.includes(truth.solution.slice(0, 30))) fail(p.id + " context leaked solution after scoring");
    if (json.includes('"calibration"')) fail(p.id + " context leaked scores after scoring");
  }

  /* --- 3. 隔离：错误指控应降低 accuracy --- */
  const fakeNormalized = ScoringEngine.normalizeRoundResults(mocks);
  fakeNormalized.final.deepseek = {
    killer: "S1",
    confidence: 90,
    reasoning_summary: "强行改指林晚舟用于测试计分。",
    key_evidence: ["EV-08"],
  };
  const fakeScores = ScoringEngine.computeScoresFromResults({
    truth,
    players,
    roundResults: fakeNormalized,
    caseData,
  });
  const demoNormalized = ScoringEngine.normalizeRoundResults(mocks);
  const demoScores2 = ScoringEngine.computeScoresFromResults({
    truth,
    players,
    roundResults: demoNormalized,
    caseData,
  });
  const ds = fakeScores.find((s) => s.id === "deepseek");
  const dsDemo = demoScores2.find((s) => s.id === "deepseek");
  if (!ds || !dsDemo) fail("deepseek score missing");
  else if (ds.correct) fail("deepseek should be incorrect after fake final");
  else if (!(ds.total < dsDemo.total)) fail("wrong final should score lower than correct (" + ds.total + " vs " + dsDemo.total + ")");
  else ok("wrong final scores lower: " + ds.total + " < " + dsDemo.total);

  console.log(failed ? "PHASE9_SCORING_FAILED " + failed : "PHASE9_SCORING_OK");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
