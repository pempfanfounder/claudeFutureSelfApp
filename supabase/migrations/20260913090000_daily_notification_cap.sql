-- Combined daily notification cap: quotes_per_day + affirmations_per_day <= 20.
-- Forward-only. Requires 20260908013000_s4_preference_order (save_notification_prefs).
--
-- Onboarding promises "a maximum of 20 a day" in total and the push pipeline
-- is sized for that, but the two per-kind 0..20 checks (20260815120000) let a
-- user configure 20 + 20 = 40/day. This migration:
--  1. brings existing rows above the cap inside it, keeping the split
--     proportional (quotes rounded down, affirmations take the remainder;
--     20 + 20 becomes 10 + 10) and rescheduling those users;
--  2. adds a table check so no writer can exceed the cap again;
--  3. re-creates save_notification_prefs with an explicit guard on the merged
--     row, so the RPC fails with a clear message instead of a check violation.
-- The client applies the same rule (src/features/notifications/dailyCap.ts).
--
-- Deploy order: apply this migration first, then ship the app build that
-- redistributes counts in the pickers. Older builds only fail when they try
-- to save a total above 20 (settings screen error), never on read.

-- ---------------------------------------------------------------------------
-- 1. Existing rows above the cap.
-- ---------------------------------------------------------------------------
-- The S4 write guard charges the per-row backend budget; a one-off data fix
-- must not be rate-limited or fail on it. The revision trigger stays on.
alter table public.notification_prefs disable trigger s4_prefs_guard;
create temporary table daily_cap_rescheduled(user_id uuid primary key) on commit drop;
with fixed as (
  update public.notification_prefs
     set quotes_per_day = floor(quotes_per_day * 20.0 / (quotes_per_day + affirmations_per_day))::int,
         affirmations_per_day = 20 - floor(quotes_per_day * 20.0 / (quotes_per_day + affirmations_per_day))::int,
         updated_at = now()
   where quotes_per_day + affirmations_per_day > 20
   returning user_id
)
insert into daily_cap_rescheduled select user_id from fixed;
alter table public.notification_prefs enable trigger s4_prefs_guard;
do $$
declare v_user uuid;
begin
  for v_user in select user_id from daily_cap_rescheduled loop
    perform public.recalc_notification_state(v_user);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Durable invariant.
-- ---------------------------------------------------------------------------
alter table public.notification_prefs
  drop constraint if exists notification_prefs_daily_total_check;
alter table public.notification_prefs
  add constraint notification_prefs_daily_total_check
    check (quotes_per_day + affirmations_per_day <= 20);

-- ---------------------------------------------------------------------------
-- 3. save_notification_prefs: same body as 20260908013000 plus the guard on
--    the merged row (a partial patch is validated against the stored other
--    count, so {"quotes_per_day": 20} on a row with 5 affirmations fails).
-- ---------------------------------------------------------------------------
create or replace function public.save_notification_prefs(p_changes jsonb,p_initial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_row public.notification_prefs;v_next public.notification_prefs;
 v_key text;v_value jsonb;v_budget jsonb;v_changes jsonb:=p_changes;v_keys text[];
begin
 if v_user is null then raise exception 'not authenticated';end if;
 if p_initial is null or p_changes is null or jsonb_typeof(p_changes)<>'object'
    or octet_length(p_changes::text)>2048 then raise exception 'invalid preferences';end if;
 for v_key,v_value in select key,value from jsonb_each(p_changes) loop
  if v_key not in ('quotes_per_day','affirmations_per_day','streak_reminder','trial_reminder','window_start_minutes','window_end_minutes','quiet_start_minutes','quiet_end_minutes') then raise exception 'invalid preference key';end if;
  if v_key in ('streak_reminder','trial_reminder') then
   if jsonb_typeof(v_value)<>'boolean' then raise exception 'invalid boolean';end if;
  elsif v_key in ('quiet_start_minutes','quiet_end_minutes') and v_value='null'::jsonb then null;
  elsif jsonb_typeof(v_value)<>'number' or v_value::text !~ '^[0-9]{1,4}$' then raise exception 'invalid integer';end if;
 end loop;
 if (p_changes?'window_start_minutes')<>(p_changes?'window_end_minutes') then raise exception 'delivery window must be paired';end if;
 if (p_changes?'quiet_start_minutes')<>(p_changes?'quiet_end_minutes') then raise exception 'quiet hours must be paired';end if;
 -- Match existing recalc budget-before-row lock ordering. Admission is charged
 -- even for initial skips; an applied write also consumes its table guard unit.
 v_budget:=public.consume_backend_budget(v_user,'notification_prefs',1);
 if not (v_budget->>'allowed')::boolean then raise exception 'preference budget exceeded';end if;
 select * into v_row from public.notification_prefs where user_id=v_user for update;
 if not found then
  insert into public.notification_prefs(user_id) values(v_user) on conflict(user_id) do nothing;
  select * into v_row from public.notification_prefs where user_id=v_user for update;
 end if;
 if p_initial and v_row.initial_applied then return jsonb_build_object('applied',false,'prefs',to_jsonb(v_row));end if;
 if p_initial then v_changes:=p_changes-v_row.overridden_keys;v_keys:=v_row.overridden_keys;
 else select array_agg(distinct key) into v_keys from (select unnest(v_row.overridden_keys) as key union select jsonb_object_keys(p_changes)) chosen;end if;
 v_next:=jsonb_populate_record(v_row,v_changes);
 -- Combined daily cap (20260913090000): quotes + affirmations <= 20 in total.
 if coalesce(v_next.quotes_per_day,0)+coalesce(v_next.affirmations_per_day,0)>20 then
  raise exception 'daily total exceeds 20';end if;
 update public.notification_prefs set quotes_per_day=v_next.quotes_per_day,affirmations_per_day=v_next.affirmations_per_day,
   streak_reminder=v_next.streak_reminder,trial_reminder=v_next.trial_reminder,
   window_start_minutes=v_next.window_start_minutes,window_end_minutes=v_next.window_end_minutes,
   quiet_start_minutes=v_next.quiet_start_minutes,quiet_end_minutes=v_next.quiet_end_minutes,updated_at=now(),
   initial_applied=v_row.initial_applied or p_initial,overridden_keys=coalesce(v_keys,'{}')
 where user_id=v_user returning * into v_row;
 return jsonb_build_object('applied',true,'prefs',to_jsonb(v_row));
end;
$$;
revoke all on function public.save_notification_prefs(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_notification_prefs(jsonb,boolean) to authenticated;
