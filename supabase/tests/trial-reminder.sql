-- STATIC ACCEPTANCE DRAFT for the trial-ending reminder chain. NOT RUN.
-- Same ground rules as s4-preferences.sql: disposable synthetic Supabase DB
-- with all migrations applied (through 20260913090000), pgmq installed,
-- cron/net jobs disabled. Stop on error; everything rolls back at the end.
--
-- Chain under test (see docs/NOTIFICATION_OPERATIONS.md "Trial-ending
-- reminders"): notification_prefs.trial_reminder (client toggle, saved via
-- save_notification_prefs) -> entitlements.trial_expires_at (RevenueCat via
-- apply_canonical_entitlement) -> enqueue_trial_reminders() (pg_cron
-- fs-trial-reminders, 30 * * * *) -> push_schedule_claims + pgmq push_jobs
-- -> push-dispatch builds "Your free trial ends soon" -> futureself://settings.
begin;
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
   raise exception 'isolated synthetic database approval/identity is required';end if;
 if current_user not in ('postgres','supabase_admin') then raise exception 'verify fixture owner role first';end if;
 if not exists(select 1 from cron.job where jobname='fs-trial-reminders' and schedule='30 * * * *'
   and command ~ 'enqueue_trial_reminders\(200\)') then raise exception 'fs-trial-reminders cron missing or changed';end if;
end $$;

-- Fixtures: 501 toggle on (expects a job), 502 toggle off (expects nothing),
-- 503 toggle on but trial too far away (expects nothing), 504 toggle on, no
-- device token (expects nothing). All in UTC with a window that covers now.
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000501',false),('00000000-0000-4000-8000-000000000502',false),
 ('00000000-0000-4000-8000-000000000503',false),('00000000-0000-4000-8000-000000000504',false);
update public.profiles set timezone='UTC' where id in
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000503','00000000-0000-4000-8000-000000000504');
insert into public.notification_prefs(user_id,quotes_per_day,affirmations_per_day,trial_reminder,window_start_minutes,window_end_minutes)
 select id,3,3,id<>'00000000-0000-4000-8000-000000000502',0,1440 from auth.users
 where id in ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000502',
              '00000000-0000-4000-8000-000000000503','00000000-0000-4000-8000-000000000504');
-- What apply_canonical_entitlement writes for a RevenueCat trial (period_type
-- 'trial', expires_date = trial end): the yearly product on a 3-day trial.
insert into public.entitlements(user_id,is_premium,product_id,expires_at,period_type,trial_expires_at,source)
 values
 ('00000000-0000-4000-8000-000000000501',true,'yearly',now()+interval '24 hours','trial',now()+interval '24 hours','canonical-api'),
 ('00000000-0000-4000-8000-000000000502',true,'yearly',now()+interval '24 hours','trial',now()+interval '24 hours','canonical-api'),
 ('00000000-0000-4000-8000-000000000503',true,'yearly',now()+interval '60 hours','trial',now()+interval '60 hours','canonical-api'),
 ('00000000-0000-4000-8000-000000000504',true,'yearly',now()+interval '24 hours','trial',now()+interval '24 hours','canonical-api');
insert into public.devices(user_id,install_id,platform,push_token,permission_status,active)
 values
 ('00000000-0000-4000-8000-000000000501','install-501','ios','ExponentPushToken[synthetic-501]','granted',true),
 ('00000000-0000-4000-8000-000000000502','install-502','ios','ExponentPushToken[synthetic-502]','granted',true),
 ('00000000-0000-4000-8000-000000000503','install-503','ios','ExponentPushToken[synthetic-503]','granted',true);
update public.push_pipeline_control set paused=false where id=true;
delete from public.backend_budget_windows where operation in ('push_schedule','push_enqueue');

-- Run the cron body as service_role (what pg_cron does).
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ declare n int;begin
 n:=public.enqueue_trial_reminders(200);
 if n<>1 then raise exception 'expected exactly one trial reminder job, got %',n;end if;
end $$;
reset role;
do $$ declare v_msg jsonb;begin
 if not exists(select 1 from public.push_schedule_claims where user_id='00000000-0000-4000-8000-000000000501' and kind='trial_reminder'
   and trial_anchor is not null and queue_msg_id is not null) then raise exception 'no claim for the eligible trial user';end if;
 if exists(select 1 from public.push_schedule_claims where kind='trial_reminder' and user_id<>'00000000-0000-4000-8000-000000000501') then
   raise exception 'toggle off / far trial / no device produced a claim';end if;
 select message into v_msg from pgmq.q_push_jobs where message->>'user_id'='00000000-0000-4000-8000-000000000501' and message->>'kind'='trial_reminder';
 if v_msg is null or (v_msg->>'slot')::int<>0 or v_msg->>'trial_expires_at' is null then raise exception 'push job payload incomplete';end if;
 -- The dispatcher gate re-checks the toggle and the trial anchor at send time.
 if public.push_eligibility('00000000-0000-4000-8000-000000000501','trial_reminder',(now() at time zone 'UTC')::date,0,now()+interval '6 hours',(v_msg->>'trial_expires_at')::timestamptz)->>'outcome'<>'allow' then
   raise exception 'send-time gate refused an eligible trial reminder';end if;
 if public.push_eligibility('00000000-0000-4000-8000-000000000502','trial_reminder',(now() at time zone 'UTC')::date,0,now()+interval '6 hours',now()+interval '24 hours')->>'reason'<>'preference_changed' then
   raise exception 'send-time gate ignored trial_reminder=false';end if;
end $$;

-- Second hourly run: the claim dedupes, nothing is enqueued twice.
set local role service_role;
do $$ declare n int;begin
 n:=public.enqueue_trial_reminders(200);
 if n<>0 then raise exception 'reminder enqueued twice, got %',n;end if;
end $$;
reset role;

-- Turning the toggle off after the job was queued: the dispatcher skips it.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',true);
select public.save_notification_prefs('{"trial_reminder":false}',false);
reset role;
do $$ begin
 if public.push_eligibility('00000000-0000-4000-8000-000000000501','trial_reminder',(now() at time zone 'UTC')::date,0,now()+interval '6 hours',now()+interval '24 hours')->>'reason'<>'preference_changed' then
   raise exception 'late opt-out not honoured at send time';end if;
end $$;

rollback;
