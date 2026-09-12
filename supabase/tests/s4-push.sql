-- STATIC / NOT RUN. First verify a disposable synthetic Supabase DB, role map,
-- every migration including PGMQ, and disable all cron/net jobs there. This file
-- is not permission to create/start/connect to a DB. NEVER use an existing project.
begin;
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
   raise exception 'isolated synthetic database approval/identity is required';end if;
 if exists(select 1 from pgmq.q_push_jobs) then raise exception 'fixture queue must be empty';end if;
end $$;
-- Auth schema fixture and trigger behavior must be checked before execution.
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000101',true),('00000000-0000-4000-8000-000000000102',true);
-- Choose a valid timezone currently at midday; the real clock is never changed.
update public.profiles set timezone=(select name from pg_timezone_names where extract(hour from clock_timestamp() at time zone name)=12 order by name limit 1)
 where id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102');
insert into public.entitlements(user_id,is_premium,expires_at,source) values
 ('00000000-0000-4000-8000-000000000101',true,null,'canonical-api'),('00000000-0000-4000-8000-000000000102',true,null,'canonical-api');
insert into public.notification_prefs(user_id,window_start_minutes,window_end_minutes) values
 ('00000000-0000-4000-8000-000000000101',0,1439),('00000000-0000-4000-8000-000000000102',0,1439);
insert into public.devices(id,user_id,install_id,push_token,platform,permission_status) values
 ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000101','s4-push-one','ExpoPushToken[s4_one]','ios','granted'),
 ('00000000-0000-4000-8000-000000000112','00000000-0000-4000-8000-000000000101','s4-push-two','ExpoPushToken[s4_two]','ios','granted'),
 ('00000000-0000-4000-8000-000000000113','00000000-0000-4000-8000-000000000101','s4-push-three','ExpoPushToken[s4_three]','ios','granted');

do $$ begin
 if not (select paused from public.push_pipeline_control where id) then raise exception 'local draft must start paused';end if;
 if has_function_privilege('authenticated','public.claim_push_job(bigint)','execute')
   or has_function_privilege('anon','public.finish_push_send(uuid,uuid,jsonb)','execute')
   or has_function_privilege('authenticated','public.finish_push_receipts(uuid,jsonb)','execute')
   or has_table_privilege('authenticated','public.notification_delivery_devices','select')
   or has_table_privilege('authenticated','public.push_schedule_claims','insert')
   or has_function_privilege('service_role','public.queue_delete(bigint)','execute') then raise exception 'internal privilege escaped';end if;
end $$;
-- This changes only the synthetic transaction; the final rollback restores it.
update public.push_pipeline_control set paused=false;

do $$
declare u uuid:='00000000-0000-4000-8000-000000000101';q bigint;c jsonb;b jsonb;f jsonb;again jsonb;res jsonb;
 d uuid;lease uuid;day date;rc jsonb;rr jsonb;
 content jsonb:='{"title":"Future Self","body":"Original synthetic content.","url":"futureself://feed","contentId":null,"campaignId":null,"snapshot":{"body":"Original synthetic content.","author":null,"type":"quote"}}';
begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
 q:=public.enqueue_push_job(u,'quote',day,0);
 if q is null or q<=0 or public.enqueue_push_job(u,'quote',day,0)<>0 then raise exception 'durable producer reservation failed';end if;
 c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;lease:=(c->>'lease_token')::uuid;
 if c->>'outcome'<>'claimed' or public.claim_push_job(q)->>'outcome'<>'busy' then raise exception 'exclusive claim failed';end if;
 perform public.prepare_push_delivery(d,lease,content);b:=public.begin_push_send(d,lease);
 if b->>'outcome'<>'sending' or jsonb_array_length(b->'attempts')<>3 then raise exception 'device fanout missing';end if;
 select jsonb_agg(case when device_id='00000000-0000-4000-8000-000000000112' then
   jsonb_build_object('attempt_id',id,'state','ticket_error','error_code','DeviceNotRegistered') else
   jsonb_build_object('attempt_id',id,'state','ticket_ok','ticket_id','s4-ticket-'||device_id::text) end order by id)
 into res from public.notification_delivery_devices where delivery_id=d;
 f:=public.finish_push_send(d,lease,res);again:=public.finish_push_send(d,lease,res);
 if f is distinct from again or f->>'outcome'<>'persisted' or (f->>'ticket_ok')::int<>2 or (f->>'ticket_error')::int<>1
   or not (f->>'queue_deleted')::boolean or exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'atomic/idempotent progress failed';end if;
 if exists(select 1 from public.devices where id='00000000-0000-4000-8000-000000000112' and (active or push_token is not null)) then
   raise exception 'acknowledged registration not invalidated';end if;
 if public.finish_push_send(d,lease,jsonb_build_array(res->0))->>'outcome'<>'superseded' then raise exception 'partial finalization accepted';end if;
 -- Rotation happens after ticket acknowledgement but before its receipt. An old
 -- DeviceNotRegistered receipt must not erase the newly registered token/version.
 update public.devices set push_token='ExpoPushToken[s4_one_rotated]' where id='00000000-0000-4000-8000-000000000111';
 update public.notification_delivery_devices set next_retry_at=clock_timestamp()-interval '1 second' where delivery_id=d and state='ticket_ok';
 rc:=public.claim_push_receipts();
 if jsonb_array_length(rc->'attempts')<>2 or jsonb_array_length(public.claim_push_receipts()->'attempts')<>0 then raise exception 'receipt lease not exclusive';end if;
 select jsonb_agg(case when device_id='00000000-0000-4000-8000-000000000111' then
   jsonb_build_object('attempt_id',id,'state','receipt_error','error_code','DeviceNotRegistered') else
   jsonb_build_object('attempt_id',id,'state','receipt_ok') end order by id)
 into rr from public.notification_delivery_devices where delivery_id=d and state='ticket_ok';
 f:=public.finish_push_receipts((rc->>'lease_token')::uuid,rr);
 if f is distinct from public.finish_push_receipts((rc->>'lease_token')::uuid,rr) or (f->>'checked')::int<>2 then raise exception 'receipt persistence not idempotent';end if;
 if not exists(select 1 from public.devices where id='00000000-0000-4000-8000-000000000111' and active and push_token='ExpoPushToken[s4_one_rotated]' and registration_version=2) then
   raise exception 'stale receipt erased new registration';end if;
 -- Crash after begin has no safe resend. Expiry retains uncertainty and closes
 -- the queue, even when the old worker later supplies a valid-looking ticket.
 q:=public.enqueue_push_job(u,'quote',day,1);c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;lease:=(c->>'lease_token')::uuid;
 perform public.prepare_push_delivery(d,lease,content);b:=public.begin_push_send(d,lease);
 if b->>'outcome'<>'sending' then raise exception 'crash fixture never began';end if;
 update public.notification_deliveries set lease_until=clock_timestamp()-interval '1 second',next_retry_at=null where id=d;
 c:=public.claim_push_job(q);
 if c->>'outcome'<>'archived' or exists(select 1 from public.notification_delivery_devices where delivery_id=d and state<>'uncertain') then raise exception 'ambiguous crash was resent';end if;
 select jsonb_agg(jsonb_build_object('attempt_id',id,'state','ticket_ok','ticket_id','s4-late-'||id::text)) into res from public.notification_delivery_devices where delivery_id=d;
 if public.finish_push_send(d,lease,res)->>'outcome'<>'superseded' then raise exception 'expired send lease accepted';end if;
 -- Crash before begin is retryable. A deferred re-read must not consume the
 -- same crashed preparation again and prematurely dead-letter the job.
 q:=public.enqueue_push_job(u,'quote',day,2);c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;
 update public.notification_deliveries set lease_until=clock_timestamp()-interval '1 second',next_retry_at=clock_timestamp()+interval '15 minutes' where id=d;
 perform public.claim_push_job(q);perform public.claim_push_job(q);
 if not exists(select 1 from public.notification_deliveries where id=d and preparation_failures=1 and status='retry_wait') then raise exception 'crashed prep counted repeatedly';end if;
end $$;

-- Reset only synthetic receipt budget counters between independent scenarios.
delete from public.backend_budget_windows where operation='push_receipt';

-- A receipt from a prior device batch must not overwrite the active dispatcher
-- preparation phase for remaining devices. Rows below are synthetic state setup.
insert into public.devices(id,user_id,install_id,push_token,platform,permission_status) values
 ('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000102','s4-phase-one','ExpoPushToken[s4_phase_one]','ios','granted'),
 ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000102','s4-phase-two','ExpoPushToken[s4_phase_two]','ios','granted');
do $$ declare u uuid:='00000000-0000-4000-8000-000000000102';q bigint;day date;c jsonb;rc jsonb;b jsonb;d uuid;lease uuid;res jsonb;
 content jsonb:='{"title":"Future Self","body":"Original phase fixture.","url":"futureself://feed","contentId":null,"campaignId":null,"snapshot":{"body":"Original phase fixture.","author":null,"type":"affirmation"}}';
begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
 q:=public.enqueue_push_job(u,'affirmation',day,0);c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;lease:=(c->>'lease_token')::uuid;
 perform public.prepare_push_delivery(d,lease,content);perform public.release_push_delivery(d,lease,'preparation_failed');
 update public.notification_delivery_devices set state='ticket_ok',expo_ticket_id='s4-prior-phase-ticket',sent_at=clock_timestamp()-interval '20 minutes',next_retry_at=clock_timestamp()-interval '1 second'
   where delivery_id=d and device_id='00000000-0000-4000-8000-000000000121';
 update public.notification_deliveries set next_retry_at=clock_timestamp()-interval '1 second' where id=d;
 c:=public.claim_push_job(q);lease:=(c->>'lease_token')::uuid;
 if c->>'outcome'<>'claimed' then raise exception 'phase fixture not claimed';end if;
 rc:=public.claim_push_receipts();
 select jsonb_agg(jsonb_build_object('attempt_id',x->>'id','state','receipt_ok')) into res from jsonb_array_elements(rc->'attempts') x;
 perform public.finish_push_receipts((rc->>'lease_token')::uuid,res);
 if not exists(select 1 from public.notification_deliveries where id=d and status='preparing' and lease_token=lease) then raise exception 'receipt stole preparation phase';end if;
 b:=public.begin_push_send(d,lease);
 if b->>'outcome'<>'sending' or jsonb_array_length(b->'attempts')<>1 then raise exception 'receipt blocked valid send lease';end if;
 select jsonb_agg(jsonb_build_object('attempt_id',x->>'id','state','uncertain','error_code','provider_outcome_uncertain')) into res from jsonb_array_elements(b->'attempts') x;
 perform public.finish_push_send(d,lease,res);
end $$;

-- Owner finalization must clear the preparing phase before aggregate refresh,
-- including when every device disappears or entitlement changes after prepare.
do $$ declare u uuid:='00000000-0000-4000-8000-000000000102';day date;q bigint;c jsonb;b jsonb;d uuid;lease uuid;
 content jsonb:='{"title":"Future Self","body":"Original terminal fixture.","url":"futureself://feed","contentId":null,"campaignId":null,"snapshot":{"body":"Original terminal fixture.","author":null,"type":"affirmation"}}';
begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
 q:=public.enqueue_push_job(u,'affirmation',day,1);c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;lease:=(c->>'lease_token')::uuid;
 perform public.prepare_push_delivery(d,lease,content);
 update public.devices set active=false where user_id=u;
 b:=public.begin_push_send(d,lease);
 if b->>'outcome'<>'no_ready_attempts' or not (b->>'queue_archived')::boolean
   or not exists(select 1 from public.notification_deliveries where id=d and status='skipped' and lease_token is null and lease_until is null)
   or exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'disabled devices stranded preparing parent';end if;
 update public.devices set active=true where user_id=u;
 q:=public.enqueue_push_job(u,'affirmation',day,2);c:=public.claim_push_job(q);d:=(c->>'delivery_id')::uuid;lease:=(c->>'lease_token')::uuid;
 perform public.prepare_push_delivery(d,lease,content);
 update public.entitlements set expires_at=clock_timestamp()-interval '1 second' where user_id=u;
 b:=public.begin_push_send(d,lease);
 if b->>'outcome'<>'skip' or not (b->>'queue_archived')::boolean
   or not exists(select 1 from public.notification_deliveries where id=d and status='skipped' and lease_token is null and lease_until is null)
   or exists(select 1 from pgmq.q_push_jobs where msg_id=q) then raise exception 'revoked entitlement stranded preparing parent';end if;
 update public.entitlements set expires_at=null where user_id=u;
end $$;

-- Midnight and late-night trials must remain unreserved until the actual send
-- window. Use valid zones to place this fixture's local clock at 00/23/12;
-- never replace application clock helpers or change the system clock.
update public.notification_prefs set window_start_minutes=540,window_end_minutes=1260 where user_id='00000000-0000-4000-8000-000000000102';
update public.entitlements set trial_expires_at=clock_timestamp()+interval '24 hours',period_type='trial' where user_id='00000000-0000-4000-8000-000000000102';
do $$ declare h integer;day date;q bigint;u uuid:='00000000-0000-4000-8000-000000000102';begin
 foreach h in array array[0,23] loop
   update public.profiles set timezone=(select name from pg_timezone_names where extract(hour from clock_timestamp() at time zone name)=h order by name limit 1) where id=u;
   select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
   q:=public.enqueue_push_job(u,'trial_reminder',day,0);
   if q is not null or exists(select 1 from public.push_schedule_claims where user_id=u and kind='trial_reminder') then raise exception 'overnight trial reservation lost its later window';end if;
 end loop;
 update public.profiles set timezone=(select name from pg_timezone_names where extract(hour from clock_timestamp() at time zone name)=12 order by name limit 1) where id=u;
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id=u;
 q:=public.enqueue_push_job(u,'trial_reminder',day,0);
 if q is null or q<=0 or public.enqueue_push_job(u,'trial_reminder',day,0)<>0 then raise exception 'allowed trial window not reserved exactly once';end if;
