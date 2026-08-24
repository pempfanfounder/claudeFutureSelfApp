# Notification Pipeline 100k Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the push notification pipeline's sustainable throughput from ~72,000/day to ~576,000/day, stop free users consuming enqueue capacity, bound unbounded table growth at 90 days, and make the repo's migration history match production.

**Architecture:** Six independent changes. Two are pure repo hygiene (migration file reconciliation). Two are Deno edge function changes (bounded-concurrency prep in the dispatcher, grouped updates in the receipts worker). Two are SQL migrations (entitlement gate + streak-risk split + cron cadence; retention job). Each task is independently revertible.

**Tech Stack:** Postgres 17 + pgmq 1.5.1 + pg_cron 1.6.4 + pg_net 0.20.4, Supabase Edge Functions (Deno), TypeScript, Jest (client), `deno test` (edge functions).

**Reference spec:** `docs/superpowers/specs/2026-08-24-notification-pipeline-100k-design.md`

---

## Critical context for the implementer

**Production is pre-launch.** 6 profiles, 2 devices, 0 entitlements, 0 deliveries. Writing test rows is safe. The risk is shipping something that fails at launch, not corrupting data.

**Migration versions in the repo do not match production.** Production recorded five migrations under different timestamps and has two migrations with no file. Task 1 fixes this. Do not run `supabase db push` before Task 1 completes — it would re-run `create table` and `cron.schedule` against a live database.

**`cron.schedule(name, ...)` upserts by name** in pg_cron 1.6.4. Re-scheduling an existing job name replaces its schedule; it does not create a duplicate.

**`create or replace function` preserves grants** when the signature is unchanged. Grants are re-issued anyway in Task 4 so the migration is self-contained.

**Apply migrations via the Supabase MCP `apply_migration` tool**, matching how the existing production migrations were applied. Use the file's exact basename (without `.sql`) as the migration name.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/20260808*.sql`, `20260815*.sql` | Historical record matching production | Rename / create (Task 1) |
| `supabase/functions/_shared/concurrency.ts` | Bounded-concurrency map helper. Pure logic, no I/O. | Create (Task 2) |
| `supabase/functions/_shared/concurrency.test.ts` | Unit tests for the helper | Create (Task 2) |
| `supabase/functions/push-dispatch/index.ts` | Queue consumer. Uses the helper for phase 1 and phase 2. | Modify (Task 3) |
| `supabase/migrations/20260824120000_pipeline_capacity.sql` | Entitlement gate, streak-risk split, cron cadence | Create (Task 4) |
| `supabase/migrations/20260824120500_data_retention.sql` | `purge_old_data` + daily cron | Create (Task 5) |
| `supabase/functions/push-receipts/index.ts` | Receipt worker. Grouped updates. | Modify (Task 6) |
| `supabase/tests/pipeline_capacity_test.sql` | Self-cleaning integration test | Create (Task 7) |

---

## Task 1: Reconcile migration history with production

**Files:**
- Rename: `supabase/migrations/20260809090000_core.sql` → `20260808184810_core.sql`
- Rename: `supabase/migrations/20260809092000_notifications.sql` → `20260808184942_notifications.sql`
- Rename: `supabase/migrations/20260809093000_seed_content.sql` → `20260808190513_seed_content.sql`
- Rename: `supabase/migrations/20260809100000_notifications_v2.sql` → `20260808192549_notifications_v2.sql`
- Rename: `supabase/migrations/20260809101500_register_device_nullif.sql` → `20260808192608_register_device_nullif.sql`
- Create: `supabase/migrations/20260815145751_security_grants_and_caps.sql`
- Create: `supabase/migrations/20260815153419_daily_sets_cap.sql`

- [ ] **Step 1: Rename the five existing files with `git mv`**

```bash
cd supabase/migrations
git mv 20260809090000_core.sql                  20260808184810_core.sql
git mv 20260809092000_notifications.sql         20260808184942_notifications.sql
git mv 20260809093000_seed_content.sql          20260808190513_seed_content.sql
git mv 20260809100000_notifications_v2.sql      20260808192549_notifications_v2.sql
git mv 20260809101500_register_device_nullif.sql 20260808192608_register_device_nullif.sql
```

- [ ] **Step 2: Create the first missing migration file**

Create `supabase/migrations/20260815145751_security_grants_and_caps.sql`:

```sql
-- Future Self: security hardening + raised notification caps.
-- Reconstructed from production supabase_migrations.schema_migrations
-- (version 20260815145751) — this migration is ALREADY APPLIED in production.

revoke all on function public.invoke_push_function(text) from public, anon, authenticated;
revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.recalc_notification_state(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_due_notifications(int) to service_role;
grant execute on function public.recalc_notification_state(uuid) to service_role;

revoke all on function public.register_device(text, text, text, text, text, text, text) from anon;
revoke all on function public.deactivate_device(text) from anon;
revoke all on function public.record_view(uuid, date) from anon;
revoke all on function public.recalc_my_notification_state() from anon;

alter function public.set_updated_at() set search_path = '';
alter function public.compute_next_due(
  p_tz text, p_window_start integer, p_window_end integer,
  p_quiet_start integer, p_quiet_end integer,
  p_total_per_day integer, p_sent_today integer,
  p_local_now timestamp without time zone
) set search_path = '';

alter table public.notification_prefs
  drop constraint if exists notification_prefs_quotes_per_day_check;
alter table public.notification_prefs
  add constraint notification_prefs_quotes_per_day_check
    check (quotes_per_day between 0 and 20);
alter table public.notification_prefs
  drop constraint if exists notification_prefs_affirmations_per_day_check;
alter table public.notification_prefs
  add constraint notification_prefs_affirmations_per_day_check
    check (affirmations_per_day between 0 and 20);
```

