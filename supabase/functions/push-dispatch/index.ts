// push-dispatch: pgmq 'push_jobs' consumer, invoked every minute by pg_cron
// via pg_net. Picks content at dispatch time (campaigns first, then a
// personalized rotation), records an idempotent delivery row, and sends
// through Expo. Deploy with --no-verify-jwt: auth is the x-dispatch-secret.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createAdminClient } from '../_shared/admin.ts';
import { requireDispatchSecret } from '../_shared/auth.ts';
import { json } from '../_shared/http.ts';
import { mapWithConcurrency } from '../_shared/concurrency.ts';
import {
  EXPO_SEND_CHUNK,
  type ExpoPushMessage,
  type ExpoPushTicket,
  formatTicketError,
  sendExpoChunk,
} from '../_shared/expo.ts';
import {
  type CampaignRow,
  type DeviceRow,
  type NotificationPrefsRow,
  type PersonalizationRow,
  PUSH_KINDS,
  type PushJob,
  type PushKind,
  type QueueMessage,
} from '../_shared/types.ts';

const BATCH_SIZE = 400;
// How many messages may be in preparation (and later, finalization) at once.
// Each one holds a PostgREST connection; the instance allows 60 in total.
const PREPARE_CONCURRENCY = 10;
// Longer than the runtime budget so in-flight messages are never redelivered
// to a concurrent invocation mid-run.
const VISIBILITY_TIMEOUT_S = 120;
const RUNTIME_BUDGET_MS = 50_000;
const MAX_READS = 5;
const RECENT_CONTENT_DAYS = 14;

const APP_TITLE = 'Future Self';

const STREAK_BODIES: Array<(n: number) => string> = [
  (n) => `${n}-day streak, one small read from safety. Three words before midnight.`,
  (n) => `Your ${n}-day streak ends at midnight. One quick read keeps it alive.`,
  (n) => `Day ${n + 1} is still yours to claim. One short read before midnight.`,
];

const TRIAL_TITLE = 'Your trial ends soon';
const TRIAL_BODY =
  "Your free trial ends tomorrow. Nothing to do if you're staying — cancel anytime in Settings.";

interface NotificationContent {
  title: string;
  body: string;
  url: string;
  contentId: string | null;
  campaignId: string | null;
  snapshot: { body: string; author: string | null; type: string };
}

interface PreparedSend {
  msgId: number;
  deliveryId: string;
  job: PushJob;
  devices: DeviceRow[];
  messages: ExpoPushMessage[];
}

interface Stats {
  read: number;
  sent: number;
  ticket_error: number;
  archived: number;
  deferred: number;
}

Deno.serve(async (req) => {
  const denied = requireDispatchSecret(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const deadline = Date.now() + RUNTIME_BUDGET_MS;

  const { data: rawMessages, error: readError } = await admin.rpc('queue_read', {
    n: BATCH_SIZE,
    vt: VISIBILITY_TIMEOUT_S,
  });
  if (readError) return json({ error: readError.message }, 500);

  const queueMessages = (rawMessages ?? []) as QueueMessage[];
  const stats: Stats = {
    read: queueMessages.length,
    sent: 0,
    ticket_error: 0,
    archived: 0,
    deferred: 0,
  };

  // Phase 1: resolve each job to a claimed delivery + Expo messages.
  // Bounded concurrency: the work is round-trip bound, not CPU bound, so
  // overlapping it is what lets one invocation clear a 400-message batch.
  // Each message re-checks the deadline, so a slow run sheds the tail
  // rather than blowing through the budget.
  const outcomes = await mapWithConcurrency(
    queueMessages,
    PREPARE_CONCURRENCY,
    (msg) =>
      Date.now() > deadline
        ? Promise.resolve('deferred' as const)
        : prepareMessage(admin, msg),
  );

  const prepared: PreparedSend[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.ok) {
      if (outcome.value === 'archived') stats.archived++;
      else if (outcome.value === 'deferred') stats.deferred++;
      else prepared.push(outcome.value);
      continue;
    }
    const msg = queueMessages[i];
    console.error(`push-dispatch: msg ${msg.msg_id} failed to prepare:`, outcome.error);
    if (msg.read_ct > MAX_READS) {
      await exhaustMessage(admin, msg);
      stats.archived++;
    } else {
      stats.deferred++; // visibility timeout redelivers it
    }
  }

  // Phase 2: send, packing whole jobs into Expo-sized chunks so a transport
  // failure never leaves a single job half-sent across chunk boundaries.
  for (const batch of packIntoChunks(prepared)) {
    if (Date.now() > deadline) {
      stats.deferred += batch.length;
      continue;
    }
    let tickets: ExpoPushTicket[];
    try {
      tickets = await sendExpoChunk(batch.flatMap((p) => p.messages));
    } catch (err) {
      // Transport failure: leave every queue message in the batch; its
      // delivery row stays 'queued' and is reused on redelivery.
      console.error('push-dispatch: expo send failed:', err);
      stats.deferred += batch.length;
      continue;
    }
    // Slice tickets back onto their jobs before finalizing, so the
    // concurrent finalizers each own a disjoint set.
    let offset = 0;
    const withTickets = batch.map((p) => {
      const jobTickets = tickets.slice(offset, offset + p.messages.length);
      offset += p.messages.length;
      return { p, jobTickets };
    });

    const finalized = await mapWithConcurrency(
      withTickets,
      PREPARE_CONCURRENCY,
      ({ p, jobTickets }) => finalizeSend(admin, p, jobTickets),
    );

    for (let i = 0; i < finalized.length; i++) {
      const result = finalized[i];
      if (!result.ok) {
        console.error(
          `push-dispatch: msg ${withTickets[i].p.msgId} failed to finalize:`,
          result.error,
        );
        stats.deferred++;
        continue;
      }
      if (result.value) stats.sent++;
      else stats.ticket_error++;
    }
  }

  return json(stats);
});

