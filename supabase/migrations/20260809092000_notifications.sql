-- Future Self: server-driven push notification system
-- devices, prefs, per-user dispatch state, deliveries, entitlements,
-- campaigns, queue, and the recurring enqueue job.

create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The durable send queue. The dispatcher edge function consumes it in
-- bounded batches; pgmq visibility timeouts give us retry semantics.
select pgmq.create('push_jobs');

-- ---------------------------------------------------------------------------
-- devices: one row per install/push token
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  install_id text not null check (char_length(install_id) <= 64),
  push_token text unique check (char_length(push_token) <= 512),
  platform text not null check (platform in ('ios','android')),
  permission_status text not null default 'undetermined'
    check (permission_status in ('undetermined','granted','denied')),
  locale text check (char_length(locale) <= 16),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  app_version text check (char_length(app_version) <= 32),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index devices_user_idx on public.devices (user_id) where active;
create unique index devices_install_idx on public.devices (install_id);

alter table public.devices enable row level security;

create policy "devices_select_own" on public.devices
  for select using ((select auth.uid()) = user_id);

create trigger devices_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

-- Registration RPC: possession of the install (and token) proves the
-- device belongs to the caller, so reassignment across sign-in changes
-- is safe here but not via direct row updates.
create or replace function public.register_device(
  p_install_id text,
  p_push_token text,
  p_platform text,
  p_permission_status text,
  p_locale text,
  p_timezone text,
  p_app_version text
) returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_install_id is null or char_length(p_install_id) > 64 then
    raise exception 'invalid install id';
  end if;

  -- A token can only ever live on one row; free it if another install
  -- held it (token refresh on reinstall).
  if p_push_token is not null then
    update public.devices
      set push_token = null, active = false, updated_at = now()
      where push_token = p_push_token and install_id <> p_install_id;
  end if;

  insert into public.devices as d (
    user_id, install_id, push_token, platform, permission_status,
    locale, timezone, app_version, active, last_seen_at
  ) values (
    v_user, p_install_id, p_push_token, p_platform,
    coalesce(p_permission_status, 'undetermined'),
    p_locale, coalesce(nullif(p_timezone, ''), 'UTC'), p_app_version, true, now()
  )
  on conflict (install_id) do update set
    user_id = excluded.user_id,
    push_token = excluded.push_token,
    platform = excluded.platform,
    permission_status = excluded.permission_status,
    locale = excluded.locale,
    timezone = excluded.timezone,
    app_version = excluded.app_version,
    active = true,
    last_seen_at = now(),
    updated_at = now()
  returning d.id into v_id;

  -- Keep the profile timezone in sync for local-day computations.
  update public.profiles
    set timezone = coalesce(nullif(p_timezone, ''), timezone),
        locale = coalesce(p_locale, locale),
        install_id = p_install_id,
        updated_at = now()
    where id = v_user;

  perform public.recalc_notification_state(v_user);
  return v_id;
end;
$$;

revoke all on function public.register_device(text, text, text, text, text, text, text) from public;
grant execute on function public.register_device(text, text, text, text, text, text, text) to authenticated;

create or replace function public.deactivate_device(p_install_id text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.devices
    set active = false, updated_at = now()
    where install_id = p_install_id and user_id = auth.uid();
end;
$$;

revoke all on function public.deactivate_device(text) from public;
grant execute on function public.deactivate_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- notification_prefs
-- ---------------------------------------------------------------------------
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  quotes_per_day int not null default 3 check (quotes_per_day between 0 and 3),
  affirmations_per_day int not null default 3 check (affirmations_per_day between 0 and 3),
  streak_reminder boolean not null default true,
  window_start_minutes int not null default 540 check (window_start_minutes between 0 and 1439),
  window_end_minutes int not null default 1260 check (window_end_minutes between 0 and 1439),
  quiet_start_minutes int check (quiet_start_minutes between 0 and 1439),
  quiet_end_minutes int check (quiet_end_minutes between 0 and 1439),
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs_select_own" on public.notification_prefs
  for select using ((select auth.uid()) = user_id);
create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert with check ((select auth.uid()) = user_id);
create policy "notification_prefs_update_own" on public.notification_prefs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger notification_prefs_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- entitlements: server-side premium state (RevenueCat webhook / verified
-- sync are the only writers — service role only, no client policies).
-- ---------------------------------------------------------------------------
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  product_id text,
  expires_at timestamptz,
  source text not null default 'unknown',
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

create policy "entitlements_select_own" on public.entitlements
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- notification_state: one row per user; next_due_at drives the
-- recurring dispatcher. Never one cron job per user.
-- ---------------------------------------------------------------------------
create table public.notification_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  next_due_at timestamptz,
  local_date date,
  quotes_sent int not null default 0,
  affirmations_sent int not null default 0,
  streak_risk_sent_on date,
  updated_at timestamptz not null default now()
);

