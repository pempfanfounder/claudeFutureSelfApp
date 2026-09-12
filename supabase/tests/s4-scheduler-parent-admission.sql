-- UNEXECUTED. Coordinator must verify editor project bqigczxgdpebnylgrffz
-- and reserve this request before dispatch. Never production ykgswczatkspryetstor.
rollback;
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='30s';
do $$ declare table_name text;row_count bigint;begin
if exists(select 1 from cron.job where active) or (select count(*) from cron.job)<>4
 or exists(select 1 from vault.secrets) or exists(select 1 from net.http_request_queue) or exists(select 1 from net._http_response)
 or exists(select 1 from pgmq.q_push_jobs) or exists(select 1 from pgmq.a_push_jobs)
 or (select paused from public.push_pipeline_control where id) is distinct from true
 or exists(select 1 from public.notification_deliveries) or exists(select 1 from public.notification_delivery_devices)
 or exists(select 1 from public.push_schedule_claims) or exists(select 1 from public.devices)
 or (select count(*) from public.content_items)<>325 then raise exception 'isolation drift';end if;
if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required';end if;
if current_setting('deadlock_timeout')::interval >= interval '3 seconds' then raise exception 'detector does not fit lock bound';end if;
if (select md5(prosrc) from pg_proc where oid='public.enqueue_due_notifications(integer)'::regprocedure) is distinct from 'cbff66ccd437c8de3b90029d14dcb191' then raise exception 'function identity drift: public.enqueue_due_notifications(integer)';end if;
if (select md5(prosrc) from pg_proc where oid='public.enqueue_push_job(uuid,text,date,integer)'::regprocedure) is distinct from '5678722ca3b2477977447dc038db7d03' then raise exception 'function identity drift: public.enqueue_push_job(uuid,text,date,integer)';end if;
if (select md5(prosrc) from pg_proc where oid='public.recalc_notification_state(uuid)'::regprocedure) is distinct from 'ad4ed89c030e6bab317d672c0483600d' then raise exception 'function identity drift: public.recalc_notification_state(uuid)';end if;
if (select md5(prosrc) from pg_proc where oid='public.consume_backend_budget(uuid,text,integer)'::regprocedure) is distinct from 'bb1deaaf7aebfc9a509df3c9a5192f42' then raise exception 'function identity drift: public.consume_backend_budget(uuid,text,integer)';end if;

foreach table_name in array array['profiles','personalization','favorites','daily_sets','daily_progress','streaks','streak_completions','entitlements','notification_prefs','notification_state','entitlement_reconciliation','subscription_events','subscription_event_targets','account_deletion_receipts','backend_budget_windows'] loop
 execute format('select count(*) from public.%I',table_name) into row_count;
 if row_count<>0 then raise exception 'expected empty %',table_name;end if;
end loop;
if exists(select 1 from auth.users) or exists(select 1 from auth.identities) or exists(select 1 from auth.sessions) or exists(select 1 from auth.refresh_tokens) then raise exception 'auth scope not empty';end if;
if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name like 's4c14-%' and state<>'idle') then raise exception 'prior QA active';end if;
end $$;
do $$ begin if (select max_receipt_age from public.push_pipeline_control where id) is distinct from interval '2 hours' then raise exception 'receipt-age fixture expects two-hour policy';end if;end $$;
create function pg_temp.rb13_seed() returns void language plpgsql as $seed$
begin
insert into auth.users(id,is_anonymous) values ('00000000-0000-4000-8000-000000001411',true),('00000000-0000-4000-8000-000000001412',true),('00000000-0000-4000-8000-000000001413',true);
insert into public.notification_prefs(user_id,quotes_per_day,affirmations_per_day,streak_reminder,trial_reminder) select u,1,0,false,false from unnest(array['00000000-0000-4000-8000-000000001411','00000000-0000-4000-8000-000000001412','00000000-0000-4000-8000-000000001413']::uuid[]) u;
insert into public.entitlements(user_id,is_premium,source) select u,true,'s4c14-scheduler' from unnest(array['00000000-0000-4000-8000-000000001411','00000000-0000-4000-8000-000000001412','00000000-0000-4000-8000-000000001413']::uuid[]) u;
insert into public.notification_state(user_id,next_due_at,local_date,quotes_sent,affirmations_sent) values ('00000000-0000-4000-8000-000000001411',now()-interval '3 minutes',(now() at time zone 'UTC')::date,0,0),('00000000-0000-4000-8000-000000001412',now()-interval '2 minutes',(now() at time zone 'UTC')::date,0,0),('00000000-0000-4000-8000-000000001413',now()-interval '1 minutes',(now() at time zone 'UTC')::date,0,0);
end $seed$;
create function pg_temp.rb13_fail_counter() returns trigger language plpgsql as $fault$
begin
 if current_setting('future_self.rb13_inject_failure',true)='on' and new.user_id='00000000-0000-4000-8000-000000001411' and new.quotes_sent>old.quotes_sent then
  raise exception using errcode='ZX014',message='synthetic user counter failure';end if;
 return new;
