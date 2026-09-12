-- S4 LOCAL DRAFT. Forward-only; no cron, secret, provider or live quota changes.
-- Runtime SQL/RLS/concurrency acceptance is NOT RUN. Limits below are conservative
-- local fixture settings and require target/capacity review before deployment.

create table public.backend_budget_limits (
  operation text primary key check (char_length(operation) between 1 and 64),
  per_user_per_minute integer not null check (per_user_per_minute > 0),
  global_per_minute integer not null check (global_per_minute > 0),
  max_concurrent integer not null default 4 check (max_concurrent between 1 and 20),
  paused boolean not null default false
);
create table public.backend_budget_windows (
  operation text not null references public.backend_budget_limits(operation),
  subject text not null check (subject = '*' or subject ~ '^[0-9a-f-]{36}$'),
  window_start timestamptz not null,
  used integer not null check (used >= 0),
  primary key (operation, subject, window_start)
);
alter table public.backend_budget_limits enable row level security;
alter table public.backend_budget_windows enable row level security;
revoke all on public.backend_budget_limits, public.backend_budget_windows from public, anon, authenticated;
grant all on public.backend_budget_limits, public.backend_budget_windows to service_role;
insert into public.backend_budget_limits(operation,per_user_per_minute,global_per_minute) values
  ('subscription_event',120,600), ('sync_entitlement',6,120),
  ('daily_set',12,1200), ('record_view',120,10000),
  ('register_device',12,1000), ('personalization',30,3000),
  ('deactivate_device',20,2000),
  ('profile',30,3000), ('notification_prefs',60,6000), ('favorite',120,10000);

