-- S5-RB08. Only an approved isolated synthetic DB; outer transaction always rolls back.
-- The separate s4c9-lock A/B fixtures test actual-function concurrency.
rollback;
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='30s';
do $$ begin
  if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic'
    or exists(select 1 from auth.users) or exists(select 1 from cron.job where active)
    or exists(select 1 from vault.secrets) or exists(select 1 from net.http_request_queue)
    or exists(select 1 from pgmq.q_push_jobs) or (select paused from public.push_pipeline_control where id) is distinct from true then
    raise exception 'approved empty isolated synthetic database required';
  end if;
end $$;
create temporary table finalizer_results(label text primary key) on commit drop;
create function pg_temp.finalizer_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
  'entitlements',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]') from public.entitlements t),
  'reconciliation',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]') from public.entitlement_reconciliation t),
  'targets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.event_id,t.user_id),'[]') from public.subscription_event_targets t),
  'events',(select coalesce(jsonb_agg(to_jsonb(t) order by t.event_id),'[]') from public.subscription_events t),
  'prefs',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]') from public.notification_prefs t),
  'notification_state',(select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id),'[]') from public.notification_state t));
$$;
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000993',true),
 ('00000000-0000-4000-8000-000000000994',true),
 ('00000000-0000-4000-8000-000000000995',true);

-- Missing, null and previously deleted parent all return superseded without children.
insert into public.entitlement_reconciliation(user_id,lease_token,lease_until)
 values('00000000-0000-4000-8000-000000000995','00000000-0000-4000-8000-000000000996',now()+interval '1 minute');
delete from auth.users where id='00000000-0000-4000-8000-000000000995';
do $$ declare u uuid;r jsonb;before jsonb;begin
 before:=pg_temp.finalizer_snapshot();
 foreach u in array array[null::uuid,'00000000-0000-4000-8000-000000000995'::uuid,'00000000-0000-4000-8000-000000000999'::uuid,'00000000-0000-4000-8000-000000000993'::uuid] loop
  r:=public.finish_entitlement_reconciliation(u,'00000000-0000-4000-8000-000000000996',1,null);
  if r->>'outcome' is distinct from 'superseded' or pg_temp.finalizer_snapshot() is distinct from before then raise exception 'missing parent/reconciliation recreated children';end if;
 end loop;
 insert into finalizer_results values('missing/null/deleted parent and missing reconciliation');
end $$;

insert into public.entitlement_reconciliation(user_id,dirty_generation,lease_token,lease_until)
 values('00000000-0000-4000-8000-000000000993',1,'00000000-0000-4000-8000-000000000996',now()+interval '1 minute');
do $$ declare i int;r jsonb;before jsonb;tok uuid;gen bigint;u uuid:='00000000-0000-4000-8000-000000000993';begin
 for i in 1..7 loop
  update public.entitlement_reconciliation set lease_token='00000000-0000-4000-8000-000000000996',lease_until=now()+interval '1 minute' where user_id=u;
  tok:='00000000-0000-4000-8000-000000000996';gen:=1;
  case i
   when 1 then tok:=null;
   when 2 then tok:='00000000-0000-4000-8000-000000000997';
   when 3 then gen:=null;
   when 4 then gen:=0;
   when 5 then update public.entitlement_reconciliation set lease_token=null where user_id=u;
   when 6 then update public.entitlement_reconciliation set lease_until=null where user_id=u;
   when 7 then update public.entitlement_reconciliation set lease_until=now() where user_id=u;
  end case;
  before:=pg_temp.finalizer_snapshot();
  r:=public.finish_entitlement_reconciliation(u,tok,gen,null);
  if r->>'outcome' is distinct from 'superseded' or pg_temp.finalizer_snapshot() is distinct from before then raise exception 'invalid lease/generation % changed state',i;end if;
 end loop;
 insert into finalizer_results values('seven invalid lease/generation cases preserve complete rows');
 update public.entitlement_reconciliation set dirty_generation=2,lease_until=now()+interval '1 minute' where user_id=u;
 r:=public.finish_entitlement_reconciliation(u,tok,1,null);
 if r->>'outcome' is distinct from 'superseded' or not exists(select 1 from public.entitlement_reconciliation where user_id=u and dirty_generation=2 and applied_generation=0 and lease_token is null and lease_until is null and next_retry_at=now()) or exists(select 1 from public.entitlements where user_id=u) then raise exception 'dirty generation recovery changed';end if;
 insert into finalizer_results values('dirty generation clears only lease and schedules retry');
 update public.entitlement_reconciliation set dirty_generation=1,lease_token=tok,lease_until=now()+interval '1 minute' where user_id=u;
end $$;

-- Reject malformed snapshots atomically with a valid live lease.
do $$ declare i int;bad jsonb;before jsonb;caught boolean;good jsonb:='{"is_premium":false,"expires_at":null,"product_id":null,"period_type":null,"trial_expires_at":null}';begin
 for i in 1..8 loop
  bad:=case i when 1 then null when 2 then '[]'::jsonb when 3 then '{}'::jsonb
    when 4 then good||'{"is_premium":"false"}'::jsonb
    when 5 then good||jsonb_build_object('product_id',repeat('x',257))
    when 6 then good||jsonb_build_object('period_type',repeat('x',33))
    when 7 then good||jsonb_build_object('extra',repeat('x',4097))
    when 8 then good||'{"expires_at":"not-a-date"}'::jsonb end;
  before:=pg_temp.finalizer_snapshot();caught:=false;
  begin
   perform public.finish_entitlement_reconciliation('00000000-0000-4000-8000-000000000993','00000000-0000-4000-8000-000000000996',1,bad);
  exception when raise_exception then if sqlerrm<>'invalid canonical snapshot' then raise;end if;caught:=true;
   when invalid_datetime_format then if i<>8 then raise;end if;caught:=true;
  end;
  if not caught or pg_temp.finalizer_snapshot() is distinct from before then raise exception 'snapshot rejection % not atomic',i;end if;
 end loop;
 insert into finalizer_results values('eight snapshot validation rejections preserve complete rows');
