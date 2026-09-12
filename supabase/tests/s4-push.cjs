// Actual Edge handlers with in-process SQL/provider fixtures. No network/server/DB.
const fs = require("fs"),
  vm = require("vm"),
  path = require("path"),
  assert = require("assert/strict"),
  ts = require("typescript");
const root = path.resolve(__dirname, "..", "functions");
const U = "00000000-0000-4000-8000-000000000001",
  D = "00000000-0000-4000-8000-000000000010";
const attempts = [1, 2, 3].map((n) => ({
  id: `attempt-${n}`,
  device_id: `device-${n}`,
  registration_version: n,
  push_token: `ExpoPushToken[fixture_${n}]`,
  expo_ticket_id: `ticket-${n}`,
}));
const content = {
  title: "Future Self",
  body: "Original fixture words.",
  url: "futureself://feed",
  contentId: null,
  campaignId: null,
  snapshot: { body: "Original fixture words.", author: null, type: "quote" },
};
const job = {
  user_id: U,
  kind: "quote",
  local_date: new Date().toISOString().slice(0, 10),
  slot: 0,
};
function fixture(o = {}) {
  let handler,
    fetches = 0,
    offset = 0;
  const calls = [],
    writes = [],
    logs = [],
    requests = [],
    dbSignals = [];
  class FixtureDate extends Date {
    static now() {
      return Date.now() + offset;
    }
  }
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (o.advanceOnRpc === name) offset += 25_000;
    if (
      o.failOnce === name &&
      calls.filter((c) => c.name === name).length === 1
    )
      return {
        data: null,
        error: { message: "fixture response lost after commit" },
      };
    if (o.failRpc === name)
      return { data: null, error: { message: "fixture DB unavailable" } };
    if (name === "queue_read")
      return {
        data: [
          {
            msg_id: 1,
            read_ct: 1,
            enqueued_at: new Date().toISOString(),
            message: job,
          },
        ],
        error: null,
      };
    if (name === "claim_push_job")
      return {
        data: {
          outcome: o.claim ?? "claimed",
          delivery_id: D,
          lease_token: "send-lease",
          job,
          content: null,
        },
        error: null,
      };
    if (name === "prepare_push_delivery")
      return { data: { outcome: "prepared" }, error: null };
    if (name === "begin_push_send")
      return {
        data: { outcome: o.begin ?? "sending", attempts, content },
        error: null,
      };
    if (name === "finish_push_send")
      return {
        data: {
          outcome: o.finish ?? "persisted",
          ticket_ok: args.p_results.filter((r) => r.state === "ticket_ok")
            .length,
          ticket_error: args.p_results.filter((r) => r.state === "ticket_error")
            .length,
          uncertain: args.p_results.filter((r) => r.state === "uncertain")
            .length,
          retry_wait: 0,
          queue_deleted: true,
        },
        error: null,
      };
    if (name === "release_push_delivery")
      return { data: { outcome: "released" }, error: null };
    if (name === "pick_notification_content")
      return {
        data: [{ content_id: null, body: content.body, author: null }],
        error: null,
      };
    if (name === "claim_push_receipts")
      return {
        data: {
          lease_token: "receipt-lease",
          attempts,
          expired: 0,
          legacy_imported: 0,
        },
        error: null,
      };
    if (name === "finish_push_receipts")
      return {
        data: {
          outcome: "persisted",
          checked: args.p_results.length,
          receipt_ok: args.p_results.filter((r) => r.state === "receipt_ok")
            .length,
          receipt_error: args.p_results.filter(
            (r) => r.state === "receipt_error",
          ).length,
          pending: args.p_results.filter((r) => r.state === "pending").length,
        },
        error: null,
      };
    return { data: true, error: null };
  };
  const admin = {
    rpc: (...args) => {
      const pending = rpc(...args);
      pending.abortSignal = (signal) => {
        dbSignals.push(signal);
        return pending;
      };
      return pending;
    },
    from: (table) => {
      let single = false;
      const b = new Proxy(
        {},
        {
          get: (_t, k) => {
            if (k === "then")
              return (resolve, reject) =>
                Promise.resolve({
                  data:
                    table === "devices"
                      ? attempts.map((a) => ({
                          id: a.device_id,
                          push_token: a.push_token,
                          platform: "ios",
                        }))
                      : table === "notification_prefs"
                        ? {
                            quotes_per_day: 3,
                            affirmations_per_day: 3,
                            streak_reminder: true,
                            trial_reminder: true,
                          }
                        : table === "notification_deliveries"
                          ? single
                            ? { id: D, status: "queued" }
                            : [
                                {
                                  id: D,
                                  expo_ticket_id: "ticket-1",
                                  device_id: "device-1",
                                  sent_at: new Date(
                                    Date.now() - 3600000,
                                  ).toISOString(),
                                },
                              ]
                          : table === "campaigns"
                            ? []
                            : null,
                  error: null,
                }).then(resolve, reject);
            return (...args) => {
              if (["update", "upsert", "insert"].includes(k))
                writes.push({ table, op: k, args });
              if (k === "maybeSingle") single = true;
              return b;
            };
          },
        },
      );
      return b;
    },
  };
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    vm.runInNewContext(
      js,
      {
        exports,
        require: (name) => {
          if (name === "../_shared/admin.ts")
            return { createAdminClient: () => admin };
          if (name === "../_shared/auth.ts")
            return {
              requireDispatchSecret: (req) =>
                req.headers.get("x-dispatch-secret") === "fixture-secret"
                  ? null
                  : new Response("{}", { status: 401 }),
            };
          if (name.startsWith("."))
            return load(
              path.relative(root, path.resolve(path.dirname(filename), name)),
            );
          throw new Error("UNSTUBBED_IMPORT:" + name);
        },
        Request,
        Response,
        Headers,
        TextEncoder,
        TextDecoder,
        URL,
        AbortController,
        Date: FixtureDate,
        Promise,
        Set,
        Map,
        WeakMap,
        setTimeout: (fn, delay) => setTimeout(fn, o.fastTimeout ? 1 : delay),
        clearTimeout,
        console: {
          log: (...a) => logs.push(a.join(" ")),
          error: (...a) => logs.push(a.join(" ")),
        },
        Deno: { serve: (fn) => (handler = fn), env: { get: () => undefined } },
        fetch: async (url, init) => {
          fetches++;
          requests.push({ url, body: JSON.parse(init.body) });
          if (o.requireSignal) assert.ok(init.signal);
          if (o.transport === "timeout")
            return new Promise((_, reject) =>
              init.signal.addEventListener(
                "abort",
                () => reject(new Error("fixture timeout")),
                { once: true },
              ),
            );
          if (o.transport === "failure")
            throw new Error("SECRET-CANARY synthetic uncertain outcome");
          if (url.includes("getReceipts"))
            return new Response(
              JSON.stringify(
                o.receipts ?? {
                  data: {
                    "ticket-1": { status: "ok" },
                    "ticket-2": {
                      status: "error",
                      details: { error: "DeviceNotRegistered" },
                      message: "SECRET-CANARY",
                    },
                  },
                },
              ),
              { status: o.httpStatus ?? 200 },
            );
          return new Response(
            JSON.stringify(
              o.tickets ?? {
                data: [
                  { status: "ok", id: "ticket-1" },
                  {
                    status: "error",
                    details: { error: "DeviceNotRegistered" },
                    message: "SECRET-CANARY",
                  },
                  { status: "ok", id: "ticket-3" },
                ],
              },
            ),
            { status: o.httpStatus ?? 200 },
          );
        },
      },
      { filename, timeout: 1000 },
    );
    return exports;
  }
  async function call(
    kind = "dispatch",
    method = "POST",
    secret = "fixture-secret",
  ) {
    load(`push-${kind}/index.ts`);
    const response = await handler(
      new Request("http://127.0.0.1/fixture", {
        method,
        headers: { "x-dispatch-secret": secret },
      }),
    );
    return { status: response.status, body: await response.json() };
  }
  return {
    call,
    calls,
    writes,
    logs,
    requests,
    dbSignals,
    get fetches() {
      return fetches;
    },
  };
}
const cases = [];
const test = (name, run) => cases.push({ name, run });
test("busy logical delivery never reaches transport", async () => {
  const f = fixture({ claim: "busy" });
  await f.call();
  assert.equal(f.fetches, 0);
});
test("send-time eligibility rejection never reaches transport", async () => {
  const f = fixture({ begin: "skipped" });
  await f.call();
  assert.equal(f.fetches, 0);
});
test("mixed tickets preserve each exact attempt mapping", async () => {
  const f = fixture();
  await f.call();
  const done = f.calls.find((c) => c.name === "finish_push_send");
  assert.ok(done);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        done.args.p_results.map((r) => [
          r.attempt_id,
          r.state,
          r.ticket_id ?? null,
        ]),
      ),
    ),
    [
      ["attempt-1", "ticket_ok", "ticket-1"],
      ["attempt-2", "ticket_error", null],
      ["attempt-3", "ticket_ok", "ticket-3"],
    ],
  );
  assert.equal(
    f.writes.some((w) => w.table === "devices"),
    false,
  );
});
test("ambiguous transport is durable uncertain, never automatically resent", async () => {
  const f = fixture({ transport: "failure" });
  const r = await f.call();
  assert.equal(f.fetches, 1);
  const done = f.calls.find((c) => c.name === "finish_push_send");
  assert.ok(done);
  assert.ok(done.args.p_results.every((x) => x.state === "uncertain"));
  assert.equal(r.body.uncertain, 3);
  assert.equal(
    f.logs.some((l) => l.includes("SECRET-CANARY")),
    false,
  );
});
test("short or duplicate ticket response is ambiguous for the batch", async () => {
  for (const data of [
    [{ status: "ok", id: "one" }],
    [
      { status: "ok", id: "same" },
      { status: "ok", id: "same" },
      { status: "ok", id: "same" },
    ],
  ]) {
    const f = fixture({ tickets: { data } });
    await f.call();
    const done = f.calls.find((c) => c.name === "finish_push_send");
    assert.ok(done);
    assert.ok(done.args.p_results.every((x) => x.state === "uncertain"));
  }
});
test("timeout uses abort and records uncertainty", async () => {
  const f = fixture({
    transport: "timeout",
    fastTimeout: true,
    requireSignal: true,
  });
  await f.call();
  assert.equal(f.fetches, 1);
  assert.ok(
    f.calls
      .find((c) => c.name === "finish_push_send")
      .args.p_results.every((x) => x.state === "uncertain"),
  );
});
test("failed final persistence does not claim tickets or queue deletion succeeded", async () => {
  const f = fixture({ failRpc: "finish_push_send" });
  const r = await f.call();
  assert.equal(r.status, 503);
  assert.equal(r.body.ticket_ok ?? 0, 0);
  assert.equal(r.body.queue_deleted ?? 0, 0);
});
test("preparation failure releases unsent lease rather than sending", async () => {
  const f = fixture({ failRpc: "prepare_push_delivery" });
  await f.call();
  assert.equal(f.fetches, 0);
  assert.ok(f.calls.some((c) => c.name === "release_push_delivery"));
});
test("every provider request and RPC has a timeout signal", async () => {
  const f = fixture({ requireSignal: true });
  const r = await f.call();
  assert.equal(r.status, 200);
  assert.equal(f.fetches, 1);
  assert.ok(f.dbSignals.length >= 5);
  assert.ok(f.dbSignals.every((s) => s instanceof AbortSignal));
});
test("receipt outcomes map every ticket and defer missing receipt", async () => {
  const f = fixture();
  await f.call("receipts");
  const done = f.calls.find((c) => c.name === "finish_push_receipts");
  assert.ok(done);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(done.args.p_results.map((r) => [r.attempt_id, r.state])),
    ),
    [
      ["attempt-1", "receipt_ok"],
      ["attempt-2", "receipt_error"],
      ["attempt-3", "pending"],
    ],
  );
  assert.equal(
    f.writes.some((w) => w.table === "devices"),
    false,
  );
});
test("receipt persistence errors cannot inflate success stats", async () => {
  const f = fixture({ failRpc: "finish_push_receipts" });
  const r = await f.call("receipts");
  assert.equal(r.status, 503);
  assert.equal(r.body.receipt_ok ?? 0, 0);
});
test("receipt transport failure records bounded pending retry without token invalidation", async () => {
  const f = fixture({ transport: "failure" });
  const r = await f.call("receipts");
  assert.equal(r.status, 503);
  const done = f.calls.find((c) => c.name === "finish_push_receipts");
  assert.ok(done);
  assert.ok(done.args.p_results.every((x) => x.state === "pending"));
  assert.equal(
    f.writes.some((w) => w.table === "devices"),
    false,
  );
  assert.equal(
    f.logs.some((l) => l.includes("SECRET-CANARY")),
    false,
  );
});
test("worker rejects GET and unauthorized calls before database work", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const f = fixture();
    assert.equal((await f.call(kind, "GET")).status, 405);
    assert.equal((await f.call(kind, "POST", "wrong")).status, 401);
    assert.equal(f.calls.length, 0);
  }
});
test("response-loss retry repeats persistence only, with identical outcomes", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const name =
      kind === "dispatch" ? "finish_push_send" : "finish_push_receipts";
    const f = fixture({ failOnce: name });
    const r = await f.call(kind);
    assert.equal(r.status, 200);
    assert.equal(f.fetches, 1);
    const persisted = f.calls.filter((c) => c.name === name);
    assert.equal(persisted.length, 2);
    assert.equal(
      JSON.stringify(persisted[0].args),
      JSON.stringify(persisted[1].args),
    );
  }
});
test("superseded finalizer response never becomes successful send statistics", async () => {
  const f = fixture({ finish: "superseded" });
  const r = await f.call();
  assert.equal(r.status, 503);
  assert.equal(r.body.ticket_ok, 0);
  assert.equal(r.body.queue_deleted, 0);
  assert.equal(f.fetches, 1);
});
test("only explicit per-ticket rate error reaches the retry policy", async () => {
  const f = fixture({
    tickets: {
      data: [
        { status: "error", details: { error: "MessageRateExceeded" } },
        {
          status: "error",
          details: { error: "unknown-canary" },
          message: "SECRET-CANARY",
        },
        { status: "ok", id: "ticket-3" },
      ],
    },
  });
  await f.call();
  const results = f.calls.find((c) => c.name === "finish_push_send").args
    .p_results;
  assert.equal(results[0].error_code, "MessageRateExceeded");
  assert.equal(results[1].error_code, "unknown_ticket_error");
  assert.equal(JSON.stringify(results).includes("SECRET-CANARY"), false);
  assert.equal(f.fetches, 1);
});
test("malformed receipt map preserves every ticket as pending", async () => {
  const f = fixture({ receipts: { data: [] } });
  const r = await f.call("receipts");
  assert.equal(r.status, 503);
  assert.ok(
    f.calls
      .find((c) => c.name === "finish_push_receipts")
      .args.p_results.every((r) => r.state === "pending"),
  );
});
test("content preparation exhausting the time allowance cannot begin sending", async () => {
  const f = fixture({ advanceOnRpc: "prepare_push_delivery" });
  const r = await f.call();
  assert.equal(r.status, 503);
  assert.equal(f.fetches, 0);
  assert.equal(
    f.calls.some((c) => c.name === "begin_push_send"),
    false,
  );
  assert.ok(f.calls.some((c) => c.name === "release_push_delivery"));
});
test("curated content is transmitted verbatim to every attempted registration", async () => {
  const f = fixture();
  await f.call();
  assert.equal(f.requests[0].body.length, 3);
  assert.ok(
    f.requests[0].body.every(
      (m) =>
        m.body === content.body &&
        m.title === content.title &&
        m.data.delivery_id === D,
    ),
  );
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
          "in-process actual handler fixtures; SQL/RLS/queue/provider/native NOT RUN",
        results,
      },
      null,
      2,
    ),
  );
})();