-- The locked operation row serializes reservations. Both buckets are checked
-- before either is charged. Neither identities nor new installs create a new
-- global allowance. Upstream auth/HTTP quotas remain a separate deployment gap.
create function public.consume_backend_budget(p_user uuid, p_operation text, p_units integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit public.backend_budget_limits%rowtype;
  v_window timestamptz := date_trunc('minute',clock_timestamp());
  v_global integer; v_user integer;
begin
  if p_units is null or p_units not between 1 and 16 then raise exception 'invalid budget units'; end if;
  select * into v_limit from public.backend_budget_limits where operation=p_operation for update;
  if not found then raise exception 'unknown budget operation'; end if;
  select coalesce(max(used),0) into v_global from public.backend_budget_windows
    where operation=p_operation and subject='*' and window_start=v_window;
  select coalesce(max(used),0) into v_user from public.backend_budget_windows
    where operation=p_operation and subject=p_user::text and window_start=v_window;
  if v_limit.paused or v_global+p_units>v_limit.global_per_minute
     or (p_user is not null and v_user+p_units>v_limit.per_user_per_minute) then
    return jsonb_build_object('allowed',false,'retry_after_seconds',60);
  end if;
  insert into public.backend_budget_windows values(p_operation,'*',v_window,p_units)
    on conflict(operation,subject,window_start) do update set used=public.backend_budget_windows.used+excluded.used;
  if p_user is not null then
    insert into public.backend_budget_windows values(p_operation,p_user::text,v_window,p_units)
      on conflict(operation,subject,window_start) do update set used=public.backend_budget_windows.used+excluded.used;
  end if;
  return jsonb_build_object('allowed',true);
end;
$$;
revoke all on function public.consume_backend_budget(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.consume_backend_budget(uuid,text,integer) to service_role;

-- Bounded maintenance is deliberately unscheduled. Preserve current windows.
create function public.prune_backend_budget_windows() returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with expired as (
    select operation,subject,window_start from public.backend_budget_windows
    where window_start < now()-interval '2 days' order by window_start limit 1000 for update skip locked
  ), removed as (
    delete from public.backend_budget_windows b using expired e
    where (b.operation,b.subject,b.window_start)=(e.operation,e.subject,e.window_start) returning 1
  ) select count(*) into v_count from removed;
  return v_count;
end;
$$;
revoke all on function public.prune_backend_budget_windows() from public,anon,authenticated;
grant execute on function public.prune_backend_budget_windows() to service_role;

alter table public.entitlements add column trial_expires_at timestamptz;
create table public.subscription_events (
  event_id text primary key check(char_length(event_id) between 1 and 128),
  app_id text not null check(char_length(app_id) between 1 and 128),
  environment text not null check(char_length(environment) between 1 and 32),
  event_time timestamptz not null,
  payload jsonb not null check(octet_length(payload::text)<=16384),
  payload_hash text not null,
  unmapped_user_ids uuid[] not null default '{}' check(cardinality(unmapped_user_ids)<=16 and coalesce(array_ndims(unmapped_user_ids),1)=1),
  status text not null check(status in ('pending','complete','unmapped','dead_letter')),
  received_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.entitlement_reconciliation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dirty_generation bigint not null default 1,
  applied_generation bigint not null default 0,
  minimum_event_time timestamptz,
  lease_token uuid, lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  total_attempts bigint not null default 0,
  next_retry_at timestamptz default now(),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text check(char_length(last_error)<=64),
  state text not null default 'pending' check(state in ('pending','current','dead_letter'))
);
create table public.subscription_event_targets (
  event_id text not null references public.subscription_events(event_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation bigint not null,
  status text not null default 'pending' check(status in ('pending','applied','dead_letter')),
  processed_at timestamptz,
  primary key(event_id,user_id)
);
create index entitlement_reconciliation_retry_idx on public.entitlement_reconciliation(next_retry_at)
  where state='pending';
create index subscription_event_targets_user_idx on public.subscription_event_targets(user_id,generation)
  where status<>'applied';
alter table public.subscription_events enable row level security;
alter table public.entitlement_reconciliation enable row level security;
alter table public.subscription_event_targets enable row level security;
revoke all on public.subscription_events,public.entitlement_reconciliation,public.subscription_event_targets from public,anon,authenticated;
grant all on public.subscription_events,public.entitlement_reconciliation,public.subscription_event_targets to service_role;

create function public.receive_subscription_event(
  p_event_id text,p_app_id text,p_environment text,p_event_time timestamptz,p_payload jsonb,p_user_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid; v_generation bigint; v_count integer:=0;
  v_hash text; v_existing public.subscription_events%rowtype; v_users uuid[]; v_budget jsonb;
  v_unmapped uuid[]:='{}'::uuid[];
begin
  if p_user_ids is null or cardinality(p_user_ids)>16
     or coalesce(array_ndims(p_user_ids),1)<>1 or array_position(p_user_ids,null) is not null
     or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384
     or p_event_time is null or not isfinite(p_event_time) or p_event_time>now()+interval '5 minutes' then
    raise exception 'invalid event';
  end if;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_users from unnest(p_user_ids) x;
  v_hash:=md5(p_payload::text || v_users::text);
  -- Global rate applies to authenticated provider traffic, including replays.
  v_budget:=public.consume_backend_budget(null,'subscription_event',1);
  if not (v_budget->>'allowed')::boolean then raise exception 'event budget exceeded'; end if;
  insert into public.subscription_events(event_id,app_id,environment,event_time,payload,payload_hash,status)
    values(p_event_id,p_app_id,p_environment,p_event_time,p_payload-'user_ids',v_hash,'pending')
    on conflict(event_id) do nothing;
  if not found then
    select * into v_existing from public.subscription_events where event_id=p_event_id for update;
    if v_existing.payload_hash<>v_hash or v_existing.app_id<>p_app_id or v_existing.environment<>p_environment then
      raise exception 'event id collision';
    end if;
    select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]) into v_users
      from public.subscription_event_targets where event_id=p_event_id and status<>'applied';
    -- The inbox lock serializes this fresh aggregate read with finalizers. A
    -- replay also repairs old pending/dead-letter aggregates with no work left.
    update public.subscription_events e set
      status=case when cardinality(v_users)=0 then
        case when exists(select 1 from public.subscription_event_targets t where t.event_id=p_event_id)
          then 'complete' else 'unmapped' end
        when exists(select 1 from public.subscription_event_targets t where t.event_id=p_event_id and t.status='dead_letter')
          then 'dead_letter' else 'pending' end,
      completed_at=case when cardinality(v_users)=0 then coalesce(e.completed_at,now()) else null end
      where e.event_id=p_event_id returning * into v_existing;
    return jsonb_build_object('status',v_existing.status,'user_ids',to_jsonb(v_users));
  end if;
  -- Deterministic target lock ordering avoids transfer A/B versus B/A deadlocks.
  foreach v_user in array v_users loop
    if not exists(select 1 from auth.users where id=v_user) then
      v_unmapped:=array_append(v_unmapped,v_user);
      continue;
    end if;
    insert into public.entitlement_reconciliation(user_id,minimum_event_time)
      values(v_user,p_event_time)
      on conflict(user_id) do update set
        dirty_generation=public.entitlement_reconciliation.dirty_generation+1,
        minimum_event_time=greatest(public.entitlement_reconciliation.minimum_event_time,excluded.minimum_event_time),
        state='pending',next_retry_at=now(),attempts=0
      returning dirty_generation into v_generation;
    insert into public.subscription_event_targets(event_id,user_id,generation) values(p_event_id,v_user,v_generation);
    v_count:=v_count+1;
  end loop;
  -- Preserve only validated unresolved UUID routing metadata for operator
  -- recovery. Known targets remain FK-owned so account deletion removes them.
  update public.subscription_events set unmapped_user_ids=v_unmapped,
    status=case when v_count=0 then 'unmapped' else 'pending' end,
    completed_at=case when v_count=0 then now() else null end where event_id=p_event_id;
  select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]) into v_users
    from public.subscription_event_targets where event_id=p_event_id;
  return jsonb_build_object('status',case when v_count=0 then 'unmapped' else 'pending' end,'user_ids',to_jsonb(v_users));
