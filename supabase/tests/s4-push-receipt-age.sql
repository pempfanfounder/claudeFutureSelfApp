-- S5-RB07: run only in an approved empty synthetic database, all migrations
-- applied, cron inactive and no provider credentials. Every fixture rolls back.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local idle_in_transaction_session_timeout='60s';
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic'
 or exists(select 1 from auth.users) or exists(select 1 from cron.job where active)
 or exists(select 1 from vault.secrets) or exists(select 1 from pgmq.q_push_jobs)
 or (select paused from public.push_pipeline_control where id) is distinct from true then
   raise exception 'Approved empty synthetic database required'; end if;
end $$;

create function pg_temp.age_snapshot(scheduler boolean default false) returns jsonb language sql as $$
 select jsonb_build_object(
 'queue',(select jsonb_agg(to_jsonb(x) order by msg_id) from pgmq.q_push_jobs x),
 'archive',(select jsonb_agg(to_jsonb(x) order by msg_id) from pgmq.a_push_jobs x),
 'claims',(select jsonb_agg(to_jsonb(x) order by schedule_key) from public.push_schedule_claims x),
 'budgets',(select jsonb_agg(to_jsonb(x) order by operation,subject,window_start) from public.backend_budget_windows x where not scheduler or operation<>'push_schedule'),
 'parents',(select jsonb_agg(to_jsonb(x) order by id) from public.notification_deliveries x),
 'attempts',(select jsonb_agg(to_jsonb(x) order by id) from public.notification_delivery_devices x),
 'state',(select jsonb_agg(case when scheduler then to_jsonb(x)-'next_due_at'-'updated_at' else to_jsonb(x) end order by user_id) from public.notification_state x));
$$;

create function pg_temp.age_seed() returns void language plpgsql as $$
declare q bigint;c jsonb;b jsonb;r jsonb;d uuid;l uuid;day date;
 content jsonb:='{"title":"Future Self","body":"Synthetic receipt-age regression.","url":"futureself://feed","snapshot":{"body":"Synthetic receipt-age regression.","author":null,"type":"quote"}}';
begin
 insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000960',true),('00000000-0000-4000-8000-000000000970',true);
 update public.profiles set timezone=(select name from pg_timezone_names where extract(hour from clock_timestamp() at time zone name)=12 order by name limit 1);
 insert into public.entitlements(user_id,is_premium,expires_at,source)
 select id,true,null,'canonical-api' from public.profiles;
 insert into public.notification_prefs(user_id,window_start_minutes,window_end_minutes)
 select id,0,1439 from public.profiles;
 insert into public.devices(id,user_id,install_id,push_token,platform,permission_status) values
 ('00000000-0000-4000-8000-000000000961','00000000-0000-4000-8000-000000000960','s4c8-old-1','ExpoPushToken[s4c8_old_1]','ios','granted'),
 ('00000000-0000-4000-8000-000000000962','00000000-0000-4000-8000-000000000960','s4c8-old-2','ExpoPushToken[s4c8_old_2]','ios','granted'),
 ('00000000-0000-4000-8000-000000000971','00000000-0000-4000-8000-000000000970','s4c8-target','ExpoPushToken[s4c8_target]','ios','granted');
 update public.push_pipeline_control set paused=false where id;
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id='00000000-0000-4000-8000-000000000960';
 q:=public.enqueue_push_job('00000000-0000-4000-8000-000000000960','quote',day,0);
 c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;l:=(c->>'lease_token')::uuid;
 perform public.prepare_push_delivery(d,l,content);b:=public.begin_push_send(d,l);
 if b->>'outcome' is distinct from 'sending' or jsonb_array_length(b->'attempts') is distinct from 2 then raise exception 'seed sending failed';end if;
 select jsonb_agg(jsonb_build_object('attempt_id',id,'state','ticket_ok','ticket_id','s4c8-'||id::text) order by id) into r from public.notification_delivery_devices where delivery_id=d;
 r:=public.finish_push_send(d,l,r);
 if r->>'outcome' is distinct from 'persisted' or r->>'ticket_ok' is distinct from '2' or r->>'queue_deleted' is distinct from 'true' then raise exception 'seed tickets failed';end if;
 -- No daily scheduler work for the receipt owner. Target scenarios opt in below.
 insert into public.notification_state(user_id,local_date,next_due_at)
 select id,(now() at time zone timezone)::date,null from public.profiles
 on conflict(user_id) do update set next_due_at=null,local_date=excluded.local_date;
 update public.notification_delivery_devices set sent_at=clock_timestamp()-interval '180 minutes',next_retry_at=clock_timestamp()-interval '1 second';
end $$;

