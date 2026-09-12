-- NOT RUN. Requires a separately VERIFIED isolated synthetic Supabase DB.
-- Never run against an existing/remote project. Role/cross-session tests are
-- integration tests; the in-process Edge harness does not establish them.
begin;
do $$ begin
  if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
    raise exception 'isolated synthetic database approval/identity is required';
  end if;
end $$;

-- This auth fixture must be checked against the isolated auth schema before use.
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',true);
insert into public.content_items(id,type,body) values
 ('00000000-0000-4000-8000-000000000070','quote','Original synthetic fixture quote.');
insert into public.notification_deliveries(user_id,content_id,kind,local_date,idempotency_key,content_snapshot)
 values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000070','quote',current_date,'s4-fixture',
 '{"body":"Original synthetic fixture quote.","type":"quote"}');

do $$ begin
  if has_function_privilege('authenticated','public.claim_entitlement_reconciliation(uuid,text)','execute')
    or has_function_privilege('anon','public.consume_backend_budget(uuid,text,integer)','execute')
    or has_table_privilege('authenticated','public.daily_progress','insert')
    or has_table_privilege('authenticated','public.daily_sets','insert') then raise exception 'internal privilege escaped'; end if;
  if public.bounded_personalization_array(array_fill('x'::text,array[2,2]))
    or public.bounded_personalization_array(array[null]::text[])
    or public.bounded_personalization_array(array_fill('x'::text,array[33])) then raise exception 'array bounds bypass'; end if;
  if public.safe_timezone('invalid/fixture')<>'UTC' then raise exception 'unsafe legacy timezone'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.content_items) or exists(select 1 from public.notification_deliveries) then raise exception 'unpaid content read'; end if;
  begin
    insert into public.daily_progress(user_id,local_date,content_id) values(auth.uid(),current_date,'00000000-0000-4000-8000-000000000070');
    raise exception 'direct progress write allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set timezone='invalid/fixture' where id=auth.uid();
    raise exception 'invalid timezone accepted';
  exception when raise_exception then
    if sqlerrm<>'invalid timezone' then raise; end if;
  end;
end $$;
reset role;
insert into public.entitlements(user_id,is_premium,expires_at) values('00000000-0000-4000-8000-000000000001',true,null);
set local role authenticated;
do $$ declare v_ids uuid[]; begin
  if not exists(select 1 from public.content_items where id='00000000-0000-4000-8000-000000000070')
    or not exists(select 1 from public.notification_deliveries where idempotency_key='s4-fixture') then raise exception 'paid content inaccessible'; end if;
  v_ids:=public.save_daily_set(current_date,'quote',array['00000000-0000-4000-8000-000000000070'::uuid]);
  if cardinality(v_ids)<>1 then raise exception 'daily winner missing'; end if;
  if public.save_daily_set(current_date,'quote',v_ids) is distinct from v_ids then raise exception 'stored daily winner changed'; end if;
  begin
    perform public.save_daily_set(current_date+100,'quote',v_ids);
    raise exception 'arbitrary date accepted';
  exception when raise_exception then if sqlerrm<>'invalid local date' then raise; end if; end;
  begin
    perform public.record_view(v_ids[1],current_date+100);
    raise exception 'old/future view was silently reassigned';
  exception when raise_exception then if sqlerrm<>'invalid local date' then raise; end if; end;
  begin
    perform public.record_view(v_ids[1],null);
    raise exception 'missing view date was silently reassigned';
  exception when raise_exception then if sqlerrm<>'invalid local date' then raise; end if; end;
  perform public.record_view(v_ids[1],current_date-1);
  if not exists(select 1 from public.daily_progress where local_date=current_date-1)
    or exists(select 1 from public.daily_progress where local_date=current_date) then
    raise exception 'accepted offline view original day lost'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.notification_deliveries) or exists(select 1 from public.daily_progress) then raise exception 'cross-user read'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if not exists(select 1 from public.backend_budget_windows where operation='daily_set'
    and subject='00000000-0000-4000-8000-000000000001' and used>=2) then
    raise exception 'successful daily-set replay bypassed budget';
  end if;
end $$;

-- Sequential claim/fence checks. Real concurrency still requires two independent
-- sessions/barriers: simultaneous claim, global budget, transfer and stable set.
do $$ declare v_claim jsonb; v_again jsonb; v_applied jsonb; begin
  perform public.receive_subscription_event('s4-event','fixture-app','SANDBOX',now(),'{"id":"s4-event"}',
    array['00000000-0000-4000-8000-000000000001'::uuid]);
  v_claim:=public.claim_entitlement_reconciliation('00000000-0000-4000-8000-000000000001','webhook');
  v_again:=public.claim_entitlement_reconciliation('00000000-0000-4000-8000-000000000001','webhook');
  if v_claim->>'outcome'<>'claimed' or v_again->>'outcome'<>'busy' then raise exception 'exclusive claim failed'; end if;
  perform public.receive_subscription_event('s4-newer','fixture-app','SANDBOX',now(),'{"id":"s4-newer"}',
    array['00000000-0000-4000-8000-000000000001'::uuid]);
  v_applied:=public.finish_entitlement_reconciliation('00000000-0000-4000-8000-000000000001',
    (v_claim->>'lease_token')::uuid,(v_claim->>'generation')::bigint,
    '{"is_premium":false,"expires_at":null,"product_id":null,"period_type":null,"trial_expires_at":null}');
  if v_applied->>'outcome'<>'superseded' then raise exception 'stale reconciliation accepted'; end if;
  if not exists(select 1 from public.entitlements where user_id='00000000-0000-4000-8000-000000000001' and is_premium) then
    raise exception 'superseded result revoked premium'; end if;