- [ ] **Step 3: Create the second missing migration file**

Create `supabase/migrations/20260815153419_daily_sets_cap.sql`:

```sql
-- Future Self: raise the per-day content set cap from 10 to 20.
-- Reconstructed from production supabase_migrations.schema_migrations
-- (version 20260815153419) — this migration is ALREADY APPLIED in production.

alter table public.daily_sets
  drop constraint if exists daily_sets_content_ids_check;
alter table public.daily_sets
  add constraint daily_sets_content_ids_check
    check (array_length(content_ids, 1) <= 20);
```

- [ ] **Step 4: Verify every local filename matches a production migration version**

Run this against production via MCP `execute_sql`:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Then compare to `ls supabase/migrations/`. Expected: exactly seven files, and each
filename's leading timestamp appears in the query result. No file without a matching
version; no version without a matching file.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "chore(db): reconcile migration history with production

Production recorded five migrations under different version stamps than
the repo used, and two migrations had no file at all. Renames the five to
match, and adds the two missing ones reconstructed from
supabase_migrations.schema_migrations. Verified the remote copies are
functionally identical - the byte differences were comment-only lines
stripped by the MCP apply path.

Makes 'supabase db push' a no-op instead of a destructive replay."
```

---

## Task 2: Bounded-concurrency helper

**Files:**
- Create: `supabase/functions/_shared/concurrency.ts`
- Test: `supabase/functions/_shared/concurrency.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/concurrency.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import { mapWithConcurrency } from './concurrency.ts';

Deno.test('preserves input order regardless of completion order', async () => {
  const delays = [30, 5, 20, 1];
  const results = await mapWithConcurrency(delays, 4, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return i;
  });
  assertEquals(results.map((r) => (r.ok ? r.value : null)), [0, 1, 2, 3]);
});

Deno.test('never exceeds the concurrency limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 50 }, (_, i) => i);
  await mapWithConcurrency(items, 10, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return null;
  });
  assertEquals(peak <= 10, true, `peak concurrency was ${peak}`);
});

Deno.test('captures per-item errors without failing the batch', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('boom');
    return n * 10;
  });
  assertEquals(results[0], { ok: true, value: 10 });
  assertEquals(results[1].ok, false);
  assertEquals((results[1] as { ok: false; error: Error }).error.message, 'boom');
  assertEquals(results[2], { ok: true, value: 30 });
});

Deno.test('handles an empty input array', async () => {
  const results = await mapWithConcurrency([], 10, async () => 1);
  assertEquals(results, []);
});

Deno.test('handles a limit larger than the input length', async () => {
  const results = await mapWithConcurrency([1, 2], 100, async (n) => n);
  assertEquals(results.map((r) => (r.ok ? r.value : null)), [1, 2]);
});

