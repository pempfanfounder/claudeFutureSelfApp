// S4: logical delivery leases and per-device send attempts. Transport can be
// uncertain; only SQL finalization may acknowledge queue progress.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/admin.ts";
import { requireDispatchSecret } from "../_shared/auth.ts";
import { json } from "../_shared/http.ts";
import {
  InputError,
  readBoundedJson,
  record,
  boundedString,
} from "../_shared/input.ts";
import { PUSH_RPC_DEADLINE_MS } from "../_shared/rpc-deadline.ts";
import {
  describeDbError,
  failureBody,
  logFailure,
  retryOnceIfTransient,
  RpcFailure,
} from "../_shared/rpc-failure.ts";
import type {
  CampaignRow,
  PersonalizationRow,
  PushJob,
  PushKind,
} from "../_shared/types.ts";

const APP_TITLE = "Future Self";
const RECENT_CONTENT_DAYS = 14;
/**
 * Server counterpart of the app's EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED.
 * Off by default (owner decision): push picks and campaign audiences ignore
 * the user's interests; pick_notification_content then orders by editorial
 * priority and random() only. Set the edge-function secret to "true" to
 * re-enable interest weighting.
 */
const CONTENT_PERSONALIZATION_ENABLED =
  Deno.env.get("CONTENT_PERSONALIZATION_ENABLED") === "true";
const STREAK_BODIES: Array<(n: number) => string> = [
  (n) =>
    `${n}-day streak, one small read from safety. Three words before midnight.`,
  (n) =>
    `Your ${n}-day streak ends at midnight. One quick read keeps it alive.`,
  (n) =>
    `Day ${n + 1} is still yours to claim. One short read before midnight.`,
];
const TRIAL_TITLE = "Your trial ends soon";
const TRIAL_BODY =
  "Your free trial ends soon. Review your subscription in Settings.";
interface NotificationContent {
  title: string;
  body: string;
  url: string;
  contentId: string | null;
  campaignId: string | null;
  snapshot: { body: string; author: string | null; type: string };
}
interface Attempt {
  id: string;
  device_id: string;
  registration_version: number;
  push_token: string;
}
interface SendResult {
  attempt_id: string;
  state: "ticket_ok" | "ticket_error" | "uncertain";
  ticket_id?: string;
  error_code?: string;
}
const ERROR_CODES = new Set([
  "DeviceNotRegistered",
  "MessageTooBig",
  "MessageRateExceeded",
  "MismatchSenderId",
  "InvalidCredentials",
]);
const FN = "push-dispatch";
const deadlines = new WeakMap<object, number>();

type DbResult = { data: any; error: unknown; status?: number };
// postgrest-js types `.maybeSingle()` as a bare PostgrestBuilder without
// `abortSignal`, but returns `this` at runtime, so the method is always
// present. Accept it as optional and fail closed if it ever is not.
type BoundedRequest = PromiseLike<DbResult> & {
  abortSignal?(signal: AbortSignal): PromiseLike<DbResult>;
};

/**
 * Runs one database request under the per-call abort cap and the worker
 * deadline. Resolves with `data`; throws RpcFailure carrying the shaped cause
 * (code/status/truncated message, elapsed time, whether the abort fired).
 */
