/**
 * Phase 5 + 安全加固 — 本地/部署用 Node 服务
 * 1) 静态托管（HTML 含 SITE_TOKEN 占位符，运行时替换）
 * 2) AI 代理（Key 只在服务端）:
 *    POST /api/deepseek | /api/openai | /api/doubao  — OpenAI 兼容
 *    POST /api/anthropic                             — Anthropic Messages
 * 3) 安全：同源 CORS + X-Site-Token + Rate Limit + 安全 headers + dotfile 拦截
 *
 * 启动: node server.js
 * Key 与 SITE_TOKEN 见 .env（.env 不进 git、不被静态服务暴露）
 * 无 Key → 503 no_key，前端 Provider 回退 Mock。
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8747);
const HOST = process.env.HOST || "127.0.0.1";

function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return false;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    return true;
  } catch (e) {
    console.warn("[env] failed to load", file, e.message);
    return false;
  }
}
// 查找 .env：优先本目录（Docker env_file 注入或本地开发可放），
// 找不到则向上到父目录（项目代码与 .env 物理分离时的本地开发场景，
// 即 .env 留在 Vibecoding/ 根，代码在 ai-murder-mystery/ 子文件夹）
const envCandidates = [
  path.join(ROOT, ".env"),
  path.join(ROOT, "..", ".env"),
];
let envLoaded = false;
let envPath = "(none)";
for (const p of envCandidates) {
  if (loadEnvFile(p)) {
    envLoaded = true;
    envPath = p;
    break;
  }
}
// 启动日志会显示实际加载的 .env 路径，便于排查

function env(name, fallback) {
  return process.env[name] || fallback || "";
}
function trimUrl(u, suffix) {
  let s = (u || "").replace(/\/$/, "");
  if (suffix && s.endsWith(suffix)) s = s.slice(0, -suffix.length).replace(/\/$/, "");
  return s;
}

const PROVIDERS = {
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    key: env("DEEPSEEK_API_KEY"),
    kind: "openai",
    baseUrl: trimUrl(env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/chat/completions"),
    path: "/chat/completions",
    model: env("DEEPSEEK_MODEL", "deepseek-chat"),
    jsonMode: true,
    label: "DeepSeek",
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    key: env("OPENAI_API_KEY"),
    kind: "openai",
    baseUrl: trimUrl(env("OPENAI_BASE_URL", "https://api.openai.com/v1"), "/chat/completions"),
    path: "/chat/completions",
    model: env("OPENAI_MODEL", "grok-4.5"),
    jsonMode: true,
    label: "Grok",
  },
  doubao: {
    envKey: "DOUBAO_API_KEY",
    key: env("DOUBAO_API_KEY") || env("ARK_API_KEY"),
    kind: "openai",
    baseUrl: trimUrl(
      env("DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
      "/chat/completions"
    ),
    path: "/chat/completions",
    model: env("DOUBAO_MODEL", "gemini-3.5-flash"),
    jsonMode: true,
    label: "Gemini",
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    key: env("ANTHROPIC_API_KEY"),
    kind: "anthropic",
    baseUrl: trimUrl(env("ANTHROPIC_BASE_URL", "https://api.anthropic.com"), "/v1/messages"),
    path: "/v1/messages",
    model: env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    jsonMode: false,
    label: "Claude",
  },
};

/* ============================================================
 * 安全配置
 * ============================================================ */
const SITE_TOKEN = env("SITE_TOKEN"); // 站点访问令牌（阻止跨站调 /api/*）；空 → 跳过校验
const ALLOWED_ORIGIN = env("ALLOWED_ORIGIN"); // 同源白名单，如 https://your-domain.com；空 → 不返回 CORS 头
const RATE_LIMIT = { windowMs: 60_000, max: 30 }; // 每 IP 每分钟 30 次 API 调用

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/* ============================================================
 * 安全 / 日志工具
 * ============================================================ */

/** 基础安全 headers，所有响应都应注入 */
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/** 同源 CORS：无 Origin 放行；Origin 匹配白名单放行；其余不返回 CORS 头（浏览器拦截） */
function corsHeaders(req) {
  const origin = req.headers.origin || "";
  if (!origin) return {}; // 同源请求（浏览器导航/同源 fetch 不带 Origin）
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Content-Type, X-Site-Token",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
  }
  return {}; // 不匹配的跨域：不返回 CORS 头 → 浏览器拦截
}

/** 令牌校验：未配置 SITE_TOKEN 时跳过（开发模式） */
function checkSiteToken(req) {
  if (!SITE_TOKEN) return true;
  return req.headers["x-site-token"] === SITE_TOKEN;
}

/** 取客户端真实 IP（Nginx 反代后从 X-Forwarded-For 取第一个） */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