Deno.test('runs every item exactly once', async () => {
  const seen: number[] = [];
  const items = Array.from({ length: 25 }, (_, i) => i);
  await mapWithConcurrency(items, 4, async (n) => {
    seen.push(n);
    return n;
  });
  assertEquals(seen.length, 25);
  assertEquals(new Set(seen).size, 25);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
deno test --allow-none supabase/functions/_shared/concurrency.test.ts
```

Expected: FAIL — `Module not found` for `./concurrency.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/concurrency.ts`:

```ts
// Bounded-concurrency map. Used by the push workers to overlap their
// PostgREST round trips without opening an unbounded number of connections.

export type Outcome<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Applies `worker` to every item with at most `limit` calls in flight.
 *
 * Results keep the input order regardless of completion order. A worker
 * rejection is captured as an `ok: false` outcome for that item only — one
 * failure never cancels the rest of the batch, which matters because each
 * queue message must be accounted for individually.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Outcome<R>[]> {
  const results: Outcome<R>[] = new Array(items.length);
  let next = 0;

  const runner = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, runner));
  return results;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
deno test --allow-none supabase/functions/_shared/concurrency.test.ts
```

Expected: `ok | 6 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/concurrency.ts supabase/functions/_shared/concurrency.test.ts
git commit -m "feat(functions): add bounded-concurrency map helper

Order-preserving, per-item error capture, hard cap on in-flight calls.
Used next by push-dispatch to overlap its PostgREST round trips."
```

---

## Task 3: Parallelize the dispatcher and raise its batch size

**Files:**
- Modify: `supabase/functions/push-dispatch/index.ts`

- [ ] **Step 1: Update the constants**

Replace lines 28–34 of `supabase/functions/push-dispatch/index.ts`:

```ts
const BATCH_SIZE = 50;
// Longer than the runtime budget so in-flight messages are never redelivered
// to a concurrent invocation mid-run.
const VISIBILITY_TIMEOUT_S = 90;
const RUNTIME_BUDGET_MS = 50_000;
const MAX_READS = 5;
const RECENT_CONTENT_DAYS = 14;
```

with:

```ts
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
```

- [ ] **Step 2: Add the helper import**

After the existing `import { json } from '../_shared/http.ts';` line, add:

```ts
import { mapWithConcurrency } from '../_shared/concurrency.ts';
```

- [ ] **Step 3: Replace the serial phase-1 loop**

Replace this block:

```ts
  // Phase 1: resolve each job to a claimed delivery + Expo messages.
  const prepared: PreparedSend[] = [];
  for (const msg of queueMessages) {
    if (Date.now() > deadline) {
      stats.deferred += queueMessages.length - stats.archived - stats.deferred - prepared.length;
      break;
    }
    try {
      const result = await prepareMessage(admin, msg);
      if (result === 'archived') stats.archived++;
      else if (result === 'deferred') stats.deferred++;
      else prepared.push(result);
    } catch (err) {
      console.error(`push-dispatch: msg ${msg.msg_id} failed to prepare:`, err);
      if (msg.read_ct > MAX_READS) {
        await exhaustMessage(admin, msg);
        stats.archived++;
      } else {
        stats.deferred++; // visibility timeout redelivers it
      }
    }
  }
```

with:

```ts
  // Phase 1: resolve each job to a claimed delivery + Expo messages.
  // Bounded concurrency: the work is round-trip bound, not CPU bound, so
  // overlapping it is what lets one invocation clear a 400-message batch.
  // Each message re-checks the deadline, so a slow run sheds the tail
  // rather than blowing through the budget.
  const outcomes = await mapWithConcurrency(
    queueMessages,
    PREPARE_CONCURRENCY,
    (msg) => (Date.now() > deadline ? Promise.resolve('deferred' as const) : prepareMessage(admin, msg)),
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
```

- [ ] **Step 4: Replace the serial finalize loop in phase 2**

Replace this block:

```ts
    let offset = 0;
    for (const p of batch) {
      const jobTickets = tickets.slice(offset, offset + p.messages.length);
      offset += p.messages.length;
      try {
        const ok = await finalizeSend(admin, p, jobTickets);
        if (ok) stats.sent++;
        else stats.ticket_error++;
      } catch (err) {
        console.error(`push-dispatch: msg ${p.msgId} failed to finalize:`, err);
        stats.deferred++;
      }
    }
```

with:

```ts
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
```

- [ ] **Step 5: Typecheck the function**

```bash
deno check supabase/functions/push-dispatch/index.ts
```

Expected: no errors. (Network access is required on first run to fetch `npm:@supabase/supabase-js@2`.)

- [ ] **Step 6: Re-run the helper tests**

```bash
deno test --allow-none supabase/functions/_shared/concurrency.test.ts
```

Expected: `ok | 6 passed | 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/push-dispatch/index.ts
git commit -m "perf(push-dispatch): overlap prep and finalize, raise batch to 400

The per-message work is round-trip bound (about six sequential PostgREST
calls), so a serial loop capped one invocation at ~50 messages. Bounded
concurrency of 10 lets one invocation clear 400, taking the ceiling from
72k/day to ~576k/day.

Visibility timeout raised 90s -> 120s for margin against the larger batch.
Deadline and read_ct handling unchanged; each message still re-checks the
deadline so a slow run sheds its tail instead of overrunning."
```

---

## Task 4: Entitlement gate, streak-risk split, cron cadence

**Files:**
- Create: `supabase/migrations/20260824120000_pipeline_capacity.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260824120000_pipeline_capacity.sql`:

```sql
-- Future Self: pipeline capacity for 100k users.
--   1. recalc_notification_state gates on entitlements, so free users never
--      enter the next_due_at index and never consume an enqueue slot.
--   2. The streak-risk pass moves out of enqueue_due_notifications into its
--      own function, so the main pass can run every minute without running
--      that five-table join five times as often.
--   3. Cron cadence raised to match the dispatcher's new throughput.

-- ---------------------------------------------------------------------------
-- 1. Entitlement gate
-- ---------------------------------------------------------------------------
create or replace function public.recalc_notification_state(p_user uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_tz text;
  v_prefs record;
  v_state record;
  v_local_now timestamp;
  v_local_date date;
  v_total int;
  v_sent int;
  v_next timestamptz;
  v_has_device boolean;
  v_entitled boolean;
begin
  select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = p_user;
  if v_tz is null then
    v_tz := 'UTC';
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_user;
  if v_prefs is null then
    insert into public.notification_prefs (user_id) values (p_user)
    on conflict do nothing;
    select * into v_prefs from public.notification_prefs where user_id = p_user;
  end if;

  select exists (
    select 1 from public.devices d
    where d.user_id = p_user and d.active and d.push_token is not null
      and d.permission_status = 'granted'
  ) into v_has_device;

  -- Push is premium-only. Gating here (not just in the enqueue pass) keeps
  -- free users out of the next_due_at index entirely, so they never consume
  -- an enqueue slot. The enqueue pass keeps its own check for entitlements
  -- that lapse by time without a webhook firing.
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user and e.is_premium
      and (e.expires_at is null or e.expires_at > now())
  ) into v_entitled;

  begin
    v_local_now := now() at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
    v_local_now := now() at time zone 'UTC';
  end;
  v_local_date := v_local_now::date;

  insert into public.notification_state (user_id, local_date)
  values (p_user, v_local_date)
  on conflict (user_id) do nothing;

  select * into v_state from public.notification_state where user_id = p_user;

  -- Roll daily counters on local-date change.
  if v_state.local_date is distinct from v_local_date then
    update public.notification_state
      set local_date = v_local_date, quotes_sent = 0, affirmations_sent = 0, updated_at = now()
      where user_id = p_user;
    v_state.quotes_sent := 0;
    v_state.affirmations_sent := 0;
  end if;

  v_total := coalesce(v_prefs.quotes_per_day, 0) + coalesce(v_prefs.affirmations_per_day, 0);
  v_sent := coalesce(v_state.quotes_sent, 0) + coalesce(v_state.affirmations_sent, 0);

  if not v_has_device or v_total = 0 or not v_entitled then
    v_next := null;
  else
    v_next := public.compute_next_due(
      v_tz,
      v_prefs.window_start_minutes,
      v_prefs.window_end_minutes,
      v_prefs.quiet_start_minutes,
      v_prefs.quiet_end_minutes,
      v_total,
      v_sent,
      v_local_now
    );
  end if;

  update public.notification_state
    set next_due_at = v_next, updated_at = now()
    where user_id = p_user;
end;
$$;

revoke all on function public.recalc_notification_state(uuid) from public, anon, authenticated;
grant execute on function public.recalc_notification_state(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2a. Main enqueue pass, with the streak-risk loop removed
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_due_notifications(p_batch int default 1000)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_prefs record;
  v_kind text;
  v_slot int;
  v_count int := 0;
  v_local_date date;
  v_tz text;
begin
  for r in
    select ns.user_id, ns.quotes_sent, ns.affirmations_sent, ns.local_date
    from public.notification_state ns
    where ns.next_due_at is not null and ns.next_due_at <= now()
    order by ns.next_due_at
    limit p_batch
    for update of ns skip locked
  loop
    select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = r.user_id;
    select * into v_prefs from public.notification_prefs where user_id = r.user_id;
    if v_prefs is null then
      update public.notification_state set next_due_at = null, updated_at = now()
        where user_id = r.user_id;
      continue;
    end if;

    begin
      v_local_date := (now() at time zone v_tz)::date;
    exception when others then
      v_local_date := (now() at time zone 'UTC')::date;
    end;

    -- Roll counters if the local day changed since last recalc.
    if r.local_date is distinct from v_local_date then
      update public.notification_state
        set local_date = v_local_date, quotes_sent = 0, affirmations_sent = 0, updated_at = now()
        where user_id = r.user_id;
      r.quotes_sent := 0;
      r.affirmations_sent := 0;
    end if;

    -- Premium gate. recalc_notification_state also gates on this, so reaching
    -- here means the entitlement lapsed by time since it was last recalculated.
    if not exists (
      select 1 from public.entitlements e
      where e.user_id = r.user_id and e.is_premium
        and (e.expires_at is null or e.expires_at > now())
    ) then
      update public.notification_state set next_due_at = null, updated_at = now()
        where user_id = r.user_id;
      continue;
    end if;

    -- Choose kind: interleave, respecting per-kind daily caps.
    v_kind := null;
    if r.quotes_sent < v_prefs.quotes_per_day
       and (r.quotes_sent <= r.affirmations_sent or r.affirmations_sent >= v_prefs.affirmations_per_day) then
      v_kind := 'quote';
      v_slot := r.quotes_sent;
    elsif r.affirmations_sent < v_prefs.affirmations_per_day then
      v_kind := 'affirmation';
      v_slot := r.affirmations_sent;
    end if;

    if v_kind is not null then
      perform pgmq.send(
        'push_jobs',
        jsonb_build_object(
          'user_id', r.user_id,
          'kind', v_kind,
          'local_date', v_local_date,
          'slot', v_slot
        )
      );
      -- Optimistically count the send so pacing holds even before the
      -- dispatcher confirms; the dispatcher enforces true idempotency
      -- via delivery records.
      if v_kind = 'quote' then
        update public.notification_state set quotes_sent = quotes_sent + 1 where user_id = r.user_id;
      else
        update public.notification_state set affirmations_sent = affirmations_sent + 1 where user_id = r.user_id;
      end if;
      v_count := v_count + 1;
    end if;

    perform public.recalc_notification_state(r.user_id);
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
grant execute on function public.enqueue_due_notifications(int) to service_role;

-- ---------------------------------------------------------------------------
-- 2b. Streak-risk pass, extracted verbatim into its own function
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_streak_risk(p_batch int default 500)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_local_date date;
begin
  for r in
    select s.user_id, coalesce(p.timezone, 'UTC') as tz
    from public.streaks s
    join public.profiles p on p.id = s.user_id
    join public.notification_prefs np on np.user_id = s.user_id and np.streak_reminder
    join public.entitlements e on e.user_id = s.user_id and e.is_premium
      and (e.expires_at is null or e.expires_at > now())
    where s.current_streak > 0
      and s.last_completed_date = ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 1)
      and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) between 18 and 20
      and not exists (
        select 1 from public.notification_state ns
        where ns.user_id = s.user_id
          and ns.streak_risk_sent_on = (now() at time zone coalesce(p.timezone, 'UTC'))::date
      )
      and exists (
        select 1 from public.devices d
        where d.user_id = s.user_id and d.active and d.push_token is not null
          and d.permission_status = 'granted'
      )
    limit p_batch
  loop
    v_local_date := (now() at time zone r.tz)::date;
    perform pgmq.send(
      'push_jobs',
      jsonb_build_object(
        'user_id', r.user_id,
        'kind', 'streak_risk',
        'local_date', v_local_date,
        'slot', 0
      )
    );
    insert into public.notification_state (user_id, local_date, streak_risk_sent_on)
    values (r.user_id, v_local_date, v_local_date)
    on conflict (user_id) do update
      set streak_risk_sent_on = excluded.streak_risk_sent_on, updated_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_streak_risk(int) from public, anon, authenticated;
grant execute on function public.enqueue_streak_risk(int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cron cadence. cron.schedule upserts by job name in pg_cron 1.6.
-- ---------------------------------------------------------------------------
select cron.schedule('fs-enqueue-due', '* * * * *',
  $$select public.enqueue_due_notifications(1000);$$);

select cron.schedule('fs-streak-risk', '*/5 * * * *',
  $$select public.enqueue_streak_risk(500);$$);

select cron.schedule('fs-push-receipts', '*/5 * * * *',
  $$select public.invoke_push_function('push-receipts');$$);
```

- [ ] **Step 2: Apply the migration to production**

Use the Supabase MCP `apply_migration` tool:
- `project_id`: `ykgswczatkspryetstor`
- `name`: `pipeline_capacity`
- `query`: the full file contents

Expected: success, no error.

- [ ] **Step 3: Verify the cron schedule changed**

Run via MCP `execute_sql`:

```sql
select jobname, schedule, command, active from cron.job order by jobname;
```

Expected exactly five rows:

| jobname | schedule |
|---|---|
| `fs-enqueue-due` | `* * * * *` |
| `fs-push-dispatch` | `* * * * *` |
| `fs-push-receipts` | `*/5 * * * *` |
| `fs-streak-risk` | `*/5 * * * *` |
| `fs-trial-reminders` | `30 * * * *` |

- [ ] **Step 4: Verify the entitlement gate compiles and the grants are right**

```sql
select p.proname,
       has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('recalc_notification_state','enqueue_due_notifications','enqueue_streak_risk')
order by p.proname;
```

Expected: `service_role = true`, `authenticated = false`, `anon = false` for all three.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824120000_pipeline_capacity.sql
git commit -m "feat(db): gate notification scheduling on entitlements, split streak-risk

recalc_notification_state now clears next_due_at for non-premium users, so
free users never enter the due index. Previously every app open re-armed
them and the enqueue pass burned a slot discovering they don't pay - work
proportional to free-user app opens, which exceeds the whole enqueue budget
at 1M users. The enqueue pass keeps its own check for entitlements that
lapse by time without a webhook.

The streak-risk loop moves into enqueue_streak_risk() on its own */5
schedule, so the main pass can run every minute without running that
five-table join five times as often.

Cadence: fs-enqueue-due */5 batch 500 -> */1 batch 1000;
fs-push-receipts */15 -> */5."
```

---

## Task 5: 90-day data retention

**Files:**
- Create: `supabase/migrations/20260824120500_data_retention.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260824120500_data_retention.sql`:

```sql
-- Future Self: bounded retention.
-- Nothing purged these tables, so they grew monotonically: roughly
-- 30-50 GB/year at 100k DAU. Deletes run in bounded batches so no single
-- statement holds a long lock.
--
-- public.streaks is deliberately NOT purged: current_streak and
-- longest_streak are derived state that must survive the purge window.

create or replace function public.purge_old_data(
  p_days int default 90,
  p_batch int default 5000,
  p_max_loops int default 200
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_cutoff_date date := (now() at time zone 'UTC')::date - p_days;
  v_cutoff_ts timestamptz := now() - make_interval(days => p_days);
  v_deleted bigint;
  v_sum bigint;
  v_loops int;
  v_result jsonb := '{}'::jsonb;
begin
  if p_days < 1 then
    raise exception 'purge_old_data: p_days must be >= 1 (got %)', p_days;
  end if;

  -- daily_progress
  v_sum := 0; v_loops := 0;
  loop
    delete from public.daily_progress
    where ctid in (
      select ctid from public.daily_progress
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('daily_progress', v_sum);

  -- daily_sets
  v_sum := 0; v_loops := 0;
  loop
    delete from public.daily_sets
    where ctid in (
      select ctid from public.daily_sets
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('daily_sets', v_sum);

  -- streak_completions (the streaks table itself is never purged)
  v_sum := 0; v_loops := 0;
  loop
    delete from public.streak_completions
    where ctid in (
      select ctid from public.streak_completions
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('streak_completions', v_sum);

  -- notification_deliveries
  v_sum := 0; v_loops := 0;
  loop
    delete from public.notification_deliveries
    where ctid in (
      select ctid from public.notification_deliveries
      where created_at < v_cutoff_ts
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('notification_deliveries', v_sum);

  -- pgmq archive
  v_sum := 0; v_loops := 0;
  loop
    delete from pgmq.a_push_jobs
    where ctid in (
      select ctid from pgmq.a_push_jobs
      where archived_at < v_cutoff_ts
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('pgmq_archive', v_sum);

  return v_result;
end;
$$;

revoke all on function public.purge_old_data(int, int, int) from public, anon, authenticated;
grant execute on function public.purge_old_data(int, int, int) to service_role;

select cron.schedule('fs-purge-old-data', '15 3 * * *',
  $$select public.purge_old_data(90, 5000);$$);
```

- [ ] **Step 2: Apply the migration to production**

Use MCP `apply_migration`:
- `project_id`: `ykgswczatkspryetstor`
- `name`: `data_retention`
- `query`: the full file contents

- [ ] **Step 3: Prove the function is a safe no-op on current data**

Current production data is all recent, so a 90-day purge must delete nothing.

```sql
select public.purge_old_data(90, 5000);
```

Expected: `{"daily_progress": 0, "daily_sets": 0, "streak_completions": 0, "notification_deliveries": 0, "pgmq_archive": 0}`

- [ ] **Step 4: Prove the function actually deletes when rows are old enough**

This inserts a row dated 200 days ago for an existing user, purges, and confirms
only that row went. Run as one statement:

```sql
do $$
declare
  v_user uuid;
  v_content uuid;
  v_before bigint;
  v_after bigint;
  v_result jsonb;
begin
  select id into v_user from public.profiles limit 1;
  select id into v_content from public.content_items limit 1;
  select count(*) into v_before from public.daily_progress;

  insert into public.daily_progress (user_id, local_date, content_id)
  values (v_user, (now() at time zone 'UTC')::date - 200, v_content);

  select public.purge_old_data(90, 5000) into v_result;
  select count(*) into v_after from public.daily_progress;

  if v_after <> v_before then
    raise exception 'purge left % rows, expected % (result %)', v_after, v_before, v_result;
  end if;
  if (v_result->>'daily_progress')::bigint <> 1 then
    raise exception 'expected exactly 1 purged row, got %', v_result->>'daily_progress';
  end if;
  raise notice 'purge_old_data verified: %', v_result;
end $$;
```

Expected: completes with a `NOTICE`, no exception.

- [ ] **Step 5: Verify the cron job registered**

```sql
select jobname, schedule, command from cron.job where jobname = 'fs-purge-old-data';
```

Expected: one row, schedule `15 3 * * *`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824120500_data_retention.sql
git commit -m "feat(db): add 90-day retention purge

Nothing purged daily_progress, daily_sets, streak_completions,
notification_deliveries or the pgmq archive - roughly 30-50 GB/year at
100k DAU on unpartitioned tables. Deletes run in bounded batches so no
statement holds a long lock.

public.streaks is deliberately untouched: current/longest streak are
derived state that must outlive the retention window.

Runs daily at 03:15 UTC."
```

---

## Task 6: Receipt worker throughput

**Files:**
- Modify: `supabase/functions/push-receipts/index.ts`

- [ ] **Step 1: Raise the batch limit**

Replace line 10:

```ts
const BATCH_LIMIT = 300;
```

with:

```ts
const BATCH_LIMIT = 1000;
```

- [ ] **Step 2: Replace the per-row update loop with grouped updates**

Replace this block:

```ts
  const stats = { checked: deliveries.length, receipt_ok: 0, receipt_error: 0, pending: 0, expired: 0 };

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.expo_ticket_id];

    if (!receipt) {
      if (Date.now() - new Date(delivery.sent_at).getTime() > RECEIPT_EXPIRY_MS) {
        // Never resolvable; close it out so it stops occupying the batch.
        await admin
          .from('notification_deliveries')
          .update({
            status: 'receipt_error',
            error_detail: 'receipt not available from Expo (expired unfetched)',
          })
          .eq('id', delivery.id);
        stats.expired++;
      } else {
        stats.pending++; // Expo has not processed it yet; retry next run
      }
      continue;
    }

    if (receipt.status === 'ok') {
      await admin
        .from('notification_deliveries')
        .update({ status: 'receipt_ok' })
        .eq('id', delivery.id);
      stats.receipt_ok++;
      continue;
    }

    await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_error', error_detail: formatTicketError(receipt) })
      .eq('id', delivery.id);
    stats.receipt_error++;

    if (receipt.details?.error === 'DeviceNotRegistered' && delivery.device_id) {
      await admin
        .from('devices')
        .update({ active: false, push_token: null })
        .eq('id', delivery.device_id);
    }
  }

  return json(stats);
