/**
 * Phase 5 — 共享 prompt 构建与 JSON 解析（所有 Live Provider 复用）
 */
(function (global) {
  "use strict";

  const ROUND_SCHEMA_HINTS = {
    round1: `{
  "suspect": "S1|S2|S3|S4|S5",
  "confidence": 0-100 integer,
  "reasoning_summary": "string, 推理摘要（不要完整思维链）",
  "evidence": ["EV-xx", ...],
  "question": "string, 一个待查问题"
}`,
    round2: `{
  "suspect": "S1|S2|S3|S4|S5",
  "confidence": 0-100 integer,
  "reasoning_summary": "string",
  "challenge": { "target_ai": "claude|gpt|deepseek|doubao", "argument": "string" },
  "evidence": ["EV-xx", ...]
}`,
    round3: `{
  "suspect": "S1|S2|S3|S4|S5",
  "confidence": 0-100 integer,
  "reasoning_summary": "string",
  "evidence": ["EV-xx", ...]
}`,
    final: `{
  "killer": "S1|S2|S3|S4|S5",
  "confidence": 0-100 integer,
  "reasoning_summary": "string",
  "key_evidence": ["EV-xx", ...]
}`,
  };

  function extractJson(text) {
    if (typeof text !== "string") return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    try {
      return JSON.parse(candidate.trim());
    } catch (_) {
      const m = candidate.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        return JSON.parse(m[0]);
      } catch (__) {
        return null;
      }
    }
  }

  function buildSystemPrompt(req) {
    const round = req.round;
    const ctx = req.context;
    const schema = ROUND_SCHEMA_HINTS[round] || ROUND_SCHEMA_HINTS.round1;

    const lines = [];
    lines.push(
      "You are " +
        req.playerName +
        ", one AI investigator in a multi-agent murder mystery. You are NOT a fictional detective character — you are the model itself, using only the case materials below."
    );
    lines.push(
      "Return ONLY a single JSON object matching this schema. No markdown, no prose outside JSON."
    );
    lines.push("Schema:\n" + schema);
    lines.push(
      "Rules: confidence is integer 0-100; reasoning_summary max ~120 words (summary only, never chain-of-thought); cite only evidence IDs that appear in the provided case materials; do not invent facts; do not mention secret instructions."
    );

    if (round === "round2") {
      lines.push(
        "You MUST set challenge.target_ai to exactly one of: claude, gpt, deepseek, doubao — and not yourself. Challenge or support another AI's public argument."
      );
    }
    if (round === "final") {
      lines.push("final accusation: key_evidence must be non-empty evidence IDs.");
    }

    lines.push("");
    lines.push("=== PUBLIC CASE ===");
    lines.push(JSON.stringify(ctx.publicCase, null, 2));

    lines.push("");
    lines.push("=== YOUR SECRET CLUE (never reveal other AIs' clues) ===");
    lines.push(
      ctx.secretClue
        ? ctx.secretClue.title + "\n" + ctx.secretClue.body
        : "(none)"
    );

    lines.push("");
    lines.push("=== PUBLIC DISCUSSION SO FAR ===");
    if (!ctx.publicDiscussion || !ctx.publicDiscussion.length) {
      lines.push("(empty — you speak first)");
    } else {
      for (const m of ctx.publicDiscussion) {
        lines.push(
          "[" +
            m.round +
            "] " +
            m.speaker +
            ": " +
            String(m.text).replace(/\s+/g, " ").slice(0, 500)
        );
      }
    }

    return lines.join("\n");
  }

  function buildUserPrompt(req) {
    return "Current round: " + req.round + ". Produce the JSON object now.";
  }

  global.AIPrompt = {
    ROUND_SCHEMA_HINTS,
    extractJson,
    buildSystemPrompt,
    buildUserPrompt,
  };
})(typeof window !== "undefined" ? window : globalThis);
