// Run from supabase/functions: deno test _shared/apple-revocation.test.ts
import assert from "node:assert/strict";
import {
  APPLE_AUTH_ORIGIN,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  buildAppleClientSecret,
  CLIENT_SECRET_TTL_SECONDS,
  pemToPkcs8,
  readAppleRevocationConfig,
  revokeAppleAuthorization,
  type AppleRevocationConfig,
} from "./apple-revocation.ts";

function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A throwaway P-256 key exported the way Apple ships .p8 files. */
async function testKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const body = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

const baseConfig = (pem: string): AppleRevocationConfig => ({
  teamId: "XH7C5Y9M67",
  keyId: "ABC123DEFG",
  clientId: "com.futureself.mobile",
  privateKey: pem,
});

Deno.test("readAppleRevocationConfig needs all four secrets", () => {
  const env = (values: Record<string, string | undefined>) => (name: string) =>
    values[name];
  const full = {
    APPLE_TEAM_ID: " XH7C5Y9M67 ",
    APPLE_KEY_ID: "ABC123DEFG",
    APPLE_CLIENT_ID: "com.futureself.mobile",
    APPLE_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
  };
  assert.deepEqual(readAppleRevocationConfig(env(full)), {
    teamId: "XH7C5Y9M67",
    keyId: "ABC123DEFG",
    clientId: "com.futureself.mobile",
    privateKey: full.APPLE_PRIVATE_KEY,
  });
  for (const missing of Object.keys(full)) {
    assert.equal(
      readAppleRevocationConfig(env({ ...full, [missing]: undefined })),
      null,
      `missing ${missing}`,
    );
    assert.equal(
      readAppleRevocationConfig(env({ ...full, [missing]: "  " })),
      null,
      `blank ${missing}`,
    );
  }
});

Deno.test(
  "pemToPkcs8 accepts PEM, escaped newlines and bare base64",
  async () => {
    const { pem } = await testKey();
    const der = pemToPkcs8(pem);
    assert.deepEqual(pemToPkcs8(pem.replace(/\n/g, "\\n")), der);
    assert.deepEqual(
      pemToPkcs8(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")),
      der,
    );
    assert.throws(() => pemToPkcs8("not a key!"), /PKCS#8/);
  },
);

Deno.test(
  "buildAppleClientSecret signs an ES256 JWT Apple will accept",
  async () => {
    const { pem, publicKey } = await testKey();
    const now = 1_757_700_000_000;
    const jwt = await buildAppleClientSecret(baseConfig(pem), now);
    const [header, claims, signature] = jwt.split(".");
    assert.ok(header && claims && signature);
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(header))),
      { alg: "ES256", kid: "ABC123DEFG", typ: "JWT" },
    );
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(claims))),
      {
        iss: "XH7C5Y9M67",
        iat: 1_757_700_000,
        exp: 1_757_700_000 + CLIENT_SECRET_TTL_SECONDS,
        aud: APPLE_AUTH_ORIGIN,
        sub: "com.futureself.mobile",
      },
    );
    const sig = base64UrlDecode(signature);
    assert.equal(sig.length, 64, "raw r||s signature");
    assert.ok(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        sig,
        new TextEncoder().encode(`${header}.${claims}`),
      ),
    );
  },
);

interface Call {
  url: string;
  form: URLSearchParams;
}
function fakeFetch(
  responses: { status: number; body?: unknown }[],
  calls: Call[],
) {
  return (input: string, init: RequestInit) => {
    calls.push({ url: input, form: new URLSearchParams(String(init.body)) });
    const next = responses.shift() ?? { status: 500 };
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: () => Promise.resolve(next.body),
      text: () => Promise.resolve(JSON.stringify(next.body ?? "")),
    });
  };
}

Deno.test(
  "revokeAppleAuthorization exchanges the code, then revokes the refresh token",
  async () => {
    const { pem } = await testKey();
    const calls: Call[] = [];
    const outcome = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de.abc",
      fetchImpl: fakeFetch(
        [
          {
            status: 200,
            body: { refresh_token: "rt-1", access_token: "at-1" },
          },
          { status: 200 },
        ],
        calls,
      ),
    });
    assert.deepEqual(outcome, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, APPLE_TOKEN_URL);
    assert.equal(calls[0].form.get("grant_type"), "authorization_code");
    assert.equal(calls[0].form.get("code"), "c0de.abc");
    assert.equal(calls[0].form.get("client_id"), "com.futureself.mobile");
    assert.match(
      calls[0].form.get("client_secret") ?? "",
      /^[\w-]+\.[\w-]+\.[\w-]+$/,
    );
    assert.equal(calls[1].url, APPLE_REVOKE_URL);
    assert.equal(calls[1].form.get("token"), "rt-1");
    assert.equal(calls[1].form.get("token_type_hint"), "refresh_token");
    assert.equal(
      calls[1].form.get("client_secret"),
      calls[0].form.get("client_secret"),
    );
  },
);

Deno.test(
  "falls back to the access token when Apple returns no refresh token",
  async () => {
    const { pem } = await testKey();
    const calls: Call[] = [];
    const outcome = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de.abc",
      fetchImpl: fakeFetch(
        [{ status: 200, body: { access_token: "at-1" } }, { status: 200 }],
        calls,
      ),
    });
    assert.deepEqual(outcome, { ok: true });
    assert.equal(calls[1].form.get("token"), "at-1");
    assert.equal(calls[1].form.get("token_type_hint"), "access_token");
  },
);

Deno.test(
  "reports, never throws, when something is missing or Apple refuses",
  async () => {
    const { pem } = await testKey();
    assert.deepEqual(
      await revokeAppleAuthorization({
        config: null,
        authorizationCode: "c0de",
        fetchImpl: fakeFetch([], []),
      }),
      { ok: false, reason: "not_configured" },
    );
    assert.deepEqual(
      await revokeAppleAuthorization({
        config: baseConfig(pem),
        authorizationCode: undefined,
        fetchImpl: fakeFetch([], []),
      }),
      { ok: false, reason: "no_authorization_code" },
    );
    const badKey = await revokeAppleAuthorization({
      config: { ...baseConfig(pem), privateKey: "garbage" },
      authorizationCode: "c0de",
      fetchImpl: fakeFetch([], []),
    });
    assert.equal(badKey.ok, false);
    assert.equal(!badKey.ok && badKey.reason, "invalid_private_key");

    const exchangeCalls: Call[] = [];
    const exchange = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de",
      fetchImpl: fakeFetch(
        [{ status: 400, body: { error: "invalid_grant" } }],
        exchangeCalls,
      ),
    });
    assert.deepEqual(exchange, {
      ok: false,
      reason: "token_exchange_failed",
      detail: "status 400",
    });
    assert.equal(exchangeCalls.length, 1, "no revoke call without a token");

    const noToken = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de",
      fetchImpl: fakeFetch([{ status: 200, body: {} }], []),
    });
    assert.equal(!noToken.ok && noToken.reason, "token_exchange_failed");

    const revoke = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de",
      fetchImpl: fakeFetch(
        [{ status: 200, body: { refresh_token: "rt" } }, { status: 400 }],
        [],
      ),
    });
    assert.deepEqual(revoke, {
      ok: false,
      reason: "revoke_failed",
      detail: "status 400",
    });

    const network = await revokeAppleAuthorization({
      config: baseConfig(pem),
      authorizationCode: "c0de",
      fetchImpl: () => Promise.reject(new Error("offline")),
    });
    assert.deepEqual(network, {
      ok: false,
      reason: "network_error",
      detail: "offline",
    });
  },
);
