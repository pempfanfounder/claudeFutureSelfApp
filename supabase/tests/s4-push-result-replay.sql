-- S5-RB06 regression. Run only in an approved empty synthetic database with
-- every migration applied, cron inactive and no provider credentials or traffic.
-- Transaction-local fixtures and unpause are always discarded by ROLLBACK.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='60s';
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic'
   or exists(select 1 from auth.users) or exists(select 1 from cron.job where active)
   or exists(select 1 from vault.secrets) or exists(select 1 from pgmq.q_push_jobs)
   or not (select paused from public.push_pipeline_control where id) then
   raise exception 'Approved empty synthetic database required'; end if;
end $$;
insert into auth.users(id,is_anonymous) values ('00000000-0000-4000-8000-000000000980',true);
update public.profiles set timezone=(select name from pg_timezone_names
 where extract(hour from clock_timestamp() at time zone name)=12 order by name limit 1)
 where id='00000000-0000-4000-8000-000000000980';
insert into public.entitlements(user_id,is_premium,expires_at,source)
 values ('00000000-0000-4000-8000-000000000980',true,null,'canonical-api');
insert into public.notification_prefs(user_id,window_start_minutes,window_end_minutes)
 values ('00000000-0000-4000-8000-000000000980',0,1439);
insert into public.devices(id,user_id,install_id,push_token,platform,permission_status)
 select ('00000000-0000-4000-8000-00000000098'||n)::uuid,
 '00000000-0000-4000-8000-000000000980','s4c7-result-'||n,
 'ExpoPushToken[s4c7_result_'||n||']','ios','granted' from generate_series(1,4) n;
update public.push_pipeline_control set paused=false where id;

-- Snapshot complete rows, including queue/archive and registration generations,
-- so a rejected replay cannot silently persist any prefix or acknowledge work.
create function pg_temp.push_result_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
 'attempts',(select jsonb_agg(to_jsonb(x) order by id) from public.notification_delivery_devices x),
 'parents',(select jsonb_agg(to_jsonb(x) order by id) from public.notification_deliveries x),
 'devices',(select jsonb_agg(to_jsonb(x) order by id) from public.devices x),
 'queue',(select jsonb_agg(to_jsonb(x) order by msg_id) from pgmq.q_push_jobs x),
 'archive',(select jsonb_agg(to_jsonb(x) order by msg_id) from pgmq.a_push_jobs x));
$$;

do $$ declare
 u uuid:='00000000-0000-4000-8000-000000000980'; day date; q bigint;
 c jsonb; b jsonb; f jsonb; res jsonb; conflict jsonb; saved jsonb; initial_res jsonb;
 d uuid; lease uuid; initial_lease uuid; retry_device uuid:='00000000-0000-4000-8000-000000000984';
 n integer; before_finish timestamptz; after_finish timestamptz; due timestamptz;
 content jsonb:='{"title":"Future Self","body":"Synthetic result regression.","url":"futureself://feed","snapshot":{"body":"Synthetic result regression.","author":null,"type":"quote"}}';
begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
 q:=public.enqueue_push_job(u,'quote',day,0); c:=public.claim_push_job(q);
 if c->>'outcome' is distinct from 'claimed' then raise exception 'fixture not claimed'; end if;
 d:=(c->>'delivery_id')::uuid; lease:=(c->>'lease_token')::uuid; initial_lease:=lease;
 perform public.prepare_push_delivery(d,lease,content); b:=public.begin_push_send(d,lease);
 if b->>'outcome' is distinct from 'sending' or jsonb_array_length(b->'attempts') is distinct from 4 then raise exception 'fixture fanout'; end if;
 select jsonb_agg(case device_id
 when '00000000-0000-4000-8000-000000000981'::uuid then jsonb_build_object('attempt_id',id,'state','ticket_ok','ticket_id','s4c7-ticket-ok')
 when '00000000-0000-4000-8000-000000000982'::uuid then jsonb_build_object('attempt_id',id,'state','ticket_error','error_code','DeviceNotRegistered')
 when '00000000-0000-4000-8000-000000000983'::uuid then jsonb_build_object('attempt_id',id,'state','uncertain')
 else jsonb_build_object('attempt_id',id,'state','ticket_error','error_code','MessageRateExceeded') end order by id)
 into res from public.notification_delivery_devices where delivery_id=d;
 initial_res:=res; before_finish:=clock_timestamp(); f:=public.finish_push_send(d,lease,res); after_finish:=clock_timestamp();
 if f is distinct from '{"outcome":"persisted","ticket_ok":1,"ticket_error":2,"uncertain":1,"retry_wait":1,"queue_deleted":false}'::jsonb then raise exception 'mixed results: %',f; end if;
 select next_retry_at into due from public.notification_delivery_devices where delivery_id=d and device_id=retry_device;
 if due is null or due<before_finish+interval '60 seconds' or due>after_finish+interval '60 seconds' then raise exception 'first retry backoff'; end if;
 if not exists(select 1 from public.devices where id='00000000-0000-4000-8000-000000000982' and not active and push_token is null)
 or (select count(*) from public.devices where active)<>3
 or not exists(select 1 from public.notification_delivery_devices where delivery_id=d and device_id='00000000-0000-4000-8000-000000000983' and state='uncertain' and error_code='provider_outcome_uncertain' and terminal_at is not null)
 or not exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'mixed state or registration'; end if;
 saved:=pg_temp.push_result_snapshot();
 if public.finish_push_send(d,lease,res) is distinct from f or pg_temp.push_result_snapshot() is distinct from saved then raise exception 'identical replay changed rows'; end if;
 -- A full-sized replay differs only in its last result. Every original row,
 -- including any earlier matching prefix, must remain byte-for-byte equivalent.
 conflict:=jsonb_set(res,'{3}',jsonb_build_object('attempt_id',res->3->>'attempt_id','state','ticket_ok','ticket_id','s4c7-conflicting-ticket'));
 if jsonb_array_length(conflict)<>4 or public.finish_push_send(d,lease,conflict) is distinct from '{"outcome":"superseded"}'::jsonb
 or pg_temp.push_result_snapshot() is distinct from saved then raise exception 'conflicting full replay mutated state'; end if;
 if public.finish_push_send(d,lease,jsonb_build_array(res->0)) is distinct from '{"outcome":"superseded"}'::jsonb
 or pg_temp.push_result_snapshot() is distinct from saved then raise exception 'partial replay mutated state'; end if;

 for n in 2..3 loop
   -- Only fixture timestamps/visibility move. Do not reset attempt counts,
   -- budget windows, registration generations or application clocks.
   update public.notification_delivery_devices set next_retry_at=clock_timestamp()-interval '1 second' where delivery_id=d and device_id=retry_device;
   update public.notification_deliveries set next_retry_at=clock_timestamp()-interval '1 second' where id=d;
   update pgmq.q_push_jobs set vt=clock_timestamp()-interval '1 second' where msg_id=q;
   c:=public.claim_push_job(q); lease:=(c->>'lease_token')::uuid;
   if c->>'outcome' is distinct from 'claimed' then raise exception 'retry not claimed'; end if;
   perform public.prepare_push_delivery(d,lease,content); b:=public.begin_push_send(d,lease);
   if b->>'outcome' is distinct from 'sending' or jsonb_array_length(b->'attempts') is distinct from 1
   or (b->'attempts'->0->>'device_id')::uuid is distinct from retry_device then raise exception 'successful/uncertain device resent'; end if;
   select jsonb_build_array(jsonb_build_object('attempt_id',id,'state','ticket_error','error_code','MessageRateExceeded')) into res
   from public.notification_delivery_devices where delivery_id=d and device_id=retry_device and send_attempts=n;
   before_finish:=clock_timestamp(); f:=public.finish_push_send(d,lease,res); after_finish:=clock_timestamp();
   if f->>'outcome' is distinct from 'persisted' or f->>'ticket_error' is distinct from '1'
   or f->>'retry_wait' is distinct from (case when n=2 then '1' else '0' end)
   or f->>'queue_deleted' is distinct from (case when n=2 then 'false' else 'true' end) then raise exception 'rate retry result: %',f; end if;
   if n=2 then
     select next_retry_at into due from public.notification_delivery_devices where delivery_id=d and device_id=retry_device;
     if due is null or due<before_finish+interval '120 seconds' or due>after_finish+interval '120 seconds' or not exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'second retry backoff/queue'; end if;
   elsif not exists(select 1 from public.notification_delivery_devices where delivery_id=d and device_id=retry_device and state='dead_letter' and send_attempts=3 and terminal_at is not null)
      or exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'third retry not terminal'; end if;
   saved:=pg_temp.push_result_snapshot();
   if public.finish_push_send(d,lease,res) is distinct from f or pg_temp.push_result_snapshot() is distinct from saved then raise exception 'retry replay changed state'; end if;
   if public.finish_push_send(d,initial_lease,initial_res) is distinct from '{"outcome":"superseded"}'::jsonb or pg_temp.push_result_snapshot() is distinct from saved then raise exception 'superseded old batch changed state'; end if;
 end loop;
 if (select sum(send_attempts) from public.notification_delivery_devices where delivery_id=d) is distinct from 6::bigint then raise exception 'unexpected send fanout'; end if;
end $$;
select 'S5-RB06 replay, mixed outcomes, uncertainty, retry bounds: PASS' as result;
rollback;
