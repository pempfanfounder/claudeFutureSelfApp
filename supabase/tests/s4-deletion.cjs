// Actual deletion handler with synthetic in-process auth/database transports.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const crypto = require("node:crypto").webcrypto;
const root = path.resolve(__dirname, "../functions");
const A = "00000000-0000-4000-8000-000000000001";
const nonce = "11111111-1111-4111-8111-111111111111";
function fixture(options = {}) {
  let handler,
    deleted = false,
    deleteCalls = 0;
  const rows = new Map();
  const budgetCalls = [];
  const admin = {
    rpc: async (name, args) => {
      assert.equal(name, "consume_backend_budget");
      budgetCalls.push(args);
      return {
        data: { allowed: args.p_operation !== options.exhaustedOperation },
        error: null,
      };
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          assert.equal(id, A);
          deleteCalls++;
          if (options.deleteFails) return { error: { message: "synthetic" } };
          deleted = true;
          return { error: null };
        },
        getUserById: async (id) => ({
          data: { user: deleted ? null : { id } },
          error: deleted ? { code: "user_not_found", status: 404 } : null,
        }),
      },
    },
    from: (table) => {
      assert.equal(table, "account_deletion_receipts");
      return {
        select: () => ({
          eq: (_key, hash) => ({
            maybeSingle: async () => ({
              data: rows.get(hash) ?? null,
              error: null,
            }),
          }),
        }),
        upsert: async (row) => {
          if (!rows.has(row.nonce_hash))
            rows.set(row.nonce_hash, {
              ...row,
              user_id: options.reservationRace
                ? "00000000-0000-4000-8000-000000000002"
                : row.user_id,
              confirmed_at: null,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            });
          return { error: null };
        },
        update: (changes) => ({
          eq: (_key, hash) => ({
            eq: (_key2, user) => ({
              select: () => ({
                maybeSingle: async () => {
                  if (options.failConfirmationOnce) {
                    options.failConfirmationOnce = false;
                    return { error: { message: "synthetic" } };
                  }
                  const row = rows.get(hash);
                  if (row?.user_id === user) Object.assign(row, changes);
                  return {
                    data: options.zeroConfirmation
                      ? null
                      : row?.user_id === user
                        ? row
                        : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      };
    },
  };
  const cache = new Map();
  function load(name) {
    const filename = path.resolve(root, name);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = fs.readFileSync(filename, "utf8");
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        exports,
        require: (n) =>
          n === "../_shared/admin.ts"
            ? { createAdminClient: () => admin }
            : n === "../_shared/auth.ts"
              ? {
                  getUserFromRequest: async () =>
                    options.unauthorized || deleted ? null : { id: A },
                }
              : n.startsWith(".")
                ? load(
                    path.relative(
                      root,
                      path.resolve(path.dirname(filename), n),
                    ),
                  )
                : (() => {
                    throw Error("UNSTUBBED " + n);
                  })(),
        Request,
        Response,
        Headers,
        TextEncoder,
        TextDecoder,
        Date,
        crypto,
        console: { error() {} },
        Deno: {
          serve: (fn) => {
            handler = fn;
          },
        },
      },
      { filename, timeout: 1000 },
    );
    return exports;
  }
  load("delete-account/index.ts");
  return {
    call: (body) =>
      handler(
        new Request("http://127.0.0.1/fixture", {
          method: "POST",
          headers: { Authorization: "Bearer synthetic" },
          body: JSON.stringify(body),
        }),
      ),
    get deletes() {
      return deleteCalls;
    },
    get budgetCalls() {
      return budgetCalls;
    },
  };
}
(async () => {
  const lost = fixture();
  assert.equal((await lost.call({ receipt: nonce })).status, 200);
  const retry = await lost.call({ receipt: nonce });
  assert.equal(
    retry.status,
    200,
    "lost response retry must return the verified deletion receipt",
  );
  assert.equal((await retry.json()).deleted_user_id, A);
  assert.equal(lost.deletes, 1);
  const partial = fixture({ failConfirmationOnce: true });
  assert.equal((await partial.call({ receipt: nonce })).status, 503);
  assert.equal((await partial.call({ receipt: nonce })).status, 200);
  assert.equal(partial.deletes, 1);
  const unauthorized = fixture({ unauthorized: true });
  assert.equal((await unauthorized.call({ receipt: nonce })).status, 401);
  assert.equal(unauthorized.deletes, 0);
  const invalid = fixture();
  assert.equal((await invalid.call({ receipt: "bad" })).status, 400);
  assert.equal(invalid.deletes, 0);
  const failed = fixture({ deleteFails: true });
  assert.equal((await failed.call({ receipt: nonce })).status, 500);
  assert.equal((await failed.call({ receipt: nonce })).status, 500);
  const race = fixture({ reservationRace: true });
  assert.equal((await race.call({ receipt: nonce })).status, 403);
  assert.equal(race.deletes, 0);
  const zero = fixture({ zeroConfirmation: true });
  assert.equal((await zero.call({ receipt: nonce })).status, 503);
  // Budget keying: the caller is authenticated BEFORE any budget is charged.
  // An authenticated deletion spends the caller's own per-user bucket; a
  // receipt-only status probe spends a separate per-receipt pool.
  const keyed = fixture();
  assert.equal((await keyed.call({ receipt: nonce })).status, 200);
  assert.deepEqual(
    { ...keyed.budgetCalls[0] },
    {
      p_user: A,
      p_operation: "delete_account",
      p_units: 1,
    },
  );
  assert.equal(
    (await keyed.call({ receipt: nonce, check_only: true })).status,
    200,
  );
  assert.deepEqual(
    { ...keyed.budgetCalls[1] },
    {
      p_user: nonce,
      p_operation: "delete_account_status",
      p_units: 1,
    },
  );
  assert.equal(keyed.budgetCalls.length, 2);
  const probe = fixture({ unauthorized: true });
  assert.equal(
    (await probe.call({ receipt: nonce.toUpperCase(), check_only: true }))
      .status,
    401,
  );
  assert.equal(probe.budgetCalls[0].p_operation, "delete_account_status");
  assert.equal(
    probe.budgetCalls[0].p_user,
    nonce,
    "receipt subject is lowercased",
  );
  assert.equal(probe.deletes, 0);
  // Exhausting the unauthenticated status pool must not block a real deletion.
  const starved = fixture({ exhaustedOperation: "delete_account_status" });
  assert.equal((await starved.call({ receipt: nonce })).status, 200);
  assert.equal(starved.deletes, 1);
  const denied = fixture({ exhaustedOperation: "delete_account" });
  assert.equal((await denied.call({ receipt: nonce })).status, 429);
  assert.equal(denied.deletes, 0);
  console.log(
    "PASS 11 deletion receipt/absence/authorization/budget-keying fixtures; actual DB/gateway unrun",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
