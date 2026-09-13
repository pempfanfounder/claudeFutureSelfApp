-- STATIC ACCEPTANCE DRAFT for 20260913090000_daily_notification_cap. NOT RUN.
-- Same ground rules as s4-preferences.sql: only against a disposable synthetic
-- Supabase DB with migrations through 20260913090000 applied and cron/net jobs
-- disabled. Stop on error; everything rolls back at the end.
begin;
do $$ begin
 if current_setting('future_self.test_environment',true) is distinct from 'isolated-synthetic' then
   raise exception 'isolated synthetic database approval/identity is required';end if;
 if current_user not in ('postgres','supabase_admin') then raise exception 'verify fixture owner role first';end if;
 if not exists(select 1 from pg_constraint where conname='notification_prefs_daily_total_check'
   and conrelid='public.notification_prefs'::regclass) then raise exception 'daily total check missing';end if;
end $$;

insert into auth.users(id,is_anonymous) values
 ('00000000-0000-4000-8000-000000000401',true),('00000000-0000-4000-8000-000000000402',true),
 ('00000000-0000-4000-8000-000000000403',true);

-- The RPC rejects a merged total above 20, atomically, whether the excess
-- arrives in one patch or against a stored count; exactly 20 is accepted.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',true);
do $$ declare r jsonb;before_row jsonb;after_row jsonb;changes jsonb;begin
 r:=public.save_notification_prefs('{"quotes_per_day":12,"affirmations_per_day":8,"streak_reminder":true,"trial_reminder":true,"window_start_minutes":540,"window_end_minutes":1260,"quiet_start_minutes":null,"quiet_end_minutes":null}',true);
 if r->>'applied'<>'true' or (r->'prefs'->>'quotes_per_day')::int<>12 or (r->'prefs'->>'affirmations_per_day')::int<>8 then
   raise exception 'a total of exactly 20 must be accepted';end if;
 select to_jsonb(p) into before_row from public.notification_prefs p where user_id=auth.uid();
 for changes in select value from jsonb_array_elements('[
   {"quotes_per_day":13},
   {"affirmations_per_day":9},
   {"quotes_per_day":20,"affirmations_per_day":1},
   {"quotes_per_day":20,"affirmations_per_day":20}
 ]') loop
   begin
     perform public.save_notification_prefs(changes,false);
     raise exception using errcode='ZX001',message='total above 20 accepted: '||changes::text;
   exception when raise_exception then
     if sqlerrm<>'daily total exceeds 20' then raise;end if;
   end;
   select to_jsonb(p) into after_row from public.notification_prefs p where user_id=auth.uid();
   if before_row is distinct from after_row then raise exception 'rejected patch changed the row';end if;
 end loop;
 -- Lowering one count first makes room for the other.
 r:=public.save_notification_prefs('{"quotes_per_day":0}',false);
 r:=public.save_notification_prefs('{"affirmations_per_day":20}',false);
 if (r->'prefs'->>'quotes_per_day')::int<>0 or (r->'prefs'->>'affirmations_per_day')::int<>20 then
   raise exception 'a total of 20 after redistribution must be accepted';end if;
end $$;
reset role;

-- Direct writers hit the table check; the RPC message is the friendlier path.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated"}',true);
do $$ begin
 begin
   insert into public.notification_prefs(user_id,quotes_per_day,affirmations_per_day) values(auth.uid(),11,10);
   raise exception using errcode='ZX001',message='direct insert above 20 accepted';
 exception when check_violation then null;end;
 insert into public.notification_prefs(user_id,quotes_per_day,affirmations_per_day) values(auth.uid(),10,10);
end $$;
reset role;

-- Legacy-row rewrite rule (what step 1 of the migration applied to rows that
-- already existed): proportional, quotes rounded down, remainder to
-- affirmations, rows within the cap untouched. Checked against the same
-- expression the migration used so the two cannot drift.
do $$ declare q int;a int;fq int;fa int;begin
 for q,a,fq,fa in select * from (values (20,20,10,10),(20,5,16,4),(20,1,19,1),(5,20,4,16),(1,20,0,20),(15,15,10,10)) v loop
   if floor(q*20.0/(q+a))::int<>fq or 20-floor(q*20.0/(q+a))::int<>fa then
     raise exception 'legacy rewrite of % + % gave % + %, expected % + %',q,a,floor(q*20.0/(q+a))::int,20-floor(q*20.0/(q+a))::int,fq,fa;end if;
   if fq+fa<>20 or fq>q or fa>a then raise exception 'legacy rewrite left the cap or raised a count';end if;
 end loop;
 if exists(select 1 from public.notification_prefs where quotes_per_day+affirmations_per_day>20) then
   raise exception 'rows above the cap survive the migration';end if;
end $$;

rollback;
