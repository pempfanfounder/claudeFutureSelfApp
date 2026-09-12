// Authenticated deletion; an unguessable, hashed receipt supports a status-only
// retry after the user is gone. A 401 alone never proves deletion.
import { createAdminClient } from "../_shared/admin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  InputError,
  readBoundedJson,
  record,
  UUID_RE,
} from "../_shared/input.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ error: "method not allowed" }, 405, corsHeaders);
  try {
    const body = record(await readBoundedJson(req, 2048), "body");
    if (typeof body.receipt !== "string" || !UUID_RE.test(body.receipt))
      return json({ error: "invalid receipt" }, 400, corsHeaders);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body.receipt),
    );
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const admin = createAdminClient();
    // Authenticate before charging. An authenticated caller spends their own
    // per-user `delete_account` bucket; a receipt-only caller (the user may
    // already be gone) spends a separate `delete_account_status` pool keyed by
    // the receipt, so unauthenticated traffic can never starve real deletions.
    const user = await getUserFromRequest(req);
    const { data: budget, error: budgetError } = await admin.rpc(
      "consume_backend_budget",
      user
        ? { p_user: user.id, p_operation: "delete_account", p_units: 1 }
        : {
            p_user: body.receipt.toLowerCase(),
            p_operation: "delete_account_status",
            p_units: 1,
          },
    );
    if (budgetError)
      return json({ error: "temporarily unavailable" }, 503, corsHeaders);
    if (!budget?.allowed)
      return json({ error: "retry later" }, 429, corsHeaders);
    const { data: receipt, error: readError } = await admin
      .from("account_deletion_receipts")
      .select("user_id,confirmed_at,expires_at")
      .eq("nonce_hash", hash)
      .maybeSingle();
    if (readError)
      return json({ error: "temporarily unavailable" }, 503, corsHeaders);
    if (receipt && Date.parse(receipt.expires_at) <= Date.now())
      return json(
        { error: "receipt expired; contact support" },
        410,
        corsHeaders,
      );
    const confirm = async (userId: string) => {
      const { data, error } = await admin
        .from("account_deletion_receipts")
        .update({ confirmed_at: new Date().toISOString() })
        .eq("nonce_hash", hash)
        .eq("user_id", userId)
        .select("user_id,confirmed_at")
        .maybeSingle();
      return error || data?.user_id !== userId || !data?.confirmed_at
        ? json({ error: "confirmation pending; retry" }, 503, corsHeaders)
        : json({ ok: true, deleted_user_id: userId }, 200, corsHeaders);
    };
    if (receipt?.confirmed_at)
      return json(
        { ok: true, deleted_user_id: receipt.user_id },
        200,
        corsHeaders,
      );
    // The durable receipt is proof of a prior authenticated deletion request.
    // For a crash after deletion but before confirmation, ask trusted admin auth
    // for explicit user_not_found; a timeout/401/general error is not absence.
    if (receipt) {
      const { data, error } = await admin.auth.admin.getUserById(
        receipt.user_id,
      );
      if (
        error?.code === "user_not_found" &&
        error.status === 404 &&
        !data?.user
      )
        return confirm(receipt.user_id);
      if (error)
        return json({ error: "could not verify outcome" }, 503, corsHeaders);
      if (body.check_only === true)
        return json({ ok: false, pending: true }, 409, corsHeaders);
    } else if (body.check_only === true)
      return json({ error: "unknown receipt" }, 401, corsHeaders);
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);
    if (receipt && receipt.user_id !== user.id)
      return json(
        { error: "receipt belongs to another account" },
        403,
        corsHeaders,
      );
    const { error: writeError } = await admin
      .from("account_deletion_receipts")
      .upsert(
        { nonce_hash: hash, user_id: user.id },
        { onConflict: "nonce_hash", ignoreDuplicates: true },
      );
    if (writeError)
      return json(
        { error: "could not retain deletion outcome" },
        503,
        corsHeaders,
      );
    const { data: reserved, error: reservationError } = await admin
      .from("account_deletion_receipts")
      .select("user_id,expires_at")
      .eq("nonce_hash", hash)
      .maybeSingle();
    if (reservationError || !reserved)
      return json(
        { error: "could not verify receipt reservation" },
        503,
        corsHeaders,
      );
    if (reserved.user_id !== user.id)
      return json(
        { error: "receipt belongs to another account" },
        403,
        corsHeaders,
      );
    if (Date.parse(reserved.expires_at) <= Date.now())
      return json(
        { error: "receipt expired; contact support" },
        410,
        corsHeaders,
      );
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error)
      return json({ error: "deletion not confirmed; retry" }, 500, corsHeaders);
    return confirm(user.id);
  } catch (error) {
    return json(
      {
        error:
          error instanceof InputError
            ? "invalid request"
            : "temporarily unavailable",
      },
      error instanceof InputError ? error.status : 503,
      corsHeaders,
    );
  }
});