end $$;

-- Explicit rate-error retries: use a fresh isolated transaction/session for each
-- attempt, expire queue visibility/backoff synthetically, and assert send_attempts
-- is 1/2/3 then dead_letter, 60/120-second backoff, and only that rejected device
-- is retried. Successful/uncertain device attempts must never re-enter sending.
-- Repeat with legacy ticket rows: legacy_unmapped=true, no version/token copied,
-- negative receipt changes the legacy ledger only; no current device is disabled.
-- No response: due receipt leases are reclaimable after expiry, NULL/missing
-- receipt is pending, the eighth attempt or >24-hour ticket becomes unresolved,
-- and transport failures never invalidate a token.

-- Trial anchoring must never borrow grace/another entitlement's access deadline.
update public.entitlements set trial_expires_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()+interval '24 hours',period_type='trial'
 where user_id='00000000-0000-4000-8000-000000000102';
do $$ declare day date;begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id='00000000-0000-4000-8000-000000000102';
 if public.enqueue_push_job('00000000-0000-4000-8000-000000000102','trial_reminder',day,0) is not null then raise exception 'expired trial grace queued reminder';end if;
end $$;

-- Admission denial reserves nothing; daily slots/preferences must not advance.
update public.push_pipeline_control set paused=true;
do $$ declare day date;before_count bigint;begin
 select (clock_timestamp() at time zone timezone)::date into day from public.profiles where id='00000000-0000-4000-8000-000000000102';
 select count(*) into before_count from public.push_schedule_claims;
 if public.enqueue_push_job('00000000-0000-4000-8000-000000000102','affirmation',day,0) is not null
   or (select count(*) from public.push_schedule_claims)<>before_count then raise exception 'paused pipeline reserved work';end if;
end $$;

-- REQUIRED TWO-SESSION PROTOCOLS, all NOT RUN:
-- 1. Same queue ID and separate duplicate queue IDs with the same logical key:
--    A claim before commit; B waits on the control row. After A commits B sees
--    busy, not a second lease. Hold A begin until just beyond expiry: B recovers
--    uncertainty; A finish is superseded. Instrument barriers in the isolated DB.
-- 2. Different parents: interleave begin/finish/receipt/import/retention and both
--    producer wrappers. They acquire control BEFORE queue/parent/attempt/state
--    locks. Test register_device (same install, token transfer), logout, account
--    deletion concurrently with finalizers. Confirm no deadlocks and exact fencing.
--    Specifically: A auth-admin deletion holds auth user and parent, B receipt
--    finalizer/expiry/retention starts with the same parent IDs. B must wait before
--    locking attempts; after deletion commits it reports deleted/superseded. Reverse
--    the barrier: B holds user KEY SHARE + parent; A waits, B finalizes, then A
--    cascades cleanly. Include mixed parents, legacy parent device reassignment,
--    and receipt completion while another parent is in a preparation lease.
-- 3. Response loss after SQL commit, after provider acceptance, and after queue
--    delete: retries repeat only identical finalization; unique ticket IDs persist
--    once; ack errors roll back all outcomes. Duplicate provider IDs must rollback
--    as a batch, then expired send becomes uncertain; no provider resend occurs.
-- 4. Two users plus a third new anonymous identity race the global 8-message
--    allowance; aggregate committed sends <=8 per fixed minute, not 8 per user.
--    Reset neither allowance nor registration versions on install/account change.
-- 5. Fill pending tickets to 599 and claim 8 ready devices: only ONE may start.
--    At 600, or oldest unresolved ticket >2h, send/producer work pauses. Confirm
--    producer queue cap 100, stale >6h/current-local-date jobs archived on resume,
--    current quiet/window/count/entitlement/streak/trial changes gate before send.
-- 6. Retention fixture with new terminal attempts aged31d, uncertain89d/91d,
--    active attempts and legacy parent/archive rows: per-pass deletes<=200 each;
--    89d uncertainty/active/legacy history remain. New uncertainty91d is retired
--    without resend. Schedule claims outlive the 6h replay horizon (90d retention).
rollback;
