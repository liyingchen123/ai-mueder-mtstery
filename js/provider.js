/**
 * Phase 3 — 统一 AI Provider 抽象
 *
 * 游戏引擎只依赖 AIProvider，不感知 Anthropic / OpenAI / DeepSeek / 豆包 的具体 API。
 * Phase 4 起：先接入 DeepSeekProvider（真实 HTTP），其余仍可用 MockProvider。
 *
 * 所有 API Key 只允许存在于服务端环境变量；本文件在浏览器中运行时
 * 绝不能读取 NEXT_PUBLIC_* 或硬编码 Key。真实 Provider 将迁到 Route Handler。
 */

(function (global) {
  "use strict";

  /**
   * @typedef {Object} InvestigationRequest
   * @property {string} playerId
   * @property {string} playerName
   * @property {'round1'|'round2'|'round3'|'final'} round
   * @property {object} context  由 GameEngine.buildContext 产出（已隔离）
   * @property {number} timeoutMs
   *
   * @typedef {Object} InvestigationResult
   * @property {object} data   结构化 JSON（schema 由 Engine 校验）
   * @property {string} providerId
   * @property {number} latencyMs
   * @property {'mock'|'live'} mode
   */

  /** 抽象接口（文档化；子类必须实现 generateInvestigation） */
  class AIProvider {
    /** @returns {string} 唯一 id，如 'claude' | 'deepseek' */
    get id() {
      throw new Error("AIProvider.id not implemented");
    }

    /** @returns {string} 展示名 */
    get displayName() {
      throw new Error("AIProvider.displayName not implemented");
    }

    /**
     * @param {InvestigationRequest} _req
     * @returns {Promise<InvestigationResult>}
     */
    async generateInvestigation(_req) {
      throw new Error("AIProvider.generateInvestigation not implemented");
    }
  }

  /** 共享工具：带超时的等待（真实 Provider 用于 abort） */
  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error((label || "request") + " timeout after " + ms + "ms")),
        ms
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /** 共享工具：指数退避重试（仅网络/超时类错误） */
  async function withRetry(fn, opts) {
    const retries = opts && opts.retries != null ? opts.retries : 1;
    const baseDelay = (opts && opts.baseDelayMs) || 400;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn(attempt);
      } catch (err) {
        lastErr = err;
        const retriable =
          err &&
          (err.retriable === true ||
            /timeout|network|5\d\d/.test(String(err.message || "")));
        if (!retriable || attempt === retries) break;
        await new Promise((r) =>
          setTimeout(r, baseDelay * Math.pow(2, attempt))
        );
      }
    }
    throw lastErr;
  }

  /* ------------------------------------------------------------------ */
  /* MockProvider — 实现完整接口，读预置剧本；不访问网络                   */
  /* ------------------------------------------------------------------ */

  class MockProvider extends AIProvider {
    /**
     * @param {{id:string, displayName:string, script:object}} opts
     * script: { round1: {playerId: result}, round2: ..., ... }
     * 或按 player 固定：script 是 MOCK_ROUNDS 结构
     */
    constructor(opts) {
      super();
      this._id = opts.id;
      this._name = opts.displayName;
      this._script = opts.script;
      this._latencyMs = opts.latencyMs != null ? opts.latencyMs : 750;
    }

    get id() {
      return this._id;
    }

    get displayName() {
      return this._name;
    }

    async generateInvestigation(req) {
      const started = Date.now();
      const pack = this._script[req.round];
      const data =
        pack && pack.results && pack.results[req.playerId]
          ? JSON.parse(JSON.stringify(pack.results[req.playerId]))
          : null;

      if (!data) {
        const err = new Error(
          "mock script missing: " + req.round + "/" + req.playerId
        );
        err.retriable = false;
        throw err;
      }

      await new Promise((r) =>
        setTimeout(r, this._latencyMs + Math.floor(Math.random() * 200))
      );

      return {
        data,
        providerId: this.id,
        latencyMs: Date.now() - started,
        mode: "mock",
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Registry — Engine 只认识 registry，不认识具体厂商                     */
  /* ------------------------------------------------------------------ */

  class ProviderRegistry {
    constructor() {
      /** @type {Map<string, AIProvider>} */
      this._map = new Map();
    }

    /** @param {AIProvider} provider */
    register(provider) {
      if (!provider || typeof provider.generateInvestigation !== "function") {
        throw new Error("invalid provider");
      }
      this._map.set(provider.id, provider);
      return this;
    }

    get(playerId) {
      return this._map.get(playerId) || null;
    }

    has(playerId) {
      return this._map.has(playerId);
    }

    list() {
      return Array.from(this._map.values()).map((p) => ({
        id: p.id,
        displayName: p.displayName,
      }));
    }
  }

  /**
   * 默认注册表：除 opts.liveIds 外均为 Mock。
   * Phase 4：liveIds = ['deepseek'] 且存在 DeepSeekProvider 时走真实代理。
   * @param {object} mockRounds - data.js 的 MOCK_ROUNDS
   * @param {Array<{id,name}>} players
   * @param {{liveIds?:string[], liveFactory?:(p:object)=>AIProvider}} [opts]
   */
  function createDefaultRegistry(mockRounds, players, opts) {
    const options = opts || {};
    const liveIds = new Set(options.liveIds || []);
    const reg = new ProviderRegistry();

    players.forEach((p) => {
      if (liveIds.has(p.id) && typeof options.liveFactory === "function") {
        const live = options.liveFactory(p);
        if (live) {
          reg.register(live);
          return;
        }
      }
      reg.register(
        new MockProvider({
          id: p.id,
          displayName: p.name,
          script: mockRounds,
          latencyMs: 700 + Math.floor(Math.random() * 250),
        })
      );
    });
    return reg;
  }

  /**
   * 统一调用入口：超时 + 一次重试 + schema 前的传输层错误包装。
   * Engine 侧仍负责 JSON schema 校验。
   * @param {AIProvider} provider
   * @param {InvestigationRequest} req
   * @returns {Promise<InvestigationResult>}
   */
  async function callProvider(provider, req) {
    const timeoutMs = req.timeoutMs || 30000;
    return withRetry(
      async () => {
        const result = await withTimeout(
          provider.generateInvestigation(req),
          timeoutMs,
          provider.id
        );
        if (!result || typeof result !== "object" || !result.data) {
          const e = new Error("provider returned empty data");
          e.retriable = true;
          throw e;
        }
        return result;
      },
      { retries: 1, baseDelayMs: 500 }
    );
  }

  const AIProviderAPI = {
    AIProvider,
    MockProvider,
    ProviderRegistry,
    createDefaultRegistry,
    callProvider,
    withTimeout,
    withRetry,
  };

  global.AIProviderAPI = AIProviderAPI;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AIProviderAPI;
  }
})(typeof window !== "undefined" ? window : globalThis);
