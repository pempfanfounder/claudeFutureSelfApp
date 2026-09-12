import {
  boundedString,
  InputError,
  readBoundedJson,
  record,
  UUID_RE,
} from "./input.ts";

// Structural contract keeps this module free of SDK initialization.
export interface ReconciliationDb {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface EntitlementSnapshot {
  is_premium: boolean;
  expires_at: string | null;
  product_id: string | null;
  period_type: string | null;
  trial_expires_at: string | null;
}
function dateValue(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new InputError(`invalid ${label}`);
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day
  ) {
    throw new InputError(`invalid ${label}`);
  }
  return Date.parse(value);
}
/** Missing/malformed canonical data must never become a revocation. */
export function parseSubscriber(
  payload: unknown,
  now = Date.now(),
): EntitlementSnapshot {
  const subscriber = record(
    record(payload, "response").subscriber,
    "subscriber",
  );
  const entitlements = record(subscriber.entitlements, "entitlements");
  const subscriptions =
    subscriber.subscriptions === undefined
      ? {}
      : record(subscriber.subscriptions, "subscriptions");
  const entries = Object.entries(entitlements);
  if (entries.length > 100 || Object.keys(subscriptions).length > 200)
    throw new InputError("map too large");
  const active: Array<{
    end: number | null;
    purchase: number;
    product: string | null;
    period: string | null;
    trial: number | null;
  }> = [];
  for (const [id, raw] of entries) {
    boundedString(id, "entitlement id", 256);
    const e = record(raw, "entitlement");
    if (!Object.prototype.hasOwnProperty.call(e, "expires_date"))
      throw new InputError("missing expiry");
    let end = dateValue(e.expires_date, "expiry");
    const purchase =
      e.purchase_date == null
        ? 0
        : dateValue(e.purchase_date, "purchase date")!;
    const product =
      e.product_identifier == null
        ? null
        : boundedString(e.product_identifier, "product id", 256);
    const subscription =
      product && subscriptions[product] !== undefined
        ? record(subscriptions[product], "subscription")
        : {};
    const grace =
      subscription.grace_period_expires_date == null
        ? null
        : dateValue(subscription.grace_period_expires_date, "grace expiry");
    if (end !== null && grace !== null) end = Math.max(end, grace);
    const rawPeriod = e.period_type ?? subscription.period_type ?? null;
    const period =
      rawPeriod === null
        ? null
        : boundedString(rawPeriod, "period", 32).toLowerCase();
    if (end === null || end > now) {
      const trial =
        period === "trial" ? dateValue(e.expires_date, "trial expiry") : null;
      active.push({ end, purchase, product, period, trial });
    }
  }
  active.sort(
    (a, b) =>
      b.purchase - a.purchase ||
      (a.product ?? "").localeCompare(b.product ?? ""),
  );
  const newest = active[0];
  const finite = active
    .map((e) => e.end)
    .filter((e): e is number => e !== null);
  const trials = active
    .map((e) => e.trial)
    .filter((e): e is number => e !== null);
  const futureTrials = trials.filter((end) => end > now);
  // An ended trial may remain entitled through grace. Retain its real past end
  // so a scheduler cannot substitute grace or another product's access expiry.
  const trialEnd = futureTrials.length
    ? Math.min(...futureTrials)
    : trials.length
      ? Math.max(...trials)
      : null;
  return {
    is_premium: active.length > 0,
    expires_at:
      active.length === 0 || active.some((e) => e.end === null)
        ? null
        : new Date(Math.max(...finite)).toISOString(),
    product_id: newest?.product ?? null,
    period_type: newest?.period ?? null,
    trial_expires_at:
      trialEnd === null ? null : new Date(trialEnd).toISOString(),
  };
}
/**
 * One RevenueCat project may expose several apps (e.g. iOS and Android) that
 * all post to the same webhook. Accepts a comma-separated list; a single ID
 * keeps working unchanged. Returns null when no usable ID is configured.
 */
