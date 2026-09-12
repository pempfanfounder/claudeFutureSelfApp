-- STATIC ACCEPTANCE / ROLLBACK DRAFT. NOT RUN.
-- Requires a separately verified disposable synthetic Supabase DB, its actual
-- auth/role/default-grant schema, migrations through 130, and disabled cron/net
-- jobs. This file grants no authority to connect, apply migrations or start DBs.
-- Run with stop-on-error. On ANY failure roll back this transaction. Never use
-- an existing/remote project or drop/rewrite migration history to make it pass.
begin;
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
   raise exception 'isolated synthetic database approval/identity is required';end if;
 if current_user not in ('postgres','supabase_admin') then raise exception 'verify fixture owner role first';end if;
 if not has_function_privilege('authenticated','public.save_notification_prefs(jsonb,boolean)','execute')
   or has_function_privilege('anon','public.save_notification_prefs(jsonb,boolean)','execute')
   or has_function_privilege('authenticated','public.consume_backend_budget(uuid,text,integer)','execute') then
   raise exception 'preference RPC role boundary changed';end if;
end $$;

-- Verify these auth columns and the profile-creation trigger in the disposable
-- schema before running. Collisions intentionally fail; no ON CONFLICT cleanup.
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000301',true),('00000000-0000-4000-8000-000000000302',true),
 ('00000000-0000-4000-8000-000000000303',true),('00000000-0000-4000-8000-000000000304',true),
 ('00000000-0000-4000-8000-000000000305',true),('00000000-0000-4000-8000-000000000306',true),
 ('00000000-0000-4000-8000-000000000307',true);

-- Both commit orders must give the same complete onboarding settings, except
-- the later user choice quotes_per_day=0. Anonymous signed-in users use the
-- authenticated role; this is distinct from the pre-session anon role.
set local role authenticated;
do $$
declare suffix text;u text;r jsonb;before_row jsonb;after_row jsonb;
 initial jsonb:='{"quotes_per_day":2,"affirmations_per_day":4,"streak_reminder":true,"trial_reminder":false,"window_start_minutes":600,"window_end_minutes":1200,"quiet_start_minutes":1260,"quiet_end_minutes":420}';
 expected jsonb:='{"quotes_per_day":0,"affirmations_per_day":4,"streak_reminder":true,"trial_reminder":false,"window_start_minutes":600,"window_end_minutes":1200,"quiet_start_minutes":1260,"quiet_end_minutes":420}';