```

with:

```ts
  const stats = { checked: deliveries.length, receipt_ok: 0, receipt_error: 0, pending: 0, expired: 0 };

  // Bucket first, write once per bucket. The ok case is uniform so it
  // collapses to a single UPDATE regardless of batch size; error rows carry
  // per-row detail and stay individual, which is fine because they are rare.
  const okIds: string[] = [];
  const expiredIds: string[] = [];
  const errored: Array<{ id: string; detail: string }> = [];
  const deadDeviceIds: string[] = [];

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.expo_ticket_id];

    if (!receipt) {
      if (Date.now() - new Date(delivery.sent_at).getTime() > RECEIPT_EXPIRY_MS) {
        // Never resolvable; close it out so it stops occupying the batch.
        expiredIds.push(delivery.id);
        stats.expired++;
      } else {
        stats.pending++; // Expo has not processed it yet; retry next run
      }
      continue;
    }

    if (receipt.status === 'ok') {
      okIds.push(delivery.id);
      stats.receipt_ok++;
      continue;
    }

    errored.push({ id: delivery.id, detail: formatTicketError(receipt) });
    stats.receipt_error++;

    if (receipt.details?.error === 'DeviceNotRegistered' && delivery.device_id) {
      deadDeviceIds.push(delivery.device_id);
    }
  }

  if (okIds.length > 0) {
    const { error: okError } = await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_ok' })
      .in('id', okIds);
    if (okError) console.error('push-receipts: receipt_ok update failed:', okError);
  }

  if (expiredIds.length > 0) {
    const { error: expiredError } = await admin
      .from('notification_deliveries')
      .update({
        status: 'receipt_error',
        error_detail: 'receipt not available from Expo (expired unfetched)',
      })
      .in('id', expiredIds);
    if (expiredError) console.error('push-receipts: expired update failed:', expiredError);
  }

  for (const row of errored) {
    const { error: errUpdate } = await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_error', error_detail: row.detail })
      .eq('id', row.id);
    if (errUpdate) console.error('push-receipts: receipt_error update failed:', errUpdate);
  }

  if (deadDeviceIds.length > 0) {
    const { error: deviceError } = await admin
      .from('devices')
      .update({ active: false, push_token: null })
      .in('id', deadDeviceIds);
    if (deviceError) console.error('push-receipts: device deactivation failed:', deviceError);
  }

  return json(stats);
