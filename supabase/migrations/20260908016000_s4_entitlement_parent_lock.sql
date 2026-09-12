-- S5-RB08: avoid finalizer/account-deletion lock inversion.
-- CREATE OR REPLACE preserves the existing owner and service-role-only ACL.
create or replace function public.finish_entitlement_reconciliation(p_user uuid,p_lease_token uuid,p_generation bigint,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_state public.entitlement_reconciliation%rowtype; v_events text[];
begin
  -- Match account deletion's parent-before-child order, including first inserts.
  -- Keep the parent alive through entitlement, notification and event completion.
  perform 1 from auth.users where id=p_user for key share;
  if not found then
    return jsonb_build_object('outcome','superseded');
  end if;
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
