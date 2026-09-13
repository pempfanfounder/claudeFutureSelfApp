# Notification Operations Guide

How to run, tune, and debug Future Self push notifications from the Supabase
dashboard. No app update or redeploy is needed for anything in this guide:
**content is selected at dispatch time**, so every change below applies
automatically to all future, not-yet-sent notifications.

Everything here happens in the Supabase dashboard:

- **Table Editor** — point-and-click edits to `content_items`, `campaigns`, etc.
- **SQL Editor** — paste the snippets below.

## How the pipeline works (30 seconds)

1. Every 5 minutes, `enqueue_due_notifications()` (pg_cron, in-database) finds
   users who are due a notification and drops a small job into the `push_jobs`
   queue (pgmq). Hourly at :30, `enqueue_trial_reminders()` does the same for
   trials ending in 12–36 hours.
2. Every minute, pg_cron invokes the `push-dispatch` edge function. It reads
   up to 50 jobs, **picks the content at that moment** (active campaigns
   first, then a personalized rotation), records an idempotent row in
   `notification_deliveries`, and sends via Expo.
3. Every 5 minutes (`*/5 * * * *`), `push-receipts` collects Expo delivery
   receipts and deactivates dead device tokens.

Because step 2 chooses content at send time, editing `content_items` or
`campaigns` changes what goes out from the next minute onward.

---

## Content: activate, deactivate, prioritize

An item is eligible for notifications when **all** of these hold:

- `active = true`
- `notification_eligible = true`
- body is ≤ 178 characters (longer items stay in-app only)
- it was not already sent to that user in the last 14 days
  (relaxed automatically if the user has exhausted the pool)

Ranking: items whose `categories`/`tags` overlap the user's onboarding
interests first, then higher `priority`, then random.

```sql
-- Kill a bad item immediately (in-app AND notifications).
update public.content_items set active = false where id = '<item-uuid>';

-- Keep an item in the app but stop notifying with it.
update public.content_items set notification_eligible = false where id = '<item-uuid>';

-- Boost an item so it wins ties within its interest bucket (default is 0).
update public.content_items set priority = 100 where id = '<item-uuid>';

-- Find an item by its text.
select id, type, left(body, 80) as body, active, notification_eligible, priority
from public.content_items
where body ilike '%discipline%';
```

Deactivating an item takes effect on the very next dispatch (within a
minute). Notifications already handed to Expo/APNs/FCM cannot be recalled.

## Campaigns: schedule specific content

Campaigns beat the personalized rotation. The dispatcher checks active
campaigns (highest `priority` first) whose window contains "now"; the first
one whose `audience` matches the user wins.

Audience formats:

| Audience JSON                            | Matches                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `{"all": true}`                          | everyone                                       |
| `{"categories": ["discipline","focus"]}` | users whose interests overlap those categories |
| `{"variant": "stella-founder"}`          | users on that onboarding variant               |

```sql
-- Push one specific quote to everyone for 24 hours.
insert into public.campaigns (name, kind, content_id, audience, starts_at, ends_at, priority)
values (
  'new-year-push',
  'quote',                         -- 'quote' or 'affirmation'
  '<content-uuid>',
  '{"all": true}',
  now(),
  now() + interval '24 hours',
  10
);

-- Target users interested in discipline, next Monday 9:00–21:00 UTC.
insert into public.campaigns (name, kind, content_id, audience, starts_at, ends_at)
values ('discipline-monday', 'quote', '<content-uuid>',
        '{"categories": ["discipline"]}',
        '2026-08-17 09:00+00', '2026-08-17 21:00+00');

-- Temporary override: custom title/body without creating a content item.
-- (override_body is sent verbatim; override_title replaces "Future Self".)
insert into public.campaigns (name, kind, override_title, override_body, audience, ends_at)
values ('launch-day', 'affirmation',
        'Big day',
        'Today the new Future Self ships. You were part of it before it existed.',
        '{"variant": "stella-founder"}',
        now() + interval '12 hours');

-- Stop a campaign right now.
update public.campaigns set active = false where name = 'new-year-push';
```

Notes:

- If a campaign's `content_id` item is deactivated and there is no
  `override_body`, the campaign is skipped automatically — no broken sends.
- An open-ended campaign (`ends_at = null`) runs until you set
  `active = false`. Campaign sends are **not** subject to the 14-day repeat
  exclusion, so an always-on `{"all": true}` campaign will repeat for users;
  give campaigns an `ends_at`.

## Trial-ending reminders