create index notification_state_due_idx on public.notification_state (next_due_at asc)
  where next_due_at is not null;

alter table public.notification_state enable row level security;

create policy "notification_state_select_own" on public.notification_state
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- notification_deliveries: idempotent delivery records + snapshots
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  content_id uuid references public.content_items (id) on delete set null,
  campaign_id uuid,
  kind text not null check (kind in ('quote','affirmation','streak_risk')),
  local_date date not null,
  slot int not null default 0,
  idempotency_key text not null unique,
  title text,
  body text,
  content_snapshot jsonb,
  status text not null default 'queued'
    check (status in ('queued','sent','ticket_ok','ticket_error','receipt_ok','receipt_error','skipped')),
  error_detail text,
  expo_ticket_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index deliveries_user_recent_idx on public.notification_deliveries (user_id, created_at desc);
create index deliveries_ticket_idx on public.notification_deliveries (expo_ticket_id)
  where expo_ticket_id is not null and status = 'ticket_ok';
create index deliveries_user_content_idx on public.notification_deliveries (user_id, content_id);

alter table public.notification_deliveries enable row level security;

-- Clients read their own deliveries (deep-link fallback snapshots).
create policy "deliveries_select_own" on public.notification_deliveries
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- campaigns: central operations lever (see docs/NOTIFICATION_OPERATIONS.md)
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('quote','affirmation')),
  content_id uuid references public.content_items (id) on delete cascade,
  override_title text,
  override_body text,
  audience jsonb not null default '{"all": true}'::jsonb,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create index campaigns_active_idx on public.campaigns (active, starts_at, ends_at);

alter table public.campaigns enable row level security;
-- No client policies: dashboard/service-role only.

-- ---------------------------------------------------------------------------
-- Scheduling helpers
-- ---------------------------------------------------------------------------

-- Computes the next UTC instant a user is due a content notification,
-- spreading sends evenly inside their window and honoring quiet hours.
create or replace function public.compute_next_due(
  p_tz text,
  p_window_start int,
  p_window_end int,
  p_quiet_start int,
  p_quiet_end int,
  p_total_per_day int,
  p_sent_today int,
  p_local_now timestamp
) returns timestamptz
language plpgsql
immutable
as $$
declare
  v_window_len int;
  v_slot_minutes numeric;
  v_target_minutes numeric;
  v_local_date date := p_local_now::date;
  v_candidate timestamp;
  v_minutes_of_day int;
