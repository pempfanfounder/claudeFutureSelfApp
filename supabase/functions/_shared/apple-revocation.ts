// Sign in with Apple token revocation (App Store Guideline 5.1.1(v)).
//
// The app signs in natively (identity token -> supabase.auth.linkIdentity),
// so no Apple refresh token is ever retained server-side. At deletion the
// client re-runs the native Apple sheet and sends the short-lived
// authorization code; this module exchanges it for a refresh token at
// /auth/token and revokes it at /auth/revoke. Both calls authenticate
// with a client secret JWT signed by the team's Sign in with Apple key.
//
// Every failure is reported, never thrown: deletion must still complete.

export interface AppleRevocationConfig {
  /** Apple Developer team id (e.g. XH7C5Y9M67). */
  teamId: string;
  /** Key id of the Sign in with Apple private key (.p8). */
  keyId: string;
  /** Native flows use the app's bundle id as client_id. */
  clientId: string;
  /** The .p8 contents (PEM, with or without header lines / escaped \n). */
  privateKey: string;
}

export const APPLE_AUTH_ORIGIN = "https://appleid.apple.com";
export const APPLE_TOKEN_URL = `${APPLE_AUTH_ORIGIN}/auth/token`;
export const APPLE_REVOKE_URL = `${APPLE_AUTH_ORIGIN}/auth/revoke`;
/** Apple caps client secrets at six months; ten minutes is plenty here. */
export const CLIENT_SECRET_TTL_SECONDS = 600;
export const APPLE_REQUEST_TIMEOUT_MS = 8_000;

export type AppleRevocationOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "no_authorization_code"
        | "invalid_private_key"
        | "token_exchange_failed"
        | "revoke_failed"
        | "network_error";
      detail?: string;
    };

/** Reads the four APPLE_* function secrets; null when any is missing. */
export function readAppleRevocationConfig(
  env: (name: string) => string | undefined,
): AppleRevocationConfig | null {
  const teamId = env("APPLE_TEAM_ID")?.trim();
  const keyId = env("APPLE_KEY_ID")?.trim();
  const clientId = env("APPLE_CLIENT_ID")?.trim();
  const privateKey = env("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !clientId || !privateKey?.trim()) return null;
  return { teamId, keyId, clientId, privateKey };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/** Accepts a PEM (.p8), a PEM with `\n` escapes, or the bare base64 body. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+=*$/.test(body))
    throw new Error("private key is not base64 PKCS#8");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * ES256 client secret per
 * https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 */
export async function buildAppleClientSecret(
  config: AppleRevocationConfig,
  nowMs: number = Date.now(),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const issuedAt = Math.floor(nowMs / 1000);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const claims = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUTH_ORIGIN,
    sub: config.clientId,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  // WebCrypto returns the raw r||s form JWS requires (no DER wrapping).
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json" | "text">>;

async function postForm(
  fetchImpl: FetchLike,
  url: string,
  form: Record<string, string>,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchanges the authorization code for a refresh token and revokes it.
 * Never throws; the caller logs the outcome and deletes the user anyway.
 */
export async function revokeAppleAuthorization(options: {
  config: AppleRevocationConfig | null;
  authorizationCode: string | undefined;
  fetchImpl?: FetchLike;
  nowMs?: number;
  timeoutMs?: number;
}): Promise<AppleRevocationOutcome> {
  const {
    config,
    authorizationCode,
    fetchImpl = fetch as FetchLike,
    nowMs = Date.now(),
    timeoutMs = APPLE_REQUEST_TIMEOUT_MS,
  } = options;
  if (!config) return { ok: false, reason: "not_configured" };
  if (!authorizationCode) return { ok: false, reason: "no_authorization_code" };
  let clientSecret: string;
  try {
    clientSecret = await buildAppleClientSecret(config, nowMs);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_private_key",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const exchange = await postForm(
      fetchImpl,
      APPLE_TOKEN_URL,
      {
        grant_type: "authorization_code",
        code: authorizationCode,
        client_id: config.clientId,
        client_secret: clientSecret,
      },
      timeoutMs,
    );
    if (!exchange.ok)
      return {
        ok: false,
        reason: "token_exchange_failed",
        detail: `status ${exchange.status}`,
      };
    const tokens = (await exchange.json()) as {
      refresh_token?: unknown;
      access_token?: unknown;
    };
    const token =
      typeof tokens.refresh_token === "string"
        ? { value: tokens.refresh_token, hint: "refresh_token" }
        : typeof tokens.access_token === "string"
          ? { value: tokens.access_token, hint: "access_token" }
          : null;
    if (!token)
      return {
        ok: false,
        reason: "token_exchange_failed",
        detail: "no token in response",
      };
    const revoke = await postForm(
      fetchImpl,
      APPLE_REVOKE_URL,
      {
        client_id: config.clientId,
        client_secret: clientSecret,
        token: token.value,
        token_type_hint: token.hint,
      },
      timeoutMs,
    );
    if (!revoke.ok)
      return {
        ok: false,
        reason: "revoke_failed",
        detail: `status ${revoke.status}`,
      };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "network_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