end $fault$;
create trigger s4c14_counter_failure before update on public.notification_state
 for each row execute function pg_temp.rb13_fail_counter();
do $$ declare scenario text;n integer;q bigint;saved jsonb;results jsonb:='[]';day date:=(now() at time zone 'UTC')::date;
begin
 foreach scenario in array array['normal','duplicate','cap','not_premium','paused','queue_cap','receipt_age','receipt_fresh','user_error'] loop
  begin
   perform pg_temp.rb13_seed();
   update public.push_pipeline_control set paused=false where id;
   -- Trigger only enabled for the error case via session-local setting.
   perform set_config('future_self.rb13_inject_failure',case when scenario='user_error' then 'on' else 'off' end,true);
   if scenario='cap' then update public.notification_state set quotes_sent=1 where user_id='00000000-0000-4000-8000-000000001411';end if;
   if scenario='not_premium' then update public.entitlements set is_premium=false where user_id='00000000-0000-4000-8000-000000001411';end if;
   if scenario='paused' then update public.push_pipeline_control set paused=true where id;end if;
   if scenario='duplicate' then
    q:=public.enqueue_push_job('00000000-0000-4000-8000-000000001411','quote',day,0);
    if q is null or q<=0 then raise exception 'duplicate seed failed';end if;
   end if;
   if scenario='queue_cap' then
    q:=public.enqueue_push_job('00000000-0000-4000-8000-000000001413','quote',day,0);
    if q is null or q<=0 then raise exception 'queue seed failed';end if;
    update public.push_pipeline_control set max_queued_jobs=1 where id;
   end if;
   if scenario in ('receipt_age','receipt_fresh') then
    insert into public.notification_deliveries(id,user_id,kind,local_date,idempotency_key,status)
     values('00000000-0000-4000-8000-000000001419','00000000-0000-4000-8000-000000001413','quote',day,'s4c14-receipt','ticket_ok');
    insert into public.notification_delivery_devices(delivery_id,user_id,state,legacy_unmapped,sent_at)
     values('00000000-0000-4000-8000-000000001419','00000000-0000-4000-8000-000000001413','ticket_ok',true,clock_timestamp()-case when scenario='receipt_age' then interval '121 minutes' else interval '119 minutes' end);
   end if;
   saved:=jsonb_build_object('claims',(select count(*) from public.push_schedule_claims),'queue',(select count(*) from pgmq.q_push_jobs),'enqueue_units',(select coalesce(sum(used),0) from public.backend_budget_windows where operation='push_enqueue'));
   n:=public.enqueue_due_notifications(case when scenario='user_error' then 2 else 1 end);
   if scenario in ('normal','receipt_fresh','user_error') then
    if n<>1 or (select count(*) from public.push_schedule_claims)<>1 or (select count(*) from pgmq.q_push_jobs)<>1 then raise exception '% expected one reservation',scenario;end if;
    if not exists(select 1 from public.notification_state where user_id=case when scenario='user_error' then '00000000-0000-4000-8000-000000001412'::uuid else '00000000-0000-4000-8000-000000001411'::uuid end and quotes_sent=1 and next_due_at is null) then raise exception '% wrong selected user',scenario;end if;
   else
    if n<>0 or jsonb_build_object('claims',(select count(*) from public.push_schedule_claims),'queue',(select count(*) from pgmq.q_push_jobs),'enqueue_units',(select coalesce(sum(used),0) from public.backend_budget_windows where operation='push_enqueue')) is distinct from saved then raise exception '% admission/replay changed reservations',scenario;end if;
   end if;
   if scenario in ('paused','queue_cap','receipt_age','user_error') and not exists(select 1 from public.notification_state where user_id='00000000-0000-4000-8000-000000001411' and quotes_sent=0 and next_due_at=now()+interval '15 minutes') then raise exception '% expected user backoff',scenario;end if;
   if scenario='duplicate' and not exists(select 1 from public.notification_state where user_id='00000000-0000-4000-8000-000000001411' and quotes_sent=1 and next_due_at is null) then raise exception 'duplicate slot did not advance once';end if;
   if (select sum(used) from public.backend_budget_windows where operation='push_schedule' and subject='*') is distinct from 1::bigint then raise exception 'scheduler not reached';end if;
   raise exception using errcode='ZX001',message='rollback successful scenario';
  exception when sqlstate 'ZX001' then null;end;
  results:=results||jsonb_build_array(jsonb_build_object('case',scenario,'sqlstate','00000','status','PASS'));
 end loop;
 perform set_config('future_self.rb13_scenarios',results::text,true);