/** 按 IP 限流（内存 token bucket） */
const rateMap = new Map(); // ip -> { count, resetAt }
function rateLimit(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateMap.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    rateMap.set(ip, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT.max) {
    res.writeHead(429, {
      "Retry-After": "60",
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(),
    });
    res.end(JSON.stringify({ error: { code: "rate_limited" } }));
    return false;
  }
  return true;
}
// 定期清理过期桶，防止内存膨胀
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateMap) if (now > b.resetAt) rateMap.delete(ip);
}, 60_000).unref();

/** 一行访问日志 */
function logRequest(req, status, ms) {
  const ts = new Date().toISOString();
  const ip = clientIp(req);
  console.log(`[${ts}] ${ip} ${req.method} ${req.url} ${status} ${ms}ms`);
}

/* ============================================================
 * 响应工具
 * ============================================================ */

function sendJson(res, status, obj, req) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...(req ? corsHeaders(req) : {}),
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function ensureJsonWord(messages) {
  const textBlob = messages
    .map((m) => String((m && m.content) || ""))
    .join("\n");
  if (/json/i.test(textBlob)) return { messages, useJsonMode: true };
  return {
    messages: messages.concat([
      { role: "system", content: "Respond with valid JSON only (json)." },
    ]),
    useJsonMode: true,
  };
}

/* ============================================================
 * AI 代理主逻辑
 * ============================================================ */

async function handleProxy(providerId, req, res) {
  const start = Date.now();
  const conf = PROVIDERS[providerId];

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { code: "method_not_allowed" } }, req);
    logRequest(req, 405, Date.now() - start);
    return;
  }
  if (!rateLimit(req, res)) {
    logRequest(req, 429, Date.now() - start);
    return;
  }
  if (!checkSiteToken(req)) {
    sendJson(res, 401, { error: { code: "bad_token", message: "invalid site token" } }, req);
    logRequest(req, 401, Date.now() - start);
    return;
  }
  if (!conf.key) {
    sendJson(res, 503, {
      error: {
        code: "no_key",
        message:
          conf.envKey +
          " 未配置。写入 .env 后重启 node server.js（无 Key 时前端自动回退 Mock）。",
      },
    }, req);
    logRequest(req, 503, Date.now() - start);
    return;
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req, 512 * 1024)) || "{}");
  } catch (e) {
    sendJson(res, e.status || 400, {
      error: { code: "bad_request", message: String(e.message || e) },
    }, req);
    logRequest(req, e.status || 400, Date.now() - start);
    return;
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, {
      error: { code: "bad_request", message: "messages required" },
    }, req);
    logRequest(req, 400, Date.now() - start);
    return;
  }

  const timeoutMs = Math.min(Number(payload.timeoutMs) || 60000, 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamUrl = conf.baseUrl + conf.path;
  const temperature =
    typeof payload.temperature === "number" ? payload.temperature : 0.4;
  const maxTokens = payload.max_tokens || 1200;

  try {
    let reqBody;
    let headers = { "Content-Type": "application/json" };

    if (conf.kind === "anthropic") {
      const sys = messages
        .filter((m) => m.role === "system")
        .map((m) => String(m.content || ""))
        .join("\n\n");
      const rest = messages.filter((m) => m.role !== "system");
      reqBody = {
        model: conf.model,
        max_tokens: maxTokens,
        temperature,
        ...(sys ? { system: sys } : {}),
        messages: rest.length
          ? rest
          : [{ role: "user", content: "Produce the json now." }],
      };
      headers = {
        "Content-Type": "application/json",
        "x-api-key": conf.key,
        "anthropic-version": env("ANTHROPIC_VERSION", "2023-06-01"),
      };
    } else {
      const ensured = conf.jsonMode
        ? ensureJsonWord(messages)
        : { messages, useJsonMode: false };
      reqBody = {
        model: conf.model,
        messages: ensured.messages,
        temperature,
        max_tokens: maxTokens,
        ...(ensured.useJsonMode ? { response_format: { type: "json_object" } } : {}),
      };
      headers.Authorization = "Bearer " + conf.key;
    }

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(reqBody),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      sendJson(res, 502, {
        error: { code: "upstream_bad_json", message: text.slice(0, 400) },
      }, req);
      logRequest(req, 502, Date.now() - start);
      return;
    }

    if (!upstream.ok) {
      const msg =
        (data.error && (data.error.message || data.error.type)) ||
        conf.label + " HTTP " + upstream.status;
      const retriable = upstream.status === 429 || upstream.status >= 500;
      const st = upstream.status === 401 ? 401 : 502;
      sendJson(res, st, {
        error: {
          code: upstream.status === 401 ? "bad_key" : "upstream_error",
          message: String(msg),
          retriable,
        },
      }, req);
      logRequest(req, st, Date.now() - start);
      return;
    }

    let content;
    if (conf.kind === "anthropic") {
      content = Array.isArray(data.content)
        ? data.content
            .filter((b) => b && b.type === "text")
            .map((b) => b.text)
            .join("")
        : "";
    } else {
      content =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;
    }

    if (typeof content !== "string" || !content) {
      sendJson(res, 502, {
        error: { code: "empty_content", message: "no content in upstream response" },
      }, req);
      logRequest(req, 502, Date.now() - start);
      return;
    }

    sendJson(res, 200, {
      content,
      model: data.model || conf.model,
      usage: data.usage || null,
      provider: providerId,
    }, req);
    logRequest(req, 200, Date.now() - start);
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    const st = aborted ? 504 : 502;
    sendJson(res, st, {
      error: {
        code: aborted ? "timeout" : "network",
        message: aborted
          ? conf.label + " timeout " + timeoutMs + "ms"
          : String(e.message || e),
        retriable: true,
      },
    }, req);
    logRequest(req, st, Date.now() - start);
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
 * 静态托管（HTML 含占位符，运行时替换注入 SITE_TOKEN）
 * ============================================================ */

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

/** HTML 模板渲染：替换 `<%= SITE_TOKEN %>` 等占位符 */
function renderHtml(abs, res, st) {
  fs.readFile(abs, "utf8", (err, raw) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Internal Error");
    }
    const html = raw.replace(/<%=\s*SITE_TOKEN\s*%>/g, SITE_TOKEN || "");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "no-cache",
      ...securityHeaders(),
    });
    res.end(html);
  });
}