create function pg_temp.age_resolve(one_only boolean default false) returns void language plpgsql as $$
declare c jsonb;r jsonb;first_id uuid;expected integer;
begin
 update public.notification_delivery_devices set next_retry_at=clock_timestamp()-interval '1 second' where state='ticket_ok';
 c:=public.claim_push_receipts(); expected:=jsonb_array_length(c->'attempts');
 if expected is null or expected not between 1 and 2 then raise exception 'receipt fixture not claimable: %',c;end if;
 first_id:=(c->'attempts'->0->>'id')::uuid;
 select jsonb_agg(jsonb_build_object('attempt_id',x->>'id','state',case when one_only and (x->>'id')::uuid<>first_id then 'pending' else 'receipt_ok' end))
 into r from jsonb_array_elements(c->'attempts') x;
 r:=public.finish_push_receipts((c->>'lease_token')::uuid,r);
 if r->>'outcome' is distinct from 'persisted' or (r->>'receipt_ok')::int is distinct from (case when one_only then 1 else expected end) then raise exception 'receipt resolution failed: %',r;end if;
end $$;

-- Each scenario starts from identical empty state. The deliberate ZX001 rolls
-- back its fixture AND budget windows; assertion failures use another SQLSTATE.
do $$ declare scenario text;u uuid:='00000000-0000-4000-8000-000000000970';day date;
 saved jsonb; q bigint;n int;v_kind text;want_quote int;want_affirmation int;anchor timestamptz;
 results jsonb:='[]'; blocked boolean;