Users on a free trial get one "Your trial ends soon" push 12–36 hours before
the trial converts (enqueued hourly at :30).

```sql
-- Turn it off for one user.
update public.notification_prefs set trial_reminder = false where user_id = '<user-uuid>';

-- Turn the whole feature off / back on.
select cron.unschedule('fs-trial-reminders');
select cron.schedule('fs-trial-reminders', '30 * * * *',
  $$select public.enqueue_trial_reminders(200);$$);
```

---

## Monitoring

### Deliveries

`notification_deliveries` has one row per attempted send. Status meanings:

| Status          | Meaning                                                       |
| --------------- | ------------------------------------------------------------- |
| `queued`        | claimed by the dispatcher, not yet handed to Expo (transient) |
| `ticket_ok`     | Expo accepted it; awaiting the delivery receipt               |
| `ticket_error`  | Expo rejected it (bad/expired token, etc.)                    |
| `receipt_ok`    | confirmed handed to Apple/Google                              |
| `receipt_error` | Apple/Google rejected it (`error_detail` says why)            |
| `skipped`       | intentionally not sent (`error_detail` says why)              |

```sql
-- Last 24h at a glance.
select status, kind, count(*)
from public.notification_deliveries
where created_at > now() - interval '24 hours'
group by status, kind
order by status, kind;

-- Recent failures with reasons.
select created_at, user_id, kind, status, error_detail, left(body, 60) as body
from public.notification_deliveries
where status in ('ticket_error','receipt_error','skipped')
  and created_at > now() - interval '24 hours'
order by created_at desc
limit 100;

-- What did a specific user receive?
select created_at, kind, status, title, left(body, 80) as body, error_detail
from public.notification_deliveries
where user_id = '<user-uuid>'
order by created_at desc
limit 50;

-- How often is each content item being sent?
select content_id, count(*) as sends
from public.notification_deliveries
where created_at > now() - interval '7 days' and content_id is not null
group by content_id
order by sends desc
limit 20;
```

`DeviceNotRegistered` in `error_detail` is normal churn (app deleted, token
rotated); the system deactivates those devices automatically. A spike of
`InvalidCredentials` or `MismatchSenderId` means push credentials broke —
check the Expo dashboard.

### Queue health

```sql
-- Depth and age of the push queue. queue_length should hover near 0;
-- a growing number means the dispatcher is not keeping up or is failing.
select * from pgmq.metrics('push_jobs');

-- Messages that were archived (dropped after too many retries, no devices,
-- duplicates, etc.).
select * from pgmq.a_push_jobs order by archived_at desc limit 50;
```

### Cron health

```sql
-- Recent runs of all jobs (enqueue, dispatch, receipts, trial reminders).
select jobid, jobname, status, return_message, start_time
from cron.job_run_details
join cron.job using (jobid)
order by start_time desc
limit 50;

-- The schedule itself.
select jobid, jobname, schedule, active from cron.job order by jobname;
```

### Edge function logs

Dashboard → Edge Functions → `push-dispatch` / `push-receipts` → Logs. Each
dispatch run returns a summary like
`{"read":12,"sent":11,"ticket_error":0,"archived":1,"deferred":0}`.

Every failed database RPC writes one JSON line to `console.error` with
`event:"push_rpc_failure"`, the `function`, the `step` (RPC or query name),
a `reason` (`rpc_error`, `aborted`, `worker_deadline`, `invalid_response`,
`exception`), the PostgREST/SQLSTATE `code`, HTTP `status` (`0` = the fetch
itself failed), a truncated `message`, `elapsed_ms`, `deadline_ms`, whether
our `aborted` signal fired, and the retry `attempt`. PostgREST `details` and
`hint` are never logged. Every 503 body carries the same `reason`/`step`/
`code`/`status`, e.g.
`{"ok":false,"error":"queue unavailable","reason":"rpc_error","step":"queue_read","code":"PGRST001","status":503}`.

```sh
supabase functions logs push-dispatch --since 1h | grep push_rpc_failure
supabase functions logs push-receipts --since 1h | grep push_rpc_failure
```

The first RPC of each run (`queue_read`, `claim_push_receipts`) is retried
once after 2 s when the cause is transport-level or 5xx (`status` 0 or ≥ 500,
connection-class SQLSTATEs, `PGRST001–003`). Lease-bearing RPCs are never
retried by that policy.

### Time budgets

