/**
 * Phase 5 — 兼容旧入口：DeepSeek 的 Live Provider 已并入 live-providers.js
 * 保留文件名以免旧 index.html 引用断裂。
 */
(function (global) {
  "use strict";
  // no-op shim — see live-providers.js
  if (global.AIProviderAPI && !global.AIProviderAPI.DeepSeekProvider) {
    global.AIProviderAPI.DeepSeekProvider =
      global.AIProviderAPI.OpenAICompatProvider || null;
  }
})(typeof window !== "undefined" ? window : globalThis);
