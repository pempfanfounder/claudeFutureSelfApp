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
