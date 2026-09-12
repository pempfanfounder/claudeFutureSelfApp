-- STATIC ACCEPTANCE DRAFT for 20260912120000_security_prelaunch.sql. NOT RUN.
-- Requires a separately verified disposable synthetic Supabase DB with the
-- actual auth schema, all migrations applied, and cron jobs deactivated. Run
-- with stop-on-error; on ANY failure roll back. Never use a real project.
begin;
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
   raise exception 'isolated synthetic database approval/identity is required';end if;
 if current_user not in ('postgres','supabase_admin') then raise exception 'verify fixture owner role first';end if;
 if exists(select 1 from auth.users) or exists(select 1 from cron.job where active) then raise exception 'isolation drift';end if;
end $$;

-- Role boundary: nothing new is callable by client roles.
do $$ begin
 if has_function_privilege('authenticated','public.cleanup_stale_anonymous_users(boolean,integer,integer)','execute')
   or has_function_privilege('anon','public.cleanup_stale_anonymous_users(boolean,integer,integer)','execute')
   or has_table_privilege('authenticated','public.anonymous_cleanup_control','select')
   or has_table_privilege('authenticated','public.anonymous_cleanup_runs','select')
   or has_function_privilege('authenticated','public.consume_backend_budget(uuid,text,integer)','execute') then
   raise exception 'security-prelaunch privilege escaped';end if;
 if not exists(select 1 from public.backend_budget_limits where operation='delete_account_status'
   and per_user_per_minute=6 and global_per_minute=120 and enforce_global) then raise exception 'status budget pool missing';end if;
 if not exists(select 1 from public.backend_budget_limits where operation='profile' and not enforce_global) then
   raise exception 'profile budget still globally enforced';end if;
 if not exists(select 1 from public.anonymous_cleanup_control where id and dry_run and retention_days=14 and batch_limit=500) then
   raise exception 'cleanup must default to dry-run / 14 days / 500';end if;
 if exists(select 1 from pg_extension where extname='pg_cron') and
   (select count(*) from cron.job where jobname in ('fs-anon-cleanup','fs-prune-budget','fs-prune-deletion-receipts'))<>3 then
   raise exception 'prune/cleanup schedules missing';end if;
end $$;

-- Profile cap re-key: a saturated GLOBAL profile window must not fail sign-up
-- (the auth trigger inserts the profile), while the per-user window still holds
-- and a globally-enforced operation still denies.
delete from public.backend_budget_windows where operation in ('profile','favorite');
update public.backend_budget_limits set global_per_minute=1,per_user_per_minute=1 where operation='profile';
update public.backend_budget_limits set global_per_minute=1 where operation='favorite';
do $$ declare r jsonb; v_window timestamptz:=date_trunc('minute',clock_timestamp());begin
 insert into auth.users(id,is_anonymous,created_at) values
  ('00000000-0000-4000-8000-000000000401',true,now()),('00000000-0000-4000-8000-000000000402',true,now());
 if (select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000402'))<>2 then
   raise exception 'global profile window failed a legitimate sign-up';end if;
 if (select used from public.backend_budget_windows where operation='profile' and subject='*' and window_start=v_window)<>2 then
   raise exception 'unenforced global window is no longer recorded';end if;
 r:=public.consume_backend_budget('00000000-0000-4000-8000-000000000401','profile',1);
 if (r->>'allowed')::boolean then raise exception 'per-user profile window not enforced';end if;
 r:=public.consume_backend_budget('00000000-0000-4000-8000-000000000401','favorite',1);
 if not (r->>'allowed')::boolean then raise exception 'first favorite unit denied';end if;
 r:=public.consume_backend_budget('00000000-0000-4000-8000-000000000402','favorite',1);
 if (r->>'allowed')::boolean then raise exception 'enforced global window bypassed';end if;
 if date_trunc('minute',clock_timestamp())<>v_window then
   raise exception using errcode='ZX002',message='fixture crossed a minute boundary; roll back and rerun';end if;
end $$;

-- Cleanup candidates. Only 501 (old, untouched guest) may be deleted:
--   502 recent guest; 503 old but has an entitlement row; 504 old, completed
--   onboarding; 505 old with a device seen recently; 506 old but linked
--   (not anonymous); 507 old anonymous with a session refreshed recently;
--   508 old anonymous mid email-change.
insert into auth.users(id,is_anonymous,created_at,last_sign_in_at,email_change) values
 ('00000000-0000-4000-8000-000000000501',true,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000502',true,now()-interval '3 days',now()-interval '3 days',''),
 ('00000000-0000-4000-8000-000000000503',true,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000504',true,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000505',true,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000506',false,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000507',true,now()-interval '40 days',now()-interval '40 days',''),
 ('00000000-0000-4000-8000-000000000508',true,now()-interval '40 days',now()-interval '40 days','pending@example.invalid');
-- The trigger stamps profiles.updated_at=now(); age every fixture profile.
update public.profiles set updated_at=now()-interval '40 days' where id::text like '00000000-0000-4000-8000-0000000005%';
insert into public.entitlements(user_id,is_premium) values('00000000-0000-4000-8000-000000000503',false);
insert into public.personalization(user_id,onboarding_completed_at,updated_at)
 values('00000000-0000-4000-8000-000000000504',now()-interval '39 days',now()-interval '39 days');
insert into public.devices(user_id,install_id,platform,last_seen_at,updated_at)
 values('00000000-0000-4000-8000-000000000505','fixture-505','ios',now()-interval '2 days',now()-interval '2 days');
insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at)
 values(gen_random_uuid(),'00000000-0000-4000-8000-000000000507',now()-interval '40 days',now()-interval '1 day',now()-interval '1 day');

do $$ declare r jsonb;begin
 -- Default control row = dry run: report, delete nothing.
 r:=public.cleanup_stale_anonymous_users();
 if not (r->>'dry_run')::boolean or (r->>'candidates')::int<>1 or (r->>'deleted')::int<>0 then
   raise exception 'dry run reported % / deleted %', r->>'candidates', r->>'deleted';end if;
 if (select count(*) from auth.users where id::text like '00000000-0000-4000-8000-0000000005%')<>8 then
   raise exception 'dry run deleted rows';end if;
 -- Batch limit is honoured before deletion.
 r:=public.cleanup_stale_anonymous_users(false,14,1);
 if (r->>'deleted')::int<>1 or exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000501')
   or exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000501') then
   raise exception 'stale guest not removed with its cascade';end if;
 if (select count(*) from auth.users where id::text like '00000000-0000-4000-8000-0000000005%')<>7 then
   raise exception 'a protected account was deleted';end if;
 -- Idempotent: nothing left to do.
 r:=public.cleanup_stale_anonymous_users(false);
 if (r->>'candidates')::int<>0 or (r->>'deleted')::int<>0 then raise exception 'second pass found new candidates';end if;
 if (select count(*) from public.anonymous_cleanup_runs)<>3 then raise exception 'run log incomplete';end if;
 begin perform public.cleanup_stale_anonymous_users(false,1,1);raise exception using errcode='ZX001',message='retention below floor accepted';
 exception when raise_exception then if sqlerrm<>'invalid cleanup parameters' then raise;end if;end;
 begin perform public.cleanup_stale_anonymous_users(false,14,0);raise exception using errcode='ZX001',message='zero batch accepted';
 exception when raise_exception then if sqlerrm<>'invalid cleanup parameters' then raise;end if;end;
end $$;

-- Normal success and ANY assertion failure both end with ROLLBACK.
rollback;
