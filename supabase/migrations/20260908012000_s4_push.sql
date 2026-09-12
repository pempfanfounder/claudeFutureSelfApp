-- S4 LOCAL DRAFT: no cron activation, service invocation, or historical rewrite.
-- SQL/queue/RLS/concurrency integration NOT RUN. Conservative fixture settings,
-- not a measured production capacity or spend guarantee.
create table public.push_pipeline_control (
  id boolean primary key default true check(id),
  paused boolean not null default true,
  max_queued_jobs integer not null default 100 check(max_queued_jobs between 1 and 1000),
  max_pending_receipts integer not null default 600 check(max_pending_receipts between 1 and 5000),
  max_receipt_age interval not null default interval '2 hours' check(max_receipt_age between interval '15 minutes' and interval '12 hours')
);
insert into public.push_pipeline_control(id) values(true);
alter table public.push_pipeline_control enable row level security;
revoke all on public.push_pipeline_control from public,anon,authenticated;
grant all on public.push_pipeline_control to service_role;
insert into public.backend_budget_limits(operation,per_user_per_minute,global_per_minute,max_concurrent) values
 ('push_enqueue',40,8,1),('push_send',8,8,1),('push_receipt',2,2,1),('push_read',2,2,1),('push_schedule',2,2,1);

alter table public.notification_deliveries
  add column pipeline_version integer not null default 1,
  add column queue_msg_id bigint,
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column preparation_failures integer not null default 0,
  add column next_retry_at timestamptz,
  add column expires_at timestamptz,
  add column trial_anchor timestamptz,
  add column push_content jsonb check(octet_length(push_content::text)<=8192),
  add column legacy_receipt_imported boolean not null default false,
  add column terminal_at timestamptz;
alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check check(status in
 ('queued','preparing','sending','retry_wait','sent','ticket_ok','ticket_error','receipt_ok','receipt_error','skipped','uncertain','dead_letter'));
create index s4_push_delivery_retry_idx on public.notification_deliveries(next_retry_at)
 where pipeline_version=2 and status in ('queued','preparing','sending','retry_wait');

create table public.notification_delivery_devices (
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 -- Immutable identifier snapshot: deleting/reassigning a current registration
 -- must not cascade into another account's historical attempt or erase mapping.
 device_id uuid,
 registration_version bigint,
 token_value text check(char_length(token_value)<=512),
 legacy_unmapped boolean not null default false,
 state text not null check(state in ('ready','sending','retry_wait','ticket_ok','ticket_error','receipt_ok','receipt_error','uncertain','skipped','dead_letter')),
 send_attempts integer not null default 0,
 send_lease_token uuid,
 send_result jsonb,
 send_queue_deleted boolean not null default false,
 receipt_attempts integer not null default 0,
 receipt_lease_token uuid,
 receipt_lease_until timestamptz,
 receipt_last_token uuid,
 receipt_result jsonb,
 expo_ticket_id text check(char_length(expo_ticket_id) between 1 and 128),
 next_retry_at timestamptz,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 terminal_at timestamptz,
 error_code text check(char_length(error_code)<=64),
 unique(delivery_id,device_id,registration_version),
 check(legacy_unmapped or (device_id is not null and registration_version is not null and registration_version>0 and token_value is not null))
);
create unique index s4_push_ticket_unique_idx on public.notification_delivery_devices(expo_ticket_id) where expo_ticket_id is not null;
create unique index s4_push_legacy_unique_idx on public.notification_delivery_devices(delivery_id) where legacy_unmapped;
create index s4_push_receipt_due_idx on public.notification_delivery_devices(next_retry_at) where state='ticket_ok';
create index s4_push_attempt_parent_idx on public.notification_delivery_devices(delivery_id,state);
alter table public.notification_delivery_devices enable row level security;
revoke all on public.notification_delivery_devices from public,anon,authenticated;
grant all on public.notification_delivery_devices to service_role;

