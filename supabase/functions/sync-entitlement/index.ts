import { createAdminClient } from "../_shared/admin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { equalSecret, InputError, readBoundedJson } from "../_shared/input.ts";
import {
  reconcileEntitlement,
  rpc,
} from "../_shared/entitlement-reconciliation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ error: "method not allowed" }, 405, corsHeaders);
  const recoveryHeader = req.headers.get("x-entitlement-recovery-secret");
  const recovery = equalSecret(
    recoveryHeader,
    Deno.env.get("ENTITLEMENT_RECOVERY_SECRET"),
  );
  if (recoveryHeader !== null && !recovery)
    return json({ error: "unauthorized" }, 401, corsHeaders);
  const user = recovery ? null : await getUserFromRequest(req);
  if (!recovery && !user)
    return json({ error: "unauthorized" }, 401, corsHeaders);
  const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!apiKey) return json({ configured: false }, 501, corsHeaders);
  try {
    // Client entitlement, user ID, force flag and budget parameters are never trusted.
    await readBoundedJson(req, 1024);
    const db = createAdminClient();
    if (recovery) {
      const targets = await rpc(db, "list_entitlement_recovery");
      if (!Array.isArray(targets) || targets.length > 3)
        throw new Error("invalid recovery batch");
      let completed = 0;
      for (const target of targets) {
        try {
          const result = await reconcileEntitlement(
            db,
            String(target),
            apiKey,
            "recovery",
          );
          if (["fresh", "applied"].includes(result.outcome)) completed++;
        } catch {
          /* Durable retry/dead-letter state is retained. */
        }
      }
      return json(
        {
          checked: targets.length,
          completed,
          pending: targets.length - completed,
        },
        200,
      );
    }
    const result = await reconcileEntitlement(db, user!.id, apiKey, "sync");
    const status =
      result.outcome === "busy"
        ? 202
        : result.outcome === "rate_limited"
          ? 429
          : 200;
    return json({ ok: status === 200, ...result }, status, {
      ...corsHeaders,
      ...(result.retry_after_seconds
        ? { "Retry-After": String(result.retry_after_seconds) }
        : {}),
    });
  } catch (error) {
    if (error instanceof InputError)
      return json({ error: error.message }, error.status, corsHeaders);
    return json({ error: "entitlement sync pending" }, 503, corsHeaders);
  }
});