end $$;
do $$ declare table_name text;row_count bigint;begin
if exists(select 1 from cron.job where active) or (select count(*) from cron.job)<>4
 or exists(select 1 from vault.secrets) or exists(select 1 from net.http_request_queue) or exists(select 1 from net._http_response)
 or exists(select 1 from pgmq.q_push_jobs) or exists(select 1 from pgmq.a_push_jobs)
 or (select paused from public.push_pipeline_control where id) is distinct from true
 or exists(select 1 from public.notification_deliveries) or exists(select 1 from public.notification_delivery_devices)
 or exists(select 1 from public.push_schedule_claims) or exists(select 1 from public.devices)
 or (select count(*) from public.content_items)<>325 then raise exception 'isolation drift';end if;
if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required';end if;
if current_setting('deadlock_timeout')::interval >= interval '3 seconds' then raise exception 'detector does not fit lock bound';end if;
if (select md5(prosrc) from pg_proc where oid='public.enqueue_due_notifications(integer)'::regprocedure) is distinct from 'cbff66ccd437c8de3b90029d14dcb191' then raise exception 'function identity drift: public.enqueue_due_notifications(integer)';end if;
if (select md5(prosrc) from pg_proc where oid='public.enqueue_push_job(uuid,text,date,integer)'::regprocedure) is distinct from '5678722ca3b2477977447dc038db7d03' then raise exception 'function identity drift: public.enqueue_push_job(uuid,text,date,integer)';end if;
if (select md5(prosrc) from pg_proc where oid='public.recalc_notification_state(uuid)'::regprocedure) is distinct from 'ad4ed89c030e6bab317d672c0483600d' then raise exception 'function identity drift: public.recalc_notification_state(uuid)';end if;
if (select md5(prosrc) from pg_proc where oid='public.consume_backend_budget(uuid,text,integer)'::regprocedure) is distinct from 'bb1deaaf7aebfc9a509df3c9a5192f42' then raise exception 'function identity drift: public.consume_backend_budget(uuid,text,integer)';end if;

foreach table_name in array array['profiles','personalization','favorites','daily_sets','daily_progress','streaks','streak_completions','entitlements','notification_prefs','notification_state','entitlement_reconciliation','subscription_events','subscription_event_targets','account_deletion_receipts','backend_budget_windows'] loop
 execute format('select count(*) from public.%I',table_name) into row_count;
 if row_count<>0 then raise exception 'expected empty %',table_name;end if;
end loop;
if exists(select 1 from auth.users) or exists(select 1 from auth.identities) or exists(select 1 from auth.sessions) or exists(select 1 from auth.refresh_tokens) then raise exception 'auth scope not empty';end if;
if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name like 's4c14-%' and state<>'idle') then raise exception 'prior QA active';end if;
end $$;
select current_setting('future_self.rb13_scenarios')::jsonb as scenario_results;
rollback;
