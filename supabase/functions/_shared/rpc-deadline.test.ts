// Run from supabase/functions: deno test _shared/rpc-deadline.test.ts
import assert from "node:assert/strict";
import {
  DEFAULT_PUSH_RPC_DEADLINE_MS,
  MAX_PUSH_RPC_DEADLINE_MS,
  MIN_PUSH_RPC_DEADLINE_MS,
  PUSH_RPC_DEADLINE_MS,
  resolveRpcDeadlineMs,
} from "./rpc-deadline.ts";

Deno.test(
  "default fits a cold start and stays inside the receipt lease",
  () => {
    assert.equal(DEFAULT_PUSH_RPC_DEADLINE_MS, 10_000);
    // push-receipts worst case: claim + 8 s provider call + two finish calls.
    assert.ok(3 * MAX_PUSH_RPC_DEADLINE_MS + 8_000 < 45_000);
    // push-dispatch reserves 18 s after begin_push_send for send + persistence.
    assert.ok(8_000 + DEFAULT_PUSH_RPC_DEADLINE_MS <= 18_000);
  },
);

Deno.test("unset env falls back to the default", () => {
  assert.equal(resolveRpcDeadlineMs(undefined), DEFAULT_PUSH_RPC_DEADLINE_MS);
});

Deno.test("accepts integers inside the range", () => {
  assert.equal(resolveRpcDeadlineMs("6000"), 6_000);
  assert.equal(resolveRpcDeadlineMs(" 8000 "), 8_000);
  assert.equal(
    resolveRpcDeadlineMs(String(MIN_PUSH_RPC_DEADLINE_MS)),
    MIN_PUSH_RPC_DEADLINE_MS,
  );
  assert.equal(
    resolveRpcDeadlineMs(String(MAX_PUSH_RPC_DEADLINE_MS)),
    MAX_PUSH_RPC_DEADLINE_MS,
  );
});

Deno.test("rejects malformed or out-of-range values", () => {
  for (const raw of [
    "",
    "abc",
    "10s",
    "-1",
    "1.5",
    "0",
    "999",
    "12001",
    "60000",
  ]) {
    assert.equal(
      resolveRpcDeadlineMs(raw),
      DEFAULT_PUSH_RPC_DEADLINE_MS,
      `raw=${JSON.stringify(raw)}`,
    );
  }
});

Deno.test("module constant is resolved from the environment", () => {
  assert.equal(
    PUSH_RPC_DEADLINE_MS,
    resolveRpcDeadlineMs(Deno.env.get("PUSH_RPC_DEADLINE_MS")),
  );
});