async function boundedDb(
  db: SupabaseClient,
  step: string,
  request: BoundedRequest,
): Promise<DbResult["data"]> {
  const remaining = (deadlines.get(db) ?? 0) - Date.now();
  if (remaining <= 0)
    throw new RpcFailure(
      step,
      {
        reason: "worker_deadline",
        message: "worker deadline reached",
        transient: false,
      },
      0,
      false,
      0,
    );
  if (typeof request.abortSignal !== "function")
    throw new RpcFailure(
      step,
      {
        reason: "not_abortable",
        message: "database request is not abortable",
        transient: false,
      },
      0,
      false,
      null,
    );
  const controller = new AbortController();
  // Per-call cap sized for a cold start (see _shared/rpc-deadline.ts); the
  // worker deadline stays the hard bound on the whole invocation.
  const deadlineMs = Math.min(PUSH_RPC_DEADLINE_MS, remaining);
  const timeout = setTimeout(() => controller.abort(), deadlineMs);
  const started = Date.now();
  let result: DbResult;
  try {
    result = await request.abortSignal(controller.signal);
  } catch (thrown) {
    // postgrest-js resolves with `error` rather than rejecting, so this is
    // only reached for unexpected client-side throws.
    throw new RpcFailure(
      step,
      describeDbError(thrown, undefined, controller.signal.aborted),
      Date.now() - started,
      controller.signal.aborted,
      deadlineMs,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (result.error)
    throw new RpcFailure(
      step,
      describeDbError(result.error, result.status, controller.signal.aborted),
      Date.now() - started,
      controller.signal.aborted,
      deadlineMs,
    );
  return result.data;
}
async function rpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  return await boundedDb(db, name, db.rpc(name, args));
}
async function send(
  attempts: Attempt[],
  content: NotificationContent,
  deliveryId: string,
  kind: string,
): Promise<SendResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(
        attempts.map((a) => ({
          to: a.push_token,
          title: content.title,
          body: content.body,
          data: {
            url: content.url,
            content_id: content.contentId,
            kind,
            delivery_id: deliveryId,
          },
          sound: "default",
          priority: "default",
        })),
      ),
    });
    if (!response.ok) throw new Error("provider outcome uncertain");
    const payload = record(await readBoundedJson(response, 65_536), "tickets");
    if (!Array.isArray(payload.data) || payload.data.length !== attempts.length)
      throw new Error("invalid ticket count");
    const ids = new Set<string>();
    return payload.data.map((raw, i) => {
      const ticket = record(raw, "ticket");
      if (ticket.status === "ok") {
        const id = boundedString(ticket.id, "ticket id", 128);
        if (ids.has(id)) throw new Error("duplicate ticket id");
        ids.add(id);
        return {
          attempt_id: attempts[i].id,
          state: "ticket_ok",
          ticket_id: id,
        };
      }
      if (ticket.status !== "error") throw new Error("invalid ticket status");
      const details =
        ticket.details === undefined
          ? {}
          : record(ticket.details, "ticket details");
      const code =
        typeof details.error === "string" && ERROR_CODES.has(details.error)
          ? details.error
          : "unknown_ticket_error";
      return {
        attempt_id: attempts[i].id,
        state: "ticket_error",
        error_code: code,
      };
    });
  } catch (error) {
    // Includes timeouts, HTTP errors, malformed/truncated responses. Provider
    // acceptance may already have happened; these attempts must never auto-resend.
    // Provider messages may echo request content, so only the error class and
    // whether our abort fired are logged.
    console.error(
      JSON.stringify({
        event: "push_provider_failure",
        function: FN,
        step: "expo_send",
        reason: "provider_outcome_uncertain",
        name: (error as { name?: unknown } | null)?.name ?? typeof error,
        aborted: controller.signal.aborted,
      }),
    );
    return attempts.map((a) => ({
      attempt_id: a.id,
      state: "uncertain",
      error_code: "provider_outcome_uncertain",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const denied = requireDispatchSecret(req);
  if (denied) return denied;
  const db = createAdminClient();
  const deadline = Date.now() + 40_000;
  deadlines.set(db, deadline);
  const stats = {
    read: 0,
    archived: 0,
    deferred: 0,
    ticket_ok: 0,
    ticket_error: 0,
    uncertain: 0,
    retry_wait: 0,
    queue_deleted: 0,
    persistence_errors: 0,
  };
  let messages;
  try {
    // Safe to run twice: queue_read only sets a 90 s visibility timeout on
    // whatever it returns. If the first call committed but its response was
    // lost, those messages are simply redelivered after the timeout with
    // read_ct+1; no lease token is involved and nothing is acknowledged.
    messages = await retryOnceIfTransient(FN, "queue_read", () =>
      rpc(db, "queue_read", { n: 10, vt: 90 }),
    );
  } catch (error) {
    return json(failureBody("queue unavailable", error, "queue_read"), 503);
  }
  if (!Array.isArray(messages) || messages.length > 10) {
    logFailure(FN, "queue_read", new InputError("invalid queue batch"));
    return json(
      {
        ok: false,
        error: "invalid queue batch",
        reason: "invalid_response",
        step: "queue_read",
      },
      503,
    );
  }
  stats.read = messages.length;
  for (const msg of messages) {
    if (Date.now() + 18_000 > deadline) {
      stats.deferred++;
      continue;
    }
    let deliveryId: string | null = null,
      lease: string | null = null,
      begun = false;
    try {
      const claim = record(
        await rpc(db, "claim_push_job", { p_msg_id: msg.msg_id }),
        "claim",
      );
      if (claim.outcome !== "claimed") {
        if (claim.outcome === "archived") stats.archived++;
        else stats.deferred++;
        continue;
      }
      deliveryId = boundedString(claim.delivery_id, "delivery id");
      lease = boundedString(claim.lease_token, "lease");
      const job = claim.job as PushJob;
      const content = claim.content
        ? (claim.content as NotificationContent)
        : await buildNotification(db, job);
      if (!content) {
        const released = record(
          await rpc(db, "release_push_delivery", {
            p_delivery_id: deliveryId,
            p_lease_token: lease,
            p_reason: "no_content",
          }),
          "release",
        );
        if (released.queue_archived === true) stats.archived++;
        else stats.deferred++;
        continue;
      }
      await rpc(db, "prepare_push_delivery", {
        p_delivery_id: deliveryId,
        p_lease_token: lease,
        p_content: content,
      });
      // Leave time for one transport call (8 s) plus one full-deadline
      // persistence call; the persistence retry runs in whatever remains,
      // since warm RPCs finish in milliseconds. A preparation that consumes
      // the time allowance stays unsent/recoverable.
      if (Date.now() + 18_000 > deadline)
        throw new Error("insufficient send time");
      const ready = record(
        await rpc(db, "begin_push_send", {
          p_delivery_id: deliveryId,
          p_lease_token: lease,
        }),
        "send claim",
      );
      if (ready.outcome !== "sending") {
        if (ready.queue_archived === true) stats.archived++;
        else stats.deferred++;
        continue;
      }
      begun = true;
      if (
        !Array.isArray(ready.attempts) ||
        ready.attempts.length < 1 ||
        ready.attempts.length > 8
      )
        throw new Error("invalid attempts");
      const attempts = ready.attempts as Attempt[];
      const results = await send(
        attempts,
        ready.content as NotificationContent,
        deliveryId,
        job.kind,
      );
      let persisted: Record<string, unknown> | null = null;
      // Retry only the idempotent persistence call, never the provider send.
      for (let retry = 0; retry < 2 && !persisted; retry++) {
        try {
          persisted = record(
            await rpc(db, "finish_push_send", {
              p_delivery_id: deliveryId,
              p_lease_token: lease,
              p_results: results,
            }),
            "send result",
          );
        } catch (error) {
          logFailure(FN, "finish_push_send", error, {
            attempt: retry,
            msgId: msg.msg_id,
            deliveryId,
          });
          if (retry === 1) throw new Error("send persistence unavailable");
        }
      }
      if (persisted?.outcome !== "persisted")
        throw new Error("send finalizer superseded");
      stats.ticket_ok += Number(persisted.ticket_ok ?? 0);
      stats.ticket_error += Number(persisted.ticket_error ?? 0);
      stats.uncertain += Number(persisted.uncertain ?? 0);
      stats.retry_wait += Number(persisted.retry_wait ?? 0);
      if (persisted.queue_deleted === true) stats.queue_deleted++;
    } catch (error) {
      stats.persistence_errors++;
      // Cause only (step, code, status, truncated message); never the job
      // payload or notification content.
      logFailure(
        FN,
        begun ? "after_begin_push_send" : "process_message",
        error,
        {
          msgId: msg.msg_id,
          deliveryId: deliveryId ?? undefined,
        },
      );
      if (deliveryId && lease && !begun) {
        try {
          await rpc(db, "release_push_delivery", {
            p_delivery_id: deliveryId,
            p_lease_token: lease,
            p_reason: "preparation_failed",
          });
        } catch (releaseError) {
          // Expiring unsent lease remains recoverable.
          logFailure(FN, "release_push_delivery", releaseError, {
            msgId: msg.msg_id,
            deliveryId,
          });
        }
      }
      // Once begun, lease recovery marks unknown outcomes uncertain.
    }
  }
  return json(
    stats.persistence_errors
      ? { ok: false, reason: "message_failures", ...stats }
      : stats,
    stats.persistence_errors ? 503 : 200,
  );
});

async function buildNotification(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  switch (job.kind) {
    case "streak_risk":
      return await buildStreakRisk(admin, job);
    case "trial_reminder":
      return buildTrialReminder();
    default:
      return await buildContentNotification(admin, job);
  }
}

async function buildStreakRisk(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  const streak = await boundedDb(
    admin,
    "streaks_select",
    admin
      .from("streaks")
      .select("current_streak")
      .eq("user_id", job.user_id)
      .maybeSingle(),
  );

  const n = streak?.current_streak ?? 0;
  if (n <= 0) return null; // nothing left to protect

  const body = STREAK_BODIES[n % STREAK_BODIES.length](n);
  return {
    title: "Your streak is on the line",
    body,
    url: "futureself://feed",
    contentId: null,
    campaignId: null,
    snapshot: { body, author: null, type: "streak_risk" },
  };
}

function buildTrialReminder(): NotificationContent {
  return {
    title: TRIAL_TITLE,
    body: TRIAL_BODY,
    url: "futureself://settings",
    contentId: null,
    campaignId: null,
    snapshot: { body: TRIAL_BODY, author: null, type: "trial_reminder" },
  };
}

async function buildContentNotification(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  const personalization = await boundedDb(
    admin,
    "personalization_select",
    admin
      .from("personalization")
      .select(
        "variant, primary_goals, obstacles, future_traits, quote_interests, affirmation_interests",
      )
      .eq("user_id", job.user_id)
      .maybeSingle(),
  );

  const interests = CONTENT_PERSONALIZATION_ENABLED
    ? interestsFor(job.kind, personalization as PersonalizationRow | null)
    : [];

  const campaign = await matchCampaign(
    admin,
    job.kind,
    interests,
    (personalization as PersonalizationRow | null)?.variant ?? null,
  );
  if (campaign) return campaign;

  // Per-user rotation (interest-weighted only when personalization is on);
  // if every eligible item went out in the last 14 days, relax the
  // exclusion rather than sending nothing.
  for (const days of [RECENT_CONTENT_DAYS, 0]) {
    const data = await boundedDb(
      admin,
      "pick_notification_content",
      admin.rpc("pick_notification_content", {
        p_user: job.user_id,
        p_kind: job.kind,
        p_interests: interests,
        p_exclude_days: days,
      }),
    );
    const row = data?.[0];
    if (row) {
      return formatContent(
        row.content_id,
        row.body,
        row.author ?? null,
        job.kind,
        null,
      );
    }
  }
  return null;
}

async function matchCampaign(
  admin: SupabaseClient,
  kind: PushKind,
  interests: string[],
  variant: string | null,
): Promise<NotificationContent | null> {
  const nowIso = new Date().toISOString();
  const campaigns = await boundedDb(
    admin,
    "campaigns_select",
    admin
      .from("campaigns")
      .select(
        "id, kind, content_id, override_title, override_body, audience, priority",
      )
      .eq("active", true)
      .eq("kind", kind)
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order("priority", { ascending: false })
      .limit(100),
  );

  for (const campaign of (campaigns ?? []) as CampaignRow[]) {
    if (!matchesAudience(campaign.audience, interests, variant)) continue;
    const resolved = await resolveCampaign(admin, campaign, kind);
    if (resolved) return resolved; // first (highest-priority) match wins
  }
  return null;
}

function matchesAudience(
  audience: Record<string, unknown> | null,
  interests: string[],
  variant: string | null,
): boolean {
  if (!audience || typeof audience !== "object") return false;
  if (audience.all === true) return true;
  if (Array.isArray(audience.categories)) {
    return audience.categories.some((c) => interests.includes(String(c)));
  }
  if (typeof audience.variant === "string") {
    return audience.variant === variant;
  }
  return false;
}

async function resolveCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow,
  kind: PushKind,
): Promise<NotificationContent | null> {
  let item: { id: string; body: string; author: string | null } | null = null;
  if (campaign.content_id) {
    const data = await boundedDb(
      admin,
      "content_items_select",
      admin
        .from("content_items")
        .select("id, body, author, active")
        .eq("id", campaign.content_id)
        .maybeSingle(),
    );
    if (data?.active) item = data;
  }

  let content: NotificationContent;
  if (campaign.override_body) {
    // Overrides are sent verbatim (no author suffix).
    content = formatContent(
      item?.id ?? null,
      campaign.override_body,
      null,
      kind,
      campaign.id,
    );
    content.snapshot = {
      body: campaign.override_body,
      author: null,
      type: kind,
    };
  } else if (item) {
    content = formatContent(item.id, item.body, item.author, kind, campaign.id);
  } else {
    // Campaign points at a missing/deactivated item and has no override.
    return null;
  }
  if (campaign.override_title) content.title = campaign.override_title;
  return content;
}

function formatContent(
  contentId: string | null,
  body: string,
  author: string | null,
  kind: PushKind,
  campaignId: string | null,
): NotificationContent {
  const displayBody = kind === "quote" && author ? `${body} — ${author}` : body;
  return {
    title: APP_TITLE,
    body: displayBody,
    url: contentId
      ? `futureself://content/${contentId}?kind=${kind}`
      : "futureself://feed",
    contentId,
    campaignId,
    snapshot: { body, author, type: kind },
  };
}

function interestsFor(kind: PushKind, p: PersonalizationRow | null): string[] {
  if (!p) return [];
  const primary =
    (kind === "quote" ? p.quote_interests : p.affirmation_interests) ?? [];
  if (primary.length > 0) return primary;
  // No explicit interests: fall back to broader onboarding signals so the
  // scoring in pick_notification_content still has something to match.
  return [
    ...(p.primary_goals ?? []),
    ...(p.future_traits ?? []),
    ...(p.obstacles ?? []),
  ];
}