```

- [ ] **Step 3: Typecheck**

```bash
deno check supabase/functions/push-receipts/index.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/push-receipts/index.ts
git commit -m "perf(push-receipts): batch to 1000, collapse per-row updates

At 300 per 15 minutes the worker could resolve 28.8k receipts/day against a
72k/day delivery ceiling, so DeviceNotRegistered cleanup fell behind and dead
tokens accumulated - which then consumed dispatcher capacity permanently.

Batch 300 -> 1000 (cron moved to */5 in the pipeline_capacity migration) and
the uniform ok/expired cases collapse into one UPDATE each instead of N."
```

---

## Task 7: End-to-end integration test against production

**Files:**
- Create: `supabase/tests/pipeline_capacity_test.sql`

This seeds synthetic users, drives the real enqueue path, asserts, and cleans up
after itself — including on failure.

- [ ] **Step 1: Write the test script**

Create `supabase/tests/pipeline_capacity_test.sql`:

```sql
-- Integration test for the 100k capacity changes.
-- Seeds synthetic users, runs the real enqueue functions, asserts, cleans up.
-- Safe to run against production: every row it creates is namespaced by the
-- 'capacity-test-' email prefix and deleted in the same transaction.
--
-- Run with: MCP execute_sql, or psql -f. Raises an exception on any failure.