end $$;

-- Regression: repair an aggregate inbox state left pending after all targets
-- committed. The two-session transfer race below must also be exercised later.
update public.subscription_event_targets set status='applied',processed_at=now() where event_id='s4-event';
update public.subscription_events set status='pending',completed_at=null where event_id='s4-event';
do $$ declare v_receipt jsonb; begin
  v_receipt:=public.receive_subscription_event('s4-event','fixture-app','SANDBOX',now(),'{"id":"s4-event"}',
    array['00000000-0000-4000-8000-000000000001'::uuid]);
  if v_receipt->>'status'<>'complete' or jsonb_array_length(v_receipt->'user_ids')<>0
    or not exists(select 1 from public.subscription_events where event_id='s4-event' and status='complete') then
    raise exception 'replay did not repair completed event aggregate';
  end if;
end $$;

-- Regression: an expired claim from a previously current row must be recoverable,
-- including a legacy pending row whose retry timestamp is null.
update public.entitlement_reconciliation set state='current',applied_generation=dirty_generation,
  last_success_at=now()-interval '1 minute',next_retry_at=null,lease_token=null,lease_until=null
  where user_id='00000000-0000-4000-8000-000000000001';
do $$ declare v_claim jsonb; begin
  v_claim:=public.claim_entitlement_reconciliation('00000000-0000-4000-8000-000000000001','sync');
  if v_claim->>'outcome'<>'claimed' or not exists(select 1 from public.entitlement_reconciliation
    where user_id='00000000-0000-4000-8000-000000000001' and next_retry_at is not null) then
    raise exception 'claim did not schedule crash recovery';
  end if;
end $$;
update public.entitlement_reconciliation set lease_until=now()-interval '1 second',next_retry_at=null
  where user_id='00000000-0000-4000-8000-000000000001';
do $$ begin
  if not (public.list_entitlement_recovery() ? '00000000-0000-4000-8000-000000000001') then
    raise exception 'expired nullable-retry claim was stranded';
  end if;
end $$;

-- Eight crashed claims must dead-letter their parent inbox as well as targets.
update public.entitlement_reconciliation set attempts=8,state='pending',next_retry_at=null,lease_until=now()-interval '1 second'
  where user_id='00000000-0000-4000-8000-000000000001';
do $$ begin
  perform public.claim_entitlement_reconciliation('00000000-0000-4000-8000-000000000001','recovery');
  if not exists(select 1 from public.subscription_events where event_id='s4-newer' and status='dead_letter') then
    raise exception 'crashed-attempt dead letter did not reach inbox';
  end if;
end $$;

-- A UUID not yet present in auth keeps bounded routing evidence for review.
do $$ begin
  perform public.receive_subscription_event('s4-unmapped','fixture-app','SANDBOX',now(),'{"id":"s4-unmapped"}',
    array['00000000-0000-4000-8000-000000000099'::uuid]);
  if not exists(select 1 from public.subscription_events where event_id='s4-unmapped' and status='unmapped'
    and unmapped_user_ids=array['00000000-0000-4000-8000-000000000099'::uuid]) then
    raise exception 'unmapped UUID routing evidence lost';
  end if;
end $$;

-- STILL NOT RUN: in two independent transactions, finalize opposite A/B targets
-- of one transfer simultaneously, with a barrier before inbox locks. Both
-- snapshots/targets must commit and inbox status must be complete without replay.
-- Repeat with two common event IDs and reversed caller ordering to check locks.
-- Also overlap fail_entitlement_reconciliation(A, attempts=8) against successful
-- finish_entitlement_reconciliation(B) with two common events inserted E2/E1.
-- Pause both before inbox acquisition; both must acquire E1 then E2, complete
-- without a lock-order deadlock, and leave the common inbox dead-letter while
-- A is unresolved. This protocol remains NOT RUN without two isolated sessions.

-- The operation's global cap stays shared across identities.
update public.backend_budget_limits set global_per_minute=2,per_user_per_minute=2 where operation='daily_set';
delete from public.backend_budget_windows where operation='daily_set';
do $$ begin
  if not (public.consume_backend_budget('00000000-0000-4000-8000-000000000001','daily_set',1)->>'allowed')::boolean
    or not (public.consume_backend_budget('00000000-0000-4000-8000-000000000002','daily_set',1)->>'allowed')::boolean
    or (public.consume_backend_budget('00000000-0000-4000-8000-000000000003','daily_set',1)->>'allowed')::boolean then
    raise exception 'global allowance multiplied by identity'; end if;
end $$;
rollback;