Each database RPC from `push-dispatch` and `push-receipts` is aborted after
`PUSH_RPC_DEADLINE_MS` (default 10 s, accepted range 1–12 s; unset or invalid
values fall back to the default). The default is sized for an edge cold start
plus the first PostgREST round-trip (~4–6 s on this project), not for the SQL
itself, which runs in milliseconds. A `push-dispatch` invocation stops
claiming new jobs 18 s before its 40 s worker deadline (room for one 8 s Expo
call plus one full-deadline persistence call), so a run always ends well
inside the 1-minute cron interval and the 90 s queue visibility timeout.
`push-receipts` has no worker deadline; its worst case is three RPCs plus one
8 s Expo call, which the 12 s ceiling keeps inside the 45 s receipt lease.

Symptoms of a deadline that is too short: `503 {"error":"queue unavailable",
"reason":"aborted",...}` from `push-dispatch` or `503 {"error":"receipt claim
unavailable","reason":"aborted",...}` from `push-receipts` on cold runs, with
no lease taken and nothing lost (the log line shows `aborted:true` and an
`elapsed_ms` close to `deadline_ms`). Raise the deadline by setting the
`PUSH_RPC_DEADLINE_MS` function secret and redeploying both functions. A 503
with `reason:"rpc_error"` is not a deadline problem: read its `code`/`status`.

---

## Emergency levers

```sql
-- Pause ALL sending (queue keeps filling; drains when re-enabled).
select cron.unschedule('fs-push-dispatch');

-- Pause even enqueueing.
select cron.unschedule('fs-enqueue-due');

-- Resume.
select cron.schedule('fs-push-dispatch', '* * * * *',
  $$select public.invoke_push_function('push-dispatch');$$);
select cron.schedule('fs-enqueue-due', '*/5 * * * *',
  $$select public.enqueue_due_notifications(500);$$);

-- Drop everything currently waiting in the queue (unsent jobs only).
select pgmq.purge_queue('push_jobs');
```

Remember: once `push-dispatch` hands a message to Expo it cannot be recalled.
The levers above stop _future_ sends only.

---

## Deployment & secrets (reference)

Configured once; listed here for troubleshooting.

| Where                             | Name                             | Used by                                                                          |
| --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Edge function secrets             | `DISPATCH_SECRET`                | `push-dispatch`, `push-receipts` (must match the vault secret)                   |
| Edge function secrets (optional)  | `PUSH_RPC_DEADLINE_MS`           | `push-dispatch`, `push-receipts` per-RPC abort (default `10000`)                 |
| Edge function secrets             | `REVENUECAT_WEBHOOK_SECRET`      | `revenuecat-webhook` (Bearer auth from RevenueCat)                               |
| Edge function secrets             | `REVENUECAT_WEBHOOK_APP_ID`      | `revenuecat-webhook` (accepted `event.app_id`s; comma-separated list, see below) |
| Edge function secrets             | `REVENUECAT_WEBHOOK_ENVIRONMENT` | `revenuecat-webhook` (exact `event.environment`, e.g. `PRODUCTION`)              |
| Edge function secrets             | `REVENUECAT_SECRET_API_KEY`      | `sync-entitlement`, `revenuecat-webhook` (server-side verification)              |
| Vault (`vault.decrypted_secrets`) | `project_url`, `dispatch_secret` | `invoke_push_function()` cron caller                                             |

`revenuecat-webhook` returns `503 reconciliation not configured` until all
three of its RevenueCat secrets are set, and `400 event scope mismatch` for any
event whose `app_id`/`environment` is not listed. One RevenueCat project has
one app per platform, so list every app ID that posts to the webhook,
comma-separated (whitespace around entries is ignored; a single ID still
works):

```sh
supabase secrets set REVENUECAT_WEBHOOK_APP_ID=app6bb4e06e68,app6bbf4b6d0c   # iOS, Android
supabase secrets set REVENUECAT_WEBHOOK_ENVIRONMENT=PRODUCTION
```

Each stored `subscription_events.app_id` is the event's own `app_id`, so
iOS and Android receipts stay distinguishable in the inbox.

Deploy flags: `push-dispatch`, `push-receipts`, and `revenuecat-webhook` are
called by machines without a Supabase JWT — deploy them with
`--no-verify-jwt` (they authenticate via their own secrets). `delete-account`
and `sync-entitlement` keep JWT verification on:

```sh
supabase functions deploy push-dispatch --no-verify-jwt
supabase functions deploy push-receipts --no-verify-jwt
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy delete-account
supabase functions deploy sync-entitlement
```