do $$
declare
  v_premium uuid := gen_random_uuid();
  v_free    uuid := gen_random_uuid();
  v_content uuid;
  v_due_before int;
  v_enqueued int;
  v_premium_next timestamptz;
  v_free_next timestamptz;
  v_q_before bigint;
  v_q_after bigint;
begin
  select id into v_content from public.content_items where type = 'quote' and active limit 1;
  if v_content is null then
    raise exception 'no active quote content to test with';
  end if;

  select count(*) into v_q_before from pgmq.q_push_jobs;

  -- --- seed two auth users -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_premium, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'capacity-test-premium@example.invalid', now(), now()),
    (v_free, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'capacity-test-free@example.invalid', now(), now());

  -- handle_new_user() creates profiles rows automatically; set timezone.
  update public.profiles set timezone = 'UTC' where id in (v_premium, v_free);

  -- both users have a granted device
  insert into public.devices (user_id, install_id, push_token, platform, permission_status, timezone)
  values
    (v_premium, 'capacity-test-premium', 'ExponentPushToken[capacity-test-premium]', 'ios', 'granted', 'UTC'),
    (v_free,    'capacity-test-free',    'ExponentPushToken[capacity-test-free]',    'ios', 'granted', 'UTC');

  -- only one of them pays
  insert into public.entitlements (user_id, is_premium, source, expires_at)
  values (v_premium, true, 'capacity-test', now() + interval '30 days');

  -- --- assertion 1: the entitlement gate ----------------------------------
  perform public.recalc_notification_state(v_premium);
  perform public.recalc_notification_state(v_free);

  select next_due_at into v_premium_next from public.notification_state where user_id = v_premium;
  select next_due_at into v_free_next    from public.notification_state where user_id = v_free;

  if v_premium_next is null then
    raise exception 'FAIL: premium user was not armed (next_due_at is null)';
  end if;
  if v_free_next is not null then
    raise exception 'FAIL: free user was armed (next_due_at = %) - entitlement gate not working', v_free_next;
  end if;
  raise notice 'PASS: entitlement gate - premium armed at %, free user excluded', v_premium_next;

  -- --- assertion 2: a due premium user enqueues exactly one job -----------
  update public.notification_state set next_due_at = now() - interval '1 minute'
    where user_id = v_premium;

  select count(*) into v_due_before from public.notification_state
    where next_due_at is not null and next_due_at <= now();

  select public.enqueue_due_notifications(1000) into v_enqueued;

  if v_enqueued < 1 then
    raise exception 'FAIL: enqueue_due_notifications returned % with % users due', v_enqueued, v_due_before;
  end if;

  select count(*) into v_q_after from pgmq.q_push_jobs;
  if v_q_after <= v_q_before then
    raise exception 'FAIL: queue depth did not grow (% -> %)', v_q_before, v_q_after;
  end if;
  raise notice 'PASS: enqueue produced % job(s), queue depth % -> %', v_enqueued, v_q_before, v_q_after;

  -- --- assertion 3: the free user never entered the queue ------------------
  if exists (
    select 1 from pgmq.q_push_jobs
    where (message->>'user_id')::uuid = v_free
  ) then
    raise exception 'FAIL: free user has a queued push job';
  end if;
  raise notice 'PASS: free user produced no queue jobs';

  -- --- assertion 4: counters advanced and the user was re-armed -----------
  if (select quotes_sent + affirmations_sent from public.notification_state where user_id = v_premium) < 1 then
    raise exception 'FAIL: send counter did not advance for premium user';
  end if;
  raise notice 'PASS: send counter advanced';

  -- --- assertion 5: streak-risk function runs standalone -------------------
  perform public.enqueue_streak_risk(500);
  raise notice 'PASS: enqueue_streak_risk executed without error';

  -- --- cleanup -------------------------------------------------------------
  delete from pgmq.q_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from pgmq.a_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from auth.users where id in (v_premium, v_free);

  raise notice 'ALL ASSERTIONS PASSED - synthetic users removed';

