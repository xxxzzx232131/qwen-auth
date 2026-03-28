/**
 * Fully automated Qwen account registration via:
 * 1. Mail.tm (free temp email API, no key required)
 * 2. Qwen chat.qwen.ai registration API (reverse-engineered)
 *
 * Flow per account:
 *   create temp email → request Qwen email code → poll inbox → extract code → register → save token
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { qwenAccountsTable } from "@workspace/db/schema";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// ─── Mail.tm API ──────────────────────────────────────────────────────────────
const MAILTM_BASE = "https://api.mail.tm";

interface MailTmDomain { domain: string; isActive: boolean; }
interface MailTmToken { token: string; id: string; }
interface MailTmMessage { id: string; subject: string; from: { address: string }; intro: string; }
interface MailTmMessageDetail { text: string; html?: string; }

async function getMailTmDomain(): Promise<string> {
  const res = await fetch(`${MAILTM_BASE}/domains?page=1`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Mail.tm domains fetch failed: ${res.status}`);
  const data = await res.json() as { "hydra:member": MailTmDomain[] };
  const active = data["hydra:member"].filter((d) => d.isActive);
  if (!active.length) throw new Error("No active Mail.tm domains available");
  return active[0].domain;
}

async function createMailTmAccount(domain: string): Promise<{ address: string; password: string; token: string }> {
  const user = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const address = `${user}@${domain}`;
  const password = `Qwen${Math.random().toString(36).slice(2, 10)}!`;

  const createRes = await fetch(`${MAILTM_BASE}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Mail.tm account creation failed: ${createRes.status} ${err}`);
  }

  const tokenRes = await fetch(`${MAILTM_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!tokenRes.ok) throw new Error(`Mail.tm token fetch failed: ${tokenRes.status}`);
  const tokenData = await tokenRes.json() as MailTmToken;

  return { address, password, token: tokenData.token };
}

async function pollMailbox(token: string, timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  while (Date.now() < deadline) {
    await sleep(4000);
    const res = await fetch(`${MAILTM_BASE}/messages?page=1`, { headers });
    if (!res.ok) continue;
    const data = await res.json() as { "hydra:member": MailTmMessage[] };
    if (data["hydra:member"].length === 0) continue;

    const msg = data["hydra:member"][0];
    const detailRes = await fetch(`${MAILTM_BASE}/messages/${msg.id}`, { headers });
    if (!detailRes.ok) continue;
    const detail = await detailRes.json() as MailTmMessageDetail;
    const body = detail.text ?? "";

    // Extract 6-digit verification code
    const match = body.match(/\b(\d{6})\b/);
    if (match) return match[1];
  }
  throw new Error("Timed out waiting for verification email");
}

// ─── Qwen Registration API ────────────────────────────────────────────────────
const QWEN_AUTH_BASE = "https://chat.qwen.ai/api/v1/auths";

async function sendQwenEmailCode(email: string, proxy?: string): Promise<void> {
  const res = await fetchWithProxy(`${QWEN_AUTH_BASE}/email/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "x-request-id": randomUUID(),
    },
    body: JSON.stringify({ email, type: "register" }),
  }, proxy);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen send code failed: ${res.status} ${err}`);
  }
  const data = await res.json() as { code?: number; message?: string };
  if (data.code !== 0 && data.code !== undefined) {
    throw new Error(`Qwen rejected code request: ${data.message ?? JSON.stringify(data)}`);
  }
}

async function registerQwenAccount(
  email: string,
  code: string,
  proxy?: string,
): Promise<{ token: string; userId: string }> {
  const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user";
  const password = `Qw${randomUUID().replace(/-/g, "").slice(0, 12)}!`;

  const res = await fetchWithProxy(`${QWEN_AUTH_BASE}/email/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "x-request-id": randomUUID(),
    },
    body: JSON.stringify({ email, code, password, username }),
  }, proxy);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen registration failed: ${res.status} ${err}`);
  }
  const data = await res.json() as { token?: string; user?: { id?: string }; code?: number; message?: string };
  if (data.code !== undefined && data.code !== 0) {
    throw new Error(`Qwen registration rejected: ${data.message ?? JSON.stringify(data)}`);
  }
  if (!data.token) throw new Error(`No token in Qwen response: ${JSON.stringify(data)}`);
  return { token: data.token, userId: data.user?.id ?? "" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithProxy(url: string, init: RequestInit, _proxy?: string): Promise<Response> {
  // Node.js 24 native fetch — proxy support via env HTTP_PROXY or undici ProxyAgent
  // For simplicity we rely on process.env.HTTP_PROXY / HTTPS_PROXY being set externally
  // or users can pass proxy URL in env. Direct fetch for now.
  return fetch(url, init);
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(ms);
}

// ─── SSE streaming batch registration ────────────────────────────────────────

router.get("/register/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const count = Math.min(Math.max(parseInt(req.query.count as string) || 1, 1), 100);
  const concurrent = Math.min(Math.max(parseInt(req.query.concurrent as string) || 1, 1), 5);
  const minDelay = Math.max(parseInt(req.query.minDelay as string) || 3000, 1000);
  const maxDelay = Math.max(parseInt(req.query.maxDelay as string) || 8000, minDelay);
  const proxy = (req.query.proxy as string) || undefined;

  let completed = 0;
  let failed = 0;
  let aborted = false;

  req.on("close", () => { aborted = true; });

  const send = (type: "log" | "success" | "fail" | "done", payload: object) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  send("log", { msg: `开始批量注册 ${count} 个账号，并发: ${concurrent}，延时: ${minDelay}-${maxDelay}ms` });

  const queue: number[] = Array.from({ length: count }, (_, i) => i + 1);
  let mailDomain: string;

  try {
    send("log", { msg: "获取临时邮箱域名..." });
    mailDomain = await getMailTmDomain();
    send("log", { msg: `使用域名: ${mailDomain}` });
  } catch (err) {
    send("log", { msg: `[ERROR] 无法获取邮箱域名: ${(err as Error).message}` });
    send("done", { completed: 0, failed: 0 });
    res.end();
    return;
  }

  const runOne = async (idx: number): Promise<void> => {
    if (aborted) return;
    const tag = `[账号 ${idx}/${count}]`;
    try {
      // 1. Create temp email
      send("log", { msg: `${tag} 创建临时邮箱...` });
      const { address, token: mailToken } = await createMailTmAccount(mailDomain);
      send("log", { msg: `${tag} 邮箱: ${address}` });

      // 2. Request Qwen verification code
      send("log", { msg: `${tag} 向 Qwen 请求注册验证码...` });
      await sendQwenEmailCode(address, proxy);
      send("log", { msg: `${tag} 验证码已发送，等待邮件...` });

      // 3. Poll inbox for code
      send("log", { msg: `${tag} 轮询邮箱中（最多60秒）...` });
      const code = await pollMailbox(mailToken, 70000);
      send("log", { msg: `${tag} 获取到验证码: ${code}` });

      // 4. Register account
      send("log", { msg: `${tag} 提交注册...` });
      const { token, userId } = await registerQwenAccount(address, code, proxy);
      send("log", { msg: `${tag} 注册成功！Token: ${token.slice(0, 16)}...` });

      // 5. Save to DB
      await db.insert(qwenAccountsTable).values({
        label: address,
        accessToken: token,
        refreshToken: null,
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // assume ~1 year
      });

      completed++;
      send("success", { idx, email: address, userId, tokenPreview: token.slice(0, 16) + "..." });
    } catch (err) {
      failed++;
      const msg = (err as Error).message;
      send("fail", { idx, msg });
      send("log", { msg: `${tag} [ERROR] ${msg}` });
    }
  };

  // Process queue with concurrency
  let activeWorkers = 0;
  let queueIdx = 0;

  await new Promise<void>((resolve) => {
    const next = async () => {
      if (aborted || queueIdx >= queue.length) {
        if (activeWorkers === 0) resolve();
        return;
      }
      const idx = queue[queueIdx++];
      activeWorkers++;

      // Add delay between starts (not first one)
      if (idx > 1) await randomDelay(minDelay, maxDelay);

      await runOne(idx);
      activeWorkers--;

      if (queueIdx < queue.length && !aborted) {
        next();
      } else if (activeWorkers === 0) {
        resolve();
      }
    };

    // Start initial concurrent workers
    for (let i = 0; i < Math.min(concurrent, count); i++) {
      next();
    }
  });

  send("done", { completed, failed, total: count });
  send("log", { msg: `─────────────────────────────────` });
  send("log", { msg: `完成: ${completed} 成功 / ${failed} 失败 / ${count} 总计` });
  res.end();
});

export default router;
