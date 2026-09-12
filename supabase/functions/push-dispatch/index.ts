// S4: logical delivery leases and per-device send attempts. Transport can be
// uncertain; only SQL finalization may acknowledge queue progress.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/admin.ts";
import { requireDispatchSecret } from "../_shared/auth.ts";
import { json } from "../_shared/http.ts";
import { readBoundedJson, record, boundedString } from "../_shared/input.ts";
import { PUSH_RPC_DEADLINE_MS } from "../_shared/rpc-deadline.ts";
import type {
  CampaignRow,
  PersonalizationRow,
  PushJob,
  PushKind,
} from "../_shared/types.ts";

const APP_TITLE = "Future Self";
const RECENT_CONTENT_DAYS = 14;
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
const deadlines = new WeakMap<object, number>();

async function boundedDb(
  db: SupabaseClient,
  request: {
    abortSignal(
      signal: AbortSignal,
    ): PromiseLike<{ data: any; error: unknown }>;
  },
): Promise<{ data: any; error: unknown }> {
  const remaining = (deadlines.get(db) ?? 0) - Date.now();
  if (remaining <= 0) throw new Error("worker deadline reached");
  const controller = new AbortController();
  // Per-call cap sized for a cold start (see _shared/rpc-deadline.ts); the
  // worker deadline stays the hard bound on the whole invocation.
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(PUSH_RPC_DEADLINE_MS, remaining),
  );
  try {
    return await request.abortSignal(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
async function rpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await boundedDb(db, db.rpc(name, args));
  if (error) throw new Error("database operation failed");
  return data;
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
  } catch {
    // Includes timeouts, HTTP errors, malformed/truncated responses. Provider
    // acceptance may already have happened; these attempts must never auto-resend.
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
    messages = await rpc(db, "queue_read", { n: 10, vt: 90 });
  } catch {
    return json({ error: "queue unavailable" }, 503);
  }
  if (!Array.isArray(messages) || messages.length > 10)
    return json({ error: "invalid queue batch" }, 503);
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
        } catch {
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
    } catch {
      stats.persistence_errors++;
      if (deliveryId && lease && !begun) {
        try {
          await rpc(db, "release_push_delivery", {
            p_delivery_id: deliveryId,
            p_lease_token: lease,
            p_reason: "preparation_failed",
          });
        } catch {
          /* Expiring unsent lease remains recoverable. */
        }
      }
      // Once begun, lease recovery marks unknown outcomes uncertain. No payload logs.
    }
  }
  return json(stats, stats.persistence_errors ? 503 : 200);
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
  const { data: streak, error } = await boundedDb(
    admin,
    admin
      .from("streaks")
      .select("current_streak")
      .eq("user_id", job.user_id)
      .maybeSingle(),
  );
  if (error) throw error;

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
  const { data: personalization, error: pErr } = await boundedDb(
    admin,
    admin
      .from("personalization")
      .select(
        "variant, primary_goals, obstacles, future_traits, quote_interests, affirmation_interests",
      )
      .eq("user_id", job.user_id)
      .maybeSingle(),
  );
  if (pErr) throw pErr;

  const interests = interestsFor(
    job.kind,
    personalization as PersonalizationRow | null,
  );

  const campaign = await matchCampaign(
    admin,
    job.kind,
    interests,
    (personalization as PersonalizationRow | null)?.variant ?? null,
  );
  if (campaign) return campaign;

  // Personalized rotation; if every eligible item went out in the last
  // 14 days, relax the exclusion rather than sending nothing.
  for (const days of [RECENT_CONTENT_DAYS, 0]) {
    const { data, error } = await boundedDb(
      admin,
      admin.rpc("pick_notification_content", {
        p_user: job.user_id,
        p_kind: job.kind,
        p_interests: interests,
        p_exclude_days: days,
      }),
    );
    if (error) throw error;
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
  const { data: campaigns, error } = await boundedDb(
    admin,
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
  if (error) throw error;

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
    const { data, error } = await boundedDb(
      admin,
      admin
        .from("content_items")
        .select("id, body, author, active")
        .eq("id", campaign.content_id)
        .maybeSingle(),
    );
    if (error) throw error;
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
