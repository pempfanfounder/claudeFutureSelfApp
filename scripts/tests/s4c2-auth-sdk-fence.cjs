// Actual installed auth-js and candidate fence/deadline; synthetic in-process transport/storage.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const { GoTrueClient } = require("@supabase/auth-js");
function load(file, dependencies) {
  const api = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      exports: api,
      require: (n) => {
        assert.ok(n in dependencies, `unapproved dependency ${n}`);
        return dependencies[n];
      },
      setTimeout,
      clearTimeout,
    },
  );
  return api;
}
const state = load("src/lib/appState.ts", { zustand: require("zustand") });
const { runSharedAuthOperation: run, sharedAuthPending: pending } = load(
  "src/features/auth/sharedAuthOperation.ts",
  { "@/lib/appState": state },
);
const values = new Map(),
  requests = [],
  events = [];
let releaseWrite,
  holdWrite = false;
const storage = {
  getItem: async (k) => values.get(k) || null,
  setItem: async (k, v) => {
    if (holdWrite) {
      holdWrite = false;
      await new Promise((r) => (releaseWrite = r));
    }
    values.set(k, v);
  },
  removeItem: async (k) => values.delete(k),
};
const sdk = new GoTrueClient({
  url: "https://synthetic.invalid/auth/v1",
  storageKey: "test-only",
  storage,
  persistSession: true,
  autoRefreshToken: false,
  detectSessionInUrl: false,
  fetch: async (url, options) => {
    assert.match(
      url,
      /^https:\/\/synthetic\.invalid\/auth\/v1\/(signup|token\?grant_type=id_token)$/,
    );
    assert.equal(options.method, "POST");
    return new Promise((resolve) =>
      requests.push({
        url,
        respond: (id, status = 200) =>
          resolve(
            new Response(
              JSON.stringify(
                status === 200
                  ? {
                      access_token: "synthetic-access",
                      token_type: "bearer",
                      expires_in: 3600,
                      refresh_token: "synthetic-refresh",
                      user: { id, is_anonymous: id === "A" },
                    }
                  : { msg: "synthetic rejected", code: "validation_failed" },
              ),
              { status, headers: { "content-type": "application/json" } },
            ),
          ),
      }),
    );
  },
});
const tick = () => new Promise((r) => setImmediate(r));
(async () => {
  await sdk.getSession();
  const sub = sdk.onAuthStateChange((event, s) => {
    if (event === "SIGNED_IN") events.push(s.user.id);
  });
  let raw;
  const timed = run(() => (raw = sdk.signInAnonymously()));
  await tick();
  assert.equal(requests.length, 1);
  await assert.rejects(timed, /taking longer/);
  assert.equal(pending(), true);
  await assert.rejects(
    run(() => sdk.signInAnonymously()),
    /not finished/,
  );
  await assert.rejects(
    run(() => sdk.signInWithIdToken({ provider: "apple", token: "synthetic" })),
    /not finished/,
  );
  assert.equal(requests.length, 1);
  holdWrite = true;
  requests[0].respond("A");
  await tick();
  await tick();
  assert.equal(typeof releaseWrite, "function");
  assert.equal(pending(), true);
  await assert.rejects(
    run(() => sdk.signInAnonymously()),
    /not finished/,
  );
  releaseWrite();
  await raw;
  await tick();
  assert.equal(pending(), false);
  assert.equal(JSON.parse(values.get("test-only")).user.id, "A");
  assert.deepEqual(events, ["A"]);
  const b = run(() =>
    sdk.signInWithIdToken({ provider: "apple", token: "synthetic" }),
  );
  await tick();
  requests[1].respond("B");
  await b;
  assert.equal(JSON.parse(values.get("test-only")).user.id, "B");
  assert.deepEqual(events, ["A", "B"]);
  const failed = run(() => sdk.signInAnonymously());
  await tick();
  requests[2].respond(null, 400);
  assert.ok((await failed).error);
  assert.equal(pending(), false);
  assert.equal(JSON.parse(values.get("test-only")).user.id, "B");
  const next = run(() =>
    sdk.signInWithIdToken({ provider: "apple", token: "synthetic" }),
  );
  await tick();
  requests[3].respond("B");
  await next;
  sub.data.subscription.unsubscribe();
  await sdk.stopAutoRefresh();
  console.log(
    "PASS actual 12-second deadline; duplicate signup/signin blocked through delayed SDK storage; late A then accepted B; HTTP-error settlement releases fence. Four synthetic transport responses, zero HTTP.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