begin
  if p_total_per_day <= 0 then
    return null;
  end if;

  if p_window_end <= p_window_start then
    -- Degenerate window: fall back to a 9:00-21:00 window.
    p_window_start := 540;
    p_window_end := 1260;
  end if;

  v_window_len := p_window_end - p_window_start;

  if p_sent_today >= p_total_per_day then
    -- All done today: first slot tomorrow.
    v_slot_minutes := v_window_len::numeric / p_total_per_day;
    v_target_minutes := p_window_start + v_slot_minutes * 0.5;
    v_candidate := (v_local_date + 1) + make_interval(mins => v_target_minutes::int);
  else
    v_slot_minutes := v_window_len::numeric / p_total_per_day;
    v_target_minutes := p_window_start + v_slot_minutes * (p_sent_today + 0.5);
    v_candidate := v_local_date + make_interval(mins => v_target_minutes::int);
    -- If that moment already passed locally, send as soon as possible
    -- but never before the window opens.
    if v_candidate < p_local_now then
      v_candidate := greatest(p_local_now, v_local_date + make_interval(mins => p_window_start));
    end if;
    -- Past the window's end: roll to tomorrow's first slot.
    if v_candidate::time > make_interval(mins => p_window_end)::time then
      v_target_minutes := p_window_start + v_slot_minutes * 0.5;
      v_candidate := (v_local_date + 1) + make_interval(mins => v_target_minutes::int);
    end if;
  end if;

  -- Quiet hours (may wrap midnight): push the send to quiet end.
  if p_quiet_start is not null and p_quiet_end is not null then
    v_minutes_of_day := extract(hour from v_candidate)::int * 60 + extract(minute from v_candidate)::int;
    if p_quiet_start <= p_quiet_end then
      if v_minutes_of_day >= p_quiet_start and v_minutes_of_day < p_quiet_end then
        v_candidate := v_candidate::date + make_interval(mins => p_quiet_end);
      end if;
    else
      if v_minutes_of_day >= p_quiet_start then
        v_candidate := (v_candidate::date + 1) + make_interval(mins => p_quiet_end);
      elsif v_minutes_of_day < p_quiet_end then
        v_candidate := v_candidate::date + make_interval(mins => p_quiet_end);
      end if;
    end if;
  end if;

  return v_candidate at time zone p_tz;
end;
$$;

-- Recomputes a user's dispatch state. Called on registration, pref
-- change, timezone change, entitlement change, and after each send.
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

  if not v_has_device or v_total = 0 then
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

revoke all on function public.recalc_notification_state(uuid) from public;
grant execute on function public.recalc_notification_state(uuid) to authenticated, service_role;

-- Client-callable wrapper (recalculates own state only).
create or replace function public.recalc_my_notification_state()
returns void
language sql
security definer set search_path = ''
as $$
  select public.recalc_notification_state(auth.uid());
$$;

revoke all on function public.recalc_my_notification_state() from public;
grant execute on function public.recalc_my_notification_state() to authenticated;

-- ---------------------------------------------------------------------------
-- The recurring enqueue pass (bounded batch, SKIP LOCKED, no per-user
-- cron jobs). Selects due users, decides quote vs affirmation vs
-- streak-risk, enqueues pgmq jobs, and advances next_due_at.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_due_notifications(p_batch int default 500)
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

    -- Premium gate: content notifications only for entitled users.
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

  -- Streak-risk pass: entitled users with a live streak, yesterday
  -- completed, today not, inside 18:00-21:00 local, pref on, not yet
  -- reminded today.
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

revoke all on function public.enqueue_due_notifications(int) from public;
grant execute on function public.enqueue_due_notifications(int) to service_role;

-- ---------------------------------------------------------------------------
-- Cron wiring.
-- 1) enqueue pass runs in-database every 5 minutes.
-- 2) the queue consumer (edge function push-dispatch) is invoked every
--    minute via pg_net, using vault secrets `project_url` and
--    `dispatch_secret`; silently skips until those secrets exist.
-- 3) receipt checking every 15 minutes, same mechanism.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_push_function(p_path text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'dispatch_secret';
  if v_url is null or v_secret is null then
    -- Not configured yet (see docs/SETUP_REQUIRED.md); do nothing.
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.invoke_push_function(text) from public;

select cron.schedule('fs-enqueue-due', '*/5 * * * *',
  $$select public.enqueue_due_notifications(500);$$);

select cron.schedule('fs-push-dispatch', '* * * * *',
  $$select public.invoke_push_function('push-dispatch');$$);

select cron.schedule('fs-push-receipts', '*/15 * * * *',
  $$select public.invoke_push_function('push-receipts');$$);