exception when others then
  -- always clean up, then re-raise so the failure is visible
  delete from pgmq.q_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from pgmq.a_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from auth.users where id in (v_premium, v_free);
  raise;
end $$;
```

- [ ] **Step 2: Run the test against production**

Use MCP `execute_sql` with the full script.

Expected: notices for each PASS, ending with `ALL ASSERTIONS PASSED`. No exception.

- [ ] **Step 3: Confirm nothing was left behind**

```sql
select
  (select count(*) from auth.users where email like 'capacity-test-%') as leftover_users,
  (select count(*) from public.devices where install_id like 'capacity-test-%') as leftover_devices,
  (select count(*) from public.entitlements where source = 'capacity-test') as leftover_entitlements;
```

Expected: `0, 0, 0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/pipeline_capacity_test.sql
git commit -m "test(db): end-to-end assertions for the capacity changes

Seeds a premium and a free synthetic user, drives the real enqueue path,
and asserts the entitlement gate excludes free users while premium users
still enqueue. Cleans up in both the success and failure paths."
```

---

## Task 8: Deploy the edge functions and run the full regression gate

**Files:** none modified

- [ ] **Step 1: Deploy both changed functions**

Both must keep `--no-verify-jwt`; they authenticate via `x-dispatch-secret`, not a JWT.

```bash
npx supabase functions deploy push-dispatch --project-ref ykgswczatkspryetstor --no-verify-jwt
```

```bash
npx supabase functions deploy push-receipts --project-ref ykgswczatkspryetstor --no-verify-jwt
```

- [ ] **Step 2: Confirm the deployed versions are current**

Use MCP `list_edge_functions` for project `ykgswczatkspryetstor`. Expected:
`push-dispatch` and `push-receipts` both show a bumped `version` and a recent
`updated_at`.

- [ ] **Step 3: Run the client regression gate**

```bash
npm test
```

Expected: all suites pass. The client was not modified; this proves no collateral damage.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 6: Confirm the dispatcher runs clean in production**

Wait for one cron tick, then check for errors:

```sql
select status, count(*) from public.notification_deliveries group by status;
```

Expected: no `ticket_error` or `skipped` rows attributable to this change (production
has no entitled users, so the expected result is zero rows overall).

Also check the function logs via MCP `query_logs` for `push-dispatch`. Expected: no
exceptions; a `{"read":0,...}` style response is correct when the queue is empty.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: deploy push workers with capacity changes" --allow-empty
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Migration reconciliation | Task 1 |
| 2. Dispatcher throughput | Tasks 2, 3 |
| 3. Entitlement gate | Task 4 |
| 4. Enqueue and receipts capacity | Tasks 4, 6 |
| 5. Retention | Task 5 |
| 6. Out of scope (compute upgrade) | Not implemented by design; reported to owner |
| Testing 1 (Deno unit tests) | Task 2 |
| Testing 2 (synthetic integration) | Task 7 |
| Testing 3 (SQL assertions) | Tasks 4, 5 |
| Testing 4 (regression gate) | Task 8 |

No gaps.

**Type consistency:** `mapWithConcurrency` is defined in Task 2 and used in Task 3 with
the same signature. `Outcome<R>` discriminates on `ok`, and Task 3 reads `.ok`,
`.value` and `.error` accordingly. `purge_old_data(int, int, int)` is granted and
scheduled with the same three-argument signature it is defined with (the cron call
passes two and relies on the third defaulting, which is valid).

**Placeholder scan:** none.