// ---------------------------------------------------------------------------
// Phase 1: per-message preparation
// ---------------------------------------------------------------------------

async function prepareMessage(
  admin: SupabaseClient,
  msg: QueueMessage,
): Promise<PreparedSend | 'archived' | 'deferred'> {
  const job = msg.message;
  if (!job?.user_id || !job.local_date || !PUSH_KINDS.includes(job.kind)) {
    await archiveMessage(admin, msg.msg_id);
    return 'archived';
  }

  if (msg.read_ct > MAX_READS) {
    await exhaustMessage(admin, msg);
    return 'archived';
  }

  const [devicesRes, prefsRes] = await Promise.all([
    admin
      .from('devices')
      .select('id, push_token, platform')
      .eq('user_id', job.user_id)
      .eq('active', true)
      .eq('permission_status', 'granted')
      .not('push_token', 'is', null),
    admin
      .from('notification_prefs')
      .select('quotes_per_day, affirmations_per_day, streak_reminder, trial_reminder')
      .eq('user_id', job.user_id)
      .maybeSingle(),
  ]);
  if (devicesRes.error) throw devicesRes.error;
  if (prefsRes.error) throw prefsRes.error;

  // Cap defensively at the Expo chunk size; one user never has 100 devices.
  const devices = ((devicesRes.data ?? []) as DeviceRow[]).slice(0, EXPO_SEND_CHUNK);
  if (devices.length === 0) {
    await archiveMessage(admin, msg.msg_id);
    return 'archived';
  }

  // Prefs may have changed since the job was enqueued; honor the latest.
  if (prefsRes.data && !kindAllowed(job.kind, prefsRes.data as NotificationPrefsRow)) {
    await archiveMessage(admin, msg.msg_id);
    return 'archived';
  }

  const deliveryId = await claimDelivery(admin, job);
  if (deliveryId === null) {
    // Already delivered (or terminally recorded) by a previous run.
    await archiveMessage(admin, msg.msg_id);
    return 'archived';
  }

  const content = await buildNotification(admin, job);
  if (content === null) {
    await admin
      .from('notification_deliveries')
      .update({ status: 'skipped', error_detail: 'no content available' })
      .eq('id', deliveryId);
    await archiveMessage(admin, msg.msg_id);
    return 'archived';
  }

  const messages: ExpoPushMessage[] = devices.map((d) => ({
    to: d.push_token,
    title: content.title,
    body: content.body,
    data: {
      url: content.url,
      content_id: content.contentId,
      kind: job.kind,
      delivery_id: deliveryId,
    },
    sound: 'default',
    priority: 'default',
  }));

  // Persist what will be sent before sending, so a crash mid-send leaves an
  // inspectable 'queued' row that the retry reuses.
  const { error: updateError } = await admin
    .from('notification_deliveries')
    .update({
      device_id: devices[0].id,
      content_id: content.contentId,
      campaign_id: content.campaignId,
      title: content.title,
      body: content.body,
      content_snapshot: content.snapshot,
    })
    .eq('id', deliveryId);
  if (updateError) throw updateError;

  return { msgId: msg.msg_id, deliveryId, job, devices, messages };
}