export function parseAppIds(raw: string | undefined): Set<string> | null {
  if (raw === undefined) return null;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length ? new Set(ids) : null;
}
export function parseWebhook(
  payload: unknown,
  appIds: string | ReadonlySet<string>,
  environment: string,
) {
  const event = record(record(payload, "body").event, "event");
  const id = boundedString(event.id, "event id");
  const type = boundedString(event.type, "event type", 64);
  const allowed = typeof appIds === "string" ? new Set([appIds]) : appIds;
  if (
    typeof event.app_id !== "string" ||
    !allowed.has(event.app_id) ||
    event.environment !== environment
  )
    throw new InputError("event scope mismatch");
  // The matched event value, never the configured list, flows downstream.
  const appId = boundedString(event.app_id, "app id", 128);
  const timestamp = event.event_timestamp_ms;
  if (
    typeof timestamp !== "number" ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > Date.now() + 300_000
  )
    throw new InputError("invalid event time");
  const identities: string[] = [];
  for (const field of ["app_user_id", "original_app_user_id"]) {
    if (event[field] !== undefined)
      identities.push(boundedString(event[field], field, 256));
  }
  for (const field of ["transferred_from", "transferred_to", "aliases"]) {
    if (event[field] === undefined) continue;
    if (!Array.isArray(event[field]) || event[field].length > 16)
      throw new InputError("too many identities");
    for (const value of event[field])
      identities.push(boundedString(value, field, 256));
  }
  const userIds = [
    ...new Set(
      identities.filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase()),
    ),
  ].sort();
  if (userIds.length > 16) throw new InputError("too many identities");
  return {
    id,
    type,
    appId,
    timestamp,
    userIds,
    // Persist routing metadata only; custom aliases may contain personal data.
    payload: {
      id,
      type,
      app_id: appId,
      environment,
      event_timestamp_ms: timestamp,
      user_ids: userIds,
      unmapped_identity_count: identities.filter((id) => !UUID_RE.test(id))
        .length,
    },
  };
}
export async function rpc(
  db: ReconciliationDb,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) throw new Error(`database ${name} failed`);
  return result.data;
}
export type ReconcileOutcome = {
  outcome: "applied" | "fresh" | "busy" | "rate_limited";
  is_premium?: boolean;
  retry_after_seconds?: number;
};
export async function reconcileEntitlement(
  db: ReconciliationDb,
  userId: string,
  apiKey: string,
  reason: "sync" | "webhook" | "recovery",
): Promise<ReconcileOutcome> {
  if (!UUID_RE.test(userId)) throw new InputError("invalid user");
  const claim = record(
    await rpc(db, "claim_entitlement_reconciliation", {
      p_user: userId,
      p_reason: reason,
    }),
    "claim",
  );
  if (claim.outcome !== "claimed") {
    if (!["fresh", "busy", "rate_limited"].includes(String(claim.outcome)))
      throw new Error("invalid claim outcome");
    return claim as ReconcileOutcome;
  }
  const lease = boundedString(claim.lease_token, "lease", 128);
  if (
    typeof claim.generation !== "number" ||
    !Number.isSafeInteger(claim.generation)
  )
    throw new Error("invalid generation");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("provider unavailable");
    const payload = record(
      await readBoundedJson(response, 262_144),
      "response",
    );
    if (claim.minimum_event_time != null) {
      const minimum = Date.parse(String(claim.minimum_event_time));
      if (
        typeof payload.request_date_ms !== "number" ||
        !Number.isFinite(payload.request_date_ms) ||
        payload.request_date_ms < minimum ||
        payload.request_date_ms > Date.now() + 300_000
      ) {
        throw new Error(
          "canonical response predates event or has no request time",
        );
      }
    }
    const snapshot = parseSubscriber(payload);
    const applied = record(
      await rpc(db, "finish_entitlement_reconciliation", {
        p_user: userId,
        p_lease_token: lease,
        p_generation: claim.generation,
        p_snapshot: snapshot,
      }),
      "apply outcome",
    );
    if (applied.outcome !== "applied")
      throw new Error("reconciliation superseded");
    return { outcome: "applied", is_premium: snapshot.is_premium };
  } catch {
    await rpc(db, "fail_entitlement_reconciliation", {
      p_user: userId,
      p_lease_token: lease,
      p_error_code: "reconciliation_failed",
    });
    throw new Error("reconciliation pending");
  } finally {
    clearTimeout(timeout);
  }
}
