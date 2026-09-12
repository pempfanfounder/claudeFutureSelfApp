-- S4 LOCAL DRAFT. Additive guards preserve historical rows and migration history.
-- SQL role/concurrency/timezone acceptance remains NOT RUN on an isolated DB.

create function public.safe_timezone(p_timezone text) returns text
language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
    then p_timezone else 'UTC' end;
$$;
revoke all on function public.safe_timezone(text) from public,anon,authenticated;
grant execute on function public.safe_timezone(text) to service_role;

create function public.has_current_premium() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.entitlements e where e.user_id=auth.uid()
    and e.is_premium and (e.expires_at is null or e.expires_at>now()));
$$;
revoke all on function public.has_current_premium() from public,anon,authenticated;
grant execute on function public.has_current_premium() to authenticated,service_role;
drop policy if exists content_select_active on public.content_items;
create policy content_select_active on public.content_items for select to authenticated
  using(active and (select public.has_current_premium()));
drop policy if exists deliveries_select_own on public.notification_deliveries;
create policy deliveries_select_own on public.notification_deliveries for select to authenticated
  using((select auth.uid())=user_id and (select public.has_current_premium()));

create function public.bounded_personalization_array(p_values text[]) returns boolean
language sql immutable set search_path='' as $$
  select case when p_values is null or coalesce(array_ndims(p_values),1)<>1 or cardinality(p_values)>32 then false
    else array_position(p_values,null) is null
      and not exists(select 1 from unnest(p_values) value where char_length(value) not between 1 and 128)
      and coalesce((select sum(octet_length(value)) from unnest(p_values) value),0)<=4096 end;
$$;
revoke all on function public.bounded_personalization_array(text[]) from public,anon,authenticated;
-- Check constraints execute as the writing role, so this pure validation helper is safe to expose.
grant execute on function public.bounded_personalization_array(text[]) to authenticated,service_role;
alter table public.personalization add constraint s4_personalization_bounds check (
  public.bounded_personalization_array(primary_goals) and public.bounded_personalization_array(obstacles)
  and public.bounded_personalization_array(future_traits) and public.bounded_personalization_array(quote_interests)
  and public.bounded_personalization_array(affirmation_interests)
  and char_length(motivation_level)<=64 and char_length(gender)<=64
  and jsonb_typeof(raw_answers)='object' and octet_length(raw_answers::text)<=16384
) not valid;
alter table public.notification_prefs add constraint s4_notification_windows check(
  window_end_minutes>window_start_minutes
  and ((quiet_start_minutes is null and quiet_end_minutes is null)
    or (quiet_start_minutes is not null and quiet_end_minutes is not null and quiet_start_minutes<>quiet_end_minutes))
) not valid;
alter table public.daily_sets add constraint s4_daily_set_shape check(
  coalesce(array_ndims(content_ids),1)=1 and cardinality(content_ids) between 1 and 20
) not valid;
alter table public.devices add column registration_version bigint not null default 1;

create function public.guard_s4_owned_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_operation text; v_budget jsonb;
begin
  if tg_table_name='profiles' then
    v_user:=new.id; v_operation:='profile';
    if (tg_op='INSERT' or new.timezone is distinct from old.timezone)
      and (new.timezone is null or public.safe_timezone(new.timezone)<>new.timezone) then raise exception 'invalid timezone'; end if;
    -- Include auto-created anonymous profiles in the global storage allowance.
    -- This bounds successful profile/auth transactions, not upstream auth/HTTP cost.
  else
    v_user:=new.user_id;
    v_operation:=case tg_table_name when 'favorites' then 'favorite' else tg_table_name end;
  end if;
  -- Existing table RLS binds direct writes to auth.uid(). Internal definer
  -- scheduling can create defaults for another user after a device switches.
  if tg_table_name='favorites' and auth.uid() is not null and not public.has_current_premium() then
    raise exception 'premium required';
  end if;
  v_budget:=public.consume_backend_budget(v_user,v_operation,1);
  if not (v_budget->>'allowed')::boolean then raise exception 'write budget exceeded'; end if;
  return new;
