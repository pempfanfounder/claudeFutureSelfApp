import { createAdminClient } from "../_shared/admin.ts";
import { json } from "../_shared/http.ts";
import {
  equalSecret,
  InputError,
  readBoundedJson,
  record,
} from "../_shared/input.ts";
import {
  parseAppIds,
  parseWebhook,
  reconcileEntitlement,
  rpc,
} from "../_shared/entitlement-reconciliation.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  const auth = req.headers.get("authorization");
  if (
    !equalSecret(auth, secret) &&
    !equalSecret(auth, secret ? `Bearer ${secret}` : undefined)
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  // Required deployment evidence; no assumed production app/environment.
  // REVENUECAT_WEBHOOK_APP_ID may list several apps, comma-separated.
  const appIds = parseAppIds(Deno.env.get("REVENUECAT_WEBHOOK_APP_ID"));
  const environment = Deno.env.get("REVENUECAT_WEBHOOK_ENVIRONMENT");
  const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!appIds || !environment || !apiKey)
    return json({ error: "reconciliation not configured" }, 503);
  try {
    const event = parseWebhook(
      await readBoundedJson(req, 65_536),
      appIds,
      environment,
    );
    const db = createAdminClient();
    const received = record(
      await rpc(db, "receive_subscription_event", {
        p_event_id: event.id,
        p_app_id: event.appId,
        p_environment: environment,
        p_event_time: new Date(event.timestamp).toISOString(),
        p_payload: event.payload,
        p_user_ids: event.userIds,
      }),
      "receipt",
    );
    const targets = received.user_ids;
    if (!Array.isArray(targets) || targets.length > 16)
      throw new Error("invalid durable targets");
    const deadline = Date.now() + 25_000;
    let pending = false;
    for (const user of targets) {
      if (Date.now() + 8_000 > deadline) {
        pending = true;
        break;
      }
      try {
        const outcome = await reconcileEntitlement(
          db,
          String(user),
          apiKey,
          "webhook",
        );
        if (!["fresh", "applied"].includes(outcome.outcome)) pending = true;
      } catch {
        pending = true;
      }
    }
    return json(
      {
        ok: !pending,
        durable: true,
        status: pending ? "pending" : "accepted",
        unmapped: received.status === "unmapped",
      },
      pending ? 503 : 200,
    );
  } catch (error) {
    if (error instanceof InputError)
      return json({ error: error.message }, error.status);
    return json({ error: "subscription event pending; retry required" }, 503);
  }
});
