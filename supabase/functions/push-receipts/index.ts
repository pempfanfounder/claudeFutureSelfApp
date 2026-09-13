// S4: leased per-device receipts. All mutation and token invalidation is fenced
// inside SQL. A successful receipt means provider acceptance, not a user read.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/admin.ts";
import { requireDispatchSecret } from "../_shared/auth.ts";
import { json } from "../_shared/http.ts";
import { InputError, readBoundedJson, record } from "../_shared/input.ts";
import { PUSH_RPC_DEADLINE_MS } from "../_shared/rpc-deadline.ts";
import {
  describeDbError,
  failureBody,
  logFailure,
  retryOnceIfTransient,
  RpcFailure,
} from "../_shared/rpc-failure.ts";

const FN = "push-receipts";

interface Pending {
  id: string;
  expo_ticket_id: string;
}
interface ReceiptResult {
  attempt_id: string;
  state: "receipt_ok" | "receipt_error" | "pending";
  error_code?: string;
}
const ERROR_CODES = new Set([
  "DeviceNotRegistered",
  "MessageTooBig",
  "MessageRateExceeded",
  "MismatchSenderId",
  "InvalidCredentials",
]);
async function rpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_RPC_DEADLINE_MS);
  const started = Date.now();
  let result: { data: unknown; error: unknown; status?: number };
  try {
    result = await db.rpc(name, args).abortSignal(controller.signal);
  } catch (thrown) {
    // postgrest-js resolves with `error` rather than rejecting, so this is
    // only reached for unexpected client-side throws.
    throw new RpcFailure(
      name,
      describeDbError(thrown, undefined, controller.signal.aborted),
      Date.now() - started,
      controller.signal.aborted,
      PUSH_RPC_DEADLINE_MS,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (result.error)
    throw new RpcFailure(
      name,
      describeDbError(result.error, result.status, controller.signal.aborted),
      Date.now() - started,
      controller.signal.aborted,
      PUSH_RPC_DEADLINE_MS,
    );
  return result.data;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const denied = requireDispatchSecret(req);
  if (denied) return denied;
  const db = createAdminClient();
  let claim;
  try {
    // Safe to run twice: every finish call below uses the lease token from
    // the response we actually received. If a first call committed a lease
    // but its response was lost, the retry sees that lease as active and
    // returns an empty batch (same as today's failure: those attempts wait
    // out their 45 s lease), so no token is ever used across the boundary.
    claim = record(
      await retryOnceIfTransient(FN, "claim_push_receipts", () =>
        rpc(db, "claim_push_receipts"),
      ),
      "receipt claim",
    );
  } catch (error) {
    if (error instanceof InputError)
      logFailure(FN, "claim_push_receipts", error);
    return json(
      failureBody("receipt claim unavailable", error, "claim_push_receipts"),
      503,
    );
  }
  if (!Array.isArray(claim.attempts) || claim.attempts.length > 300) {
    logFailure(
      FN,
      "claim_push_receipts",
      new InputError("invalid receipt batch"),
    );
    return json(
      {
        ok: false,
        error: "invalid receipt batch",
        reason: "invalid_response",
        step: "claim_push_receipts",
      },
      503,
    );
  }
  const attempts = claim.attempts as Pending[];
  if (attempts.length === 0)
    return json({
      checked: 0,
      expired: Number(claim.expired ?? 0),
      legacy_imported: Number(claim.legacy_imported ?? 0),
      budget_limited: claim.budget_limited === true,
    });
  let results: ReceiptResult[];
  let providerFailed = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ids: attempts.map((a) => a.expo_ticket_id) }),
      },
    );
    if (!response.ok) throw new Error("provider unavailable");
    const payload = record(
      await readBoundedJson(response, 262_144),
      "receipts",
    );
    const receipts = record(payload.data, "receipt map");
    results = attempts.map((a) => {
      if (receipts[a.expo_ticket_id] === undefined)
        return { attempt_id: a.id, state: "pending" };
      const receipt = record(receipts[a.expo_ticket_id], "receipt");
      if (receipt.status === "ok")
        return { attempt_id: a.id, state: "receipt_ok" };
      if (receipt.status !== "error") throw new Error("invalid receipt status");
      const details =
        receipt.details === undefined
          ? {}
          : record(receipt.details, "receipt details");
      return {
        attempt_id: a.id,
        state: "receipt_error",
        error_code:
          typeof details.error === "string" && ERROR_CODES.has(details.error)
            ? details.error
            : "unknown_receipt_error",
      };
    });
  } catch (error) {
    providerFailed = true;
    // Provider messages may echo request content, so only the error class and
    // whether our abort fired are logged.
    console.error(
      JSON.stringify({
        event: "push_provider_failure",
        function: FN,
        step: "expo_get_receipts",
        reason: "provider_unavailable",
        name: (error as { name?: unknown } | null)?.name ?? typeof error,
        aborted: controller.signal.aborted,
      }),
    );
    results = attempts.map((a) => ({
      attempt_id: a.id,
      state: "pending",
      error_code: "provider_unavailable",
    }));
  } finally {
    clearTimeout(timeout);
  }
  let persisted: Record<string, unknown> | null = null;
  for (let retry = 0; retry < 2 && !persisted; retry++) {
    try {
      persisted = record(
        await rpc(db, "finish_push_receipts", {
          p_lease_token: claim.lease_token,
          p_results: results,
        }),
        "receipt result",
      );
    } catch (error) {
      logFailure(FN, "finish_push_receipts", error, { attempt: retry });
      if (retry === 1)
        return json(
          {
            ...failureBody(
              "receipt persistence unavailable",
              error,
              "finish_push_receipts",
            ),
            checked: 0,
          },
          503,
        );
    }
  }
  if (persisted?.outcome !== "persisted")
    return json(
      {
        ok: false,
        error: "receipt claim superseded",
        reason: "superseded",
        step: "finish_push_receipts",
        checked: 0,
      },
      503,
    );
  return json(
    {
      ...persisted,
      expired: Number(claim.expired ?? 0),
      legacy_imported: Number(claim.legacy_imported ?? 0),
      ...(providerFailed ? { ok: false, reason: "provider_unavailable" } : {}),
    },
    providerFailed ? 503 : 200,
  );
});
