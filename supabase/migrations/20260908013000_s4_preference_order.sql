-- Forward-only local draft. NOT EXECUTED. Existing rows are already chosen;
-- preserve them without revalidating legacy NOT VALID constraints/budget guards.
alter table public.notification_prefs add column revision bigint not null default 1;
alter table public.notification_prefs alter column revision set default 0;

alter table public.notification_prefs add column initial_applied boolean not null default true;
alter table public.notification_prefs alter column initial_applied set default false;
alter table public.notification_prefs add column overridden_keys text[] not null default '{}';
-- Every preference writer acquires the same policy lock before tuple locks.
-- This statement trigger also covers old direct clients and server defaults.
create function public.lock_notification_prefs_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.backend_budget_limits where operation='notification_prefs' for update;
 return null;
end;
$$;
revoke all on function public.lock_notification_prefs_budget() from public,anon,authenticated;
create trigger s4_prefs_budget_order before insert or update on public.notification_prefs
for each statement execute function public.lock_notification_prefs_budget();

-- Invoker trigger distinguishes old direct client inserts from server defaults.
-- Clients can never forge/reset the revision; updates always advance it.
create function public.advance_notification_prefs_revision() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon','service_role') then
    new.initial_applied:=true;new.overridden_keys:='{}';
  end if;
  if tg_op='UPDATE' then new.revision:=old.revision+1;
  elsif current_user in ('authenticated','anon') then new.revision:=1;
  else new.revision:=0; end if;
  return new;
end;
$$;
revoke all on function public.advance_notification_prefs_revision() from public,anon,authenticated;
create trigger s4_prefs_revision before insert or update on public.notification_prefs
for each row execute function public.advance_notification_prefs_revision();

create function public.save_notification_prefs(p_changes jsonb,p_initial boolean default false) returns jsonb
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
