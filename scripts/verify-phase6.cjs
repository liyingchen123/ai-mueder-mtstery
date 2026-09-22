/* Phase 6 — 信息隔离断言（公共嫌疑人姓名属于案卷，不视为泄密） */
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

const secrets = globalThis.SECRET_CLUES;
const truth = globalThis.TRUTH;
const players = globalThis.AI_PLAYERS;
const mocks = globalThis.MOCK_ROUNDS;
const caseData = {
  meta: globalThis.CASE_META,
  suspects: globalThis.SUSPECTS,
  timeline: [],
  publicEvidence: globalThis.PUBLIC_EVIDENCE,
  lateEvidence: globalThis.LATE_EVIDENCE,
};
const Engine =
  globalThis.AIEngine ||
  globalThis.GameEngine ||
  (globalThis.GameEngineAPI && globalThis.GameEngineAPI.GameEngine);
const PAPI = globalThis.AIProviderAPI;

if (!secrets || !truth || !Engine || !PAPI) {
  console.error("FAILED: exports missing", {
    secrets: !!secrets,
    truth: !!truth,
    Engine: !!Engine,
    AIProviderAPI: !!PAPI,
  });
  process.exit(1);
}

/** 真相叙事中不会自然出现在公共案卷/他人秘密里的片段 */
const SOLUTION_NEEDLES = [
  "投入 Oloroso 2011 酒瓶",
  "以铜线熔断发电机保险丝制造时间窗",
  "被安排好的「经手者靶子」",
  "周末前的两千万担保成为沉默的动机",
].filter((n) => truth.solution && truth.solution.includes(n));
if (!SOLUTION_NEEDLES.length) SOLUTION_NEEDLES.push("用三周前以园艺名义领取的附子提取乌头碱");

function hasSolutionLeak(text) {
  return SOLUTION_NEEDLES.some((n) => text.includes(n));
}

const registry = new PAPI.ProviderRegistry();
for (const p of players) {
  registry.register(new PAPI.MockProvider({ id: p.id, displayName: p.name, script: mocks }));
}

const engine = new Engine({
  players,
  caseData,
  secretClues: secrets,
  truth,
  providers: registry,
});

let failed = 0;
function fail(msg) {
  failed++;
  console.error("FAIL:", msg);
}

for (const p of players) {
  const ctx = engine.buildContext(p.id);
  const ctxJson = JSON.stringify(ctx);

  const own = secrets[p.id];
  if (!own || !ctx.secretClue || ctx.secretClue.id !== own.id) {
    fail(p.id + " missing own secretClue");
  } else if (own.body && !ctxJson.includes(own.body.slice(0, 30))) {
    fail(p.id + " own secret body missing from context");
  }

  for (const [oid, osec] of Object.entries(secrets)) {
    if (oid === p.id) continue;
    if (osec.body && ctxJson.includes(osec.body.slice(0, 40))) {
      fail(p.id + " context contains " + oid + " secret body");
    }
  }

  if (hasSolutionLeak(ctxJson)) {
    fail(p.id + " context contains TRUTH.solution fragment");
  }
  if (ctx.scores || ctx.graders || ctx.truth || ctx.killer || ctx.killerId) {
    fail(p.id + " context has truth/scores field");
  }
  if (ctx.secretClue && own && ctx.secretClue.id !== own.id) {
    fail(p.id + " secretClue is not own: " + ctx.secretClue.id);
  }
  if (ctxJson.includes('"breakdown"') && ctxJson.includes('"calibration"')) {
    fail(p.id + " context contains scoring breakdown");
  }
  // 公共嫌疑人名单应包含真凶姓名（这是案卷，不是泄密）
  const suspectNames = (ctx.publicCase && ctx.publicCase.suspects
    ? ctx.publicCase.suspects.map((s) => s.name)
    : []
  ).join("|");
  if (truth.killerName && !suspectNames.includes(truth.killerName)) {
    fail(p.id + " public suspects missing killer name (case file broken)");
  }
}

function checkRequestPayload(label, playerId, req) {
  const dumped = JSON.stringify(req);
  for (const [oid, osec] of Object.entries(secrets)) {
    if (playerId === oid) continue;
    if (osec.body && dumped.includes(osec.body.slice(0, 40))) {
      fail(label + " request contains " + oid + " secret body");
    }
  }
  if (hasSolutionLeak(dumped)) {
    fail(label + " request contains TRUTH.solution fragment");
  }
  if (dumped.includes('"solution"') && truth.solution && dumped.includes(truth.solution.slice(0, 20))) {
    fail(label + " request contains truth.solution field");
  }
}

const liveRegistry = new PAPI.ProviderRegistry();
for (const p of players) {
  const live = PAPI.createLiveProviderFor
    ? PAPI.createLiveProviderFor(p, mocks)
    : null;
  liveRegistry.register(
    live || new PAPI.MockProvider({ id: p.id, displayName: p.name, script: mocks })
  );
}

const engine2 = new Engine({
  players,
  caseData,
  secretClues: secrets,
  truth,
  providers: liveRegistry,
});

for (const p of players) {
  const req = {
    playerId: p.id,
    playerName: p.name,
    round: "round1",
    context: engine2.buildContext(p.id),
    timeoutMs: 1000,
  };
  checkRequestPayload("live/" + p.id, p.id, req);
}

console.log(failed ? "PHASE6_ISOLATION_FAILED " + failed : "PHASE6_ISOLATION_OK");
process.exit(failed ? 1 : 0);