function serveStatic(req, res) {
  const abs = safeResolve(req.url || "/");
  if (!abs) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found");
    }
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";

    // HTML 文件走模板渲染（注入 SITE_TOKEN）
    if (ext === ".html") {
      return renderHtml(abs, res, st);
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": st.size,
      "Cache-Control": "public, max-age=60",
      ...securityHeaders(),
    });
    fs.createReadStream(abs).pipe(res);
  });
}

/* ============================================================
 * 健康检查端点
 * ============================================================ */

function healthPayload() {
  const out = { ok: true, site_token: SITE_TOKEN ? "configured" : "no_token" };
  for (const [id, c] of Object.entries(PROVIDERS)) {
    out[id] = c.key ? "key_configured" : "no_key";
    out[id + "_model"] = c.model;
  }
  return out;
}

/* ============================================================
 * HTTP 服务主入口
 * ============================================================ */

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  try {
    const pathname = new URL(
      req.url,
      "http://" + (req.headers.host || "x")
    ).pathname;

    // 同源 CORS + 安全 headers（预检与所有响应共用）
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...securityHeaders(),
        ...cors,
      });
      return res.end();
    }

    const proxyMatch = pathname.match(
      /^\/api\/(deepseek|openai|doubao|anthropic)$/
    );
    if (proxyMatch) {
      return await handleProxy(proxyMatch[1], req, res);
    }

    // 轻量健康检查（无 Key、无令牌校验，专供 Docker HEALTHCHECK / load balancer）
    if (pathname === "/api/ready") {
      sendJson(res, 200, { ok: true }, req);
      logRequest(req, 200, Date.now() - start);
      return;
    }

    // 运维健康检查（返回 Key/Token 配置状态，不暴露 token 本身）
    if (pathname === "/api/health") {
      sendJson(res, 200, healthPayload(), req);
      logRequest(req, 200, Date.now() - start);
      return;
    }

    // dotfile 拦截：拦截所有以 . 开头的路径段（.env / .git / .env.example 等）
    const segs = pathname.split("/").filter(Boolean);
    if (segs.some((seg) => seg.startsWith(".")) || pathname === "/.env") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders() });
      res.end("Not Found");
      logRequest(req, 404, Date.now() - start);
      return;
    }

    return serveStatic(req, res);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, {
      error: { code: "internal", message: String(e.message || e) },
    }, req);
    logRequest(req, 500, Date.now() - start);
  }
});

server.listen(PORT, HOST, () => {
  console.log("[AI Murder Mystery] http://" + HOST + ":" + PORT + "/");
  console.log("[env] loaded: " + envPath + (envLoaded ? "" : " (no .env found)"));
  console.log(
    "[security] SITE_TOKEN=" +
      (SITE_TOKEN ? "configured" : "no_token (open mode)") +
      " ALLOWED_ORIGIN=" +
      (ALLOWED_ORIGIN || "(none, same-origin only)")
  );
  console.log(
    "[ratelimit] " + RATE_LIMIT.max + " req/min per IP"
  );
  for (const [id, c] of Object.entries(PROVIDERS)) {
    console.log(
      "[" +
        id +
        "] " +
        (c.key
          ? "KEY → live (" + c.model + ")"
          : "NO KEY (" + c.envKey + ") → mock fallback")
    );
  }
});

/* ============================================================
 * 进程级错误处理 + 优雅关闭
 * ============================================================ */
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err);
  // 不退出：保持服务可用，记录后继续
});
process.on("unhandledRejection", (reason) => {
  console.error("[WARN] unhandledRejection:", reason);
});
process.on("SIGTERM", () => {
  console.log("[SIGTERM] shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
process.on("SIGINT", () => {
  console.log("[SIGINT] shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