end;
$$;
revoke all on function public.guard_s4_owned_write() from public,anon,authenticated;
create trigger s4_profiles_guard before insert or update on public.profiles for each row execute function public.guard_s4_owned_write();
create trigger s4_personalization_guard before insert or update on public.personalization for each row execute function public.guard_s4_owned_write();
create trigger s4_prefs_guard before insert or update on public.notification_prefs for each row execute function public.guard_s4_owned_write();
create trigger s4_favorites_guard before insert on public.favorites for each row execute function public.guard_s4_owned_write();

-- Device rows remain writable only through authenticated RPCs/service role.
create function public.guard_s4_device() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if char_length(new.install_id) not between 1 and 64 then raise exception 'invalid device'; end if;
  if (tg_op='INSERT' or new.timezone is distinct from old.timezone)
    and (new.timezone is null or public.safe_timezone(new.timezone)<>new.timezone) then raise exception 'invalid device'; end if;
  if (tg_op='INSERT' or new.push_token is distinct from old.push_token)
    and new.push_token is not null and new.push_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid push token';
  end if;
  if tg_op='UPDATE' then
    if (new.user_id,new.push_token,new.active,new.permission_status) is distinct from
       (old.user_id,old.push_token,old.active,old.permission_status) then
      new.registration_version:=old.registration_version+1;
    else new.registration_version:=old.registration_version; end if;
  else new.registration_version:=1; end if;
  return new;
end;
$$;
revoke all on function public.guard_s4_device() from public,anon,authenticated;
create trigger s4_device_guard before insert or update on public.devices for each row execute function public.guard_s4_device();

create or replace function public.register_device(
  p_install_id text,p_push_token text,p_platform text,p_permission_status text,p_locale text,p_timezone text,p_app_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_previous_user uuid; v_budget jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_install_id is null or char_length(p_install_id) not between 1 and 64 then raise exception 'invalid install id'; end if;
  p_push_token:=nullif(p_push_token,''); p_locale:=nullif(p_locale,''); p_app_version:=nullif(p_app_version,'');
  p_timezone:=coalesce(nullif(p_timezone,''),'UTC');
  if public.safe_timezone(p_timezone)<>p_timezone or p_platform is null or p_platform not in ('ios','android')
    or p_permission_status is null or p_permission_status not in ('undetermined','granted','denied')
    or char_length(p_locale)>16 or char_length(p_app_version)>32 or char_length(p_push_token)>512 then
    raise exception 'invalid device input';
  end if;
  v_budget:=public.consume_backend_budget(v_user,'register_device',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'device budget exceeded'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4102));
  select id,user_id into v_id,v_previous_user from public.devices where install_id=p_install_id for update;
  if (v_id is null or v_previous_user<>v_user) and (select count(*) from public.devices where user_id=v_user)>=20 then
    raise exception 'device storage limit reached';
  end if;
  if p_push_token is not null then
    update public.devices set push_token=null,active=false,updated_at=now()
      where push_token=p_push_token and install_id<>p_install_id;
  end if;
  insert into public.devices as d(user_id,install_id,push_token,platform,permission_status,locale,timezone,app_version,active,last_seen_at)
    values(v_user,p_install_id,p_push_token,p_platform,p_permission_status,p_locale,p_timezone,p_app_version,true,now())
    on conflict(install_id) do update set user_id=excluded.user_id,push_token=excluded.push_token,platform=excluded.platform,
      permission_status=excluded.permission_status,locale=excluded.locale,timezone=excluded.timezone,app_version=excluded.app_version,
      active=true,last_seen_at=now(),updated_at=now() returning d.id into v_id;
  update public.profiles set timezone=p_timezone,locale=coalesce(p_locale,locale),install_id=p_install_id,updated_at=now() where id=v_user;
  perform public.recalc_notification_state(v_user);
  if v_previous_user is not null and v_previous_user<>v_user then perform public.recalc_notification_state(v_previous_user); end if;
  return v_id;
