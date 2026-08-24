# Notification pipeline: 100k-user readiness

**Date:** 2026-08-24
**Status:** Approved for implementation
**Scope:** Push notification pipeline capacity, migration reconciliation, data retention

## Problem

The push pipeline has hard throughput ceilings set by cron schedules and batch-size
constants. They are independent of database size, so no amount of compute fixes them.

| Job | Schedule | Batch | Ceiling |
|---|---|---|---|
| `fs-enqueue-due` | `*/5` | 500 | 144,000/day |
| `fs-push-dispatch` | `*/1` | 50 | **72,000/day** |
| `fs-push-receipts` | `*/15` | 300 | 28,800/day |
| `fs-trial-reminders` | `30 * * * *` | 200 | 4,800/day |

The dispatcher is the binding constraint. At the default 3 quotes + 3 affirmations per
day, it saturates at ~12,000 premium users assuming a perfectly flat 24-hour spread.
Real sends are confined to a 9:00–21:00 local window and users cluster by timezone, so
the practical ceiling is closer to **6,000 premium users**.

Production permits up to 20 per kind per day (raised by the `security_grants_and_caps`
migration), so the worst case per user is 40/day, not 6.

### Failure mode

Saturation degrades badly rather than visibly:

1. `enqueue_due_notifications` increments `quotes_sent` / `affirmations_sent`
   optimistically, before the dispatcher confirms. A push that never sends still
   consumes the user's daily quota.
2. Backlogged jobs carry a stale `local_date` inside their idempotency key, so a late
   dispatch delivers a previous day's slot.
3. Messages that miss the 50s runtime budget are deferred, `read_ct` climbs, and at
   `read_ct > 5` `prepareMessage` archives them as `skipped: max retries` — silent loss.

Nothing surfaces an error. The observable symptom is "notifications stopped working".

## Secondary defects

**Free-user leak.** `recalc_notification_state` does not check entitlements. Every app
open calls `register_device` → `recalc`, which arms `next_due_at` for free users. The
enqueue pass later spends a slot discovering they are not premium and clearing it.
Cost is proportional to free-user app opens: tolerable at 100k installs, exceeds the
entire enqueue budget at 1M.

**Receipts cannot keep up.** 28,800/day of receipt checking against a 72,000/day
delivery ceiling. `DeviceNotRegistered` cleanup stops working, dead tokens accumulate
in `devices`, and those dead tokens then consume dispatcher capacity permanently.

**No data retention.** Four cron jobs exist; none purge. `daily_progress`,
`daily_sets`, `streak_completions`, `notification_deliveries` and the pgmq archive grow
without bound on unpartitioned tables. Roughly 30–50 GB/year at 100k DAU.

**Repo/production migration drift.** Production recorded five migrations under version
stamps that do not exist in `supabase/migrations/`, plus two migrations with no file at
all. `supabase db push` from this repo would treat all five local files as unapplied and
re-run them against a live database — re-executing `pgmq.create`, `cron.schedule` and
`create table`. Verified: the remote copies are functionally identical to the local
files; the byte differences are comment-only lines stripped by the MCP apply path.

## Design

### 1. Migration reconciliation

Rename local files to the version stamps production recorded, and add the two missing
migrations as files reconstructed from `supabase_migrations.schema_migrations`:

| Local file | Becomes |
|---|---|
| `20260809090000_core.sql` | `20260808184810_core.sql` |
| `20260809092000_notifications.sql` | `20260808184942_notifications.sql` |
| `20260809093000_seed_content.sql` | `20260808190513_seed_content.sql` |
| `20260809100000_notifications_v2.sql` | `20260808192549_notifications_v2.sql` |
| `20260809101500_register_device_nullif.sql` | `20260808192608_register_device_nullif.sql` |
| — | `20260815145751_security_grants_and_caps.sql` (new) |
| — | `20260815153419_daily_sets_cap.sql` (new) |

File renames only; no SQL executes. Afterwards the repo describes production and
`db push` is a no-op.

### 2. Dispatcher throughput

`supabase/functions/push-dispatch/index.ts`:

- Replace the serial phase-1 loop with bounded concurrency, 10 in flight.
- Raise `BATCH_SIZE` from 50 to 400.
- Leave phase 2 (Expo send) sequential — Expo rate-limits, and the existing
  chunk-packing already guarantees a job is never split across chunks.
- Leave deadline and `read_ct` handling unchanged.

Concurrency is capped at 10 because each in-flight message holds a PostgREST
connection; the instance allows 60 total.

Capacity: 72,000/day → ~576,000/day.

### 3. Entitlement gate in `recalc_notification_state`

Set `next_due_at = null` unless the user has an active entitlement
(`is_premium and (expires_at is null or expires_at > now())`).

The existing check in `enqueue_due_notifications` **stays**. It catches entitlements
that lapse by time without a webhook firing. Two independent layers.

Self-healing: `revenuecat-webhook` upserts the entitlement *then* calls
`recalc_notification_state`, so a new subscriber is armed within seconds. Any stale
state is corrected on the next app open.

### 4. Enqueue and receipts capacity

Split the streak-risk pass out of `enqueue_due_notifications` into a new
`enqueue_streak_risk(p_batch int)`. Without this, moving the main pass to every-minute
would run its five-table join 5× more often for no benefit.

| Job | From | To |
|---|---|---|
| `fs-enqueue-due` | `*/5`, 500 | `*/1`, 1000 |
| `fs-streak-risk` | (inside enqueue-due) | `*/5`, 500 |
| `fs-push-receipts` | `*/15`, 300 | `*/5`, 1000 |

`push-receipts` also replaces its per-row `UPDATE` loop with grouped updates by status.

### 5. Retention

New `purge_old_data(p_days int default 90, p_batch int default 5000)`:

- Batched deletes in a bounded loop; no single long-lived lock.
- Covers `daily_progress`, `daily_sets`, `streak_completions`,
  `notification_deliveries`, and the pgmq archive table.
- **`streaks` is never touched.** Current and longest streak are derived state stored
  there and must survive purging.
- New cron `fs-purge-old-data`, daily at 03:15 UTC.

Retention window: 90 days.

### 6. Out of scope

Upgrading the database off the free-tier Nano instance (60 max connections, 224 MB
shared buffers). This is a billing action on the owner's account. The code changes here
are correct and ready, but the throughput they enable is not realisable until the
instance is upgraded.

## Testing

Production currently holds 6 profiles, 2 devices, 0 entitlements and 0 deliveries — it
is pre-launch. The risk being managed is shipping something subtly wrong that fails at
launch, not corrupting live data.

1. **Deno unit tests** for the bounded-concurrency helper (pure logic).
2. **Integration test against production**: seed synthetic users (premium, free,
   multiple timezones), drive the real enqueue → dispatch path, assert outcomes, then
   delete by cascade.
3. **SQL assertion script**: cron schedules, function grants, constraints, and the
   entitlement gate's behaviour.
4. **Regression gate**: existing jest suite, `npm run typecheck`, `npm run lint` green.

## Rollback

Every migration is written `create or replace` / `if not exists` and is re-runnable.
Rollback is a follow-up migration restoring the prior function bodies and cron
schedules; the prior definitions are preserved in the reconciled migration files.
Cron jobs are unscheduled and rescheduled by name, so a rollback restores the original
cadence exactly.

## Success criteria

- Dispatcher code sustains 400 messages/invocation without hitting the runtime deadline.
- Free users never appear in the `next_due_at` index.
- A 90-day retention job runs daily and bounds all growing tables.
- `supabase db push` against production is a no-op.
- No change to any user-visible client behaviour.
