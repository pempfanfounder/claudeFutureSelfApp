-- S5-RB13 / S5C13-M01: bounded parent-before-state scheduler admission.
-- Forward-only replacement; unchanged signature, SECURITY DEFINER, ACL and
-- search_path. No grants, schema/data changes or scheduler activation.
create or replace function public.enqueue_due_notifications(p_batch int default 500)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_candidate record;
  v_admitted int := 0;
  v_prefs record;
  v_kind text;
  v_slot int;
  v_count int := 0;
  v_msg bigint;
  v_local_date date;
  v_tz text;
begin
  if p_batch is null or p_batch not between 1 and 500 then raise exception 'invalid scheduler batch'; end if;
  perform 1 from public.push_pipeline_control where id=true for update;
  if not (public.consume_backend_budget(null,'push_schedule',1)->>'allowed')::boolean then return 0; end if;
  -- Candidate prefetch/sort is read-only. Only successfully admitted rows
  -- count toward p_batch, just as LIMIT above LockRows SKIP LOCKED did.
  for v_candidate in
    select ns.user_id
    from public.notification_state ns
    where ns.next_due_at is not null and ns.next_due_at <= now()
    order by ns.next_due_at
  loop
    exit when v_admitted >= p_batch;
    -- Separate admission savepoint: if the child cannot be locked, release
    -- this candidate's parent lock before scanning the next candidate.
    begin
      perform 1 from auth.users where id = v_candidate.user_id
        for key share skip locked;
      if not found then continue; end if;
      select ns.user_id, ns.quotes_sent, ns.affirmations_sent, ns.local_date
        into r from public.notification_state ns
        where ns.user_id = v_candidate.user_id
          and ns.next_due_at is not null and ns.next_due_at <= now()
        for update skip locked;
      if not found then raise no_data_found; end if;
    exception when no_data_found then
      -- Deliberate admission miss only; no producer work has run here.
      continue;
    end;
    v_admitted := v_admitted + 1;
    -- Successful admission locks are outside this work savepoint. A user
    -- failure therefore retains parent-before-state protection for backoff.
    begin
    select public.safe_timezone(p.timezone) into v_tz from public.profiles p where p.id = r.user_id;
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
      v_msg:=public.enqueue_push_job(r.user_id,v_kind,v_local_date,v_slot);
      if v_msg is null then
        update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
        continue;
      end if;
      -- Legacy counter names represent reserved slots, not provider delivery.
      -- Reservation, queue insertion and pacing advancement commit together.
      if v_kind = 'quote' then
        update public.notification_state set quotes_sent = quotes_sent + 1 where user_id = r.user_id;
      else
        update public.notification_state set affirmations_sent = affirmations_sent + 1 where user_id = r.user_id;
      end if;
      if v_msg>0 then v_count := v_count + 1; end if;
    end if;

    perform public.recalc_notification_state(r.user_id);
    exception when others then
      -- Roll back only this user; preserve healthy users in the same pass.
      update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
    end;
  end loop;

  -- Streak-risk pass: entitled users with a live streak, yesterday
  -- completed, today not, inside 18:00-21:00 local, pref on, not yet
  -- reminded today.
  for r in
    select s.user_id, public.safe_timezone(p.timezone) as tz
    from public.streaks s
    join public.profiles p on p.id = s.user_id
    join public.notification_prefs np on np.user_id = s.user_id and np.streak_reminder
    join public.entitlements e on e.user_id = s.user_id and e.is_premium
      and (e.expires_at is null or e.expires_at > now())
    where s.current_streak > 0
      and s.last_completed_date = ((now() at time zone public.safe_timezone(p.timezone))::date - 1)
      and extract(hour from (now() at time zone public.safe_timezone(p.timezone))) between 18 and 20
      and not exists (
        select 1 from public.notification_state ns
        where ns.user_id = s.user_id
          and ns.streak_risk_sent_on = (now() at time zone public.safe_timezone(p.timezone))::date
      )
      and exists (
        select 1 from public.devices d
        where d.user_id = s.user_id and d.active and d.push_token is not null
          and d.permission_status = 'granted'
      )
    limit p_batch
  loop
    begin
    v_local_date := (now() at time zone r.tz)::date;
    v_msg:=public.enqueue_push_job(r.user_id,'streak_risk',v_local_date,0);
    if v_msg is null then continue; end if;
    insert into public.notification_state (user_id, local_date, streak_risk_sent_on)
    values (r.user_id, v_local_date, v_local_date)
    on conflict (user_id) do update
      set streak_risk_sent_on = excluded.streak_risk_sent_on, updated_at = now();
    if v_msg>0 then v_count := v_count + 1; end if;
    exception when others then
      -- Roll back only this user; preserve healthy users in the same pass.
      update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
    end;
  end loop;

  return v_count;
end;
$$;