begin
 foreach scenario in array array['age180','age121','age119','limit4h','limit1h','pause','count_cap','queue_cap','multiple_global','daily_quote','daily_affirmation','trial','streak'] loop
  begin
   perform pg_temp.age_seed();
   select (now() at time zone timezone)::date into day from public.profiles where id=u;
   if scenario in ('age121','age119','limit1h','pause','count_cap','queue_cap') then
     update public.notification_delivery_devices set sent_at=clock_timestamp()-make_interval(mins=>case when scenario='age121' then 121 else 119 end);
   end if;
   if scenario='limit4h' then update public.push_pipeline_control set max_receipt_age=interval '4 hours';end if;
   if scenario='limit1h' then update public.push_pipeline_control set max_receipt_age=interval '1 hour';end if;
   if scenario='pause' then update public.push_pipeline_control set paused=true;end if;
   if scenario='count_cap' then update public.push_pipeline_control set max_pending_receipts=2;end if;
   if scenario='queue_cap' then
     q:=public.enqueue_push_job(u,'quote',day,1);
     if q is null or q<=0 then raise exception 'queue cap seed failed';end if;
     update public.push_pipeline_control set max_queued_jobs=1;
   end if;
   if scenario in ('daily_quote','daily_affirmation','trial','streak') then
     if scenario='streak' then
       update public.profiles set timezone=(select name from pg_timezone_names where extract(hour from now() at time zone name)=19 order by name limit 1) where id=u;
       select (now() at time zone timezone)::date into day from public.profiles where id=u;
       insert into public.streaks(user_id,current_streak,last_completed_date) values(u,3,day-1)
       on conflict(user_id) do update set current_streak=3,last_completed_date=day-1;
     end if;
     want_quote:=case when scenario='daily_quote' then 1 else 0 end;
     want_affirmation:=case when scenario='daily_affirmation' then 1 else 0 end;
     v_kind:=case scenario when 'daily_quote' then 'quote' when 'daily_affirmation' then 'affirmation' when 'trial' then 'trial_reminder' else 'streak_risk' end;
     update public.notification_prefs set quotes_per_day=want_quote,affirmations_per_day=want_affirmation where user_id=u;
     update public.notification_state set local_date=day,quotes_sent=0,affirmations_sent=0,streak_risk_sent_on=null,
       next_due_at=case when scenario in ('daily_quote','daily_affirmation') then now()-interval '1 second' end where user_id=u;
     if scenario='trial' then
       anchor:=now()+interval '24 hours';
       update public.entitlements set trial_expires_at=anchor,period_type='trial' where user_id=u;
     end if;
     saved:=pg_temp.age_snapshot(true);
     n:=case when scenario='trial' then public.enqueue_trial_reminders(10) else public.enqueue_due_notifications(10) end;
     if n is distinct from 0 or pg_temp.age_snapshot(true) is distinct from saved then raise exception '% denied scheduling changed reservations/counters/budgets',scenario;end if;
     if (select sum(used) from public.backend_budget_windows where operation='push_schedule') is distinct from 1::bigint then raise exception 'scheduler denial was not reached';end if;
     if scenario in ('daily_quote','daily_affirmation') and (select next_due_at from public.notification_state where user_id=u) is distinct from now()+interval '15 minutes' then raise exception 'daily denial pacing';end if;
     perform pg_temp.age_resolve();
     -- Simulate the next scheduled pass becoming due; preserve counters/claims.
     if scenario in ('daily_quote','daily_affirmation') then update public.notification_state set next_due_at=now()-interval '1 second' where user_id=u;end if;
     n:=case when scenario='trial' then public.enqueue_trial_reminders(10) else public.enqueue_due_notifications(10) end;
     if n is distinct from 1 then raise exception '% recovery did not enqueue exactly one: %',scenario,n;end if;
     if (select sum(used) from public.backend_budget_windows where operation='push_schedule') is distinct from 2::bigint then raise exception 'scheduler recovery budget';end if;
     if (select count(*) from public.push_schedule_claims where user_id=u and kind=v_kind)<>1
       or (select count(*) from pgmq.q_push_jobs where message->>'user_id'=u::text and message->>'kind'=v_kind)<>1 then raise exception '% recovery lost or duplicated key',scenario;end if;
     if not exists(select 1 from public.notification_state where user_id=u and quotes_sent=want_quote and affirmations_sent=want_affirmation
       and streak_risk_sent_on is not distinct from (case when scenario='streak' then day end)) then raise exception '% recovery markers',scenario;end if;
     if scenario='trial' and not exists(select 1 from public.push_schedule_claims where user_id=u and trial_anchor=anchor) then raise exception 'trial anchor changed';end if;
     saved:=pg_temp.age_snapshot();
     if public.enqueue_push_job(u,v_kind,day,0) is distinct from 0::bigint or pg_temp.age_snapshot() is distinct from saved then raise exception '% recovered key not idempotent',scenario;end if;
   else
     blocked:=scenario not in ('age119','limit4h');
     saved:=pg_temp.age_snapshot(); q:=public.enqueue_push_job(u,'quote',day,0);
     if blocked then
       if q is not null or pg_temp.age_snapshot() is distinct from saved then raise exception '% overdue/cap denial consumed rows',scenario;end if;
       if scenario='multiple_global' then
         perform pg_temp.age_resolve(true);saved:=pg_temp.age_snapshot();
         if (select count(*) from public.notification_delivery_devices where state='ticket_ok')<>1 then raise exception 'partial recovery control';end if;
         if public.enqueue_push_job(u,'quote',day,0) is not null or pg_temp.age_snapshot() is distinct from saved then raise exception 'one unresolved global overdue ticket did not block';end if;
       end if;
       if scenario='pause' then update public.push_pipeline_control set paused=false;
       elsif scenario='count_cap' then update public.push_pipeline_control set max_pending_receipts=600;
       elsif scenario='queue_cap' then update public.push_pipeline_control set max_queued_jobs=100;
       else perform pg_temp.age_resolve();end if;
       q:=public.enqueue_push_job(u,'quote',day,0);
     end if;
     if q is null or q<=0 then raise exception '% allowed/recovered key failed',scenario;end if;
     if (select count(*) from public.push_schedule_claims where user_id=u and kind='quote' and local_date=day and schedule_key=u::text||':'||day::text||':quote:0')<>1
       or (select count(*) from pgmq.q_push_jobs where msg_id=q and message->>'slot'='0')<>1 then raise exception '% slot recovery mismatch',scenario;end if;
     saved:=pg_temp.age_snapshot();
     if public.enqueue_push_job(u,'quote',day,0) is distinct from 0::bigint or pg_temp.age_snapshot() is distinct from saved then raise exception '% replay charged/reserved twice',scenario;end if;
   end if;
   raise exception using errcode='ZX001',message='rollback successful scenario';
  exception when sqlstate 'ZX001' then null;
  end;
  results:=results||jsonb_build_array(jsonb_build_object('case',scenario,'status','PASS'));
 end loop;
 if exists(select 1 from auth.users) or exists(select 1 from public.backend_budget_windows) or exists(select 1 from pgmq.q_push_jobs)
 or (select paused from public.push_pipeline_control where id) is distinct from true then raise exception 'scenario rollback failed';end if;
 perform set_config('future_self.age_results',results::text,true);
end $$;
-- Exact equality is semantic/static evidence, not a wall-clock runtime claim.
do $$ declare cutoff timestamptz:='2026-09-08T12:00:00Z';body text;begin
 if cutoff-interval '2 hours'<cutoff-interval '2 hours'
 or not (cutoff-interval '2 hours 1 microsecond'<cutoff-interval '2 hours') then raise exception 'strict threshold truth table';end if;
 select prosrc into body from pg_proc where oid='public.enqueue_push_job(uuid,text,date,integer)'::regprocedure;
 if position('state=''ticket_ok'' and sent_at<clock_timestamp()-v_control.max_receipt_age' in body)=0 then raise exception 'exact configurable strict sender predicate missing';end if;
end $$;
select current_setting('future_self.age_results')::jsonb as receipt_age_results;
rollback;
