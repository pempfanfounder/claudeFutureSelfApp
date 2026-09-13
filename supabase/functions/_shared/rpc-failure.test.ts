// Run from supabase/functions: deno test --allow-env _shared/rpc-failure.test.ts
import assert from "node:assert/strict";
import { InputError } from "./input.ts";
import {
  describeDbError,
  describeThrown,
  failureBody,
  isTransient,
  logFailure,
  MESSAGE_LIMIT,
  retryOnceIfTransient,
  RpcFailure,
  safeMessage,
} from "./rpc-failure.ts";

function captureErrors(run: () => void | Promise<void>) {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  const restore = () => {
    console.error = original;
  };
  const result = run();
  if (result instanceof Promise)
    return result.then(() => lines).finally(restore);
  restore();
  return Promise.resolve(lines);
}

Deno.test(
  "PostgREST error keeps code/status/message, drops details and hint",
  () => {
    const detail = describeDbError(
      {
        message: "canceling statement due to statement timeout",
        details: "SQL-CANARY select * from secret",
        hint: "HINT-CANARY",
        code: "57014",
      },
      500,
    );
    assert.equal(detail.reason, "rpc_error");
    assert.equal(detail.code, "57014");
    assert.equal(detail.status, 500);
    assert.equal(detail.transient, true);
    assert.equal(JSON.stringify(detail).includes("CANARY"), false);
  },
);

Deno.test("failed fetch (status 0, empty code) is transient", () => {
  const detail = describeDbError(
    {
      message:
        "TypeError: error sending request for url (https://x.supabase.co/rest/v1/rpc/queue_read): client error (Connect): connection reset",
      details: "stack",
      hint: "",
      code: "",
    },
    0,
  );
  assert.equal(detail.reason, "rpc_error");
  assert.equal(detail.status, 0);
  assert.equal(detail.code, undefined);
  assert.equal(detail.transient, true);
  assert.ok(detail.message.startsWith("TypeError: error sending request"));
});

Deno.test("our own abort is reported as aborted and never retried", () => {
  const detail = describeDbError(
    {
      message: "AbortError: The signal has been aborted",
      details: "",
      hint: "Request was aborted (timeout or manual cancellation)",
      code: "",
    },
    0,
    true,
  );
  assert.equal(detail.reason, "aborted");
  assert.equal(detail.transient, false);
});

Deno.test("SQL exceptions and client errors are not transient", () => {
  for (const [status, code] of [
    [400, "P0001"],
    [401, "PGRST301"],
    [404, "PGRST202"],
    [409, "23505"],
    [429, undefined],
  ] as Array<[number, string | undefined]>) {
    assert.equal(isTransient(status, code), false, `${status} ${code}`);
    assert.equal(
      describeDbError({ message: "x", code }, status).transient,
      false,
    );
  }
});

Deno.test("5xx and connection-class codes are transient", () => {
  for (const [status, code] of [
    [500, "57014"],
    [502, undefined],
    [503, "PGRST001"],
    [504, "PGRST003"],
    [520, undefined],
    [undefined, "08006"],
    [undefined, "53300"],
    [undefined, "57P03"],
    [undefined, "PGRST002"],
  ] as Array<[number | undefined, string | undefined]>) {
    assert.equal(isTransient(status, code), true, `${status} ${code}`);
  }
  assert.equal(isTransient(undefined, undefined), false);
  assert.equal(isTransient(undefined, "P0001"), false);
});

Deno.test("message is collapsed, redacted and truncated", () => {
  const long = "x".repeat(MESSAGE_LIMIT * 2);
  assert.equal(safeMessage(long).length, MESSAGE_LIMIT);
  assert.equal(safeMessage("a\n\n  b\tc"), "a b c");
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl";
  assert.equal(safeMessage(`token ${jwt} rejected`), "token [jwt] rejected");
  assert.equal(
    safeMessage("bad key sb_secret_abcDEF123_xyz here"),
    "bad key [key] here",
  );
  assert.equal(
    safeMessage("GET /rest/v1/rpc/x?apikey=abc123&n=1 Bearer abc.def"),
    "GET /rest/v1/rpc/x?apikey=[redacted]&n=1 Bearer [redacted]",
  );
  assert.equal(safeMessage(undefined), "");
  assert.equal(safeMessage(42), "42");
});

Deno.test(
  "describeThrown classifies RpcFailure, InputError, Error and junk",
  () => {
    const failure = new RpcFailure(
      "queue_read",
      describeDbError({ message: "boom", code: "PGRST001" }, 503),
      5339,
      false,
      10_000,
    );
    assert.equal(describeThrown(failure), failure.detail);
    assert.deepEqual(describeThrown(new InputError("invalid claim")), {
      reason: "invalid_response",
      message: "invalid claim",
      name: "InputError",
      transient: false,
    });
    const plain = describeThrown(new Error("insufficient send time"));
    assert.equal(plain.reason, "exception");
    assert.equal(plain.name, "Error");
    assert.equal(plain.message, "insufficient send time");
    assert.equal(plain.transient, false);
    assert.equal(describeThrown("string failure").message, "string failure");
    assert.equal(describeThrown(null).reason, "exception");
  },
);