begin
 foreach suffix in array array['301','302'] loop
   u:='00000000-0000-4000-8000-000000000'||suffix;
   perform set_config('request.jwt.claim.sub',u,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
   if suffix='301' then
     r:=public.save_notification_prefs(initial,true);
     if r->>'applied'<>'true' or (r->'prefs'->>'revision')::bigint<>1 then raise exception 'initial creation failed';end if;
     r:=public.save_notification_prefs('{"quotes_per_day":0}',false);
   else
     r:=public.save_notification_prefs('{"quotes_per_day":0}',false);
     if r->'prefs'->>'initial_applied'<>'false' then raise exception 'minimal patch sealed unfinished onboarding';end if;
     r:=public.save_notification_prefs(initial,true);
   end if;
   if r->>'applied'<>'true' or (r->'prefs'->>'revision')::bigint<>2 or r->'prefs'->>'initial_applied'<>'true'
     or ((r->'prefs')-array['user_id','updated_at','revision','initial_applied','overridden_keys']) is distinct from expected then
     raise exception 'initial/patch order changed chosen or unspecified fields';end if;
   if not exists(select 1 from public.notification_prefs where user_id=u::uuid and overridden_keys=array['quotes_per_day']) then
     raise exception 'minimal choice ownership not retained';end if;
   select to_jsonb(p) into before_row from public.notification_prefs p where user_id=u::uuid;
   -- A duplicate initial containing DIFFERENT valid values must not change any
   -- field, revision or timestamp. It still consumes one admission budget unit.
   r:=public.save_notification_prefs(initial||'{"quotes_per_day":8,"affirmations_per_day":9}',true);
   select to_jsonb(p) into after_row from public.notification_prefs p where user_id=u::uuid;
   if r->>'applied'<>'false' or before_row is distinct from after_row or r->'prefs' is distinct from after_row then
     raise exception 'duplicate initial rewrote an accepted choice';end if;
 end loop;
end $$;
reset role;
do $$ declare u uuid;v_used bigint;begin
 foreach u in array array['00000000-0000-4000-8000-000000000301'::uuid,'00000000-0000-4000-8000-000000000302'::uuid] loop
   select coalesce(sum(used),0) into v_used from public.backend_budget_windows where operation='notification_prefs' and subject=u::text;
   -- New row: admission+default insert guard+update guard=3; next patch/initial
   -- admission+update=2; duplicate initial admission=1. Sum across minute rollover.
   if v_used<>6 then raise exception 'initial/patch/duplicate budget accounting changed';end if;
 end loop;
end $$;

-- Delivery-window and quiet-hour pairs must stay together in either arrival
-- order. A minimal paired patch must preserve unrelated counts/reminder choices.
set local role authenticated;
do $$ declare suffix text;u text;r jsonb;
 initial jsonb:='{"quotes_per_day":2,"affirmations_per_day":4,"streak_reminder":true,"trial_reminder":false,"window_start_minutes":600,"window_end_minutes":1200,"quiet_start_minutes":1260,"quiet_end_minutes":420}';
 patch jsonb:='{"window_start_minutes":660,"window_end_minutes":1260,"quiet_start_minutes":1320,"quiet_end_minutes":360}';
begin
 foreach suffix in array array['303','304'] loop
   u:='00000000-0000-4000-8000-000000000'||suffix;
   perform set_config('request.jwt.claim.sub',u,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
   if suffix='303' then perform public.save_notification_prefs(initial,true);r:=public.save_notification_prefs(patch,false);
   else perform public.save_notification_prefs(patch,false);r:=public.save_notification_prefs(initial,true);end if;
   if ((r->'prefs')-array['user_id','updated_at','revision','initial_applied','overridden_keys']) is distinct from (initial||patch)
     or not exists(select 1 from public.notification_prefs where user_id=u::uuid and cardinality(overridden_keys)=4
       and overridden_keys @> array['window_start_minutes','window_end_minutes','quiet_start_minutes','quiet_end_minutes']) then
     raise exception 'paired overrides lost fields or split a pair';end if;
   r:=public.save_notification_prefs('{"quiet_start_minutes":null,"quiet_end_minutes":null}',false);
   if ((r->'prefs')-array['user_id','updated_at','revision','initial_applied','overridden_keys']) is distinct from
      (initial||patch||'{"quiet_start_minutes":null,"quiet_end_minutes":null}') then raise exception 'quiet clearing changed unspecified fields';end if;
 end loop;
end $$;

-- Reject malformed/partial patches atomically, with unchanged row/revision.
do $$ declare changes jsonb;before_row jsonb;after_row jsonb;begin
 select to_jsonb(p) into before_row from public.notification_prefs p where user_id=auth.uid();
 for changes in select value from jsonb_array_elements('[
   {"window_start_minutes":700},{"quiet_end_minutes":60},
   {"window_start_minutes":900,"window_end_minutes":800},
   {"quiet_start_minutes":null,"quiet_end_minutes":60},
   {"quiet_start_minutes":60,"quiet_end_minutes":60},
   {"quotes_per_day":21},{"affirmations_per_day":-1},{"quotes_per_day":2.5},
   {"streak_reminder":"false"},{"trial_reminder":null},{"revision":0},
   {"initial_applied":false},{"overridden_keys":[]},{"user_id":"00000000-0000-4000-8000-000000000301"}
 ]') loop
   begin
     perform public.save_notification_prefs(changes,false);
     raise exception using errcode='ZX001',message='invalid preference patch accepted';
   exception when raise_exception or check_violation or not_null_violation then null;end;
   select to_jsonb(p) into after_row from public.notification_prefs p where user_id=auth.uid();
   if before_row is distinct from after_row then raise exception 'failed patch changed data/revision';end if;
 end loop;
 begin perform public.save_notification_prefs('{}',null);raise exception using errcode='ZX001',message='null initial flag accepted';
 exception when raise_exception then null;end;
 begin perform public.save_notification_prefs('[]',false);raise exception using errcode='ZX001',message='array patch accepted';
 exception when raise_exception then null;end;
end $$;
reset role;

-- A server-created default is not an explicit user choice. Its definer owner
-- must leave revision 0/initial_applied=false so onboarding can still apply.
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select public.recalc_notification_state('00000000-0000-4000-8000-000000000305');
reset role;
do $$ begin
 if not exists(select 1 from public.notification_prefs where user_id='00000000-0000-4000-8000-000000000305'
   and revision=0 and not initial_applied and cardinality(overridden_keys)=0) then raise exception 'server defaults sealed initial choices';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000305","role":"authenticated"}',true);
do $$ declare r jsonb;begin
 r:=public.save_notification_prefs('{"quotes_per_day":6,"affirmations_per_day":1,"streak_reminder":false,"trial_reminder":true,"window_start_minutes":540,"window_end_minutes":1260,"quiet_start_minutes":null,"quiet_end_minutes":null}',true);
 if r->>'applied'<>'true' or (r->'prefs'->>'revision')::bigint<>1 or (r->'prefs'->>'quotes_per_day')::int<>6 then raise exception 'initial ignored server-default row';end if;
end $$;

-- Old direct authenticated writers are complete chosen snapshots. Metadata
-- forgery is ignored; the revision advances even without the new RPC.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000306","role":"authenticated"}',true);
insert into public.notification_prefs(user_id,quotes_per_day,affirmations_per_day,revision,initial_applied,overridden_keys)
 values(auth.uid(),7,8,999,false,array['quotes_per_day']);
do $$ declare r jsonb;begin
 if not exists(select 1 from public.notification_prefs where user_id=auth.uid() and revision=1 and initial_applied and cardinality(overridden_keys)=0) then raise exception 'direct insert forged metadata';end if;
 update public.notification_prefs set quotes_per_day=9,revision=-999,initial_applied=false,overridden_keys=array['trial_reminder'] where user_id=auth.uid();
 if not exists(select 1 from public.notification_prefs where user_id=auth.uid() and revision=2 and initial_applied and cardinality(overridden_keys)=0) then raise exception 'direct update did not advance protected revision';end if;
 r:=public.save_notification_prefs('{"quotes_per_day":1,"affirmations_per_day":1}',true);
 if r->>'applied'<>'false' or (r->'prefs'->>'quotes_per_day')::int<>9 or (r->'prefs'->>'affirmations_per_day')::int<>8 then raise exception 'late initial clobbered direct writer';end if;
 r:=public.save_notification_prefs('{"streak_reminder":false}',false);
 if (r->'prefs'->>'revision')::bigint<>3 or (r->'prefs'->>'quotes_per_day')::int<>9 or (r->'prefs'->>'affirmations_per_day')::int<>8 then raise exception 'minimal RPC clobbered direct snapshot';end if;
end $$;
reset role;

-- A direct service-role write is an explicit trusted snapshot as well, while
-- the current trigger deliberately gives its INSERT revision 0 (UPDATE then 1).
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
insert into public.notification_prefs(user_id,quotes_per_day,revision,initial_applied,overridden_keys)
 values('00000000-0000-4000-8000-000000000307',10,999,false,array['quotes_per_day']);
update public.notification_prefs set quotes_per_day=11,revision=999,initial_applied=false where user_id='00000000-0000-4000-8000-000000000307';
reset role;
do $$ begin
 if not exists(select 1 from public.notification_prefs where user_id='00000000-0000-4000-8000-000000000307'
   and revision=1 and initial_applied and cardinality(overridden_keys)=0) then raise exception 'service snapshot metadata changed';end if;
end $$;

-- RLS and missing-session checks. JWT signature/expiry validation is outside
-- this SQL fixture; set_config only supplies synthetic claims for role testing.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',true);
do $$ declare n integer;begin
 if exists(select 1 from public.notification_prefs where user_id<>'00000000-0000-4000-8000-000000000301') then raise exception 'cross-user preference read';end if;
 update public.notification_prefs set quotes_per_day=20 where user_id='00000000-0000-4000-8000-000000000302';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'cross-user preference update';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin perform public.save_notification_prefs('{"quotes_per_day":1}',false);raise exception using errcode='ZX001',message='missing auth accepted';
 exception when raise_exception then if sqlerrm<>'not authenticated' then raise;end if;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.save_notification_prefs('{"quotes_per_day":1}',false);raise exception using errcode='ZX001',message='pre-session role invoked RPC';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Deliberately constrained budget fixtures. Only this disposable transaction
-- changes limits/counters. Applied RPC updates require admission AND guard units;
-- denial at the second unit must roll back data, revision and the first unit.
delete from public.backend_budget_windows where operation='notification_prefs';
update public.backend_budget_limits set global_per_minute=1,per_user_per_minute=60,paused=false where operation='notification_prefs';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',true);
do $$ declare before_row jsonb;after_row jsonb;v_window timestamptz:=date_trunc('minute',clock_timestamp());begin
 select to_jsonb(p) into before_row from public.notification_prefs p where user_id=auth.uid();
 begin
   perform public.save_notification_prefs('{"quotes_per_day":12}',false);
   if date_trunc('minute',clock_timestamp())<>v_window then raise exception using errcode='ZX002',message='fixture crossed fixed-minute boundary; roll back and rerun away from rollover';end if;
   raise exception using errcode='ZX001',message='guard budget bypass';
 exception when raise_exception then if sqlerrm<>'write budget exceeded' then raise;end if;end;
 select to_jsonb(p) into after_row from public.notification_prefs p where user_id=auth.uid();
 if before_row is distinct from after_row then raise exception 'budget failure changed preferences';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.backend_budget_windows where operation='notification_prefs') then raise exception 'failed RPC left a partial reservation';end if;
end $$;
update public.backend_budget_limits set paused=true where operation='notification_prefs';
set local role authenticated;
do $$ begin
 begin perform public.save_notification_prefs('{"quotes_per_day":12}',false);raise exception using errcode='ZX001',message='paused RPC budget bypass';
 exception when raise_exception then if sqlerrm<>'preference budget exceeded' then raise;end if;end;
 begin update public.notification_prefs set quotes_per_day=12 where user_id=auth.uid();raise exception using errcode='ZX001',message='paused direct writer budget bypass';
 exception when raise_exception then if sqlerrm<>'write budget exceeded' then raise;end if;end;
end $$;
reset role;

-- Normal success and ANY assertion failure both end with ROLLBACK. This removes
-- fixtures and restores limits/counters/settings. It is not a down migration.
rollback;

-- PRE-MIGRATION PRESERVATION PROTOCOL, NOT RUN:
-- In another disposable clone stopped at 120, seed chosen legacy prefs BEFORE
-- applying 130 and capture their full old-column JSON, updated_at and budget rows.
-- Apply 130 only after its separate local-DB authority/identity checks. Old columns,
-- timestamps and budget counts must remain identical; existing rows gain
-- revision 1/initial_applied=true/overridden_keys={}. A late initial must skip.
-- Also seed an invalid legacy window before 110 adds its NOT VALID constraint;
-- applying 110/130 must preserve it. An unrelated later update must fail atomically
-- on the window constraint, then an explicit valid PAIRED window patch must repair
-- it. Do not silently coerce data, disable constraints, or downgrade real history.
-- If a migration/assertion fails, roll back the disposable migration transaction
-- where supported; otherwise retain failure evidence and dispose of that verified
-- throwaway clone. No live/source migration rollback is authorized by this file.

-- TWO-SESSION CONCURRENCY / ROLLBACK PROTOCOLS, ALL NOT RUN:
-- Use independent sessions plus a read-only observer in the verified clone.
-- Seed separate synthetic users 901/902/... in a setup transaction committed ONLY
-- so both sessions can see fixtures. Do not reuse the rolled-back users above.
-- Set each session's authenticated role and synthetic sub as above; service
-- defaults run as service_role with cleared claims. Capture RPC result JSON,
-- revisions, all 8 preference fields, overridden-key sets and budget deltas.
--
-- 1. SAME USER, INITIAL THEN PATCH: A BEGIN; save(full initial,true); keep A open.
--    B BEGIN; save({quotes_per_day:0},false) must wait for A's policy-row lock.
--    A COMMIT; B finishes/COMMIT. Observer sees revision 2, quotes 0 and every other
--    initial field. Reverse with a fresh user: A minimal patch, B full initial.
--    The final 8 fields and ownership sets must match the first ordering exactly.
--    Repeat with both delivery-window and quiet-hour pairs (including null/null).
-- 2. DUPLICATE INITIAL: A and B send DIFFERENT full initial snapshots. Whichever
--    obtains the policy lock first applies; the other returns applied=false with
--    the winning snapshot and unchanged revision. No default insert race escapes.
-- 3. DIRECT WRITER/RPC/DEFAULTS: overlap old authenticated INSERT/UPDATE, explicit
--    service-role writes, recalc_notification_state's default insert, and the new
--    RPC in both orders. Legacy chosen snapshots seal initial; server defaults do
--    not. Metadata forgery is ignored, revisions increase, unspecified RPC fields
--    survive. Neither caller may hold a prefs tuple while waiting for the policy
--    row. Use pg_blocking_pids/pg_locks from the observer to identify the wait.
--    Do NOT manufacture a reverse order by manually locking a prefs tuple before
--    the policy row: use actual writer statements as the barriers under test.
-- 4. GLOBAL BUDGET: with a fresh fixture global allowance 2, A direct update for
--    user 901 holds one unit; B direct update for user 902 waits, then uses the other.
--    A third identity/direct update must fail without a row/revision change. Also
--    test one applied RPC consuming both units and duplicate initial consuming 1.
--    Choose a known fixed-minute window away from rollover; record timestamps.
-- 5. FAILURE/ROLLBACK: A writes an initial/minimal patch but ROLLBACKs while B waits.
--    B must see committed pre-A data only, consume its own allowance and apply the
--    correct ownership merge. A's revision and budget reservation must disappear.
-- 6. ACCOUNT DELETION/REVOCATION: overlap deletion of the synthetic auth user with
--    initial/default/direct/RPC writes. No orphan preferences or cross-user writes
--    may remain; a failed transaction leaves no partial choice/revision/budget.
--
-- A blocked writer alone is not a deadlock. Record which transaction owns the
-- policy lock, release the explicit barrier, and require both sessions to finish
-- without 40P01. Abort/ROLLBACK both on unexpected errors; inspect durable outcomes
-- before cleanup. Finally remove only committed synthetic setup fixtures in the
-- disposable clone or dispose of the clone. Do not touch any real user records.
