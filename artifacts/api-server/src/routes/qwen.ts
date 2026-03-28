import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { qwenAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { randomUUID } from "crypto";
import {
  RequestDeviceCodeResponse,
  PollTokenBody,
  PollTokenResponse,
  SaveCredentialsBody,
  SaveCredentialsResponse,
  GetCredentialsResponse,
  ListAccountsResponse,
  VerifyTokenBody,
  VerifyTokenResponse,
  RefreshTokenBody,
  RefreshTokenResponse,
  DeleteAccountBody,
  DeleteAccountResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Correct Qwen OAuth2 endpoints (from official qwen-code source) ───────────
const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
const QWEN_DEVICE_CODE_URL = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_TOKEN_URL = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_SCOPE = "openid profile email model.completion";
const QWEN_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// Verify API endpoint
const QWEN_API_URL = "https://chat.qwen.ai/api/chat/completions";

// ─── PKCE helpers (RFC 7636) ──────────────────────────────────────────────────
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// In-memory store for PKCE verifiers, keyed by device_code (auto-expires naturally)
const pkceStore = new Map<string, string>(); // device_code -> code_verifier

function objectToUrlEncoded(data: Record<string, string>): string {
  return Object.keys(data)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
    .join("&");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/device-code", async (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const body = objectToUrlEncoded({
      client_id: QWEN_CLIENT_ID,
      scope: QWEN_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(QWEN_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "x-request-id": randomUUID(),
        "User-Agent": "qwen-code/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const rawText = await response.text();

    if (!response.ok) {
      req.log.error({ status: response.status, body: rawText }, "Device code request failed");
      res.status(500).json({
        error: "upstream_error",
        message: `Qwen returned ${response.status}: ${rawText}`,
      });
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      res.status(500).json({ error: "parse_error", message: `Failed to parse response: ${rawText}` });
      return;
    }

    const deviceCode = data.device_code as string;
    if (!deviceCode) {
      res.status(500).json({ error: "missing_device_code", message: "Response missing device_code" });
      return;
    }

    // Store PKCE verifier for polling
    pkceStore.set(deviceCode, codeVerifier);

    // Clean up old entries after 15 minutes (device codes expire in 10)
    setTimeout(() => pkceStore.delete(deviceCode), 15 * 60 * 1000);

    const deviceCodeResp = RequestDeviceCodeResponse.parse({
      device_code: deviceCode,
      user_code: data.user_code as string | undefined,
      verification_uri: (data.verification_uri as string | undefined) ?? `${QWEN_OAUTH_BASE_URL}/device`,
      verification_uri_complete: data.verification_uri_complete as string | undefined,
      expires_in: (data.expires_in as number | undefined) ?? 600,
      interval: (data.interval as number | undefined) ?? 5,
    });

    res.json(deviceCodeResp);
  } catch (err) {
    req.log.error({ err }, "Failed to request device code");
    res.status(500).json({ error: "request_failed", message: String(err) });
  }
});

router.post("/poll-token", async (req, res) => {
  try {
    const body = PollTokenBody.parse(req.body);

    const codeVerifier = pkceStore.get(body.device_code);
    if (!codeVerifier) {
      res.json(PollTokenResponse.parse({
        status: "expired",
        message: "设备码已过期或无效，请重新获取",
      }));
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(QWEN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "qwen-code/1.0",
      },
      body: objectToUrlEncoded({
        grant_type: QWEN_GRANT_TYPE,
        client_id: QWEN_CLIENT_ID,
        device_code: body.device_code,
        code_verifier: codeVerifier,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const rawText = await response.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      res.status(500).json({ error: "parse_error", message: `Failed to parse response: ${rawText}` });
      return;
    }

    const errorCode = data.error as string | undefined;

    if (!response.ok || errorCode) {
      if (
        errorCode === "authorization_pending" ||
        errorCode === "slow_down" ||
        response.status === 428
      ) {
        res.json(PollTokenResponse.parse({ status: "pending", message: "等待用户授权..." }));
        return;
      }
      if (
        errorCode === "expired_token" ||
        errorCode === "access_denied" ||
        errorCode === "device_code_expired"
      ) {
        pkceStore.delete(body.device_code);
        res.json(PollTokenResponse.parse({ status: "expired", message: `授权失败: ${errorCode}` }));
        return;
      }
      res.json(PollTokenResponse.parse({ status: "error", message: `错误: ${errorCode ?? response.status}` }));
      return;
    }

    const accessToken = data.access_token as string;
    if (!accessToken) {
      res.json(PollTokenResponse.parse({ status: "pending", message: "等待用户授权..." }));
      return;
    }

    // Clean up PKCE store on success
    pkceStore.delete(body.device_code);

    res.json(PollTokenResponse.parse({
      status: "authorized",
      access_token: accessToken,
      refresh_token: data.refresh_token as string | undefined,
      expires_in: data.expires_in as number | undefined,
      token_type: (data.token_type as string | undefined) ?? "Bearer",
      message: "授权成功!",
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to poll token");
    res.status(500).json({ error: "request_failed", message: String(err) });
  }
});

router.post("/save-credentials", async (req, res) => {
  try {
    const body = SaveCredentialsBody.parse(req.body);

    const expiresAt = body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000)
      : undefined;

    const [account] = await db
      .insert(qwenAccountsTable)
      .values({
        label: body.label ?? null,
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? null,
        tokenType: body.token_type ?? "Bearer",
        expiresAt: expiresAt ?? null,
      })
      .returning();

    res.json(SaveCredentialsResponse.parse({
      success: true,
      file_path: `db://qwen_accounts/${account.id}`,
      message: `凭证已保存 (ID: ${account.id})`,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to save credentials");
    res.status(500).json({ error: "save_failed", message: String(err) });
  }
});

router.get("/credentials", async (req, res) => {
  try {
    const [latest] = await db
      .select()
      .from(qwenAccountsTable)
      .orderBy(qwenAccountsTable.createdAt)
      .limit(1);

    if (!latest) {
      res.status(404).json({ error: "not_found", message: "未找到凭证" });
      return;
    }

    const isExpired = latest.expiresAt ? latest.expiresAt < new Date() : false;
    res.json(GetCredentialsResponse.parse({
      has_credentials: true,
      expires_at: latest.expiresAt?.toISOString(),
      is_expired: isExpired,
      label: latest.label ?? undefined,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to get credentials");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

router.get("/accounts", async (_req, res) => {
  try {
    const accounts = await db
      .select()
      .from(qwenAccountsTable)
      .orderBy(qwenAccountsTable.createdAt);

    const now = new Date();
    res.json(ListAccountsResponse.parse({
      accounts: accounts.map((acc) => ({
        id: acc.id,
        label: acc.label ?? undefined,
        created_at: acc.createdAt.toISOString(),
        expires_at: acc.expiresAt?.toISOString(),
        is_expired: acc.expiresAt ? acc.expiresAt < now : false,
        access_token_preview: acc.accessToken.slice(0, 12) + "...",
      })),
      total: accounts.length,
    }));
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const body = VerifyTokenBody.parse(req.body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(QWEN_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${body.access_token}`,
        "Content-Type": "application/json",
        "User-Agent": "qwen-code/1.0",
      },
      body: JSON.stringify({
        model: "qwen-max",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      res.json(VerifyTokenResponse.parse({ valid: false, message: "Token已失效" }));
      return;
    }
    if (response.ok || response.status === 429) {
      res.json(VerifyTokenResponse.parse({ valid: true, message: "Token有效" }));
      return;
    }
    res.json(VerifyTokenResponse.parse({ valid: false, message: `HTTP ${response.status}` }));
  } catch (err) {
    res.json(VerifyTokenResponse.parse({ valid: false, message: String(err) }));
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const body = RefreshTokenBody.parse(req.body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(QWEN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "qwen-code/1.0",
      },
      body: objectToUrlEncoded({
        grant_type: "refresh_token",
        client_id: QWEN_CLIENT_ID,
        refresh_token: body.refresh_token,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      res.status(500).json({ error: "refresh_failed", message: `Qwen returned ${response.status}: ${errText}` });
      return;
    }

    const data = await response.json() as Record<string, unknown>;
    res.json(RefreshTokenResponse.parse({
      access_token: data.access_token as string,
      refresh_token: (data.refresh_token as string | undefined) ?? body.refresh_token,
      expires_in: data.expires_in as number | undefined,
      token_type: (data.token_type as string | undefined) ?? "Bearer",
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to refresh token");
    res.status(500).json({ error: "refresh_failed", message: String(err) });
  }
});

router.delete("/delete-account", async (req, res) => {
  try {
    const body = DeleteAccountBody.parse(req.body);

    const deleted = await db
      .delete(qwenAccountsTable)
      .where(eq(qwenAccountsTable.id, body.id))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "not_found", message: "账号未找到" });
      return;
    }

    res.json(DeleteAccountResponse.parse({ success: true, message: "账号已删除" }));
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "delete_failed", message: String(err) });
  }
});

export default router;
