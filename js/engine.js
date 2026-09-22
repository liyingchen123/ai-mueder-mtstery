/**
 * Phase 2–3 — Game Engine
 * 服务端权威状态机：轮次流转、顺序发言、按玩家组装隔离 context、结构化输出校验。
 * 当前以浏览器内模块运行，设计目标是原样迁到 Next.js Route Handler。
 * 引擎不感知具体 AI 厂商：只通过 deps.providers（ProviderRegistry）调用 AIProvider。
 */

(function (global) {
  "use strict";

  /** 固定发言顺序（每轮相同，便于观众跟踪） */
  const SPEAKING_ORDER = ["claude", "gpt", "deepseek", "doubao"]; // 内部 id，界面显示名见 AI_PLAYERS

  const PHASES = {
    IDLE: "idle",
    ROUND1: "round1",
    ROUND2: "round2",
    ROUND3: "round3",
    FINAL: "final",
    ACCUSED: "accusations",
    REVEAL: "reveal",
    SCORED: "scored",
  };

  const PHASE_FLOW = [
    PHASES.IDLE,
    PHASES.ROUND1,
    PHASES.ROUND2,
    PHASES.ROUND3,
    PHASES.FINAL,
    PHASES.ACCUSED,
  ];

  const PHASE_META = {
    [PHASES.IDLE]: {
      label: "待开始",
      short: "Idle",
      btn: "Begin Round 1",
      progress: 0,
      step: 0,
    },
    [PHASES.ROUND1]: {
      label: "Round 1 · Initial Investigation",
      short: "Round 1",
      btn: "Continue to Round 2",
      progress: 25,
      step: 1,
    },
    [PHASES.ROUND2]: {
      label: "Round 2 · Cross Examination",
      short: "Round 2",
      btn: "Continue to Round 3",
      progress: 50,
      step: 2,
    },
    [PHASES.ROUND3]: {
      label: "Round 3 · Final Investigation",
      short: "Round 3",
      btn: "Submit Final Accusations",
      progress: 75,
      step: 3,
    },
    [PHASES.FINAL]: {
      label: "Final Accusation Locked",
      short: "Final",
      btn: "View Accusations",
      progress: 90,
      step: 4,
    },
    [PHASES.ACCUSED]: {
      label: "Accusations Public",
      short: "Done",
      btn: "View Accusations",
      progress: 100,
      step: 4,
    },
  };

  /* ---------- schema validators (no any / no free-text parse) ---------- */

  const SCHEMAS = {
    round1: {
      required: ["suspect", "confidence", "reasoning_summary", "evidence", "question"],
      fields: {
        suspect: (v) => typeof v === "string" && /^S[1-5]$/.test(v),
        confidence: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
        reasoning_summary: (v) => typeof v === "string" && v.trim().length > 0,
        evidence: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
        question: (v) => typeof v === "string",
      },
    },
    round2: {
      required: [
        "suspect",
        "confidence",
        "reasoning_summary",
        "challenge",
        "evidence",
      ],
      fields: {
        suspect: (v) => typeof v === "string" && /^S[1-5]$/.test(v),
        confidence: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
        reasoning_summary: (v) => typeof v === "string" && v.trim().length > 0,
        challenge: (v) =>
          v &&
          typeof v === "object" &&
          typeof v.target_ai === "string" &&
          typeof v.argument === "string" &&
          v.argument.trim().length > 0,
        evidence: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
      },
    },
    round3: {
      required: ["suspect", "confidence", "reasoning_summary", "evidence"],
      fields: {
        suspect: (v) => typeof v === "string" && /^S[1-5]$/.test(v),
        confidence: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
        reasoning_summary: (v) => typeof v === "string" && v.trim().length > 0,
        evidence: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
      },
    },
    final: {
      required: ["killer", "confidence", "reasoning_summary", "key_evidence"],
      fields: {
        killer: (v) => typeof v === "string" && /^S[1-5]$/.test(v),
        confidence: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
        reasoning_summary: (v) => typeof v === "string" && v.trim().length > 0,
        key_evidence: (v) =>
          Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string"),
      },
    },
  };

  function validateRoundOutput(roundKey, data) {
    const schema = SCHEMAS[roundKey];
    if (!schema || !data || typeof data !== "object") {
      return { ok: false, errors: ["unknown schema or non-object payload"] };
    }
    const errors = [];
    for (const key of schema.required) {
      if (!(key in data)) errors.push("missing: " + key);
    }
    for (const [key, check] of Object.entries(schema.fields)) {
      if (key in data && !check(data[key])) errors.push("invalid: " + key);
    }
    // round2: challenge 不得指向自己
    if (roundKey === "round2" && data.challenge && errors.length === 0) {
      // target validation against players done by engine
    }
    return { ok: errors.length === 0, errors };
  }

  /**
   * 修复常见模型输出问题（一次），失败则由调用方 retry。
   * Phase 2：仅做结构修复；不猜业务字段。
   */
  function repairRoundOutput(roundKey, raw) {
    let data = raw;
    if (typeof data === "string") {
      try {
        const m = data.match(/\{[\s\S]*\}/);
        if (!m) return null;
        data = JSON.parse(m[0]);
      } catch (_) {
        return null;
      }
    }
    if (!data || typeof data !== "object") return null;

    // confidence 取整并夹紧
    if ("confidence" in data) {
      const n = Math.round(Number(data.confidence));
      if (Number.isFinite(n)) {
        data.confidence = Math.max(0, Math.min(100, n));
      }
    }
    // 证据数组容错：字符串 → 单元素数组
    if (typeof data.evidence === "string") data.evidence = [data.evidence];
    if (typeof data.key_evidence === "string") data.key_evidence = [data.key_evidence];
    if (typeof data.reasoning_summary !== "string" && data.reasoning != null) {
      data.reasoning_summary = String(data.reasoning);
    }

    const check = validateRoundOutput(roundKey, data);
    return check.ok ? data : null;
  }

  /* ---------- Game Engine ---------- */

  class GameEngine {
    /**
     * @param {object} deps
     * @param {object} deps.caseData - 固定案件（真相仅引擎持有）
     * @param {Array}  deps.players  - [{id,name,provider}]
     * @param {object} deps.secretClues - { playerId: secret }
     * @param {object} deps.truth    - 服务端答案
     * @param {object} deps.providers - ProviderRegistry（Phase 3 必需）
     * @param {number} [deps.timeoutMs]
     */
    constructor(deps) {
      this.caseData = deps.caseData;
      this.players = deps.players.slice();
      this.playerById = Object.fromEntries(this.players.map((p) => [p.id, p]));
      this.secretClues = deps.secretClues;
      this.truth = deps.truth;
      this.providers = deps.providers;
      this.timeoutMs = deps.timeoutMs || 30000;
      this.order = deps.speakingOrder || SPEAKING_ORDER.slice();
      if (!this.providers || typeof this.providers.get !== "function") {
        throw new Error("GameEngine requires deps.providers (ProviderRegistry)");
      }

      this.reset();
    }

    reset() {
      /** @type {'idle'|'round1'|'round2'|'round3'|'final'|'accusations'} */
      this.phase = PHASES.IDLE;
      /** 当前轮内下一位待发言者 index；-1 表示轮次未开始/已结束 */
      this.turnIndex = -1;
      /** 是否正在处理某位 AI 的发言（含 mock 延迟由 UI 控制） */
      this.busy = false;
      /** 公开消息（所有人可见；秘密线索绝不进入此数组） */
      this.publicLog = [];
      /** 各玩家最新结构化结果 */
      this.playerState = {};
      /** 各轮已收集的结果 {round: {playerId: result}} */
      this.roundResults = { round1: {}, round2: {}, round3: {}, final: {} };
      /** Phase 9 — 服务端评分结果 */
      this.scores = null;
      /** 顺序发言序号，用于聊天排序 */
      this.seq = 0;

      this.players.forEach((p) => {
        this.playerState[p.id] = {
          suspect: null,
          confidence: null,
          statement: "",
          challenge: null,
          evidence: [],
          status: "idle",
          lastRound: null,
        };
      });
    }

    meta() {
      return PHASE_META[this.phase] || PHASE_META[PHASES.IDLE];
    }

    canBeginPhase() {
      if (this.busy) return false;
      if (this.phase === PHASES.IDLE) return true;
      if (
        this.phase === PHASES.ROUND1 ||
        this.phase === PHASES.ROUND2 ||
        this.phase === PHASES.ROUND3
      ) {
        return this.turnIndex < 0; // 本 phase 已跑完，可进入下一 phase
      }
      if (this.phase === PHASES.FINAL) return true;
      return false;
    }

    /** 进入下一 phase，重置顺序发言指针 */
    beginPhase() {
      if (!this.canBeginPhase()) return false;
      const flow = PHASE_FLOW;
      const idx = flow.indexOf(this.phase);
      if (idx < 0 || idx >= flow.length - 1) return false;

      const next = flow[idx + 1];
      this.phase = next;
      this.turnIndex = 0;

      if (next === PHASES.ROUND3) {
        this.pushSystem(
          "Round 3 — Final Investigation",
          "投放最后一批公共证据：" +
            (this.caseData.lateEvidence || [])
              .map((e) => e.id + " " + e.title)
              .join("；") +
            "。"
        );
      }
      if (next === PHASES.FINAL) {
        this.pushSystem(
          "Final Accusation",
          "四位 AI 按顺序提交最终指控 JSON，校验通过后同时公开。"
        );
      }
      if (next === PHASES.ACCUSED) {
        this.turnIndex = -1;
        this.pushSystem("Complete", "全部发言结束，终局指控已锁定。");
      }
      return true;
    }

    /** 当前轮到谁（null = 不在发言中） */
    currentPlayer() {
      if (this.turnIndex < 0 || this.turnIndex >= this.order.length) return null;
      return this.playerById[this.order[this.turnIndex]];
    }

    phaseKeyForResults() {
      // final phase 用 final 结果，否则用当前 phase 名
      return this.phase === PHASES.FINAL ? "final" : this.phase;
    }

    /**
     * 为某玩家组装隔离 context —— Phase 2 核心。
     * 绝不包含：其他 secret、truth、scores、未公开的秘密线索。
     * 此阶段的 mock 结果已在 roundResults 中于发言后公开，故进入 publicLog。
     */
    buildContext(playerId) {
      const player = this.playerById[playerId];
      if (!player) throw new Error("unknown player: " + playerId);

      const cd = this.caseData;
      return {
        playerId: player.id,
        playerName: player.name,
        phase: this.phase,
        // 公共案件
        publicCase: {
          id: cd.meta.id,
          title: cd.meta.title,
          background: cd.meta.background,
          victim: cd.meta.victim,
          suspects: cd.suspects.map((s) => ({
            id: s.id,
            name: s.name,
            role: s.role,
            // 背景/动机在正式案卷中对所有 AI 公开
            background: s.background,
            motive: s.motive,
          })),
          timeline: cd.timeline,
          evidence:
            this.phase === PHASES.ROUND3 ||
            this.phase === PHASES.FINAL ||
            this.phase === PHASES.ACCUSED
              ? cd.publicEvidence.concat(cd.lateEvidence)
              : cd.publicEvidence,
        },
        // 仅自己的秘密线索
        secretClue: this.secretClues[playerId] || null,
        // 仅已公开讨论
        publicDiscussion: this.publicLog.map((m) => ({
          seq: m.seq,
          speaker: m.speaker,
          round: m.round,
          kind: m.kind,
          text: m.text,
        })),
        // 明确禁止下发
        _forbidden: ["truth", "otherSecretClues", "scores", "graders"],
      };
    }

    /**
     * 校验并落库一轮结构化发言（数据来自 askAI / AIProvider）。
     * @returns {{ok:boolean, error?:string, result?:object}}
     */
    submitTurn(rawResult) {
      const player = this.currentPlayer();
      if (!player) return { ok: false, error: "not_your_turn" };
      // busy 仅由 UI 表示「正在思考动画」，不阻塞合法提交

      const roundKey = this.phaseKeyForResults();
      if (roundKey !== "round1" && roundKey !== "round2" && roundKey !== "round3" && roundKey !== "final") {
        return { ok: false, error: "invalid_phase" };
      }

      // schema 校验 → 失败则 repair → 再失败 retry 由 UI/provider 层处理
      let data = rawResult;
      let check = validateRoundOutput(roundKey, data);
      if (!check.ok) {
        data = repairRoundOutput(roundKey, data);
        if (!data) {
          return { ok: false, error: "schema_invalid", details: check.errors };
        }
      }

      // round2 不得挑战自己
      if (roundKey === "round2" && data.challenge) {
        if (data.challenge.target_ai === player.id) {
          return { ok: false, error: "cannot_challenge_self" };
        }
        if (!this.playerById[data.challenge.target_ai]) {
          return { ok: false, error: "unknown_challenge_target" };
        }
      }

      this.roundResults[roundKey][player.id] = data;
      this.applyToPlayerState(player.id, roundKey, data);
      this.pushPlayerMessage(player, roundKey, data);

      this.turnIndex += 1;
      if (this.turnIndex >= this.order.length) {
        // 本 phase 四人发言完毕
        if (this.phase === PHASES.FINAL) {
          this.phase = PHASES.ACCUSED;
          this.turnIndex = -1;
          // 终局指控锁定后立即服务端计分
          try {
            this.scoreGame();
          } catch (e) {
            console.error("scoreGame failed", e);
          }
        } else {
          // round1/2/3 结束，等待 UI 调 beginPhase 进入下一阶段
          this.turnIndex = -1;
        }
      }

      return { ok: true, result: data, player };
    }

    applyToPlayerState(playerId, roundKey, data) {
      const s = this.playerState[playerId];
      if (roundKey === "final") {
        s.suspect = data.killer;
        s.confidence = data.confidence;
        s.statement = data.reasoning_summary;
        s.challenge = null;
        s.evidence = data.key_evidence;
        s.status = "done";
        s.lastRound = "final";
      } else {
        s.suspect = data.suspect;
        s.confidence = data.confidence;
        s.statement = data.reasoning_summary;
        s.challenge = data.challenge || null;
        s.evidence = data.evidence;
        s.status = "done";
        s.lastRound = roundKey;
      }
    }

    pushPlayerMessage(player, roundKey, data) {
      const roundLabel =
        roundKey === "final" ? "FINAL ACCUSATION" : roundKey.toUpperCase();
      let text;
      if (roundKey === "final") {
        text = "最终指控：" + data.reasoning_summary;
      } else {
        text = data.reasoning_summary;
        if (data.challenge) {
          const t = this.playerById[data.challenge.target_ai];
          text += "\n【质疑 → " + (t ? t.name : data.challenge.target_ai) + "】" + data.challenge.argument;
        }
        if (data.question) {
          text += "\n【待查】" + data.question;
        }
      }
      this.seq += 1;
      this.publicLog.push({
        seq: this.seq,
        speaker: player.name,
        speakerId: player.id,
        round: roundLabel,
        kind: "speech",
        text,
        suspect:
          roundKey === "final"
            ? data.killer
            : data.suspect,
        confidence: data.confidence,
        evidence:
          roundKey === "final" ? data.key_evidence : data.evidence,
        challenge: data.challenge || null,
        ts: Date.now(),
      });
    }

    pushSystem(round, text) {
      this.seq += 1;
      this.publicLog.push({
        seq: this.seq,
        speaker: "SYSTEM",
        speakerId: "system",
        round: round,
        kind: "system",
        text,
        ts: Date.now(),
      });
    }

    /**
     * 唯一对 AI 的出口：组装隔离 context → 经 Registry 调 Provider。
     * 不返回 context 给 UI（防止秘密线索进前端日志）。
     * @param {string} playerId
     * @param {number} [timeoutMs]
     * @returns {Promise<{ok:boolean, data?:object, providerId?:string, error?:string, details?:string[]}>}
     */
    async askAI(playerId, timeoutMs) {
      const player = this.playerById[playerId];
      if (!player) return { ok: false, error: "unknown_player" };

      const roundKey = this.phaseKeyForResults();
      if (
        roundKey !== "round1" &&
        roundKey !== "round2" &&
        roundKey !== "round3" &&
        roundKey !== "final"
      ) {
        return { ok: false, error: "invalid_phase" };
      }

      const provider = this.providers.get(playerId);
      if (!provider) return { ok: false, error: "no_provider" };

      const context = this.buildContext(playerId);
      const request = {
        playerId: player.id,
        playerName: player.name,
        round: roundKey,
        context,
        timeoutMs: timeoutMs || this.timeoutMs,
      };

      const callProvider =
        (globalThis.AIProviderAPI && globalThis.AIProviderAPI.callProvider) ||
        null;

      try {
        const result = callProvider
          ? await callProvider(provider, request)
          : await provider.generateInvestigation(request);

        // Transport 层成功后立刻做 schema 校验（+ 一次 repair）
        let data = result.data;
        let check = validateRoundOutput(roundKey, data);
        if (!check.ok) {
          data = repairRoundOutput(roundKey, data);
          if (!data) {
            return {
              ok: false,
              error: "schema_invalid",
              details: check.errors,
            };
          }
        }

        return {
          ok: true,
          data,
          providerId: provider.id,
          latencyMs: result.latencyMs || 0,
          mode: result.mode || "live",
          fallbackReason: result.fallbackReason || null,
        };
      } catch (err) {
        return {
          ok: false,
          error: "provider_error",
          details: [String((err && err.message) || err)],
        };
      }
    }

    /** 终局指控（供 Accusations 页） */
    finalAccusations() {
      return this.players.map((p) => {
        const r = this.roundResults.final[p.id];
        return {
          id: p.id,
          name: p.name,
          killer: r ? r.killer : null,
          confidence: r ? r.confidence : null,
          reasoning_summary: r ? r.reasoning_summary : "",
          key_evidence: r ? r.key_evidence : [],
          correct: r ? r.killer === this.truth.killerId : false,
        };
      });
    }

    /** 是否已产出足够指控 */
    hasFinalAccusations() {
      return this.players.every((p) => !!this.roundResults.final[p.id]);
    }

    /** 是否已产出服务端评分 */
    hasScores() {
      return Array.isArray(this.scores) && this.scores.length > 0;
    }

    /**
     * Phase 9 — 服务端计分。只读本局 public roundResults + truth。
     * 结果保存在 this.scores，供 MVP 页渲染；绝不写回 AI context。
     */
    scoreGame() {
      const fn =
        (global.ScoringEngine && global.ScoringEngine.computeScoresFromResults) ||
        GameEngineAPI.computeScoresFromResults;
      if (typeof fn !== "function") return null;
      if (!this.hasFinalAccusations()) return this.scores || null;
      this.scores = fn({
        truth: this.truth,
        players: this.players,
        roundResults: this.roundResults,
        caseData: this.caseData,
        scoreDimensions: global.SCORE_DIMENSIONS,
      });
      this.phase = this.phase === PHASES.ACCUSED ? this.phase : this.phase;
      return this.scores;
    }
  }

  /* ---------- 纯函数评分（Phase 9：服务器计算，不信任客户端） ---------- */

  function computeScoresFromResults(opts) {
    if (global.ScoringEngine && global.ScoringEngine.computeScoresFromResults) {
      return global.ScoringEngine.computeScoresFromResults(opts);
    }
    // scoring.js 未加载时的最小回退（仍不使用写死总分）
    const truth = opts.truth || {};
    const players = opts.players || [];
    const results = opts.roundResults || {};
    return players.map((p) => {
      const rf = (results.final || {})[p.id];
      const correct = !!(rf && rf.killer === truth.killerId);
      return {
        id: p.id,
        name: p.name,
        total: correct ? 70 : 40,
        correct,
        finalSuspect: rf ? rf.killer : null,
        breakdown: {
          accuracy: correct ? 28 : 12,
          evidence: correct ? 14 : 10,
          logic: correct ? 12 : 8,
          contradiction: correct ? 10 : 6,
          debate: 6,
          calibration: correct ? 4 : 2,
        },
        note: correct ? "终局命中真凶（精简计分回退）" : "终局未命中（精简计分回退）",
        source: "engine-fallback",
      };
    });
  }

  /** 兼容旧签名 */
  function computeScores(caseTruth, playerHistories) {
    const truth = caseTruth || {};
    return (playerHistories || []).map((h) => ({
      id: h.id,
      total: h.total || 0,
      correct: !!(h.finalKiller && h.finalKiller === truth.killerId),
      breakdown: h.breakdown || {},
    }));
  }

  const GameEngineAPI = {
    GameEngine,
    PHASES,
    PHASE_META,
    SPEAKING_ORDER,
    validateRoundOutput,
    repairRoundOutput,
    computeScores,
    computeScoresFromResults,
  };

  global.GameEngineAPI = GameEngineAPI;
  global.GameEngine = GameEngine;
  global.AIEngine = GameEngine;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = GameEngineAPI;
  }
})(typeof window !== "undefined" ? window : globalThis);