Deno.test("failureBody is short, machine-readable and free of details", () => {
  const failure = new RpcFailure(
    "queue_read",
    describeDbError(
      { message: "m", details: "SQL-CANARY", hint: "H", code: "PGRST301" },
      401,
    ),
    12,
    false,
    10_000,
  );
  assert.deepEqual(failureBody("queue unavailable", failure), {
    ok: false,
    error: "queue unavailable",
    reason: "rpc_error",
    step: "queue_read",
    code: "PGRST301",
    status: 401,
  });
  assert.deepEqual(
    failureBody("queue unavailable", new Error("x"), "queue_read"),
    {
      ok: false,
      error: "queue unavailable",
      reason: "exception",
      step: "queue_read",
    },
  );
  // Fetch failure: status 0 is kept (it distinguishes transport from HTTP).
  const transport = new RpcFailure(
    "claim_push_receipts",
    describeDbError({ message: "TypeError: reset", code: "" }, 0),
    4800,
    false,
    10_000,
  );
  assert.deepEqual(failureBody("receipt claim unavailable", transport), {
    ok: false,
    error: "receipt claim unavailable",
    reason: "rpc_error",
    step: "claim_push_receipts",
    status: 0,
  });
});

Deno.test(
  "logFailure emits one JSON line with timing and abort flag",
  async () => {
    const lines = await captureErrors(() => {
      logFailure(
        "push-dispatch",
        "ignored-when-failure-has-step",
        new RpcFailure(
          "queue_read",
          describeDbError(
            { message: "m", details: "SQL-CANARY", code: "PGRST001" },
            503,
          ),
          5339,
          false,
          10_000,
        ),
        { attempt: 0, msgId: 7 },
      );
    });
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.deepEqual(entry, {
      event: "push_rpc_failure",
      function: "push-dispatch",
      step: "queue_read",
      reason: "rpc_error",
      code: "PGRST001",
      status: 503,
      message: "m",
      transient: true,
      attempt: 0,
      elapsed_ms: 5339,
      aborted: false,
      deadline_ms: 10_000,
      msg_id: 7,
    });
    assert.equal(lines[0].includes("CANARY"), false);
  },
);

Deno.test(
  "retryOnceIfTransient retries exactly once, only on transient causes",
  async () => {
    const transient = () =>
      new RpcFailure(
        "s",
        describeDbError({ message: "reset", code: "" }, 0),
        1,
        false,
        1,
      );
    const permanent = () =>
      new RpcFailure(
        "s",
        describeDbError({ message: "invalid", code: "P0001" }, 400),
        1,
        false,
        1,
      );

    let calls = 0;
    const lines = await captureErrors(async () => {
      // transient then success -> one retry, value returned
      calls = 0;
      const value = await retryOnceIfTransient(
        "f",
        "s",
        () => {
          calls++;
          if (calls === 1) throw transient();
          return Promise.resolve("ok");
        },
        1,
      );
      assert.equal(value, "ok");
      assert.equal(calls, 2);

      // transient twice -> exactly two attempts, last error rethrown
      calls = 0;
      await assert.rejects(
        retryOnceIfTransient(
          "f",
          "s",
          () => {
            calls++;
            throw transient();
          },
          1,
        ),
        (e: unknown) => e instanceof RpcFailure,
      );
      assert.equal(calls, 2);

      // permanent -> no retry
      calls = 0;
      await assert.rejects(
        retryOnceIfTransient(
          "f",
          "s",
          () => {
            calls++;
            throw permanent();
          },
          1,
        ),
      );
      assert.equal(calls, 1);

      // aborted -> no retry
      calls = 0;
      await assert.rejects(
        retryOnceIfTransient(
          "f",
          "s",
          () => {
            calls++;
            throw new RpcFailure(
              "s",
              describeDbError({ message: "AbortError", code: "" }, 0, true),
              1,
              true,
              1,
            );
          },
          1,
        ),
      );
      assert.equal(calls, 1);

      // success -> single call, nothing logged
      calls = 0;
      assert.equal(
        await retryOnceIfTransient("f", "s", () => {
          calls++;
          return Promise.resolve(1);
        }),
        1,
      );
      assert.equal(calls, 1);
    });
    const attempts = lines.map((l) => JSON.parse(l).attempt);
    assert.deepEqual(attempts, [0, 0, 1, 0, 0]);
  },
);
