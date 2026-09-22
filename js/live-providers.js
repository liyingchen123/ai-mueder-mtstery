/**
 * Phase 5 — Live Providers
 * - OpenAICompatProvider：Grok / Gemini / DeepSeek（本域 /api/* 代理，Key 在服务端）
 * - AnthropicCompatProvider：Claude（/api/anthropic）
 * 无 Key 或网络失败时回退 Mock（allowMockFallback）。
 *
 * 禁止在浏览器读取/拼接任何 API Key。
 */
(function (global) {
  "use strict";

  const API = global.AIProviderAPI;
  const Prompt = global.AIPrompt;
  if (!API) throw new Error("load js/provider.js first");
  if (!Prompt) throw new Error("load js/ai-prompt.js first");

  class BaseLiveProvider extends API.AIProvider {
    constructor(opts) {
      super();
      this._id = opts.id;
      this._name = opts.displayName;
      this._proxyUrl = opts.proxyUrl;
      this._allowFallback = opts.allowMockFallback !== false;
      this._fallback = new API.MockProvider({
        id: this._id,
        displayName: this._name,
        script: opts.mockScript,
        latencyMs: 800,
      });
      this.lastMode = "unknown";
      this.lastFallbackReason = null;
    }

    get id() {
      return this._id;
    }

    get displayName() {
      return this._name;
    }

    async generateInvestigation(req) {
      const started = Date.now();
      this.lastMode = "live";
      this.lastFallbackReason = null;
      try {
        const data = await this._callProxy(req);
        return {
          data,
          providerId: this.id,
          latencyMs: Date.now() - started,
          mode: "live",
        };
      } catch (err) {
        const code = err && err.code;
        const canFallback =
          this._allowFallback &&
          (code === "no_key" ||
            code === "network" ||
            code === "timeout" ||
            code === "upstream_error" ||
            code === "bad_key" ||
            code === "empty_content" ||
            code === "http_error" ||
            code === "upstream_bad_json");

        if (!canFallback) {
          err.retriable = code === "network" || code === "timeout";
          throw err;
        }
        this.lastMode = "mock";
        this.lastFallbackReason = String((err && err.message) || err).slice(0, 200);
        const fb = await this._fallback.generateInvestigation(req);
        return {
          data: fb.data,
          providerId: this.id,
          latencyMs: Date.now() - started,
          mode: "mock",
          fallbackReason: this.lastFallbackReason,
        };
      }
    }

    async _post(body, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { "Content-Type": "application/json" };
        // Phase 11 安全加固：注入 X-Site-Token 阻止跨站调用
        // 令牌由 server.js 在 index.html 渲染时通过 window.SITE_TOKEN 注入，
        // 跨站 JS 受同源策略约束拿不到，故能阻止公网任意客户端烧 Key
        if (typeof window !== "undefined" && window.SITE_TOKEN) {
          headers["X-Site-Token"] = window.SITE_TOKEN;
        }
        const res = await fetch(this._proxyUrl, {
          method: "POST",
          signal: controller.signal,
          headers,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          const e = new Error("proxy bad json");
          e.code = "upstream_bad_json";
          throw e;
        }
        if (!res.ok) {
          const e = new Error(
            (parsed.error && parsed.error.message) || "proxy HTTP " + res.status
          );
          e.code =
            (parsed.error && parsed.error.code) ||
            (res.status === 503 ? "no_key" : "http_error");
          throw e;
        }
        if (typeof parsed.content !== "string") {
          const e = new Error("empty content from proxy");
          e.code = "empty_content";
          throw e;
        }
        const data = Prompt.extractJson(parsed.content);
        if (!data) {
          const e = new Error("model did not return JSON");
          e.code = "empty_content";
          throw e;
        }
        return data;
      } catch (err) {
        if (err && err.name === "AbortError") {
          const e = new Error("timeout");
          e.code = "timeout";
          throw e;
        }
        if (err && !err.code) {
          const e = new Error(String(err.message || err));
          e.code = "network";
          throw e;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    _messages(req) {
      return [
        { role: "system", content: Prompt.buildSystemPrompt(req) },
        { role: "user", content: Prompt.buildUserPrompt(req) },
      ];
    }

    async _callProxy(req) {
      const timeoutMs = (req.timeoutMs || 30000) + 5000;
      return this._post(
        {
          messages: this._messages(req),
          timeoutMs: req.timeoutMs || 30000,
          temperature: 0.35,
          max_tokens: 1000,
        },
        timeoutMs
      );
    }
  }

  /** Grok / Gemini / DeepSeek 共用（OpenAI 兼容 chat.completions） */
  class OpenAICompatProvider extends BaseLiveProvider {}

  /** Claude：代理把 system 分离，走 Anthropic Messages API */
  class AnthropicCompatProvider extends BaseLiveProvider {}

  function createLiveProviderFor(player, mockScript) {
    const base = {
      id: player.id,
      displayName: player.name,
      mockScript,
      allowMockFallback: true,
    };
    switch (player.id) {
      case "deepseek":
        return new OpenAICompatProvider({ ...base, proxyUrl: "/api/deepseek" });
      case "gpt":
        return new OpenAICompatProvider({ ...base, proxyUrl: "/api/openai" });
      case "doubao":
        return new OpenAICompatProvider({ ...base, proxyUrl: "/api/doubao" });
      case "claude":
        return new AnthropicCompatProvider({ ...base, proxyUrl: "/api/anthropic" });
      default:
        return null;
    }
  }

  /** 四家都尝试 Live（无 Key / 中转失败自动 Mock 回退） */
  function createLiveRegistry(mockRounds, players) {
    const reg = new API.ProviderRegistry();
    players.forEach((p) => {
      const live = createLiveProviderFor(p, mockRounds);
      reg.register(live || new API.MockProvider({
        id: p.id,
        displayName: p.name,
        script: mockRounds,
      }));
    });
    return reg;
  }

  global.OpenAICompatProvider = OpenAICompatProvider;
  global.AnthropicCompatProvider = AnthropicCompatProvider;
  API.OpenAICompatProvider = OpenAICompatProvider;
  API.AnthropicCompatProvider = AnthropicCompatProvider;
  API.createLiveProviderFor = createLiveProviderFor;
  API.createLiveRegistry = createLiveRegistry;
})(typeof window !== "undefined" ? window : globalThis);
