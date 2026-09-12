-- S5-RB07: stop producer reservations while any unresolved receipt is overdue.
-- Match the sender gate under the existing control lock, before budget use.
-- CREATE OR REPLACE preserves the existing restricted ACL and signature.
create or replace function public.enqueue_push_job(p_user uuid,p_kind text,p_date date,p_slot integer) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_control public.push_pipeline_control%rowtype;v_key text;v_trial timestamptz;v_id bigint;v_budget jsonb;v_gate jsonb;
begin
 select * into v_control from public.push_pipeline_control where id=true for update;
 if p_kind is null or p_kind not in ('quote','affirmation','streak_risk','trial_reminder') or p_slot is null or p_slot not between 0 and 19
   or (p_kind in ('streak_risk','trial_reminder') and p_slot<>0) or p_user is null or p_date is null then raise exception 'invalid producer input';end if;
 if v_control.paused or (select count(*) from pgmq.q_push_jobs)>=v_control.max_queued_jobs
   or (select count(*) from public.notification_delivery_devices where state='ticket_ok')>=v_control.max_pending_receipts
   or exists(select 1 from public.notification_delivery_devices where state='ticket_ok' and sent_at<clock_timestamp()-v_control.max_receipt_age) then return null;end if;
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