end;
$$;

create function public.claim_entitlement_reconciliation(p_user uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_state public.entitlement_reconciliation%rowtype; v_budget jsonb; v_token uuid;
  v_limit public.backend_budget_limits%rowtype; v_premium boolean;
begin
  if p_reason is null or p_reason not in ('sync','webhook','recovery') then raise exception 'invalid reason'; end if;
  if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'unknown user'; end if;
  insert into public.entitlement_reconciliation(user_id) values(p_user) on conflict do nothing;
  select * into v_state from public.entitlement_reconciliation where user_id=p_user for update;
  if v_state.lease_until>now() then return jsonb_build_object('outcome','busy','retry_after_seconds',15); end if;
  select coalesce(e.is_premium and (e.expires_at is null or e.expires_at>now()),false) into v_premium
    from public.entitlements e where e.user_id=p_user;
  if v_state.dirty_generation=v_state.applied_generation and v_state.last_success_at>now()-interval '30 seconds'
    and coalesce(v_premium,false) then
    return jsonb_build_object('outcome','fresh','is_premium',true);
  end if;
  if v_state.state='dead_letter' then
    -- Explicit user restore/sync can recover after cooldown; background retries remain bounded.
    if p_reason<>'sync' or v_state.last_attempt_at>now()-interval '15 minutes' then
      return jsonb_build_object('outcome','rate_limited','retry_after_seconds',900);
    end if;
    update public.entitlement_reconciliation set state='pending',attempts=0,next_retry_at=now() where user_id=p_user;
    v_state.attempts:=0;
  elsif v_state.next_retry_at>now() then
    return jsonb_build_object('outcome','rate_limited','retry_after_seconds',greatest(1,ceil(extract(epoch from v_state.next_retry_at-now()))::integer));
  end if;
  select * into v_limit from public.backend_budget_limits where operation='sync_entitlement' for update;
  if v_limit.paused then return jsonb_build_object('outcome','rate_limited','retry_after_seconds',60); end if;
  if (select count(*) from public.entitlement_reconciliation where lease_until>now())>=v_limit.max_concurrent then
    return jsonb_build_object('outcome','busy','retry_after_seconds',15);
  end if;
  v_budget:=public.consume_backend_budget(p_user,'sync_entitlement',1);
  if not (v_budget->>'allowed')::boolean then return jsonb_build_object('outcome','rate_limited','retry_after_seconds',60); end if;
  -- A process crash also consumes an attempt; lease expiration cannot cause infinite retries.
  if v_state.attempts>=8 then
    perform e.event_id from public.subscription_events e where exists(
      select 1 from public.subscription_event_targets t where t.event_id=e.event_id and t.user_id=p_user and t.status='pending')
      order by e.event_id for update;
    update public.entitlement_reconciliation set state='dead_letter',next_retry_at=null,lease_token=null,lease_until=null where user_id=p_user;
    update public.subscription_event_targets set status='dead_letter' where user_id=p_user and status='pending';
    update public.subscription_events e set status='dead_letter',completed_at=null where exists(
      select 1 from public.subscription_event_targets t where t.event_id=e.event_id and t.user_id=p_user and t.status='dead_letter');
    return jsonb_build_object('outcome','rate_limited','retry_after_seconds',900);
  end if;
  v_token:=gen_random_uuid();
  update public.entitlement_reconciliation set lease_token=v_token,lease_until=now()+interval '30 seconds',
    next_retry_at=now()+interval '30 seconds',
    attempts=attempts+1,total_attempts=total_attempts+1,last_attempt_at=now(),state='pending'
    where user_id=p_user;
  return jsonb_build_object('outcome','claimed','lease_token',v_token,'generation',v_state.dirty_generation,
    'minimum_event_time',v_state.minimum_event_time);
end;
$$;

create function public.finish_entitlement_reconciliation(p_user uuid,p_lease_token uuid,p_generation bigint,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_state public.entitlement_reconciliation%rowtype; v_events text[];
begin
  select * into v_state from public.entitlement_reconciliation where user_id=p_user for update;
  if not found or p_lease_token is null or p_generation is null or p_generation<1
    or v_state.lease_token is distinct from p_lease_token or v_state.lease_until is null or v_state.lease_until<=now() then
    return jsonb_build_object('outcome','superseded');
  end if;
  if v_state.dirty_generation<>p_generation then
    update public.entitlement_reconciliation set lease_token=null,lease_until=null,next_retry_at=now() where user_id=p_user;
    return jsonb_build_object('outcome','superseded');
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>4096
    or not (p_snapshot ?& array['is_premium','expires_at','product_id','period_type','trial_expires_at'])
    or jsonb_typeof(p_snapshot->'is_premium')<>'boolean'
    or char_length(p_snapshot->>'product_id')>256 or char_length(p_snapshot->>'period_type')>32 then
    raise exception 'invalid canonical snapshot';
  end if;
  insert into public.entitlements as e(user_id,is_premium,product_id,expires_at,period_type,trial_expires_at,source,updated_at)
    values(p_user,(p_snapshot->>'is_premium')::boolean,p_snapshot->>'product_id',
      (p_snapshot->>'expires_at')::timestamptz,p_snapshot->>'period_type',(p_snapshot->>'trial_expires_at')::timestamptz,'canonical-api',now())
    on conflict(user_id) do update set is_premium=excluded.is_premium,product_id=excluded.product_id,
      expires_at=excluded.expires_at,period_type=excluded.period_type,trial_expires_at=excluded.trial_expires_at,source=excluded.source,updated_at=now();
  -- Failure rolls back entitlement AND receipt completion, retaining the previous access row.
  perform public.recalc_notification_state(p_user);
  select array_agg(event_id order by event_id) into v_events from public.subscription_event_targets
    where user_id=p_user and generation<=p_generation and status<>'applied';
  -- Lock common inbox rows BEFORE changing targets, in the same order for all
  -- users. The statements after this lock get a fresh READ COMMITTED snapshot:
  -- the last transfer finalizer sees the other target's committed completion.
  perform e.event_id from public.subscription_events e
    where e.event_id=any(coalesce(v_events,'{}'::text[])) order by e.event_id for update;
  update public.subscription_event_targets set status='applied',processed_at=now()
    where user_id=p_user and generation<=p_generation;
  update public.subscription_events e set status='complete',completed_at=now()
    where e.event_id=any(coalesce(v_events,'{}'::text[]))
      and not exists(select 1 from public.subscription_event_targets t where t.event_id=e.event_id and t.status<>'applied');
  update public.entitlement_reconciliation set applied_generation=p_generation,lease_token=null,lease_until=null,
    last_success_at=now(),next_retry_at=null,attempts=0,last_error=null,state='current' where user_id=p_user;
  return jsonb_build_object('outcome','applied');
end;
$$;

create function public.fail_entitlement_reconciliation(p_user uuid,p_lease_token uuid,p_error_code text) returns void
language plpgsql security definer set search_path='' as $$
declare v_attempts integer;
begin
  update public.entitlement_reconciliation set lease_token=null,lease_until=null,
    last_error=left(coalesce(p_error_code,'unknown'),64),
    state=case when attempts>=8 then 'dead_letter' else 'pending' end,
    next_retry_at=case when attempts>=8 then null else now()+make_interval(secs=>least(1800,15*power(2,greatest(0,attempts-1))::integer)) end
    where user_id=p_user and lease_token=p_lease_token returning attempts into v_attempts;
  if v_attempts>=8 then
    perform e.event_id from public.subscription_events e where exists(
      select 1 from public.subscription_event_targets t where t.event_id=e.event_id and t.user_id=p_user and t.status='pending')
      order by e.event_id for update;
    update public.subscription_event_targets set status='dead_letter' where user_id=p_user and status='pending';
    update public.subscription_events e set status='dead_letter' where exists(
      select 1 from public.subscription_event_targets t where t.event_id=e.event_id and t.user_id=p_user and t.status='dead_letter');
  end if;
end;
$$;
create function public.list_entitlement_recovery() returns jsonb
language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(user_id),'[]'::jsonb) from (
    select user_id from public.entitlement_reconciliation
    where state='pending' and (next_retry_at is null or next_retry_at<=now())
      and (lease_until is null or lease_until<=now())
    order by coalesce(next_retry_at,lease_until,last_attempt_at,'-infinity'::timestamptz),user_id limit 3
  ) pending;
$$;
create function public.retry_entitlement_reconciliation(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.entitlement_reconciliation set state='pending',attempts=0,next_retry_at=now()
    where user_id=p_user and state='dead_letter' and (lease_until is null or lease_until<=now());
  if found then
    update public.subscription_event_targets set status='pending' where user_id=p_user and status='dead_letter';
  end if;
end;
$$;
revoke all on function public.receive_subscription_event(text,text,text,timestamptz,jsonb,uuid[]) from public,anon,authenticated;
revoke all on function public.claim_entitlement_reconciliation(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_entitlement_reconciliation(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.fail_entitlement_reconciliation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.list_entitlement_recovery() from public,anon,authenticated;
revoke all on function public.retry_entitlement_reconciliation(uuid) from public,anon,authenticated;
grant execute on function public.receive_subscription_event(text,text,text,timestamptz,jsonb,uuid[]) to service_role;
grant execute on function public.claim_entitlement_reconciliation(uuid,text) to service_role;
grant execute on function public.finish_entitlement_reconciliation(uuid,uuid,bigint,jsonb) to service_role;
grant execute on function public.fail_entitlement_reconciliation(uuid,uuid,text) to service_role;
grant execute on function public.list_entitlement_recovery() to service_role;
grant execute on function public.retry_entitlement_reconciliation(uuid) to service_role;
