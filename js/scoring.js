/**
 * Phase 9 — Scoring Engine
 * 纯函数评分：只依据本局 roundResults + 服务端 truth + 公共证据结构。
 * 不调用外部 AI 做主观评判；真相与得分不得回灌 AI context。
 *
 * 维度上限：Accuracy 35 / Evidence 20 / Logic 15 /
 *           Contradiction 15 / Debate 10 / Calibration 5 = 100
 */
(function (global) {
  "use strict";

  const ROUND_KEYS = ["round1", "round2", "round3", "final"];

  /**
   * 兼容两种输入：
   * - engine.roundResults: { round1: { playerId: result } }
   * - data.js MOCK_ROUNDS: { round1: { results: { playerId: result } } }
   */
  function normalizeRoundResults(input) {
    const src = input || {};
    const out = {};
    for (const key of ROUND_KEYS) {
      const pack = src[key];
      if (!pack || typeof pack !== "object") {
        out[key] = {};
        continue;
      }
      if (pack.results && typeof pack.results === "object") {
        out[key] = { ...pack.results };
      } else {
        out[key] = { ...pack };
      }
    }
    return out;
  }

  function pickEvidence(result) {
    if (!result) return [];
    const list = result.key_evidence || result.evidence;
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  }

  function suspectOf(result) {
    if (!result) return null;
    return result.killer || result.suspect || null;
  }

  function collectUsedEvidence(roundResults, playerId) {
    const used = new Set();
    for (const key of ROUND_KEYS) {
      const r = roundResults[key] && roundResults[key][playerId];
      for (const id of pickEvidence(r)) used.add(id);
    }
    return used;
  }

  function buildNote(playerId, dims, meta) {
    if (meta.correct) {
      if (dims.accuracy >= 32) {
        return "终局命中真凶；过程证据链完整，置信度与修正节奏匹配。";
      }
      if (meta.firstCorrectRound === "round1") {
        return "首轮即锁定正确方向，后续保持收敛；评分侧重过程质量。";
      }
      return "终局正确；中局曾被误导证据干扰，但完成有效修正。";
    }
    if (meta.everCorrect) {
      return "过程中曾指向真凶，终局转向错误；被误导证据或单点逻辑锁死。";
    }
    return "全程未命中真凶；证据引用与矛盾识别偏弱，未完成关键组合推理。";
  }

  /**
   * @param {object} opts
   * @param {object} opts.truth - {killerId, keyCombinations, redHerrings}
   * @param {Array}  opts.players - [{id,name}]
   * @param {object} opts.roundResults - {round1:{id:result},...,final:{id:result}}
   * @param {object} [opts.caseData] - 可选，用于合法证据集合
   * @param {object} [opts.scoreDimensions] - 可选展示维度（不影响计算）
   * @returns {Array<{id,name,total,correct,finalSuspect,breakdown,note,dims}>}
   */
  function computeScoresFromResults(opts) {
    const truth = opts.truth || {};
    const players = opts.players || [];
    const roundResults = normalizeRoundResults(opts.roundResults);
    const killer = truth.killerId;

    const keyEvidence = new Set();
    (truth.keyCombinations || []).forEach((combo) => {
      (combo || []).forEach((id) => keyEvidence.add(id));
    });
    // 公共关键证据（即使不在 combination 里）也算有效引用
    ["EV-01", "EV-02", "EV-03", "EV-04", "EV-05", "EV-06", "EV-09", "EV-11", "EV-12"].forEach(
      (id) => keyEvidence.add(id)
    );
    const redHerrings = new Set(truth.redHerrings || []);
    const contradictionIds = new Set(["EV-04", "EV-05", "EV-07", "EV-08", "EV-11"]);

    const validEvidence = new Set(keyEvidence);
    (redHerrings || []).forEach((id) => validEvidence.add(id));
    if (opts.caseData) {
      (opts.caseData.publicEvidence || []).forEach((e) => validEvidence.add(e.id));
      (opts.caseData.lateEvidence || []).forEach((e) => validEvidence.add(e.id));
    }

    return players.map((p) => {
      const r1 = (roundResults.round1 || {})[p.id] || null;
      const r2 = (roundResults.round2 || {})[p.id] || null;
      const r3 = (roundResults.round3 || {})[p.id] || null;
      const rf = (roundResults.final || {})[p.id] || null;

      const roundSuspects = [
        { key: "round1", v: suspectOf(r1) },
        { key: "round2", v: suspectOf(r2) },
        { key: "round3", v: suspectOf(r3) },
        { key: "final", v: suspectOf(rf) },
      ];
      const firstCorrect = roundSuspects.find((s) => s.v && s.v === killer);
      const everCorrect = !!firstCorrect;
      const finalHit = !!(rf && rf.killer === killer);
      const used = collectUsedEvidence(roundResults, p.id);
      const usedList = Array.from(used);

      /* ---------- Accuracy / 35 ---------- */
      let accuracy = 0;
      if (finalHit) {
        accuracy = 26;
        const processHits = [r1, r2, r3].filter((r) => r && suspectOf(r) === killer).length;
        accuracy += processHits * 2;
        const conf = Number(rf.confidence) || 0;
        if (conf >= 75 && conf <= 96) accuracy += 3;
        else if (conf >= 55) accuracy += 2;
        else if (conf >= 40) accuracy += 1;
        if (firstCorrect && firstCorrect.key === "round1") accuracy += 1;
      } else {
        accuracy = everCorrect ? 10 : 6;
        const processHits = [r1, r2, r3].filter((r) => r && suspectOf(r) === killer).length;
        accuracy += Math.min(6, processHits * 2);
        if (rf && rf.killer === "S1" && killer === "S2") {
          // 被 EV-08 经手者靶子误导：过程有一点信息量
          accuracy += 1;
        }
      }
      accuracy = Math.max(0, Math.min(35, accuracy));

      /* ---------- Evidence Usage / 20 ---------- */
      let evidence = 0;
      const keyUsed = usedList.filter((id) => keyEvidence.has(id) && !redHerrings.has(id));
      const lateUsed = usedList.some((id) => id === "EV-11" || id === "EV-12");
      const finalEv = pickEvidence(rf);
      const finalKeyHits = finalEv.filter((id) => keyEvidence.has(id) && !redHerrings.has(id)).length;
      const finalHerringOnly =
        finalEv.length > 0 && finalEv.every((id) => redHerrings.has(id));

      evidence += Math.min(10, keyUsed.length * 1.8);
      if (lateUsed) evidence += 3;
      if (finalHit) {
        evidence += Math.min(5, finalKeyHits * 1.7);
        if (keyUsed.some((id) => id === "EV-04" || id === "EV-05" || id === "EV-03")) {
          evidence += 2;
        }
      } else if (everCorrect) {
        evidence += 2;
      }
      if (finalHerringOnly) evidence = Math.max(0, evidence - 5);
      // 全程只引用误导证据
      const onlyHerring =
        usedList.length > 0 && usedList.every((id) => redHerrings.has(id));
      if (onlyHerring) evidence = Math.min(evidence, 6);
      evidence = Math.max(0, Math.min(20, Math.round(evidence)));

      /* ---------- Logical Consistency / 15 ---------- */
      let logic = 8;
      const summaryCount = [r1, r2, r3, rf].filter(
        (r) => r && typeof r.reasoning_summary === "string" && r.reasoning_summary.trim().length >= 24
      ).length;
      logic += Math.min(3, summaryCount);

      if (finalHit) {
        if (firstCorrect && firstCorrect.key === "round1") logic += 4;
        else if (firstCorrect && firstCorrect.key === "round2") logic += 3;
        else if (firstCorrect && firstCorrect.key === "round3") logic += 2;
        else logic += 1;
        // 从错误修正到正确，且未无意义摇摆
        const path = roundSuspects.map((s) => s.v).filter(Boolean);
        const changes = path.reduce((acc, cur, i) => (i > 0 && path[i - 1] !== cur ? acc + 1 : acc), 0);
        if (changes <= 2) logic += 0;
        else if (changes >= 4) logic -= 2;
      } else if (everCorrect) {
        // 曾正确却在终局转向，逻辑稳定性受损
        logic += 1;
        if (rf && rf.confidence >= 70) logic -= 2;
      } else {
        logic += 0;
        if (r1 && rf && suspectOf(r1) === suspectOf(rf) && (rf.confidence || 0) >= 70) {
          // 全程锁死在错误方向
          logic -= 2;
        }
      }
      logic = Math.max(0, Math.min(15, logic));

      /* ---------- Contradiction Detection / 15 ---------- */
      let contradiction = 0;
      const conHits = usedList.filter((id) => contradictionIds.has(id));
      contradiction += Math.min(6, conHits.length * 2);

      const textBlob = [r1, r2, r3]
        .map((r) => {
          if (!r) return "";
          const arg = (r.challenge && r.challenge.argument) || "";
          return (r.reasoning_summary || "") + " " + arg;
        })
        .join(" ");

      if (/矛盾|冲突|谎言|证词|摄像头|不在场|伪造|记错|contradict|lie|alibi/i.test(textBlob)) {
        contradiction += 3;
      }
      if (
        (/EV-04|EV-05|摄像头|台球室/.test(textBlob) || /整晚|未离开/.test(textBlob)) &&
        /矛盾|冲突|谎言|对不上|不成立|伪造/.test(textBlob)
      ) {
        contradiction += 3;
      }
      if (/靶子|嫁祸|误导|经手者|擦拭|替罪|红鲱鱼/.test(textBlob)) {
        contradiction += 2;
      }
      if (finalHit && /EV-04|EV-05|EV-11|担保|保险丝/.test((rf && rf.reasoning_summary) || "")) {
        contradiction += 1;
      }
      contradiction = Math.max(0, Math.min(15, contradiction));

      /* ---------- Debate Quality / 10 ---------- */
      let debate = 0;
      const ch = r2 && r2.challenge;
      if (ch && typeof ch.target_ai === "string" && typeof ch.argument === "string") {
        if (ch.target_ai && ch.target_ai !== p.id) {
          debate += 4;
        }
        if (ch.argument.trim().length >= 40) debate += 2;
        if (/EV-\d|证据|时间|动机|矛盾|摄像头|门禁/.test(ch.argument)) debate += 2;
        // 质疑对象是否后来被证实有隐瞒（真凶被挑战）
        if (killer) {
          const targetPlayer = players.find((x) => x.id === ch.target_ai);
          if (targetPlayer) {
            const tFinal = (roundResults.final || {})[targetPlayer.id];
            // 挑战了最终被多数判定错误方向的人不一定加分；
            // 挑战内容若触及真凶线则 +2
            if (new RegExp(killer + "|顾|S2|担保|台球|酒窖").test(ch.argument)) {
              debate += 2;
            } else if (tFinal && tFinal.killer === killer) {
              debate += 0;
            }
          }
        }
      }
      debate = Math.max(0, Math.min(10, debate));

      /* ---------- Confidence Calibration / 5 ---------- */
      let calibration = 0;
      if (rf && Number.isFinite(Number(rf.confidence))) {
        const conf = Number(rf.confidence);
        if (finalHit) {
          if (conf >= 70 && conf <= 95) calibration = 4;
          else if (conf >= 50 && conf < 70) calibration = 3;
          else if (conf > 95) calibration = 2;
          else if (conf >= 30) calibration = 2;
          else calibration = 1;
        } else {
          if (conf <= 45) calibration = 3;
          else if (conf <= 65) calibration = 2;
          else calibration = 0;
        }
        // 中局高置信错误 + 终局修正且置信回落 → 校准优秀
        if (r2 && Number(r2.confidence) >= 70 && suspectOf(r2) !== killer && finalHit) {
          if (conf < Number(r2.confidence)) calibration = 5;
        }
        // 中局已正确却在终局错误且高置信 → 校准差
        if (!finalHit && everCorrect && conf >= 70) calibration = 0;
      }
      calibration = Math.max(0, Math.min(5, calibration));

      const breakdown = {
        accuracy,
        evidence,
        logic,
        contradiction,
        debate,
        calibration,
      };
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const meta = {
        correct: finalHit,
        everCorrect,
        firstCorrectRound: firstCorrect ? firstCorrect.key : null,
      };

      return {
        id: p.id,
        name: p.name,
        total,
        correct: finalHit,
        finalSuspect: rf ? rf.killer : null,
        finalConfidence: rf ? rf.confidence : null,
        breakdown,
        note: buildNote(p.id, breakdown, meta),
        evidenceUsed: usedList,
        source: "engine",
      };
    });
  }

  /** 用 MOCK 剧本当作已完成局，生成演示分（仍由公式计算，非写死总分） */
  function scoreMockDemo(players, mockRounds, truth, caseData) {
    return computeScoresFromResults({
      truth,
      players,
      roundResults: mockRounds,
      caseData,
    });
  }

  const ScoringEngine = {
    computeScoresFromResults,
    scoreMockDemo,
    normalizeRoundResults,
  };

  global.ScoringEngine = ScoringEngine;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ScoringEngine;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
