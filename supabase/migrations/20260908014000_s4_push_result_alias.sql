-- S5-RB06: disambiguate the replay relation from the PL/pgSQL row variable.
-- Preserve applied migration history and every existing function contract.
create or replace function public.finish_push_send(p_delivery_id uuid,p_lease_token uuid,p_results jsonb) returns jsonb
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
 if exists(select 1 from jsonb_array_elements(p_results) x join public.notification_delivery_devices ledger_attempt on ledger_attempt.id=(x->>'attempt_id')::uuid
   where ledger_attempt.state<>'sending' and ledger_attempt.send_result is distinct from x) then return jsonb_build_object('outcome','superseded'); end if;
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