end;
$$;
revoke all on function public.register_device(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_device(text,text,text,text,text,text,text) to authenticated,service_role;

create or replace function public.deactivate_device(p_install_id text) returns void
language plpgsql security definer set search_path='' as $$
declare v_budget jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_install_id is null or char_length(p_install_id) not between 1 and 64 then raise exception 'invalid install id'; end if;
  v_budget:=public.consume_backend_budget(auth.uid(),'deactivate_device',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'device deactivation budget exceeded'; end if;
  update public.devices set active=false,updated_at=now() where install_id=p_install_id and user_id=auth.uid();
end;
$$;
revoke all on function public.deactivate_device(text) from public,anon,authenticated;
grant execute on function public.deactivate_device(text) to authenticated;

revoke insert,update,delete on public.daily_sets,public.daily_progress from anon,authenticated;
drop policy if exists daily_sets_insert_own on public.daily_sets;
drop policy if exists daily_progress_insert_own on public.daily_progress;
create function public.save_daily_set(p_local_date date,p_type text,p_content_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_date date; v_existing uuid[]; v_budget jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.has_current_premium() then raise exception 'premium required'; end if;
  select (now() at time zone public.safe_timezone(timezone))::date into v_date from public.profiles where id=v_user;
  v_date:=coalesce(v_date,(now() at time zone 'UTC')::date);
  if p_local_date is null or abs(p_local_date-v_date)>1 then raise exception 'invalid local date'; end if;
  if p_type is null or p_type not in ('quote','affirmation') or p_content_ids is null
    or coalesce(array_ndims(p_content_ids),1)<>1 or cardinality(p_content_ids) not between 1 and 20 then
    raise exception 'invalid daily set';
  end if;
  if array_position(p_content_ids,null) is not null or cardinality(p_content_ids)<>(select count(distinct x) from unnest(p_content_ids) x) then
    raise exception 'invalid content ids';
  end if;
  if (select count(*) from public.content_items where id=any(p_content_ids) and active and type=p_type)<>cardinality(p_content_ids) then
    raise exception 'inaccessible content';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4101));
  v_budget:=public.consume_backend_budget(v_user,'daily_set',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'daily set budget exceeded'; end if;
  select content_ids into v_existing from public.daily_sets where user_id=v_user and local_date=p_local_date and type=p_type;
  if found then return v_existing; end if;
  insert into public.daily_sets(user_id,local_date,type,content_ids) values(v_user,p_local_date,p_type,p_content_ids);
  return p_content_ids;
end;
$$;
revoke all on function public.save_daily_set(date,text,uuid[]) from public,anon,authenticated;
grant execute on function public.save_daily_set(date,text,uuid[]) to authenticated;

create or replace function public.recalc_my_notification_state() returns void
language plpgsql security definer set search_path='' as $$
declare v_budget jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_budget:=public.consume_backend_budget(auth.uid(),'notification_prefs',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'recalc budget exceeded'; end if;
  perform public.recalc_notification_state(auth.uid());
end;
$$;
revoke all on function public.recalc_my_notification_state() from public,anon,authenticated;
grant execute on function public.recalc_my_notification_state() to authenticated;

-- Existing record_view algorithm retained, with guarded premium/input/budget/timezone boundary.
create or replace function public.record_view(p_content_id uuid, p_local_date date)
returns table (
  viewed_today int,
  completed_today boolean,
  current_streak int,
  longest_streak int
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_server_local date;
  v_count int;
  v_budget jsonb;
  v_completed boolean := false;
  v_prev_completed date;
  v_current int := 0;
  v_longest int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_current_premium() then raise exception 'premium required'; end if;
  if not exists(select 1 from public.content_items where id=p_content_id and active) then
    raise exception 'inaccessible content';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4101));
  v_budget:=public.consume_backend_budget(v_user,'record_view',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'view budget exceeded'; end if;

  -- The client supplies its local date; accept it only if it is within
  -- one day of the server's view of that user's local date.
  select p.timezone into v_tz from public.profiles p where p.id = v_user;
  v_server_local := (now() at time zone public.safe_timezone(v_tz))::date;
  if p_local_date is null or abs(p_local_date - v_server_local) > 1 then
    -- Durable offline events must keep their original day; never silently
    -- attribute an old event to today. The client retains rejected work.
    raise exception 'invalid local date';
  end if;

  insert into public.daily_progress (user_id, local_date, content_id)
  values (v_user, p_local_date, p_content_id)
  on conflict do nothing;

  select count(*) into v_count
  from public.daily_progress dp
  where dp.user_id = v_user and dp.local_date = p_local_date;

  if v_count >= 3 then
    insert into public.streak_completions (user_id, local_date)
    values (v_user, p_local_date)
    on conflict do nothing;

    if found then
      -- First completion for this local day: advance the streak.
      select s.last_completed_date, s.current_streak, s.longest_streak
        into v_prev_completed, v_current, v_longest
      from public.streaks s where s.user_id = v_user;

      if v_prev_completed is null then
        v_current := 1;
      elsif v_prev_completed = p_local_date - 1 then
        v_current := v_current + 1;
      elsif v_prev_completed >= p_local_date then
        -- Completion already recorded for today or later (timezone
        -- shifts): keep the streak unchanged.
        v_current := greatest(v_current, 1);
      else
        v_current := 1;
      end if;

      v_longest := greatest(coalesce(v_longest, 0), v_current);

      insert into public.streaks (user_id, current_streak, longest_streak, last_completed_date)
      values (v_user, v_current, v_longest, greatest(p_local_date, coalesce(v_prev_completed, p_local_date)))
      on conflict (user_id) do update
        set current_streak = excluded.current_streak,
            longest_streak = excluded.longest_streak,
            last_completed_date = excluded.last_completed_date,
            updated_at = now();
    end if;
  end if;

  select exists (
    select 1 from public.streak_completions sc
    where sc.user_id = v_user and sc.local_date = p_local_date
  ) into v_completed;

  select coalesce(s.current_streak, 0), coalesce(s.longest_streak, 0)
    into v_current, v_longest
  from public.streaks s where s.user_id = v_user;

  return query select v_count, v_completed, coalesce(v_current, 0), coalesce(v_longest, 0);
end;
$$;

revoke all on function public.record_view(uuid, date) from public, anon, authenticated;
grant execute on function public.record_view(uuid, date) to authenticated;

-- Scheduling conversion and per-user isolation replacements; no cron activation.
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
  select public.safe_timezone(p.timezone) into v_tz from public.profiles p where p.id = p_user;
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

revoke all on function public.recalc_notification_state(uuid) from public, anon, authenticated;
grant execute on function public.recalc_notification_state(uuid) to service_role;

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
  if p_batch is null or p_batch not between 1 and 500 then raise exception 'invalid scheduler batch'; end if;
  for r in
    select ns.user_id, ns.quotes_sent, ns.affirmations_sent, ns.local_date
    from public.notification_state ns
    where ns.next_due_at is not null and ns.next_due_at <= now()
    order by ns.next_due_at
    limit p_batch
    for update of ns skip locked
  loop
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
    exception when others then
      -- Roll back only this user; preserve healthy users in the same pass.
      update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
grant execute on function public.enqueue_due_notifications(int) to service_role;

-- ---------------------------------------------------------------------------

-- Keep known legacy trial metadata usable without rewriting existing rows.
create or replace function public.enqueue_trial_reminders(p_batch int default 200)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_local_date date;
begin
  if p_batch is null or p_batch not between 1 and 200 then raise exception 'invalid trial batch'; end if;
  for r in
    select e.user_id, public.safe_timezone(p.timezone) as tz
    from public.entitlements e
    join public.profiles p on p.id = e.user_id
    join public.notification_prefs np
      on np.user_id = e.user_id and np.trial_reminder
    where e.is_premium
      and (e.trial_expires_at is not null or (e.source in ('revenuecat-webhook','sync-api') and e.period_type = 'trial'))
      and coalesce(e.trial_expires_at,case when e.source in ('revenuecat-webhook','sync-api') and e.period_type='trial' then e.expires_at end) between now() + interval '12 hours'
                           and now() + interval '36 hours'
      and exists (
        select 1 from public.devices d
        where d.user_id = e.user_id and d.active
          and d.push_token is not null
          and d.permission_status = 'granted'
      )
      and not exists (
        select 1 from public.notification_deliveries nd
        where nd.user_id = e.user_id
          and nd.kind = 'trial_reminder'
          and nd.created_at > now() - interval '48 hours'
      )
    limit p_batch
  loop
    begin
    begin
      v_local_date := (now() at time zone r.tz)::date;
    exception when others then
      v_local_date := (now() at time zone 'UTC')::date;
    end;

    perform pgmq.send(
      'push_jobs',
      jsonb_build_object(
        'user_id', r.user_id,
        'kind', 'trial_reminder',
        'local_date', v_local_date,
        'slot', 0
      )
    );
    v_count := v_count + 1;
    exception when others then
      -- Isolate this user's scheduling failure; later passes may recover it.
      null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_trial_reminders(int) from public, anon, authenticated;
grant execute on function public.enqueue_trial_reminders(int) to service_role;