/**
 * Claims the idempotency slot. Returns the delivery id to use, or null when
 * this slot was already handled (status advanced past 'queued').
 */
async function claimDelivery(admin: SupabaseClient, job: PushJob): Promise<string | null> {
  const key = idempotencyKey(job);
  const { data: inserted, error } = await admin
    .from('notification_deliveries')
    .upsert(
      {
        user_id: job.user_id,
        kind: job.kind,
        local_date: job.local_date,
        slot: job.slot ?? 0,
        idempotency_key: key,
        status: 'queued',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw error;
  if (inserted && inserted.length > 0) return inserted[0].id as string;

  const { data: existing, error: existingError } = await admin
    .from('notification_deliveries')
    .select('id, status')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (existingError) throw existingError;
  // 'queued' means a previous invocation crashed between claim and send:
  // reuse the row and try again.
  if (existing && existing.status === 'queued') return existing.id as string;
  return null;
}

function idempotencyKey(job: PushJob): string {
  return `${job.user_id}:${job.local_date}:${job.kind}:${job.slot ?? 0}`;
}

function kindAllowed(kind: PushKind, prefs: NotificationPrefsRow): boolean {
  switch (kind) {
    case 'quote':
      return prefs.quotes_per_day > 0;
    case 'affirmation':
      return prefs.affirmations_per_day > 0;
    case 'streak_risk':
      return prefs.streak_reminder;
    case 'trial_reminder':
      return prefs.trial_reminder ?? true;
  }
}

// ---------------------------------------------------------------------------
// Content selection (dispatch time — dashboard edits apply to future sends)
// ---------------------------------------------------------------------------

async function buildNotification(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  switch (job.kind) {
    case 'streak_risk':
      return await buildStreakRisk(admin, job);
    case 'trial_reminder':
      return buildTrialReminder();
    default:
      return await buildContentNotification(admin, job);
  }
}

async function buildStreakRisk(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  const { data: streak, error } = await admin
    .from('streaks')
    .select('current_streak')
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw error;

  const n = streak?.current_streak ?? 0;
  if (n <= 0) return null; // nothing left to protect

  const body = STREAK_BODIES[n % STREAK_BODIES.length](n);
  return {
    title: 'Your streak is on the line',
    body,
    url: 'futureself://feed',
    contentId: null,
    campaignId: null,
    snapshot: { body, author: null, type: 'streak_risk' },
  };
}

function buildTrialReminder(): NotificationContent {
  return {
    title: TRIAL_TITLE,
    body: TRIAL_BODY,
    url: 'futureself://settings',
    contentId: null,
    campaignId: null,
    snapshot: { body: TRIAL_BODY, author: null, type: 'trial_reminder' },
  };
}

async function buildContentNotification(
  admin: SupabaseClient,
  job: PushJob,
): Promise<NotificationContent | null> {
  const { data: personalization, error: pErr } = await admin
    .from('personalization')
    .select('variant, primary_goals, obstacles, future_traits, quote_interests, affirmation_interests')
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (pErr) throw pErr;

  const interests = interestsFor(job.kind, personalization as PersonalizationRow | null);

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
    const { data, error } = await admin.rpc('pick_notification_content', {
      p_user: job.user_id,
      p_kind: job.kind,
      p_interests: interests,
      p_exclude_days: days,
    });
    if (error) throw error;
    const row = data?.[0];
    if (row) {
      return formatContent(row.content_id, row.body, row.author ?? null, job.kind, null);
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
  const { data: campaigns, error } = await admin
    .from('campaigns')
    .select('id, kind, content_id, override_title, override_body, audience, priority')
    .eq('active', true)
    .eq('kind', kind)
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order('priority', { ascending: false });
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
  if (!audience || typeof audience !== 'object') return false;
  if (audience.all === true) return true;
  if (Array.isArray(audience.categories)) {
    return audience.categories.some((c) => interests.includes(String(c)));
  }
  if (typeof audience.variant === 'string') {
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
    const { data, error } = await admin
      .from('content_items')
      .select('id, body, author, active')
      .eq('id', campaign.content_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.active) item = data;
  }

  let content: NotificationContent;
  if (campaign.override_body) {
    // Overrides are sent verbatim (no author suffix).
    content = formatContent(item?.id ?? null, campaign.override_body, null, kind, campaign.id);
    content.snapshot = { body: campaign.override_body, author: null, type: kind };
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
  const displayBody = kind === 'quote' && author ? `${body} — ${author}` : body;
  return {
    title: APP_TITLE,
    body: displayBody,
    url: contentId ? `futureself://content/${contentId}?kind=${kind}` : 'futureself://feed',
    contentId,
    campaignId,
    snapshot: { body, author, type: kind },
  };
}

function interestsFor(kind: PushKind, p: PersonalizationRow | null): string[] {
  if (!p) return [];
  const primary = (kind === 'quote' ? p.quote_interests : p.affirmation_interests) ?? [];
  if (primary.length > 0) return primary;
  // No explicit interests: fall back to broader onboarding signals so the
  // scoring in pick_notification_content still has something to match.
  return [
    ...(p.primary_goals ?? []),
    ...(p.future_traits ?? []),
    ...(p.obstacles ?? []),
  ];
}

// ---------------------------------------------------------------------------
// Phase 2 helpers: sending + finalization
// ---------------------------------------------------------------------------

/** Packs whole jobs into chunks of <= EXPO_SEND_CHUNK messages. */
function packIntoChunks(prepared: PreparedSend[]): PreparedSend[][] {
  const batches: PreparedSend[][] = [];
  let current: PreparedSend[] = [];
  let count = 0;
  for (const p of prepared) {
    if (count + p.messages.length > EXPO_SEND_CHUNK && current.length > 0) {
      batches.push(current);
      current = [];
      count = 0;
    }
    current.push(p);
    count += p.messages.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Records tickets on the delivery row and deletes the queue message. Returns true when at least one ticket is ok. */
async function finalizeSend(
  admin: SupabaseClient,
  p: PreparedSend,
  tickets: ExpoPushTicket[],
): Promise<boolean> {
  let okTicketId: string | null = null;
  const errors: string[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const device = p.devices[i];
    if (ticket.status === 'ok') {
      okTicketId ??= ticket.id ?? null;
    } else {
      errors.push(formatTicketError(ticket));
      if (ticket.details?.error === 'DeviceNotRegistered' && device) {
        await admin
          .from('devices')
          .update({ active: false, push_token: null })
          .eq('push_token', device.push_token);
      }
    }
  }

  const { error } = await admin
    .from('notification_deliveries')
    .update({
      status: okTicketId ? 'ticket_ok' : 'ticket_error',
      expo_ticket_id: okTicketId,
      error_detail: errors.length > 0 ? errors.join('; ') : null,
      sent_at: new Date().toISOString(),
    })
    .eq('id', p.deliveryId);
  if (error) throw error;

  await deleteMessage(admin, p.msgId);
  return okTicketId !== null;
}

// ---------------------------------------------------------------------------
// Queue plumbing
// ---------------------------------------------------------------------------

async function deleteMessage(admin: SupabaseClient, msgId: number): Promise<void> {
  const { error } = await admin.rpc('queue_delete', { msg_id: msgId });
  if (error) throw error;
}

async function archiveMessage(admin: SupabaseClient, msgId: number): Promise<void> {
  const { error } = await admin.rpc('queue_archive', { msg_id: msgId });
  if (error) throw error;
}

/** A message that exceeded MAX_READS: record why, then archive it. */
async function exhaustMessage(admin: SupabaseClient, msg: QueueMessage): Promise<void> {
  const job = msg.message;
  if (job?.user_id && job.local_date && PUSH_KINDS.includes(job.kind)) {
    const key = idempotencyKey(job);
    // Create the record if it never got claimed...
    await admin.from('notification_deliveries').upsert(
      {
        user_id: job.user_id,
        kind: job.kind,
        local_date: job.local_date,
        slot: job.slot ?? 0,
        idempotency_key: key,
        status: 'skipped',
        error_detail: 'max retries',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );
    // ...and flip it to skipped only if it is still stuck in 'queued'
    // (never clobber a delivery that actually went out).
    await admin
      .from('notification_deliveries')
      .update({ status: 'skipped', error_detail: 'max retries' })
      .eq('idempotency_key', key)
      .eq('status', 'queued');
  }
  await archiveMessage(admin, msg.msg_id);
}
