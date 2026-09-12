// In-process Edge fixtures. No server, network, DB, native SDK, or credentials.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..", "functions");
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const now = Date.now();
const iso = (delta) => new Date(now + delta).toISOString();
const base = {
  id: "evt-fixture",
  type: "RENEWAL",
  app_user_id: A,
  app_id: "fixture-app",
  environment: "SANDBOX",
  event_timestamp_ms: now,
};
const env = {
  REVENUECAT_WEBHOOK_SECRET: "fixture-secret",
  REVENUECAT_WEBHOOK_APP_ID: "fixture-app",
  REVENUECAT_WEBHOOK_ENVIRONMENT: "SANDBOX",
  REVENUECAT_SECRET_API_KEY: "fixture-key",
  ENTITLEMENT_RECOVERY_SECRET: "fixture-recovery",
};
function fixture(options = {}) {
  const calls = [];
  let handler;
  let fetches = 0;
  const admin = {
    from: () => ({
      upsert: async () => ({
        error: options.failReceipt ? { message: "fixture outage" } : null,
      }),
    }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "receive_subscription_event")
        return options.failReceipt
          ? { error: { message: "fixture outage" } }
          : {
              data: { user_ids: options.targets ?? [A], status: "pending" },
              error: null,
            };
      if (name === "list_entitlement_recovery")
        return { data: options.targets ?? [A], error: null };
      if (name === "claim_entitlement_reconciliation")
        return {
          data: options.claim ?? {
            outcome: "claimed",
            lease_token: "fixture-lease",
            generation: 1,
            minimum_event_time: null,
          },
          error: null,
        };
      if (name === "finish_entitlement_reconciliation")
        return options.failApply
          ? { error: { message: "fixture apply failure" } }
          : {
              data: { outcome: options.stale ? "superseded" : "applied" },
              error: null,
            };
      return { data: null, error: null };
    },
  };
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const deps = {
      "../_shared/admin.ts": { createAdminClient: () => admin },
      "../_shared/auth.ts": {
        getUserFromRequest: async () =>
          options.unauthorized ? null : { id: A },
      },
    };
    const source = fs.readFileSync(filename, "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(
      js,
      {
        exports,
        require: (name) => {
          if (deps[name]) return deps[name];
          if (name.startsWith("."))
            return load(
              path.relative(root, path.resolve(path.dirname(filename), name)),
            );
          throw new Error("UNSTUBBED_IMPORT:" + name);
        },
        Request,
        Response,
        Headers,
        URL,
        TextEncoder,
        TextDecoder,
        AbortController,
        Date,
        Set,
        Map,
        Promise,
        setTimeout,
        clearTimeout,
        console: { error() {}, log() {} },
        fetch: async (_url, init) => {
          fetches++;
          if (options.transportFailure)
            throw new Error("fixture transport failure");
          if (options.checkSignal) assert.ok(init.signal);
          return new Response(
            JSON.stringify(
              options.payload ?? {
                subscriber: { entitlements: {}, subscriptions: {} },
              },
            ),
            { status: options.providerStatus ?? 200 },
          );
        },
        Deno: {
          env: { get: (key) => (options.env ?? env)[key] },
          serve: (fn) => {
            handler = fn;
          },
        },
      },
      { filename, timeout: 1000 },
    );
    return exports;
  }
  const call = async (event = base, extra = {}) => {
    load("revenuecat-webhook/index.ts");
    return handler(
      new Request("http://127.0.0.1/fixture", {
        method: "POST",
        headers: { Authorization: "fixture-secret" },
        body: JSON.stringify({ event }),
        ...extra,
      }),
    );
  };
  const sync = async (
    headers = { Authorization: "Bearer fixture-jwt" },
    body = {},
  ) => {
    load("sync-entitlement/index.ts");
    return handler(
      new Request("http://127.0.0.1/fixture", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  };
  return {
    load,
    call,
    sync,
    calls,
    get fetches() {
      return fetches;
    },
  };
}
const cases = [];
const test = (name, run) => cases.push({ name, run });
test("receipt outage is retryable, never acknowledged as 200", async () => {
  assert.equal((await fixture({ failReceipt: true }).call()).status, 503);
});
test("webhook target must be explicitly configured", async () => {
  const f = fixture({ env: { REVENUECAT_WEBHOOK_SECRET: "fixture-secret" } });
  assert.equal((await f.call()).status, 503);
  assert.equal(f.fetches, 0);
});
test("wrong app and environment cannot change entitlement", async () => {
  const f = fixture();
  assert.equal((await f.call({ ...base, app_id: "foreign" })).status, 400);
  assert.equal(f.fetches, 0);
  assert.equal(f.calls.length, 0);
});
test("transfer reconciles every returned UUID target", async () => {
  const f = fixture({ targets: [A, B] });
  assert.equal(
    (
      await f.call({
        ...base,
        type: "TRANSFER",
        app_user_id: undefined,
        transferred_from: [A],
        transferred_to: [B],
      })
    ).status,
    200,
  );
  assert.equal(f.fetches, 2);
  assert.deepEqual(
    f.calls
      .filter((c) => c.name === "finish_entitlement_reconciliation")
      .map((c) => c.args.p_user),
    [A, B],
  );
});
test("duplicate receipt still drives unfinished reconciliation", async () => {
  const f = fixture();
  await f.call();
  await f.call();
  assert.equal(
    f.calls.filter((c) => c.name === "receive_subscription_event").length,
    2,
  );
  assert.equal(
    f.calls.filter((c) => c.name === "finish_entitlement_reconciliation")
      .length,
    2,
  );
});
test("malformed canonical payload never revokes existing access", async () => {
  const f = fixture({ payload: { subscriber: {} } });
  assert.equal((await f.sync()).status, 503);
  assert.equal(
    f.calls.some((c) => c.name === "finish_entitlement_reconciliation"),
    false,
  );
  assert.equal(
    f.calls.some((c) => c.name === "fail_entitlement_reconciliation"),
    true,
  );
});
test("failed apply remains retryable after durable receipt", async () => {
  assert.equal((await fixture({ failApply: true }).call()).status, 503);
});
test("successful webhook does not return its stale pending receipt status", async () => {
  const response = await fixture().call();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "accepted");
});
test("superseded generation is not reported synchronized", async () => {
  assert.equal((await fixture({ stale: true }).sync()).status, 503);
});
test("busy and rate-limited claims make no provider request", async () => {
  for (const outcome of ["busy", "rate_limited"]) {
    const f = fixture({ claim: { outcome, retry_after_seconds: 60 } });
    assert.ok([202, 429].includes((await f.sync()).status));
    assert.equal(f.fetches, 0);
  }
});
test("fresh sync serves server state without a provider request", async () => {
  const f = fixture({ claim: { outcome: "fresh", is_premium: true } });
  const r = await f.sync();
  assert.equal(r.status, 200);
  assert.equal((await r.json()).is_premium, true);
  assert.equal(f.fetches, 0);
});
test("transport failure releases through durable failure gate", async () => {
  const f = fixture({ transportFailure: true });
  assert.equal((await f.sync()).status, 503);
  assert.equal(
    f.calls.filter((c) => c.name === "fail_entitlement_reconciliation").length,
    1,
  );
});
test("provider fetch has an abort signal", async () => {
  assert.equal((await fixture({ checkSignal: true }).sync()).status, 200);
});
test("bounded recovery requires its separate service secret", async () => {
  const f = fixture({ unauthorized: true });
  assert.equal(
    (
      await f.sync(
        { "x-entitlement-recovery-secret": "wrong" },
        { recover: true },
      )
    ).status,
    401,
  );
  assert.equal(f.calls.length, 0);
});
test("authenticated client cannot select another reconciliation identity", async () => {
  const f = fixture();
  await f.sync(undefined, { user_id: B });
  assert.equal(
    f.calls.find((c) => c.name === "claim_entitlement_reconciliation").args
      .p_user,
    A,
  );
});
test("canonical lifetime aggregate is not capped by newer monthly purchase", () => {
  const f = fixture();
  const p = f.load("_shared/entitlement-reconciliation.ts").parseSubscriber;
  const value = p(
    {
      subscriber: {
        entitlements: {
          legacy: {
            expires_date: null,
            purchase_date: iso(-5000),
            product_identifier: "lifetime",
          },
          premium: {
            expires_date: iso(5000),
            purchase_date: iso(-1000),
            product_identifier: "monthly",
          },
        },
        subscriptions: {},
      },
    },
    now,
  );
  assert.equal(value.is_premium, true);
  assert.equal(value.expires_at, null);
  assert.equal(value.product_id, "monthly");
});
test("finite aggregate uses maximum expiry and separate trial expiry", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  const value = p(
    {
      subscriber: {
        entitlements: {
          a: {
            expires_date: iso(9000),
            purchase_date: iso(-5000),
            product_identifier: "annual",
          },
          b: {
            expires_date: iso(3000),
            purchase_date: iso(-1000),
            product_identifier: "monthly",
          },
        },
        subscriptions: { monthly: { period_type: "trial" } },
      },
    },
    now,
  );
  assert.equal(value.expires_at, iso(9000));
  assert.equal(value.trial_expires_at, iso(3000));
});
test("expired trial in grace retains its actual past trial end", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  const value = p(
    {
      subscriber: {
        entitlements: {
          a: { expires_date: iso(-1000), product_identifier: "monthly" },
        },
        subscriptions: {
          monthly: {
            period_type: "trial",
            grace_period_expires_date: iso(86400000),
          },
        },
      },
    },
    now,
  );
  assert.equal(value.is_premium, true);
  assert.equal(value.expires_at, iso(86400000));
  assert.equal(value.trial_expires_at, iso(-1000));
});
test("another active entitlement does not replace an ended trial timestamp", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  const value = p(
    {
      subscriber: {
        entitlements: {
          trial: {
            expires_date: iso(-1000),
            purchase_date: iso(-2000),
            product_identifier: "monthly",
          },
          other: {
            expires_date: iso(31536000000),
            purchase_date: iso(-5000),
            product_identifier: "annual",
          },
        },
        subscriptions: {
          monthly: {
            period_type: "trial",
            grace_period_expires_date: iso(86400000),
          },
        },
      },
    },
    now,
  );
  assert.equal(value.is_premium, true);
  assert.equal(value.expires_at, iso(31536000000));
  assert.equal(value.period_type, "trial");
  assert.equal(value.trial_expires_at, iso(-1000));
});
test("malformed expiry, omitted expiry and missing map cannot grant or revoke", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  for (const body of [
    { subscriber: {} },
    { subscriber: { entitlements: { a: {} } } },
    { subscriber: { entitlements: { a: { expires_date: "nonsense" } } } },
  ])
    assert.throws(() => p(body, now));
});
test("impossible calendar expiry is malformed, not a future entitlement", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  assert.throws(() =>
    p(
      {
        subscriber: {
          entitlements: { a: { expires_date: "2027-02-30T12:00:00Z" } },
        },
      },
      now,
    ),
  );
});
test("canonical request older than durable event remains pending", async () => {
  const f = fixture({
    claim: {
      outcome: "claimed",
      lease_token: "fixture-lease",
      generation: 2,
      minimum_event_time: iso(0),
    },
    payload: {
      request_date_ms: now - 1000,
      subscriber: { entitlements: {}, subscriptions: {} },
    },
  });
  assert.equal((await f.call()).status, 503);
  assert.equal(
    f.calls.some((c) => c.name === "finish_entitlement_reconciliation"),
    false,
  );
});
test("explicit empty map revokes while valid grace preserves access", () => {
  const p = fixture().load(
    "_shared/entitlement-reconciliation.ts",
  ).parseSubscriber;
  assert.equal(
    p({ subscriber: { entitlements: {}, subscriptions: {} } }, now).is_premium,
    false,
  );
  const value = p(
    {
      subscriber: {
        entitlements: {
          a: { expires_date: iso(-1000), product_identifier: "monthly" },
        },
        subscriptions: { monthly: { grace_period_expires_date: iso(3000) } },
      },
    },
    now,
  );
  assert.equal(value.is_premium, true);
  assert.equal(value.expires_at, iso(3000));
});
test("oversized webhook is rejected before durable writes", async () => {
  const f = fixture();
  assert.equal(
    (await f.call({ ...base, unused: "x".repeat(70000) })).status,
    413,
  );
  assert.equal(f.calls.length, 0);
});
(async () => {
  const results = [];
  for (const c of cases) {
    try {
      await c.run();
      results.push({ case: c.name, status: "passed" });
    } catch (e) {
      results.push({ case: c.name, status: "failed", error: e.message });
      process.exitCode = 1;
    }
  }
  console.log(
    JSON.stringify(
      {
        scope:
          "synthetic in-process Edge/helper fixtures; SQL/RLS/provider/native NOT RUN",
        results,
      },
      null,
      2,
    ),
  );
})();
