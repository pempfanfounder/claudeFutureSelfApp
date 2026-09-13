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
    if (
      o.failWith?.name === name &&
      calls.filter((c) => c.name === name).length <= (o.failWith.times ?? 1e9)
    )
      return { data: null, error: o.failWith.error, status: o.failWith.status };
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
        data:
          "claimData" in o
            ? o.claimData
            : {
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
// postgrest-js shapes: a failed fetch resolves with status 0 and code "";
// PostgREST/Kong errors carry the HTTP status and, for PostgREST, a code.
const transport = {
  error: {
    message:
      "TypeError: error sending request for url (https://x.supabase.co/rest/v1/rpc/queue_read): connection reset",
    details: "STACK-CANARY",
    hint: "",
    code: "",
  },
  status: 0,
};
const pgrst503 = {
  error: {
    message: "Database connection error. Retrying the connection.",
    details: "SQL-CANARY",
    hint: "HINT-CANARY",
    code: "PGRST001",
  },
  status: 503,
};
const sqlError = {
  error: {
    message: "invalid queue read",
    details: "SQL-CANARY select 1",
    hint: "HINT-CANARY",
    code: "P0001",
  },
  status: 400,
};
const rpcLogs = (f) =>
  f.logs
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l))
    .filter((l) => l.event === "push_rpc_failure");
const firstRpc = { dispatch: "queue_read", receipts: "claim_push_receipts" };
test("first RPC transport failure is retried once and the run succeeds", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const f = fixture({
      failWith: { name: firstRpc[kind], ...transport, times: 1 },
      fastTimeout: true,
    });
    const r = await f.call(kind);
    assert.equal(r.status, 200, kind);
    assert.equal(f.calls.filter((c) => c.name === firstRpc[kind]).length, 2);
    const logged = rpcLogs(f);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].step, firstRpc[kind]);
    assert.equal(logged[0].function, `push-${kind}`);
    assert.equal(logged[0].reason, "rpc_error");
    assert.equal(logged[0].status, 0);
    assert.equal(logged[0].transient, true);
    assert.equal(logged[0].attempt, 0);
    assert.equal(logged[0].aborted, false);
    assert.equal(typeof logged[0].elapsed_ms, "number");
    assert.equal(typeof logged[0].deadline_ms, "number");
    assert.ok(logged[0].message.startsWith("TypeError: error sending request"));
  }
});
test("persistent 5xx on the first RPC yields one retry and a 503 with the cause", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const f = fixture({
      failWith: { name: firstRpc[kind], ...pgrst503 },
      fastTimeout: true,
    });
    const r = await f.call(kind);
    assert.equal(r.status, 503);
    assert.equal(f.calls.filter((c) => c.name === firstRpc[kind]).length, 2);
    assert.equal(f.fetches, 0);
    assert.deepEqual(r.body, {
      ok: false,
      error:
        kind === "dispatch" ? "queue unavailable" : "receipt claim unavailable",
      reason: "rpc_error",
      step: firstRpc[kind],
      code: "PGRST001",
      status: 503,
    });
    assert.deepEqual(
      rpcLogs(f).map((l) => l.attempt),
      [0, 1],
    );
    const all = f.logs.join("\n") + JSON.stringify(r.body);
    assert.equal(all.includes("CANARY"), false);
  }
});
test("SQL/client errors on the first RPC are not retried and keep their code", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const f = fixture({ failWith: { name: firstRpc[kind], ...sqlError } });
    const r = await f.call(kind);
    assert.equal(r.status, 503);
    assert.equal(f.calls.filter((c) => c.name === firstRpc[kind]).length, 1);
    assert.equal(r.body.reason, "rpc_error");
    assert.equal(r.body.code, "P0001");
    assert.equal(r.body.status, 400);
    const logged = rpcLogs(f);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].transient, false);
    assert.equal(logged[0].message, "invalid queue read");
    assert.equal(
      (f.logs.join("\n") + JSON.stringify(r.body)).includes("CANARY"),
      false,
    );
  }
});
test("legacy error shape without status is not treated as transient", async () => {
  for (const kind of ["dispatch", "receipts"]) {
    const f = fixture({ failRpc: firstRpc[kind] });
    const r = await f.call(kind);
    assert.equal(r.status, 503);
    assert.equal(f.calls.filter((c) => c.name === firstRpc[kind]).length, 1);
    assert.equal(r.body.reason, "rpc_error");
    assert.equal(r.body.code, undefined);
  }
});
test("later lease-bearing RPCs are never retried by the transport policy", async () => {
  // claim_push_job: a lost response would leave an unrecoverable duplicate
  // claim, so it stays single-shot and only the message counts as failed.
  const f = fixture({
    failWith: { name: "claim_push_job", ...transport },
    fastTimeout: true,
  });
  const r = await f.call();
  assert.equal(r.status, 503);
  assert.equal(f.calls.filter((c) => c.name === "claim_push_job").length, 1);
  assert.equal(f.fetches, 0);
  assert.equal(r.body.persistence_errors, 1);
  assert.equal(r.body.reason, "message_failures");
  const logged = rpcLogs(f);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].step, "claim_push_job");
  assert.equal(logged[0].msg_id, 1);
  // finish_push_send keeps its existing response-loss retry (2 attempts).
  const g = fixture({ failWith: { name: "finish_push_send", ...pgrst503 } });
  const s = await g.call();
  assert.equal(s.status, 503);
  assert.equal(g.calls.filter((c) => c.name === "finish_push_send").length, 2);
  assert.deepEqual(
    rpcLogs(g)
      .filter((l) => l.step === "finish_push_send")
      .map((l) => [l.attempt, l.code, l.delivery_id]),
    [
      [0, "PGRST001", D],
      [1, "PGRST001", D],
    ],
  );
});
test("receipt persistence 503 body names the failing step and code", async () => {
  const f = fixture({
    failWith: { name: "finish_push_receipts", ...pgrst503 },
  });
  const r = await f.call("receipts");
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, {
    ok: false,
    error: "receipt persistence unavailable",
    reason: "rpc_error",
    step: "finish_push_receipts",
    code: "PGRST001",
    status: 503,
    checked: 0,
  });
  assert.equal(f.logs.join("\n").includes("CANARY"), false);
});
test("shape rejections and provider failures are reported without payloads", async () => {
  const f = fixture({ claimData: "not-a-record" });
  const r = await f.call();
  assert.equal(r.status, 503);
  const logged = rpcLogs(f);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].reason, "invalid_response");
  assert.equal(logged[0].step, "process_message");
  assert.equal(logged[0].message, "invalid claim");
  const g = fixture({ transport: "failure" });
  const s = await g.call("receipts");
  assert.equal(s.status, 503);
  assert.equal(s.body.reason, "provider_unavailable");
  const provider = g.logs
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l))
    .filter((l) => l.event === "push_provider_failure");
  assert.equal(provider.length, 1);
  assert.equal(provider[0].step, "expo_get_receipts");
  assert.equal(provider[0].aborted, false);
  assert.equal(provider[0].message, undefined);
  assert.equal(g.logs.join("\n").includes("SECRET-CANARY"), false);
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