end $$;

-- Two common events supplied E2 before E1, with reversed target inputs.
select public.receive_subscription_event('s4c9-E2','fixture','SANDBOX',now(),'{"id":"s4c9-E2"}',array['00000000-0000-4000-8000-000000000994'::uuid,'00000000-0000-4000-8000-000000000993'::uuid]);
select public.receive_subscription_event('s4c9-E1','fixture','SANDBOX',now(),'{"id":"s4c9-E1"}',array['00000000-0000-4000-8000-000000000993'::uuid,'00000000-0000-4000-8000-000000000994'::uuid]);
-- This single-target event actually becomes complete before the forced failure.
select public.receive_subscription_event('s4c9-atomic','fixture','SANDBOX',now(),'{"id":"s4c9-atomic"}',array['00000000-0000-4000-8000-000000000993'::uuid]);
update public.entitlement_reconciliation set lease_token='00000000-0000-4000-8000-000000000996',lease_until=now()+interval '1 minute';

-- Force failure at the last write: earlier entitlement/recalc/target/event writes must roll back.
create function pg_temp.reject_finalizer_completion() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from public.subscription_events where event_id='s4c9-atomic' and status='complete' and completed_at is not null) then
  raise exception 'atomicity fixture did not reach event completion';
 end if;
 raise exception 'synthetic final completion failure';
end $$;
create trigger s4c9_reject_completion before update on public.entitlement_reconciliation
 for each row when(new.state='current') execute function pg_temp.reject_finalizer_completion();
do $$ declare before jsonb;caught boolean:=false;begin
 before:=pg_temp.finalizer_snapshot();
 begin
  perform public.finish_entitlement_reconciliation('00000000-0000-4000-8000-000000000993','00000000-0000-4000-8000-000000000996',4,'{"is_premium":true,"expires_at":null,"product_id":"monthly","period_type":"normal","trial_expires_at":null}');
 exception when raise_exception then if sqlerrm<>'synthetic final completion failure' then raise;end if;caught:=true;
 end;
 if not caught or pg_temp.finalizer_snapshot() is distinct from before then raise exception 'finalizer partial completion escaped rollback';end if;
 if not exists(select 1 from public.subscription_events where event_id='s4c9-atomic' and status='pending' and completed_at is null) then raise exception 'event completion did not roll back';end if;
 insert into finalizer_results values('failure at final write rolls back all six state families');
end $$;
drop trigger s4c9_reject_completion on public.entitlement_reconciliation;

do $$ declare r jsonb;u uuid;g bigint;begin
 foreach u in array array['00000000-0000-4000-8000-000000000993'::uuid,'00000000-0000-4000-8000-000000000994'::uuid] loop
  select dirty_generation into g from public.entitlement_reconciliation where user_id=u;
  r:=public.finish_entitlement_reconciliation(u,'00000000-0000-4000-8000-000000000996',g,'{"is_premium":true,"expires_at":null,"product_id":"monthly","period_type":"normal","trial_expires_at":null}');
  if r->>'outcome' is distinct from 'applied' or not exists(select 1 from public.entitlements where user_id=u and is_premium and product_id='monthly' and source='canonical-api') or not exists(select 1 from public.entitlement_reconciliation where user_id=u and applied_generation=g and lease_token is null and lease_until is null and state='current' and attempts=0 and last_success_at=now()) then raise exception 'first insert did not atomically complete';end if;
  if u='00000000-0000-4000-8000-000000000993' and exists(select 1 from public.subscription_events where event_id in ('s4c9-E1','s4c9-E2') and status='complete') then raise exception 'transfer completed before second target';end if;
 end loop;
 if (select count(*) from public.subscription_events where status='complete' and completed_at=now())<>3 or (select count(*) from public.subscription_event_targets where status='applied' and processed_at=now())<>5 then raise exception 'transfer targets/inbox not complete';end if;
 insert into finalizer_results values('first entitlement insert and two-event sequential transfer completion');
 update public.entitlement_reconciliation set lease_token='00000000-0000-4000-8000-000000000996',lease_until=now()+interval '1 minute' where user_id=u;
 r:=public.finish_entitlement_reconciliation(u,'00000000-0000-4000-8000-000000000996',g,'{"is_premium":false,"expires_at":null,"product_id":null,"period_type":null,"trial_expires_at":null}');
 if r->>'outcome' is distinct from 'applied' or not exists(select 1 from public.entitlements where user_id=u and not is_premium and product_id is null and period_type is null and expires_at is null and trial_expires_at is null and source='canonical-api') or (select count(*) from public.entitlements)<>2 then raise exception 'existing entitlement update wrong';end if;
 insert into finalizer_results values('existing entitlement canonical downgrade/update');
end $$;
select jsonb_build_object('passed_groups',count(*),'groups',jsonb_agg(label order by label)) as finalizer_regression from finalizer_results;
rollback;
