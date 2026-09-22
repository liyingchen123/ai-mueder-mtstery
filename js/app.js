/**
 * Phase 2 — UI 接线 Game Engine。
 * 房间逻辑全部委托 engine.js；UI 只渲染公开聊天与状态条。
 * 不调用真实 AI API；不信任客户端计算的真相/得分。
 */

(function () {
  "use strict";

  /* ---------- public timeline (no secret content) ---------- */
  const TIMELINE = [
    { time: "20:00", desc: "私人展览「回声」晚宴开始，宾客二十余人。", critical: false },
    { time: "20:50", desc: "苏泠温室画作最后一笔完成（延时摄影，见 EV-07）。", critical: false },
    { time: "20:58", desc: "温室门开启，此后至 21:52 未再开启（EV-07）。", critical: false },
    { time: "21:05", desc: "沈墨白以头痛为由离席，独自进入东侧书房。", critical: false },
    { time: "21:08", desc: "林晚舟刷卡进入酒窖取 Oloroso 2011，21:10 退出送至书房（EV-08）。", critical: false },
    { time: "21:12", desc: "主宅停电——发电机保险丝被细铜线跨接熔断（EV-03）。", critical: true },
    { time: "21:25–21:45", desc: "尸检推定死亡时间窗（乌头碱起效，EV-01）。", critical: true },
    { time: "21:28", desc: "电力恢复，应急灯与摄像头回线。", critical: false },
    { time: "21:29–21:33", desc: "邵闻相机对走廊间隔连拍（EV-09）。", critical: false },
    { time: "21:31", desc: "走廊摄像头清晰拍到顾承嗣出现在书房门口（EV-04）。", critical: true },
    { time: "21:40", desc: "佣人敲门无应答。", critical: false },
    { time: "21:45", desc: "发现沈墨白死亡，报警。", critical: true },
  ];

  const REVEAL_TIMELINE = [
    { time: "10 月 17 日", desc: "顾承嗣以「花园除草」名义签收附子 300g（DeepSeek 秘密线索）。", critical: true },
    { time: "11.07 · 20:45", desc: "顾借走酒窖备用钥匙，投入乌头碱于 Oloroso 2011。", critical: true },
    { time: "11.07 · 21:02", desc: "归还钥匙；离开台球室，台球室进入无使用状态（EV-11）。", critical: true },
    { time: "11.07 · 21:08", desc: "林晚舟正常取酒——取走的已是毒酒。她不是凶手，是被安排好的「经手者靶子」。", critical: false },
    { time: "11.07 · 21:12", desc: "以铜线熔断保险丝制造停电窗口（EV-03）。", critical: true },
    { time: "11.07 · 21:29", desc: "从酒窖方向返回，袖口酒渍被邵闻相机中间帧拍下。", critical: true },
    { time: "11.07 · 21:31", desc: "出现在书房门口确认毒发（EV-04），随即以「整晚在台球室」作伪证（EV-05）。", critical: true },
    { time: "11.07 · 21:45", desc: "尸体被发现；周末前的两千万担保成为沉默的动机（EV-06）。", critical: false },
  ];

  /* ---------- helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function suspectById(id) {
    return SUSPECTS.find((s) => s.id === id) || null;
  }

  function evidenceById(id) {
    return (
      PUBLIC_EVIDENCE.find((e) => e.id === id) ||
      LATE_EVIDENCE.find((e) => e.id === id) ||
      null
    );
  }

  function tagClass(tags) {
    if (!tags) return "tag";
    if (tags.includes("矛盾") || tags.includes("误导")) return "tag tag--trap";
    if (tags.includes("关键")) return "tag tag--key";
    return "tag";
  }

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ---------- Game Engine instance ---------- */
  const API = window.GameEngineAPI;
  if (!API) {
    console.error("GameEngineAPI missing — load js/engine.js first");
  }

  const caseBundle = {
    meta: CASE_META,
    suspects: SUSPECTS,
    timeline: TIMELINE,
    publicEvidence: PUBLIC_EVIDENCE,
    lateEvidence: LATE_EVIDENCE,
  };

  const PAPI = window.AIProviderAPI;
  if (!PAPI) {
    console.error("AIProviderAPI missing — load js/provider.js first");
  }

  // Phase 5：四家全部走 Live Provider（无 Key 的自动回退 Mock）
  const providerRegistry =
    PAPI && typeof PAPI.createLiveRegistry === "function"
      ? PAPI.createLiveRegistry(MOCK_ROUNDS, AI_PLAYERS)
      : PAPI
        ? PAPI.createDefaultRegistry(MOCK_ROUNDS, AI_PLAYERS)
        : null;

  /** 记录每位玩家最近一次调用模式，用于状态条 LIVE/MOCK */
  const providerMode = {};
  const fallbackAnnounced = new Set();

  const engine = new API.GameEngine({
    caseData: caseBundle,
    players: AI_PLAYERS,
    secretClues: SECRET_CLUES,
    truth: TRUTH,
    providers: providerRegistry,
    speakingOrder: API.SPEAKING_ORDER,
    timeoutMs: 30000,
  });

  /** UI 层：是否正在自动连播本轮剩余发言 */
  let autoPlay = false;

  /* ---------- routing ---------- */
  const VIEWS = ["/", "/case", "/room", "/accusations", "/reveal", "/mvp"];

  function currentRoute() {
    const h = (location.hash || "#/").replace(/^#/, "");
    return VIEWS.includes(h) ? h : "/";
  }

  function navigate(route) {
    location.hash = "#" + route;
  }

  function renderRoute() {
    const route = currentRoute();
    $$(".view").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === route);
    });
    $$("#top-nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    if (route === "/accusations") renderAccusations();
    if (route === "/reveal") renderReveal();
    if (route === "/mvp") renderMvp();
    if (route === "/room") renderRoom();
  }

  window.addEventListener("hashchange", renderRoute);

  /* ---------- static fills ---------- */
  function fillHome() {
    $("#hero-players").innerHTML = AI_PLAYERS.map(
      (p, i) =>
        `<span class="player-chip"><span class="idx">0${i + 1}</span>${esc(p.name)}</span>`
    ).join("");
  }

  function fillCase() {
    $("#case-title").textContent = CASE_META.title;
    $("#case-id").textContent = "CASE NO. " + CASE_META.id;
    $("#case-date").textContent = CASE_META.date;
    $("#case-location").textContent = CASE_META.location;
    $("#victim-name").textContent = CASE_META.victim.name + " · " + CASE_META.victim.age;
    $("#victim-role").textContent = CASE_META.victim.role;
    $("#victim-detail").textContent = CASE_META.victim.detail;
    $("#case-background").textContent = CASE_META.background;

    const facts = [
      ["发生地点", CASE_META.location],
      ["日期", CASE_META.date],
      ["天气", CASE_META.weather],
      ["死亡时间", "21:25 – 21:45（推定）"],
      ["死因", "乌头碱中毒（经雪莉酒摄入）"],
      ["在场嫌疑人", SUSPECTS.length + " 人"],
    ];
    $("#case-facts").innerHTML = facts
      .map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join("");

    $("#suspect-count").textContent = SUSPECTS.length + " SUSPECTS";
    $("#suspect-grid").innerHTML = SUSPECTS.map(
      (s) => `
      <article class="suspect-card">
        <div class="suspect-card__top">
          <span class="suspect-card__id">${esc(s.id)}</span>
          <span class="tag">AGE ${s.age}</span>
        </div>
        <h3>${esc(s.name)}</h3>
        <div class="role">${esc(s.role)}</div>
        <div class="block">
          <div class="block-label">Background</div>
          <p>${esc(s.background)}</p>
        </div>
        <div class="block">
          <div class="block-label">Potential Motive</div>
          <p>${esc(s.motive)}</p>
        </div>
      </article>`
    ).join("");

    $("#case-timeline").innerHTML = TIMELINE.map(
      (t) => `
      <div class="timeline-item${t.critical ? " critical" : ""}">
        <div class="time">${esc(t.time)}</div>
        <div class="desc">${esc(t.desc)}</div>
      </div>`
    ).join("");

    $("#evidence-count").textContent = PUBLIC_EVIDENCE.length + " PUBLIC EXHIBITS";
    $("#evidence-grid").innerHTML = PUBLIC_EVIDENCE.map((e) =>
      evidenceCardHtml(e, false)
    ).join("");
    $("#late-evidence-grid").innerHTML = LATE_EVIDENCE.map((e) =>
      evidenceCardHtml(e, true)
    ).join("");
  }

  function evidenceCardHtml(e, late) {
    const tags = (e.tags || [])
      .map((t) => `<span class="${tagClass([t])}">${esc(t)}</span>`)
      .join("");
    return `
      <article class="evidence-card"${late ? ' data-late="true"' : ""}>
        <div class="evidence-card__top">
          <span class="evidence-card__id">${esc(e.id)}</span>
          ${late ? '<span class="tag tag--key">LATE</span>' : ""}
        </div>
        <h4>${esc(e.title)}</h4>
        <p>${esc(e.body)}</p>
        <div class="evidence-card__tags">${tags}</div>
      </article>`;
  }

  /* ================= Investigation Room ================= */

  function renderRoom() {
    $("#room-case-title").textContent = CASE_META.title;
    renderStatusStrip();
    renderChat();
    updateRoomControls();
  }

  function renderStatusStrip() {
    const strip = $("#status-strip");
    const current = engine.currentPlayer();
    const currentId = current ? current.id : null;

    strip.innerHTML = AI_PLAYERS.map((p) => {
      const s = engine.playerState[p.id];
      const sus = s.suspect ? suspectById(s.suspect) : null;
      const isSpeaking = currentId === p.id;
      const mode = providerMode[p.id];
      let turnLabel = "WAITING";
      if (currentId === p.id) turnLabel = "SPEAKING…";
      else if (mode === "live") turnLabel = "LIVE";
      else if (mode === "mock") turnLabel = "MOCK";
      else if (s.lastRound) turnLabel = "SPOKE · " + String(s.lastRound).toUpperCase();
      else if (engine.phase === "idle") turnLabel = "READY";

      return `
        <div class="status-card ${isSpeaking ? "speaking" : ""} ${
        currentId && currentId !== p.id ? "waiting" : ""
      }" data-player="${p.id}">
          <div class="status-card__top">
            <span class="status-card__name">${esc(p.name)}</span>
            <span class="status-card__turn" data-mode="${esc(
              mode || ""
            )}">${esc(turnLabel)}</span>
          </div>
          <div class="status-card__row">
            <span>SUSPECT</span>
            <strong>${sus ? esc(sus.id + " " + sus.name) : "—"}</strong>
          </div>
          <div class="status-card__row">
            <span>CONF</span>
            <strong>${s.confidence != null ? s.confidence + "%" : "—"}</strong>
          </div>
          <div class="status-card__conf"><span style="width:${
            s.confidence != null ? s.confidence : 0
          }%"></span></div>
        </div>`;
    }).join("");
  }

  function chatMsgHtml(m) {
    if (m.kind === "system") {
      return `
        <div class="chat__msg system">
          <div class="system-body">
            <em>${esc(m.round)}</em>
            ${esc(m.text)}
          </div>
        </div>`;
    }

    const sus = m.suspect ? suspectById(m.suspect) : null;
    const stats = [];
    if (sus) {
      stats.push(
        `<span class="stat-suspect">指向 ${esc(sus.id)} ${esc(sus.name)}</span>`
      );
    } else if (m.kind === "speech") {
      stats.push(`<span class="stat-suspect">—</span>`);
    }
    if (m.confidence != null) {
      stats.push(`<span class="stat-conf">置信度 ${m.confidence}%</span>`);
    }

    let challengeHtml = "";
    if (m.challenge) {
      const t = AI_PLAYERS.find((a) => a.id === m.challenge.target_ai);
      challengeHtml = `
        <div class="chat__challenge">
          <div class="ch-target">Challenge → ${esc(
            t ? t.name : m.challenge.target_ai
          )}</div>
          <p>${esc(m.challenge.argument)}</p>
        </div>`;
    }

    const evidence = (m.evidence || [])
      .map((id) => `<span class="ev-ref">${esc(id)}</span>`)
      .join("");

    return `
      <div class="chat__msg" data-seq="${m.seq}">
        <div class="chat__meta">
          <span class="chat__speaker">${esc(m.speaker)}</span>
          <span class="chat__round">${esc(m.round)}</span>
          <span class="chat__time">${esc(nowStamp())}</span>
        </div>
        <div class="chat__content">
          <div class="chat__stats">${stats.join("")}</div>
          <div class="chat__text">${esc(m.text)}</div>
          ${challengeHtml}
          ${
            evidence
              ? `<div class="chat__evidence">${evidence}</div>`
              : ""
          }
        </div>
      </div>`;
  }

  function renderChat() {
    const body = $("#chat-body");
    const log = engine.publicLog;
    $("#feed-count").textContent = log.length + " MESSAGES";

    if (!log.length) {
      body.innerHTML = `
        <div class="chat__empty" id="chat-empty">
          讨论尚未开始。点击 Begin Round 1，四位 AI 将按
          Claude → Grok → DeepSeek → Gemini 的顺序依次发言。
        </div>`;
      return;
    }
    body.innerHTML = log.map(chatMsgHtml).join("");
    body.scrollTop = body.scrollHeight;
  }

  function appendLatestChatMessage() {
    const body = $("#chat-body");
    const empty = $("#chat-empty");
    if (empty) empty.remove();
    const log = engine.publicLog;
    if (!log.length) return;
    const m = log[log.length - 1];
    // 全量重绘更稳妥（消息量小）
    renderChat();
  }

  function updateRoomControls() {
    const meta = engine.meta();
    $("#round-label").textContent = meta.label;
    $("#round-step").textContent = meta.step + " / 4";
    $("#progress-fill").style.width = meta.progress + "%";

    const btnMain = $("#btn-run-round");
    const btnStep = $("#btn-step-turn");

    if (engine.phase === "accusations") {
      btnMain.textContent = "View Accusations";
      btnMain.disabled = false;
      btnStep.disabled = true;
    } else if (engine.phase === "idle") {
      btnMain.textContent = "Begin Round 1";
      btnMain.disabled = autoPlay;
      btnStep.disabled = true;
    } else if (engine.turnIndex >= 0) {
      btnMain.textContent = "Play Entire Round";
      btnMain.disabled = autoPlay;
      btnStep.disabled = autoPlay || engine.busy;
    } else {
      // 本阶段已结束，等待进入下一阶段
      const labels = {
        round1: "Continue to Round 2",
        round2: "Continue to Round 3",
        round3: "Submit Final Accusations",
        final: "View Accusations",
      };
      btnMain.textContent = labels[engine.phase] || engine.meta().btn;
      btnMain.disabled = autoPlay;
      btnStep.disabled = true;
    }

    const next = engine.currentPlayer();
    $("#chat-next").innerHTML = next
      ? `下一位发言者：<strong>${esc(next.name)}</strong> （${
          engine.turnIndex + 1
        } / 4）`
      : engine.phase === "accusations"
        ? "全部发言结束"
        : "等待开始…";

    const typing = $("#chat-typing");
    const thinking =
      engine.busy && engine.turnIndex >= 0 && engine.phase !== "accusations";
    typing.hidden = !thinking;
  }

  /**
   * 单步：当前说话者 → engine.askAI（隔离 context + Provider + 校验）→ 入聊天框
   */
  async function stepOneTurn() {
    const player = engine.currentPlayer();
    if (!player || engine.busy) return false;

    engine.busy = true;
    renderStatusStrip();
    updateRoomControls();

    const answer = await engine.askAI(player.id);
    engine.busy = false;

    if (!answer.ok) {
      console.error("askAI failed", answer);
      const detail =
        answer.details && answer.details.length
          ? "（" + answer.details.join("; ") + "）"
          : "";
      const hint =
        answer.error === "provider_error" || answer.error === "schema_invalid"
          ? " — 将自动重试一次；仍失败则本席位跳过并记入系统消息"
          : "";
      engine.pushSystem(
        "ERROR",
        player.name + " 调用失败：" + answer.error + detail + hint
      );
      appendLatestChatMessage();
      renderStatusStrip();
      updateRoomControls();
      return false;
    }

    providerMode[player.id] = answer.mode || "live";

    if (answer.mode === "mock" && answer.fallbackReason && !fallbackAnnounced.has(player.id)) {
      fallbackAnnounced.add(player.id);
      engine.pushSystem(
        "Provider",
        player.name +
          " 已回退 Mock：" +
          answer.fallbackReason +
          "（在 .env 配置对应 Key 并重启 node server.js 后可切换 LIVE）"
      );
    }

    const res = engine.submitTurn(answer.data);
    if (!res.ok) {
      console.error("submitTurn failed", res);
      engine.pushSystem("ERROR", "发言校验失败：" + res.error);
    }

    appendLatestChatMessage();
    renderStatusStrip();
    updateRoomControls();
    return true;
  }

  /** 自动播完当前 phase 的全部发言 */
  async function playEntirePhase() {
    if (autoPlay) return;

    autoPlay = true;
    updateRoomControls();

    // 进入下一 phase（若尚未开跑）
    if (engine.turnIndex < 0) {
      if (!engine.beginPhase()) {
        autoPlay = false;
        updateRoomControls();
        return;
      }
      renderChat();
      renderStatusStrip();
      updateRoomControls();
      await sleep(450);
    }

    while (autoPlay && engine.turnIndex >= 0) {
      const ok = await stepOneTurn();
      if (!ok) break;
      await sleep(300);
    }

    autoPlay = false;
    renderChat();
    renderStatusStrip();
    updateRoomControls();
  }

  async function onMainButton() {
    if (engine.phase === "accusations") {
      navigate("/accusations");
      return;
    }
    await playEntirePhase();
  }

  async function onStepButton() {
    if (engine.turnIndex < 0) return;
    await stepOneTurn();
  }

  function resetRoom() {
    autoPlay = false;
    fallbackAnnounced.clear();
    Object.keys(providerMode).forEach((k) => delete providerMode[k]);
    engine.reset();
    renderRoom();
  }

  /* ---------- accusations (from engine finals) ---------- */
  function renderAccusations() {
    let list;
    if (engine.hasFinalAccusations()) {
      list = engine.finalAccusations();
    } else {
      // 允许直接跳转查看（回放演示：终局对照 mock 剧本）
      list = AI_PLAYERS.map((p) => {
        const r = MOCK_ROUNDS.final.results[p.id];
        return {
          id: p.id,
          name: p.name,
          killer: r.killer,
          confidence: r.confidence,
          reasoning_summary: r.reasoning_summary,
          key_evidence: r.key_evidence,
          correct: r.killer === TRUTH.killerId,
        };
      });
    }

    $("#accusation-grid").innerHTML = list
      .map((r) => {
        const sus = suspectById(r.killer);
        return `
        <article class="accusation-card ${r.correct ? "correct" : "wrong"}">
          <div class="accusation-card__ai">${esc(r.name)}</div>
          <div class="accusation-card__target">
            <span class="arrow">→</span>
            <span class="suspect">${esc(sus ? sus.id : r.killer)}</span>
            <span class="suspect-name">${esc(sus ? sus.name : "")}</span>
          </div>
          <div class="acc-conf">
            <div class="acc-conf__num">${r.confidence}<small>%</small></div>
            <div class="confidence-bar"><span style="width:${r.confidence}%"></span></div>
          </div>
          <p class="reason">${esc(r.reasoning_summary)}</p>
          <div class="ai-evidence-refs">
            ${(r.key_evidence || [])
              .map((id) => `<span class="ev-ref">${esc(id)}</span>`)
              .join("")}
          </div>
          <div class="verdict">${
            r.correct ? "Correct · 命中真凶" : "Incorrect · 误指"
          }</div>
        </article>`;
      })
      .join("");
  }

  /* ---------- reveal ---------- */
  function renderReveal() {
    const k = suspectById(TRUTH.killerId);
    $("#reveal-killer-name").textContent = TRUTH.killerName;
    $("#reveal-killer-role").textContent = k ? k.role : "";
    $("#reveal-solution").textContent = TRUTH.solution;

    $("#reveal-timeline").innerHTML = REVEAL_TIMELINE.map(
      (t) => `
      <div class="timeline-item${t.critical ? " critical" : ""}">
        <div class="time">${esc(t.time)}</div>
        <div class="desc">${esc(t.desc)}</div>
      </div>`
    ).join("");

    $("#reveal-herrings").innerHTML = TRUTH.redHerrings.map((id) => {
      const e = evidenceById(id);
      if (!e) return "";
      return `<li><strong style="color:var(--brass)">${esc(e.id)} ${esc(
        e.title
      )}</strong><br />${esc(e.body)}</li>`;
    }).join("");
  }

  /* ---------- mvp ---------- */
  /**
   * 优先使用本局 engine 服务端计分；
   * 尚未跑完时用 MOCK 剧本 + 公式计算（非写死总分），保证 MVP 页始终可演示。
   */
  function resolveScores() {
    if (engine.hasScores()) return { list: engine.scores, source: "live" };
    if (engine.hasFinalAccusations()) {
      const scored = engine.scoreGame();
      if (scored && scored.length) return { list: scored, source: "live" };
    }
    const SE = window.ScoringEngine;
    const compute =
      (SE && SE.scoreMockDemo) ||
      (API && API.computeScoresFromResults
        ? (players, mock, truth, caseData) =>
            API.computeScoresFromResults({ truth, players, roundResults: mock, caseData })
        : null);
    if (compute) {
      const demo = compute(AI_PLAYERS, MOCK_ROUNDS, TRUTH, caseBundle);
      return { list: demo, source: "demo" };
    }
    return { list: MOCK_SCORES, source: "preset" };
  }

  function renderMvp() {
    const { list, source } = resolveScores();
    const sorted = [...list].sort((a, b) => b.total - a.total);
    const mvp = sorted[0];
    if (!mvp) {
      $("#mvp-name").textContent = "—";
      $("#mvp-total").textContent = "0";
      $("#mvp-note").textContent = "尚无终局数据。请先完成三轮讨论并提交最终指控。";
      $("#score-table").innerHTML = "";
      $("#score-details").innerHTML = "";
      return;
    }

    const sourceLabel =
      source === "live"
        ? "LIVE · 本局 Engine 计分"
        : source === "demo"
          ? "DEMO · Mock 剧本公式计分"
          : "PRESET";
    const noteEl = $("#mvp-note");
    const sourceEl = $("#mvp-source");
    if (sourceEl) sourceEl.textContent = sourceLabel;

    $("#mvp-name").textContent = mvp.name;
    $("#mvp-total").textContent = mvp.total;
    noteEl.textContent =
      (mvp.note || "") +
      (source === "live"
        ? ""
        : "（当前为演示计分：跑完 Investigation Room 后将替换为本局真实得分）");

    $("#score-table").innerHTML = `
      <thead>
        <tr>
          <th style="width:56px">RANK</th>
          <th>AI</th>
          <th style="width:110px">FINAL CALL</th>
          ${SCORE_DIMENSIONS.map(
            (d) =>
              `<th>${esc(d.label)}<br /><span style="color:var(--faint);font-weight:400">/${d.max}</span></th>`
          ).join("")}
          <th style="width:80px">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((s, i) => {
            const sus = suspectById(s.finalSuspect);
            return `
          <tr class="${i === 0 ? "rank-1" : ""}">
            <td class="num">${String(i + 1).padStart(2, "0")}</td>
            <td class="ai-col">${esc(s.name)}${
              i === 0 ? '<span class="badge mvp">MVP</span>' : ""
            }<span class="badge ${s.correct ? "hit" : "miss"}">${
              s.correct ? "HIT" : "MISS"
            }</span></td>
            <td class="num">${esc(sus ? sus.id + " " + sus.name : s.finalSuspect || "—")}</td>
            ${SCORE_DIMENSIONS.map(
              (d) => `<td class="num">${s.breakdown[d.key] != null ? s.breakdown[d.key] : 0}</td>`
            ).join("")}
            <td class="num total">${s.total}</td>
          </tr>`;
          })
          .join("")}
      </tbody>`;

    $("#score-details").innerHTML = sorted
      .map(
        (s) => `
      <article class="detail-card">
        <div class="detail-card__head">
          <h3>${esc(s.name)}</h3>
          <span class="tot">${s.total}</span>
        </div>
        <p class="note">${esc(s.note || "")}</p>
        ${SCORE_DIMENSIONS.map((d) => {
          const v = s.breakdown[d.key] != null ? s.breakdown[d.key] : 0;
          const pct = Math.max(0, Math.min(100, Math.round((v / d.max) * 100)));
          return `
          <div class="dim-row">
            <div class="dim-label">${esc(d.label)}<small>${esc(d.desc)}</small></div>
            <div class="dim-bar"><span style="width:${pct}%"></span></div>
            <div class="dim-val">${v}<span class="max"> /${d.max}</span></div>
          </div>`;
        }).join("")}
      </article>`
      )
      .join("");
  }

  /* ---------- wire up ---------- */
  function init() {
    fillHome();
    fillCase();
    renderRoom();

    $("#btn-start-case").addEventListener("click", () => navigate("/case"));
    $("#btn-enter-room").addEventListener("click", () => navigate("/room"));
    $("#btn-show-reveal").addEventListener("click", () => navigate("/reveal"));
    $("#btn-run-round").addEventListener("click", onMainButton);
    $("#btn-step-turn").addEventListener("click", onStepButton);
    $("#btn-reset-room").addEventListener("click", resetRoom);
    const btnAccMvp = $("#btn-accusation-mvp");
    if (btnAccMvp) {
      btnAccMvp.addEventListener("click", () => {
        if (engine.hasFinalAccusations()) engine.scoreGame();
        navigate("/mvp");
      });
    }
    $("#btn-replay").addEventListener("click", () => {
      resetRoom();
      navigate("/");
    });

    if (!location.hash) location.hash = "#/";
    renderRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