create table public.push_schedule_claims (
 schedule_key text primary key check(char_length(schedule_key)<=160),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,
 local_date date not null,
 trial_anchor timestamptz,
 queue_msg_id bigint,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index s4_push_schedule_user_idx on public.push_schedule_claims(user_id,kind,trial_anchor);
alter table public.push_schedule_claims enable row level security;
revoke all on public.push_schedule_claims from public,anon,authenticated;
grant all on public.push_schedule_claims to service_role;

-- All scheduling and send-time checks use the same safe timezone boundary.
create function public.push_eligibility(p_user uuid,p_kind text,p_date date,p_slot integer,p_expires timestamptz,p_trial timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tz text; v_now timestamp; v_date date; v_minutes integer; v_prefs public.notification_prefs%rowtype;
 v_ent public.entitlements%rowtype; v_trial timestamptz; v_quiet boolean;
begin
 if p_user is null or p_kind is null or p_kind not in ('quote','affirmation','streak_risk','trial_reminder')
   or p_slot is null or p_slot not between 0 and 19 then return jsonb_build_object('outcome','skip','reason','invalid_job'); end if;
 select public.safe_timezone(timezone) into v_tz from public.profiles where id=p_user;
 if not found then return jsonb_build_object('outcome','skip','reason','missing_user'); end if;
 v_now:=clock_timestamp() at time zone v_tz;v_date:=v_now::date;
 if p_date is null or p_date<>v_date or p_expires is null or p_expires<=clock_timestamp() then
   return jsonb_build_object('outcome','skip','reason','expired_job'); end if;
 select * into v_ent from public.entitlements where user_id=p_user;
 if not found or not v_ent.is_premium or (v_ent.expires_at is not null and v_ent.expires_at<=clock_timestamp()) then
   return jsonb_build_object('outcome','skip','reason','not_entitled'); end if;
 select * into v_prefs from public.notification_prefs where user_id=p_user;
 if not found then return jsonb_build_object('outcome','skip','reason','missing_preferences'); end if;
 if p_kind='quote' and (p_slot<0 or p_slot>=v_prefs.quotes_per_day)
   or p_kind='affirmation' and (p_slot<0 or p_slot>=v_prefs.affirmations_per_day)
   or p_kind='streak_risk' and not v_prefs.streak_reminder
   or p_kind='trial_reminder' and not v_prefs.trial_reminder then
   return jsonb_build_object('outcome','skip','reason','preference_changed'); end if;
 v_minutes:=extract(hour from v_now)::integer*60+extract(minute from v_now)::integer;
 if v_prefs.window_end_minutes<=v_prefs.window_start_minutes then return jsonb_build_object('outcome','skip','reason','invalid_window'); end if;
 if (v_prefs.quiet_start_minutes is null)<>(v_prefs.quiet_end_minutes is null) then
   return jsonb_build_object('outcome','skip','reason','invalid_quiet_window'); end if;
 if v_minutes<v_prefs.window_start_minutes then
   return jsonb_build_object('outcome','defer','reason','before_window','retry_at',(v_date+make_interval(mins=>v_prefs.window_start_minutes)) at time zone v_tz); end if;
 if v_minutes>=v_prefs.window_end_minutes then return jsonb_build_object('outcome','skip','reason','after_window'); end if;
 v_quiet:=v_prefs.quiet_start_minutes is not null and v_prefs.quiet_end_minutes is not null and
   case when v_prefs.quiet_start_minutes<v_prefs.quiet_end_minutes
     then v_minutes>=v_prefs.quiet_start_minutes and v_minutes<v_prefs.quiet_end_minutes
     else v_minutes>=v_prefs.quiet_start_minutes or v_minutes<v_prefs.quiet_end_minutes end;
 if v_quiet then return jsonb_build_object('outcome','defer','reason','quiet_hours','retry_at',clock_timestamp()+interval '15 minutes'); end if;
 if p_kind='streak_risk' then
   if v_minutes<1080 then return jsonb_build_object('outcome','defer','reason','before_streak_window','retry_at',(v_date+time '18:00') at time zone v_tz); end if;
   if v_minutes>=1260 or not exists(select 1 from public.streaks where user_id=p_user and current_streak>0 and last_completed_date=v_date-1)
     or exists(select 1 from public.streak_completions where user_id=p_user and local_date=v_date) then
     return jsonb_build_object('outcome','skip','reason','streak_changed'); end if;
 elsif p_kind='trial_reminder' then
   v_trial:=coalesce(v_ent.trial_expires_at,case when v_ent.source in ('revenuecat-webhook','sync-api') and v_ent.period_type='trial' then v_ent.expires_at end);
   if v_trial is null or v_trial<clock_timestamp()+interval '12 hours' or v_trial>clock_timestamp()+interval '36 hours'
      or (p_trial is not null and p_trial is distinct from v_trial) then
     return jsonb_build_object('outcome','skip','reason','trial_changed'); end if;
 end if;
 return jsonb_build_object('outcome','allow');
end;
$$;

-- Account deletion locks auth.users before cascading to delivery/attempt rows.
-- Match that order. The pipeline control lock alone cannot serialize deletion.
create function public.lock_push_parents(p_deliveries uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 perform 1 from auth.users u where u.id in (
   select d.user_id from public.notification_deliveries d where d.id=any(p_deliveries)
   union select dev.user_id from public.notification_deliveries d join public.devices dev on dev.id=d.device_id where d.id=any(p_deliveries))
   order by u.id for key share;
 perform 1 from public.notification_deliveries where id=any(p_deliveries) order by id for update;
end;
$$;

create function public.refresh_push_delivery(p_delivery uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_state text; v_next timestamptz;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 perform public.lock_push_parents(array[p_delivery]);
 -- Receipt progress is independent of a dispatcher preparing the remaining
 -- devices. Only that dispatcher (or its crash-recovery claim) owns this phase.
 if exists(select 1 from public.notification_deliveries where id=p_delivery and status='preparing' and lease_token is not null) then
   return 'preparing';end if;
 select case
   when count(*) filter(where state='sending')>0 then 'sending'
   when count(*) filter(where state in ('ready','retry_wait'))>0 then 'retry_wait'
   when count(*) filter(where state='ticket_ok')>0 then 'ticket_ok'
   when count(*) filter(where state='uncertain')>0 then 'uncertain'
   when count(*) filter(where state='dead_letter')>0 then 'dead_letter'
   when count(*) filter(where state='receipt_error')>0 then 'receipt_error'
   when count(*) filter(where state='ticket_error')>0 then 'ticket_error'
   when count(*) filter(where state='receipt_ok')>0 then 'receipt_ok' else 'skipped' end,
   min(coalesce(next_retry_at,clock_timestamp())) filter(where state in ('ready','retry_wait'))
   into v_state,v_next from public.notification_delivery_devices where delivery_id=p_delivery;
 update public.notification_deliveries set status=v_state,next_retry_at=v_next,
   terminal_at=case when v_state in ('sending','retry_wait','ticket_ok') then null else coalesce(terminal_at,clock_timestamp()) end
   where id=p_delivery;
 return v_state;
end;
$$;

create function public.close_push_queue(p_delivery uuid,p_archive boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_msg bigint;v_done boolean;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 select queue_msg_id into v_msg from public.notification_deliveries where id=p_delivery;
 if v_msg is null then return false; end if;
 if not exists(select 1 from pgmq.q_push_jobs where msg_id=v_msg) then return true; end if;
 if p_archive then select pgmq.archive('push_jobs',v_msg) into v_done;
 else select pgmq.delete('push_jobs',v_msg) into v_done; end if;
 if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
 return true;
end;
$$;

create function public.claim_push_job(p_msg_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q record; d public.notification_deliveries%rowtype; v_user uuid;v_kind text;v_date date;v_slot integer;
 v_key text;v_trial timestamptz;v_token uuid;v_gate jsonb;v_control public.push_pipeline_control%rowtype;v_done boolean;
begin
 select * into v_control from public.push_pipeline_control where id=true for update;
 -- Pipeline mutations take this control lock first, including the producer
 -- wrappers before notification-state locks. Then queue/delivery mutations are serialized.
 select msg_id,message,enqueued_at into q from pgmq.q_push_jobs where msg_id=p_msg_id for update;
 if not found then return jsonb_build_object('outcome','missing'); end if;
 begin
   if jsonb_typeof(q.message)<>'object' or octet_length(q.message::text)>2048
     or (q.message->>'user_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     or (q.message->>'local_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(q.message->>'slot','0') !~ '^\d{1,2}$' then raise exception 'invalid job'; end if;
   v_user:=(q.message->>'user_id')::uuid;v_date:=(q.message->>'local_date')::date;
   v_kind:=q.message->>'kind';v_slot:=coalesce(q.message->>'slot','0')::integer;
   if v_user is null or v_date is null or v_kind is null or v_kind not in ('quote','affirmation','streak_risk','trial_reminder')
      or v_slot not between 0 and 19 or (v_kind in ('streak_risk','trial_reminder') and v_slot<>0)
      or not exists(select 1 from auth.users where id=v_user) then raise exception 'invalid job'; end if;
   v_trial:=(q.message->>'trial_expires_at')::timestamptz;
   if v_kind='trial_reminder' and v_trial is null then raise exception 'unanchored trial job';end if;
   v_key:=v_user::text||':'||v_date::text||':'||v_kind||':'||v_slot::text;
   if v_kind='trial_reminder' and v_trial is not null then v_key:=v_user::text||':trial:'||extract(epoch from v_trial)::bigint::text; end if;
 exception when others then
   select pgmq.archive('push_jobs',p_msg_id) into v_done;
   if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
   return jsonb_build_object('outcome','archived','reason','invalid_job');
 end;
 select * into v_control from public.push_pipeline_control where id=true for update;
 if v_control.paused then return jsonb_build_object('outcome','deferred','reason','paused'); end if;
 perform 1 from auth.users where id=v_user for key share;
 if not found then
   select pgmq.archive('push_jobs',p_msg_id) into v_done;
   if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed';end if;
   return jsonb_build_object('outcome','archived','reason','deleted_user');end if;
 insert into public.notification_deliveries(user_id,kind,local_date,slot,idempotency_key,pipeline_version,queue_msg_id,expires_at,trial_anchor)
   values(v_user,v_kind,v_date,v_slot,v_key,2,p_msg_id,q.enqueued_at+interval '6 hours',v_trial) on conflict(idempotency_key) do nothing;
 select * into d from public.notification_deliveries where idempotency_key=v_key for update;
 if d.pipeline_version<>2 or d.status not in ('queued','preparing','sending','retry_wait') then
   if d.pipeline_version<>2 and d.status='queued' then
     update public.notification_deliveries set status='uncertain',error_detail='legacy_queued_outcome_unknown',terminal_at=clock_timestamp() where id=d.id;
   end if;
   select pgmq.archive('push_jobs',p_msg_id) into v_done;
   if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
   return jsonb_build_object('outcome','archived','reason','already_handled');
 end if;
 if d.lease_until>clock_timestamp() then return jsonb_build_object('outcome','busy'); end if;
 if d.status='sending' then
   update public.notification_delivery_devices set state='uncertain',error_code='worker_crashed_after_begin',terminal_at=clock_timestamp()
     where delivery_id=d.id and state='sending';
   perform public.refresh_push_delivery(d.id);
   update public.notification_deliveries set lease_token=null,lease_until=null where id=d.id;
   select * into d from public.notification_deliveries where id=d.id;
   if d.status<>'retry_wait' then
     select pgmq.archive('push_jobs',p_msg_id) into v_done;
     if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
     return jsonb_build_object('outcome','archived','reason','uncertain_send');
   end if;
 elsif d.status='preparing' then
   -- Recover this crashed lease once. Deferred re-reads must not count it again.
   update public.notification_deliveries set preparation_failures=preparation_failures+1,status='retry_wait',lease_token=null,lease_until=null where id=d.id;
   d.preparation_failures:=d.preparation_failures+1;
 end if;
 if d.preparation_failures>=5 then
   update public.notification_delivery_devices set state='dead_letter',error_code='preparation_exhausted',terminal_at=clock_timestamp()
     where delivery_id=d.id and state in ('ready','retry_wait');
   update public.notification_deliveries set status='dead_letter',error_detail='preparation_exhausted',lease_token=null,lease_until=null,terminal_at=clock_timestamp() where id=d.id;
   if exists(select 1 from public.notification_delivery_devices where delivery_id=d.id) then perform public.refresh_push_delivery(d.id); end if;
   select pgmq.archive('push_jobs',p_msg_id) into v_done;
   if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
   return jsonb_build_object('outcome','archived','reason','preparation_exhausted');
 end if;
 if d.next_retry_at>clock_timestamp() then return jsonb_build_object('outcome','deferred'); end if;
 v_gate:=public.push_eligibility(v_user,v_kind,v_date,v_slot,d.expires_at,d.trial_anchor);
 if v_gate->>'outcome'='skip' then
   update public.notification_delivery_devices set state='skipped',error_code=v_gate->>'reason',terminal_at=clock_timestamp()
     where delivery_id=d.id and state in ('ready','retry_wait');
   perform public.refresh_push_delivery(d.id);
   update public.notification_deliveries set error_detail=v_gate->>'reason',lease_token=null,lease_until=null where id=d.id;
   select pgmq.archive('push_jobs',p_msg_id) into v_done;
   if not coalesce(v_done,false) then raise exception 'queue acknowledgement failed'; end if;
   return jsonb_build_object('outcome','archived','reason',v_gate->>'reason');
 elsif v_gate->>'outcome'='defer' then
   update public.notification_deliveries set next_retry_at=(v_gate->>'retry_at')::timestamptz where id=d.id;
   return jsonb_build_object('outcome','deferred');
 end if;
 if (select count(*) from public.notification_deliveries where pipeline_version=2 and lease_until>clock_timestamp())>=1 then
   return jsonb_build_object('outcome','busy'); end if;
 v_token:=gen_random_uuid();
 update public.notification_deliveries set status='preparing',lease_token=v_token,lease_until=clock_timestamp()+interval '45 seconds',
   next_retry_at=clock_timestamp()+interval '45 seconds',queue_msg_id=p_msg_id where id=d.id;
 return jsonb_build_object('outcome','claimed','delivery_id',d.id,'lease_token',v_token,'content',d.push_content,
   'job',jsonb_build_object('user_id',v_user,'kind',v_kind,'local_date',v_date,'slot',v_slot));
end;
$$;

create function public.prepare_push_delivery(p_delivery_id uuid,p_lease_token uuid,p_content jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.notification_deliveries%rowtype;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 perform public.lock_push_parents(array[p_delivery_id]);
 select * into d from public.notification_deliveries where id=p_delivery_id for update;
 if not found or d.lease_token is distinct from p_lease_token or p_lease_token is null or coalesce(d.lease_until,'-infinity'::timestamptz)<=clock_timestamp() or d.status<>'preparing' then
   raise exception 'delivery claim expired'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>8192
   or coalesce(char_length(p_content->>'title'),0) not between 1 and 120 or coalesce(char_length(p_content->>'body'),0) not between 1 and 512
   or coalesce(char_length(p_content->>'url'),0) not between 1 and 512 or coalesce(jsonb_typeof(p_content->'snapshot'),'null')<>'object' then raise exception 'invalid content'; end if;
 if d.push_content is null then
   update public.notification_deliveries set push_content=p_content,title=p_content->>'title',body=p_content->>'body',
     content_id=(p_content->>'contentId')::uuid,campaign_id=(p_content->>'campaignId')::uuid,content_snapshot=p_content->'snapshot'
     where id=d.id;
 end if;
 if (select count(*) from public.devices where user_id=d.user_id and active and permission_status='granted' and push_token is not null)>20 then
   raise exception 'device fanout requires review'; end if;
 update public.notification_delivery_devices a set state='skipped',error_code='registration_changed',terminal_at=clock_timestamp()
   where a.delivery_id=d.id and a.state in ('ready','retry_wait') and not exists(select 1 from public.devices dev
     where dev.id=a.device_id and dev.user_id=a.user_id and dev.registration_version=a.registration_version
       and dev.push_token=a.token_value and dev.active and dev.permission_status='granted');
 insert into public.notification_delivery_devices(delivery_id,user_id,device_id,registration_version,token_value,state,next_retry_at)
   select d.id,d.user_id,dev.id,dev.registration_version,dev.push_token,'ready',clock_timestamp()
     from public.devices dev where dev.user_id=d.user_id and dev.active and dev.permission_status='granted' and dev.push_token is not null
       and not exists(select 1 from public.notification_delivery_devices a where a.delivery_id=d.id and a.device_id=dev.id and a.registration_version=dev.registration_version)
       and not exists(select 1 from public.notification_delivery_devices a where a.delivery_id=d.id and a.device_id=dev.id
         and a.state in ('sending','ticket_ok','receipt_ok','receipt_error','uncertain'))
     order by dev.id limit greatest(0,20-(select count(*)::integer from public.notification_delivery_devices where delivery_id=d.id))
     on conflict(delivery_id,device_id,registration_version) do nothing;
 return jsonb_build_object('outcome','prepared');
end;
$$;

create function public.begin_push_send(p_delivery_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.notification_deliveries%rowtype;v_gate jsonb;v_control public.push_pipeline_control%rowtype;
 v_ids uuid[];v_attempts jsonb;v_budget jsonb;v_done boolean;v_status text;
begin
 select * into v_control from public.push_pipeline_control where id=true for update;
 perform public.lock_push_parents(array[p_delivery_id]);
 select * into d from public.notification_deliveries where id=p_delivery_id for update;
 if not found or p_lease_token is null or d.lease_token is distinct from p_lease_token or coalesce(d.lease_until,'-infinity'::timestamptz)<=clock_timestamp() or d.status<>'preparing' then
   return jsonb_build_object('outcome','superseded'); end if;
 v_gate:=public.push_eligibility(d.user_id,d.kind,d.local_date,d.slot,d.expires_at,d.trial_anchor);
 if v_gate->>'outcome'<>'allow' then
   if v_gate->>'outcome'='skip' then
     update public.notification_delivery_devices set state='skipped',error_code=v_gate->>'reason',terminal_at=clock_timestamp()
       where delivery_id=d.id and state in ('ready','retry_wait');
     update public.notification_deliveries set status='retry_wait',lease_token=null,lease_until=null where id=d.id;
     perform public.refresh_push_delivery(d.id);v_done:=public.close_push_queue(d.id,true);
   end if;
   update public.notification_deliveries set lease_token=null,lease_until=null,
     next_retry_at=case when v_gate->>'outcome'='defer' then (v_gate->>'retry_at')::timestamptz else null end,
     status=case when v_gate->>'outcome'='defer' then 'retry_wait' else status end where id=d.id;
   return jsonb_build_object('outcome',v_gate->>'outcome','queue_archived',coalesce(v_done,false));
 end if;
 if v_control.paused or (select count(*) from public.notification_delivery_devices where state='ticket_ok')>=v_control.max_pending_receipts
   or exists(select 1 from public.notification_delivery_devices where state='ticket_ok' and sent_at<clock_timestamp()-v_control.max_receipt_age) then
   update public.notification_deliveries set status='retry_wait',lease_token=null,lease_until=null,next_retry_at=clock_timestamp()+interval '15 minutes' where id=d.id;
   return jsonb_build_object('outcome','deferred','reason','receipt_backpressure'); end if;
 update public.notification_delivery_devices a set state='skipped',error_code='registration_changed',terminal_at=clock_timestamp()
   where a.delivery_id=d.id and a.state in ('ready','retry_wait') and not exists(select 1 from public.devices dev
     where dev.id=a.device_id and dev.user_id=a.user_id and dev.registration_version=a.registration_version
       and dev.push_token=a.token_value and dev.active and dev.permission_status='granted');
 select array_agg(id order by id) into v_ids from (select id from public.notification_delivery_devices
   where delivery_id=d.id and state in ('ready','retry_wait') and coalesce(next_retry_at,clock_timestamp())<=clock_timestamp()
   order by id limit least(8,v_control.max_pending_receipts-(select count(*)::integer from public.notification_delivery_devices where state='ticket_ok')) for update) selected;
 if coalesce(cardinality(v_ids),0)=0 then
   update public.notification_deliveries set status='retry_wait',lease_token=null,lease_until=null where id=d.id;
   v_status:=public.refresh_push_delivery(d.id);
   if v_status<>'retry_wait' then v_done:=public.close_push_queue(d.id,true); end if;
   return jsonb_build_object('outcome','no_ready_attempts','queue_archived',coalesce(v_done,false)); end if;
 v_budget:=public.consume_backend_budget(d.user_id,'push_send',cardinality(v_ids));
 if not (v_budget->>'allowed')::boolean then
   update public.notification_deliveries set status='retry_wait',lease_token=null,lease_until=null,next_retry_at=clock_timestamp()+interval '1 minute' where id=d.id;
   return jsonb_build_object('outcome','deferred','reason','send_budget'); end if;
 update public.notification_delivery_devices set state='sending',send_attempts=send_attempts+1,send_lease_token=p_lease_token,send_result=null,send_queue_deleted=false
   where id=any(v_ids);
 update public.notification_deliveries set status='sending',lease_until=clock_timestamp()+interval '30 seconds',next_retry_at=clock_timestamp()+interval '30 seconds' where id=d.id;
 select jsonb_agg(jsonb_build_object('id',id,'device_id',device_id,'registration_version',registration_version,'push_token',token_value) order by id)
   into v_attempts from public.notification_delivery_devices where id=any(v_ids);
 return jsonb_build_object('outcome','sending','attempts',v_attempts,'content',d.push_content);
end;
$$;

create function public.finish_push_send(p_delivery_id uuid,p_lease_token uuid,p_results jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.notification_deliveries%rowtype;a public.notification_delivery_devices%rowtype;r jsonb;v_ids uuid[];
 v_status text;v_done boolean:=false;v_fresh integer;v_count integer;v_ok integer:=0;v_error integer:=0;v_uncertain integer:=0;v_retry integer:=0;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 perform public.lock_push_parents(array[p_delivery_id]);
 select * into d from public.notification_deliveries where id=p_delivery_id for update;
 if not found or p_lease_token is null then return jsonb_build_object('outcome','superseded'); end if;
 if p_results is null or jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results) not between 1 and 8 or octet_length(p_results::text)>8192 then raise exception 'invalid send result'; end if;
 select array_agg((x->>'attempt_id')::uuid order by x->>'attempt_id'),count(distinct (x->>'attempt_id')::uuid) into v_ids,v_count from jsonb_array_elements(p_results) x;
 if v_count<>cardinality(v_ids) or array_position(v_ids,null) is not null then raise exception 'invalid attempt ids'; end if;
 if (select count(*) from public.notification_delivery_devices where delivery_id=d.id and id=any(v_ids) and send_lease_token=p_lease_token)<>v_count then
   return jsonb_build_object('outcome','superseded'); end if;
 if (select count(*) from public.notification_delivery_devices where delivery_id=d.id and send_lease_token=p_lease_token)<>v_count then
   return jsonb_build_object('outcome','superseded'); end if;
 -- Validate replay consistency for the entire batch before mutating any row.
 -- A stale/partial batch must not commit a prefix of its outcomes.
 if exists(select 1 from jsonb_array_elements(p_results) x join public.notification_delivery_devices a on a.id=(x->>'attempt_id')::uuid
   where a.state<>'sending' and a.send_result is distinct from x) then return jsonb_build_object('outcome','superseded'); end if;
 select count(*) into v_fresh from public.notification_delivery_devices where delivery_id=d.id and send_lease_token=p_lease_token and state='sending';
 if v_fresh>0 and (v_fresh<>v_count or d.lease_token is distinct from p_lease_token or coalesce(d.lease_until,'-infinity'::timestamptz)<=clock_timestamp() or d.status<>'sending') then
   return jsonb_build_object('outcome','superseded'); end if;
 for r in select value from jsonb_array_elements(p_results) order by value->>'attempt_id' loop
   select * into a from public.notification_delivery_devices where id=(r->>'attempt_id')::uuid for update;
   if a.state<>'sending' then
     if a.send_result is distinct from r then return jsonb_build_object('outcome','superseded'); end if;
   else
     if r->>'state' is null or r->>'state' not in ('ticket_ok','ticket_error','uncertain')
       or char_length(r->>'error_code')>64 then raise exception 'invalid send outcome'; end if;
     if r->>'state'='ticket_ok' then
       if coalesce(char_length(r->>'ticket_id'),0) not between 1 and 128 then raise exception 'missing ticket id'; end if;
       update public.notification_delivery_devices set state='ticket_ok',expo_ticket_id=r->>'ticket_id',sent_at=clock_timestamp(),
         next_retry_at=clock_timestamp()+interval '15 minutes',error_code=null,send_result=r where id=a.id;
       update public.notification_deliveries set sent_at=coalesce(sent_at,clock_timestamp()) where id=d.id;
     elsif r->>'state'='uncertain' then
       update public.notification_delivery_devices set state='uncertain',error_code='provider_outcome_uncertain',terminal_at=clock_timestamp(),send_result=r where id=a.id;
     else
       if r->>'error_code' is null or r->>'error_code' not in ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','unknown_ticket_error') then raise exception 'invalid ticket code'; end if;
       if r->>'error_code'='MessageRateExceeded' and a.send_attempts<3 and d.expires_at>clock_timestamp()+interval '5 minutes' then
         update public.notification_delivery_devices set state='retry_wait',next_retry_at=clock_timestamp()+make_interval(secs=>60*power(2,a.send_attempts-1)::integer),
           error_code=r->>'error_code',send_result=r where id=a.id;
       else
         update public.notification_delivery_devices set state=case when r->>'error_code'='MessageRateExceeded' then 'dead_letter' else 'ticket_error' end,
           error_code=r->>'error_code',terminal_at=clock_timestamp(),send_result=r where id=a.id;
       end if;
       if r->>'error_code'='DeviceNotRegistered' and not a.legacy_unmapped then
         update public.devices set active=false,push_token=null,updated_at=now()
           where id=a.device_id and user_id=a.user_id and registration_version=a.registration_version and push_token=a.token_value;
       end if;
     end if;
   end if;
   if r->>'state'='ticket_ok' then v_ok:=v_ok+1; elsif r->>'state'='uncertain' then v_uncertain:=v_uncertain+1; else v_error:=v_error+1; end if;
 end loop;
 if v_fresh>0 then
   v_status:=public.refresh_push_delivery(d.id);
   update public.notification_deliveries set lease_token=null,lease_until=null where id=d.id;
   if v_status not in ('retry_wait','sending') then v_done:=public.close_push_queue(d.id); end if;
   update public.notification_delivery_devices set send_queue_deleted=v_done where id=any(v_ids);
 else
   -- Report this batch's committed acknowledgement, not a later worker's close.
   select bool_and(send_queue_deleted) into v_done from public.notification_delivery_devices where id=any(v_ids);
 end if;
 select count(*) into v_retry from public.notification_delivery_devices where id=any(v_ids) and state='retry_wait';
 return jsonb_build_object('outcome','persisted','ticket_ok',v_ok,'ticket_error',v_error,'uncertain',v_uncertain,'retry_wait',v_retry,'queue_deleted',v_done);
end;
$$;

create function public.release_push_delivery(p_delivery_id uuid,p_lease_token uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.notification_deliveries%rowtype;v_done boolean:=false;v_terminal boolean;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 perform public.lock_push_parents(array[p_delivery_id]);
 select * into d from public.notification_deliveries where id=p_delivery_id for update;
 if not found or p_lease_token is null or d.lease_token is distinct from p_lease_token or d.status<>'preparing' or coalesce(d.lease_until,'-infinity'::timestamptz)<=clock_timestamp() then
   return jsonb_build_object('outcome','superseded'); end if;
 if p_reason is null or p_reason not in ('no_content','preparation_failed') then raise exception 'invalid release reason'; end if;
 v_terminal:=p_reason='no_content' or d.preparation_failures>=4;
 if v_terminal then
   update public.notification_delivery_devices set state=case when p_reason='no_content' then 'skipped' else 'dead_letter' end,
     error_code=p_reason,terminal_at=clock_timestamp() where delivery_id=d.id and state in ('ready','retry_wait');
   v_done:=public.close_push_queue(d.id,true);
 end if;
 update public.notification_deliveries set preparation_failures=preparation_failures+1,lease_token=null,lease_until=null,
   status=case when p_reason='no_content' then 'skipped' when v_terminal then 'dead_letter' else 'retry_wait' end,
   next_retry_at=case when v_terminal then null else clock_timestamp()+make_interval(secs=>15*power(2,least(4,d.preparation_failures))::integer) end,
   error_detail=p_reason,terminal_at=case when v_terminal then clock_timestamp() else null end where id=d.id;
 if v_terminal and exists(select 1 from public.notification_delivery_devices where delivery_id=d.id) then perform public.refresh_push_delivery(d.id);end if;
 return jsonb_build_object('outcome','released','queue_archived',v_done);
end;
$$;

create function public.claim_push_receipts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record;v_ids uuid[];v_parents uuid[];v_token uuid:=gen_random_uuid();v_expired integer:=0;v_imported integer:=0;v_budget jsonb;v_result jsonb;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 -- Charge the bounded consumer call even when no tickets are due; maintenance
 -- and empty/busy retries must not create an unlimited scan path.
 v_budget:=public.consume_backend_budget(null,'push_receipt',1);
 if not (v_budget->>'allowed')::boolean then
   return jsonb_build_object('lease_token',v_token,'attempts','[]'::jsonb,'expired',0,'legacy_imported',0,'budget_limited',true);end if;
 perform public.prune_push_history(); -- Bounded maintenance on the existing consumer path; no new cron.
 -- Existing tickets have unproven device/token mapping. Import at most 50 per
 -- pass, explicitly without a registration; their receipt cannot disable any device.
 select array_agg(id) into v_parents from (select id from public.notification_deliveries where pipeline_version=1 and status='ticket_ok'
   and expo_ticket_id is not null and not legacy_receipt_imported order by sent_at,id limit 50) candidates;
 perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
 for r in select * from public.notification_deliveries where id=any(coalesce(v_parents,'{}'::uuid[])) and pipeline_version=1 and status='ticket_ok'
   and expo_ticket_id is not null and not legacy_receipt_imported order by id loop
   if char_length(r.expo_ticket_id) not between 1 and 128 then
     update public.notification_deliveries set status='receipt_error',error_detail='legacy_ticket_invalid',terminal_at=clock_timestamp(),legacy_receipt_imported=true where id=r.id;
     continue;end if;
   insert into public.notification_delivery_devices(delivery_id,user_id,legacy_unmapped,state,expo_ticket_id,sent_at,next_retry_at)
     values(r.id,r.user_id,true,'ticket_ok',r.expo_ticket_id,coalesce(r.sent_at,r.created_at),coalesce(r.sent_at,r.created_at)+interval '15 minutes')
     on conflict do nothing;
   if found then v_imported:=v_imported+1;
   else update public.notification_deliveries set status='receipt_error',error_detail='legacy_ticket_mapping_conflict',terminal_at=clock_timestamp() where id=r.id; end if;
   update public.notification_deliveries set legacy_receipt_imported=true where id=r.id;
 end loop;
 select array_agg(id),array_agg(distinct delivery_id) into v_ids,v_parents from (
   select id,delivery_id from public.notification_delivery_devices where state='ticket_ok'
     and (receipt_lease_until is null or receipt_lease_until<=clock_timestamp())
     and (sent_at<clock_timestamp()-interval '24 hours' or receipt_attempts>=8)
     order by sent_at,id limit 300
 ) expired;
 perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
 update public.notification_delivery_devices set state='receipt_error',error_code='receipt_unresolved',terminal_at=clock_timestamp(),
   receipt_lease_token=null,receipt_lease_until=null where id=any(coalesce(v_ids,'{}'::uuid[]));
 get diagnostics v_expired=row_count;
 for r in select unnest(coalesce(v_parents,'{}'::uuid[])) as id order by id loop perform public.refresh_push_delivery(r.id); end loop;
 if exists(select 1 from public.notification_delivery_devices where state='ticket_ok' and receipt_lease_until>clock_timestamp()) then
   return jsonb_build_object('lease_token',v_token,'attempts','[]'::jsonb,'expired',v_expired,'legacy_imported',v_imported); end if;
 select array_agg(id order by id) into v_ids from (
   select id from public.notification_delivery_devices where state='ticket_ok' and next_retry_at<=clock_timestamp()
     and (receipt_lease_until is null or receipt_lease_until<=clock_timestamp())
     order by next_retry_at,id limit 300
 ) due;
 if coalesce(cardinality(v_ids),0)>0 then
   select array_agg(distinct delivery_id) into v_parents from public.notification_delivery_devices where id=any(v_ids);
   perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
   update public.notification_delivery_devices set receipt_lease_token=v_token,receipt_lease_until=clock_timestamp()+interval '45 seconds',
     next_retry_at=clock_timestamp()+interval '45 seconds',receipt_attempts=receipt_attempts+1 where id=any(v_ids);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'expo_ticket_id',expo_ticket_id) order by id),'[]'::jsonb) into v_result
   from public.notification_delivery_devices where id=any(coalesce(v_ids,'{}'::uuid[]));
 return jsonb_build_object('lease_token',v_token,'attempts',v_result,'expired',v_expired,'legacy_imported',v_imported);
end;
$$;

create function public.finish_push_receipts(p_lease_token uuid,p_results jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;a public.notification_delivery_devices%rowtype;v_ids uuid[];v_count integer;v_parents uuid[];v_parent uuid;
 v_ok integer:=0;v_error integer:=0;v_pending integer:=0;v_skipped integer:=0;
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 if p_lease_token is null or p_results is null or jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results) not between 1 and 300
   or octet_length(p_results::text)>65536 then raise exception 'invalid receipt batch'; end if;
 select array_agg((x->>'attempt_id')::uuid),count(distinct (x->>'attempt_id')::uuid) into v_ids,v_count from jsonb_array_elements(p_results) x;
 if v_count<>cardinality(v_ids) or array_position(v_ids,null) is not null then raise exception 'invalid receipt ids'; end if;
 select array_agg(distinct delivery_id) into v_parents from public.notification_delivery_devices where id=any(v_ids);
 perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
 for r in select value from jsonb_array_elements(p_results) order by value->>'attempt_id' loop
   select * into a from public.notification_delivery_devices where id=(r->>'attempt_id')::uuid for update;
   if not found then v_skipped:=v_skipped+1;continue;end if; -- Account deletion can remove an in-flight attempt.
   if a.receipt_last_token=p_lease_token and a.receipt_result=r then null; -- Idempotent response-loss retry.
   elsif a.receipt_lease_token is distinct from p_lease_token or coalesce(a.receipt_lease_until,'-infinity'::timestamptz)<=clock_timestamp() or a.state<>'ticket_ok' then
     v_skipped:=v_skipped+1;continue;
   else
     if r->>'state' is null or r->>'state' not in ('receipt_ok','receipt_error','pending') then raise exception 'invalid receipt state'; end if;
     if r->>'state'='pending' then
       update public.notification_delivery_devices set next_retry_at=clock_timestamp()+make_interval(secs=>least(14400,900*power(2,least(4,receipt_attempts-1))::integer)),
         receipt_lease_token=null,receipt_lease_until=null,receipt_last_token=p_lease_token,receipt_result=r,
         error_code=case when r->>'error_code'='provider_unavailable' then 'provider_unavailable' else 'receipt_pending' end where id=a.id;
     else
       if r->>'state'='receipt_error' and (r->>'error_code' is null or r->>'error_code' not in
         ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','unknown_receipt_error')) then raise exception 'invalid receipt code'; end if;
       update public.notification_delivery_devices set state=r->>'state',error_code=r->>'error_code',terminal_at=clock_timestamp(),
         receipt_lease_token=null,receipt_lease_until=null,receipt_last_token=p_lease_token,receipt_result=r where id=a.id;
       if r->>'state'='receipt_error' and r->>'error_code'='DeviceNotRegistered' and not a.legacy_unmapped then
         update public.devices set active=false,push_token=null,updated_at=now()
           where id=a.device_id and user_id=a.user_id and registration_version=a.registration_version and push_token=a.token_value;
       end if;
     end if;
   end if;
   if r->>'state'='receipt_ok' then v_ok:=v_ok+1;elsif r->>'state'='receipt_error' then v_error:=v_error+1;else v_pending:=v_pending+1;end if;
 end loop;
 for v_parent in select unnest(coalesce(v_parents,'{}'::uuid[])) order by 1 loop perform public.refresh_push_delivery(v_parent); end loop;
 return jsonb_build_object('outcome','persisted','checked',v_ok+v_error+v_pending,'receipt_ok',v_ok,'receipt_error',v_error,'pending',v_pending,'superseded_or_deleted',v_skipped);
end;
$$;

-- Returns a new queue ID, 0 for an already-reserved slot, or NULL when paused.
create function public.enqueue_push_job(p_user uuid,p_kind text,p_date date,p_slot integer) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_control public.push_pipeline_control%rowtype;v_key text;v_trial timestamptz;v_id bigint;v_budget jsonb;v_gate jsonb;
begin
 select * into v_control from public.push_pipeline_control where id=true for update;
 if p_kind is null or p_kind not in ('quote','affirmation','streak_risk','trial_reminder') or p_slot is null or p_slot not between 0 and 19
   or (p_kind in ('streak_risk','trial_reminder') and p_slot<>0) or p_user is null or p_date is null then raise exception 'invalid producer input';end if;
 if v_control.paused or (select count(*) from pgmq.q_push_jobs)>=v_control.max_queued_jobs
   or (select count(*) from public.notification_delivery_devices where state='ticket_ok')>=v_control.max_pending_receipts then return null;end if;
 v_key:=p_user::text||':'||p_date::text||':'||p_kind||':'||p_slot::text;
 if p_kind='trial_reminder' then
   select coalesce(trial_expires_at,case when source in ('revenuecat-webhook','sync-api') and period_type='trial' then expires_at end)
     into v_trial from public.entitlements where user_id=p_user;
   if v_trial is null or v_trial<clock_timestamp()+interval '12 hours' or v_trial>clock_timestamp()+interval '36 hours' then return null;end if;
   -- Do not consume this once-per-trial reservation overnight/before the window.
   -- The producer will select it again when sending is currently allowed.
   v_gate:=public.push_eligibility(p_user,p_kind,p_date,p_slot,clock_timestamp()+interval '6 hours',v_trial);
   if v_gate->>'outcome'<>'allow' then return null;end if;
   v_key:=p_user::text||':trial:'||extract(epoch from v_trial)::bigint::text;
 end if;
 if exists(select 1 from public.push_schedule_claims where schedule_key=v_key) then return 0;end if;
 v_budget:=public.consume_backend_budget(p_user,'push_enqueue',1);
 if not (v_budget->>'allowed')::boolean then return null;end if;
 insert into public.push_schedule_claims(schedule_key,user_id,kind,local_date,trial_anchor,expires_at)
   values(v_key,p_user,p_kind,p_date,v_trial,clock_timestamp()+interval '6 hours') on conflict do nothing;
 if not found then return 0;end if;
 select pgmq.send('push_jobs',jsonb_build_object('user_id',p_user,'kind',p_kind,'local_date',p_date,'slot',p_slot,'trial_expires_at',v_trial,'s4_pipeline',2)) into v_id;
 update public.push_schedule_claims set queue_msg_id=v_id where schedule_key=v_key;
 return v_id;
end;
$$;

-- Bounded maintenance, consumed by the existing receipt handler. Terminal
-- attempts retain 30 days; uncertain evidence retains 90 days. No legacy parent
-- history, identities, authored data or active registrations are purged.
create function public.prune_push_history() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_attempts integer;v_deliveries integer;v_claims integer;v_archived integer;v_ids uuid[];v_parents uuid[];
begin
 perform 1 from public.push_pipeline_control where id=true for update;
 select array_agg(id),array_agg(distinct delivery_id) into v_ids,v_parents from
 (select id,delivery_id from public.notification_delivery_devices where terminal_at<clock_timestamp()-interval '30 days'
   and state not in ('ready','sending','retry_wait','ticket_ok') and (state<>'uncertain' or terminal_at<clock_timestamp()-interval '90 days')
   order by terminal_at,id limit 200) old;
 perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
 delete from public.notification_delivery_devices where id=any(coalesce(v_ids,'{}'::uuid[]));
 get diagnostics v_attempts=row_count;
 select array_agg(id) into v_parents from (select d.id from public.notification_deliveries d where d.pipeline_version=2 and d.terminal_at<clock_timestamp()-interval '90 days'
   and d.status not in ('queued','preparing','sending','retry_wait','ticket_ok')
   and not exists(select 1 from public.notification_delivery_devices a where a.delivery_id=d.id)
   and not exists(select 1 from pgmq.q_push_jobs q where q.msg_id=d.queue_msg_id)
   order by d.terminal_at,d.id limit 200) old;
 perform public.lock_push_parents(coalesce(v_parents,'{}'::uuid[]));
 delete from public.notification_deliveries where id=any(coalesce(v_parents,'{}'::uuid[]));
 get diagnostics v_deliveries=row_count;
 with old as (select schedule_key from public.push_schedule_claims s where s.created_at<clock_timestamp()-interval '90 days'
   and not exists(select 1 from pgmq.q_push_jobs q where q.msg_id=s.queue_msg_id)
   order by s.created_at limit 200 for update skip locked),
 removed as (delete from public.push_schedule_claims where schedule_key in(select schedule_key from old) returning 1)
 select count(*) into v_claims from removed;
 with old as (select msg_id from pgmq.a_push_jobs where archived_at<clock_timestamp()-interval '30 days' and message->>'s4_pipeline'='2' order by archived_at limit 200),
 removed as (delete from pgmq.a_push_jobs where msg_id in(select msg_id from old) returning 1)
 select count(*) into v_archived from removed;
 return jsonb_build_object('attempts',v_attempts,'deliveries',v_deliveries,'schedule_claims',v_claims,'archived_queue',v_archived);
end;
$$;

-- Forward-only producer replacements preserve safe timezone and per-user
-- exception isolation. Pipeline control is locked BEFORE notification state.
create or replace function public.enqueue_due_notifications(p_batch int default 500)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_prefs record;
  v_kind text;
  v_slot int;
  v_count int := 0;
  v_msg bigint;
  v_local_date date;
  v_tz text;
begin
  if p_batch is null or p_batch not between 1 and 500 then raise exception 'invalid scheduler batch'; end if;
  perform 1 from public.push_pipeline_control where id=true for update;
  if not (public.consume_backend_budget(null,'push_schedule',1)->>'allowed')::boolean then return 0; end if;
  for r in
    select ns.user_id, ns.quotes_sent, ns.affirmations_sent, ns.local_date
    from public.notification_state ns
    where ns.next_due_at is not null and ns.next_due_at <= now()
    order by ns.next_due_at
    limit p_batch
    for update of ns skip locked
  loop
    begin
    select public.safe_timezone(p.timezone) into v_tz from public.profiles p where p.id = r.user_id;
    select * into v_prefs from public.notification_prefs where user_id = r.user_id;
    if v_prefs is null then
      update public.notification_state set next_due_at = null, updated_at = now()
        where user_id = r.user_id;
      continue;
    end if;

    begin
      v_local_date := (now() at time zone v_tz)::date;
    exception when others then
      v_local_date := (now() at time zone 'UTC')::date;
    end;

    -- Roll counters if the local day changed since last recalc.
    if r.local_date is distinct from v_local_date then
      update public.notification_state
        set local_date = v_local_date, quotes_sent = 0, affirmations_sent = 0, updated_at = now()
        where user_id = r.user_id;
      r.quotes_sent := 0;
      r.affirmations_sent := 0;
    end if;

    -- Premium gate: content notifications only for entitled users.
    if not exists (
      select 1 from public.entitlements e
      where e.user_id = r.user_id and e.is_premium
        and (e.expires_at is null or e.expires_at > now())
    ) then
      update public.notification_state set next_due_at = null, updated_at = now()
        where user_id = r.user_id;
      continue;
    end if;

    -- Choose kind: interleave, respecting per-kind daily caps.
    v_kind := null;
    if r.quotes_sent < v_prefs.quotes_per_day
       and (r.quotes_sent <= r.affirmations_sent or r.affirmations_sent >= v_prefs.affirmations_per_day) then
      v_kind := 'quote';
      v_slot := r.quotes_sent;
    elsif r.affirmations_sent < v_prefs.affirmations_per_day then
      v_kind := 'affirmation';
      v_slot := r.affirmations_sent;
    end if;

    if v_kind is not null then
      v_msg:=public.enqueue_push_job(r.user_id,v_kind,v_local_date,v_slot);
      if v_msg is null then
        update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
        continue;
      end if;
      -- Legacy counter names represent reserved slots, not provider delivery.
      -- Reservation, queue insertion and pacing advancement commit together.
      if v_kind = 'quote' then
        update public.notification_state set quotes_sent = quotes_sent + 1 where user_id = r.user_id;
      else
        update public.notification_state set affirmations_sent = affirmations_sent + 1 where user_id = r.user_id;
      end if;
      if v_msg>0 then v_count := v_count + 1; end if;
    end if;

    perform public.recalc_notification_state(r.user_id);
    exception when others then
      -- Roll back only this user; preserve healthy users in the same pass.
      update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
    end;
  end loop;

  -- Streak-risk pass: entitled users with a live streak, yesterday
  -- completed, today not, inside 18:00-21:00 local, pref on, not yet
  -- reminded today.
  for r in
    select s.user_id, public.safe_timezone(p.timezone) as tz
    from public.streaks s
    join public.profiles p on p.id = s.user_id
    join public.notification_prefs np on np.user_id = s.user_id and np.streak_reminder
    join public.entitlements e on e.user_id = s.user_id and e.is_premium
      and (e.expires_at is null or e.expires_at > now())
    where s.current_streak > 0
      and s.last_completed_date = ((now() at time zone public.safe_timezone(p.timezone))::date - 1)
      and extract(hour from (now() at time zone public.safe_timezone(p.timezone))) between 18 and 20
      and not exists (
        select 1 from public.notification_state ns
        where ns.user_id = s.user_id
          and ns.streak_risk_sent_on = (now() at time zone public.safe_timezone(p.timezone))::date
      )
      and exists (
        select 1 from public.devices d
        where d.user_id = s.user_id and d.active and d.push_token is not null
          and d.permission_status = 'granted'
      )
    limit p_batch
  loop
    begin
    v_local_date := (now() at time zone r.tz)::date;
    v_msg:=public.enqueue_push_job(r.user_id,'streak_risk',v_local_date,0);
    if v_msg is null then continue; end if;
    insert into public.notification_state (user_id, local_date, streak_risk_sent_on)
    values (r.user_id, v_local_date, v_local_date)
    on conflict (user_id) do update
      set streak_risk_sent_on = excluded.streak_risk_sent_on, updated_at = now();
    if v_msg>0 then v_count := v_count + 1; end if;
    exception when others then
      -- Roll back only this user; preserve healthy users in the same pass.
      update public.notification_state set next_due_at=now()+interval '15 minutes',updated_at=now() where user_id=r.user_id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
grant execute on function public.enqueue_due_notifications(int) to service_role;

-- ---------------------------------------------------------------------------

-- Keep known legacy trial metadata usable without rewriting existing rows.
create or replace function public.enqueue_trial_reminders(p_batch int default 200)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_msg bigint;
  v_local_date date;
begin
  if p_batch is null or p_batch not between 1 and 200 then raise exception 'invalid trial batch'; end if;
  perform 1 from public.push_pipeline_control where id=true for update;
  if not (public.consume_backend_budget(null,'push_schedule',1)->>'allowed')::boolean then return 0; end if;
  for r in
    select e.user_id, public.safe_timezone(p.timezone) as tz
    from public.entitlements e
    join public.profiles p on p.id = e.user_id
    join public.notification_prefs np
      on np.user_id = e.user_id and np.trial_reminder
    where e.is_premium
      and (e.trial_expires_at is not null or (e.source in ('revenuecat-webhook','sync-api') and e.period_type = 'trial'))
      and coalesce(e.trial_expires_at,case when e.source in ('revenuecat-webhook','sync-api') and e.period_type='trial' then e.expires_at end) between now() + interval '12 hours'
                           and now() + interval '36 hours'
      and public.push_eligibility(e.user_id,'trial_reminder',(clock_timestamp() at time zone public.safe_timezone(p.timezone))::date,0,
        clock_timestamp()+interval '6 hours',coalesce(e.trial_expires_at,case when e.source in ('revenuecat-webhook','sync-api') and e.period_type='trial' then e.expires_at end))->>'outcome'='allow'
      and exists (
        select 1 from public.devices d
        where d.user_id = e.user_id and d.active
          and d.push_token is not null
          and d.permission_status = 'granted'
      )
      and not exists (
        select 1 from public.push_schedule_claims s where s.user_id=e.user_id and s.kind='trial_reminder'
          and s.trial_anchor=coalesce(e.trial_expires_at,case when e.source in ('revenuecat-webhook','sync-api') and e.period_type='trial' then e.expires_at end)
      )
      and not exists (
        select 1 from public.notification_deliveries nd
        where nd.user_id = e.user_id
          and nd.kind = 'trial_reminder'
          and nd.created_at > now() - interval '48 hours'
      )
    limit p_batch
  loop
    begin
    begin
      v_local_date := (now() at time zone r.tz)::date;
    exception when others then
      v_local_date := (now() at time zone 'UTC')::date;
    end;

    v_msg:=public.enqueue_push_job(r.user_id,'trial_reminder',v_local_date,0);
    if v_msg is null then continue; end if;
    if v_msg>0 then v_count := v_count + 1; end if;
    exception when others then
      -- Isolate this user's scheduling failure; later passes may recover it.
      null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_trial_reminders(int) from public, anon, authenticated;
grant execute on function public.enqueue_trial_reminders(int) to service_role;

-- The public queue reader stays compatible but its work allowance is server owned.
create or replace function public.queue_read(n int,vt int)
returns setof pgmq.message_record
language plpgsql security definer set search_path='' as $$
begin
 if n is null or n not between 1 and 10 or vt is null or vt not between 90 and 300 then raise exception 'invalid queue read';end if;
 if not (public.consume_backend_budget(null,'push_read',1)->>'allowed')::boolean then return;end if;
 return query select * from pgmq.read('push_jobs',vt,n);
end;
$$;
-- Obsolete workers must not acknowledge a queue row outside the ledger protocol.
revoke all on function public.queue_delete(bigint) from service_role;
revoke all on function public.queue_archive(bigint) from service_role;

revoke all on function public.push_eligibility(uuid,text,date,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.push_eligibility(uuid,text,date,integer,timestamptz,timestamptz) to service_role;

revoke all on function public.lock_push_parents(uuid[]) from public,anon,authenticated,service_role;

revoke all on function public.refresh_push_delivery(uuid) from public,anon,authenticated;
grant execute on function public.refresh_push_delivery(uuid) to service_role;

revoke all on function public.close_push_queue(uuid,boolean) from public,anon,authenticated;
grant execute on function public.close_push_queue(uuid,boolean) to service_role;

revoke all on function public.claim_push_job(bigint) from public,anon,authenticated;
grant execute on function public.claim_push_job(bigint) to service_role;

revoke all on function public.prepare_push_delivery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_push_delivery(uuid,uuid,jsonb) to service_role;

revoke all on function public.begin_push_send(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_push_send(uuid,uuid) to service_role;

revoke all on function public.finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_push_send(uuid,uuid,jsonb) to service_role;

revoke all on function public.release_push_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.release_push_delivery(uuid,uuid,text) to service_role;

revoke all on function public.claim_push_receipts() from public,anon,authenticated;
grant execute on function public.claim_push_receipts() to service_role;

revoke all on function public.finish_push_receipts(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_push_receipts(uuid,jsonb) to service_role;

revoke all on function public.enqueue_push_job(uuid,text,date,integer) from public,anon,authenticated;
grant execute on function public.enqueue_push_job(uuid,text,date,integer) to service_role;

revoke all on function public.prune_push_history() from public,anon,authenticated;
grant execute on function public.prune_push_history() to service_role;

revoke all on function public.queue_read(integer,integer) from public,anon,authenticated;
grant execute on function public.queue_read(integer,integer) to service_role;
