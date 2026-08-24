-- Integration test for the 100k capacity changes.
-- Seeds synthetic users, runs the real enqueue functions, asserts, cleans up.
-- Safe to re-run: every row it creates is namespaced by the
-- 'capacity-test-' prefix and deleted on both the success and failure paths.
--
-- Run with: MCP execute_sql, or psql -f. Raises an exception on any failure.

do $$
declare
  v_premium uuid := gen_random_uuid();
  v_free    uuid := gen_random_uuid();
  v_content uuid;
  v_enqueued int;
  v_premium_next timestamptz;
  v_free_next timestamptz;
  v_q_before bigint;
  v_q_after bigint;
begin
  select id into v_content from public.content_items where type = 'quote' and active limit 1;
  if v_content is null then
    raise exception 'no active quote content to test with';
  end if;

  select count(*) into v_q_before from pgmq.q_push_jobs;

  -- --- seed two auth users -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_premium, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'capacity-test-premium@example.invalid', now(), now()),
    (v_free, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'capacity-test-free@example.invalid', now(), now());

  -- handle_new_user() creates profiles rows automatically; set timezone.
  update public.profiles set timezone = 'UTC' where id in (v_premium, v_free);

  -- both users have a granted device
  insert into public.devices (user_id, install_id, push_token, platform, permission_status, timezone)
  values
    (v_premium, 'capacity-test-premium', 'ExponentPushToken[capacity-test-premium]', 'ios', 'granted', 'UTC'),
    (v_free,    'capacity-test-free',    'ExponentPushToken[capacity-test-free]',    'ios', 'granted', 'UTC');

  -- only one of them pays
  insert into public.entitlements (user_id, is_premium, source, expires_at)
  values (v_premium, true, 'capacity-test', now() + interval '30 days');

  -- --- assertion 1: the entitlement gate ----------------------------------
  perform public.recalc_notification_state(v_premium);
  perform public.recalc_notification_state(v_free);

  select next_due_at into v_premium_next from public.notification_state where user_id = v_premium;
  select next_due_at into v_free_next    from public.notification_state where user_id = v_free;

  if v_premium_next is null then
    raise exception 'FAIL: premium user was not armed (next_due_at is null)';
  end if;
  if v_free_next is not null then
    raise exception 'FAIL: free user was armed (next_due_at = %) - entitlement gate not working', v_free_next;
  end if;
  raise notice 'PASS: entitlement gate - premium armed at %, free user excluded', v_premium_next;

  -- --- assertion 2: a due premium user enqueues exactly one job -----------
  update public.notification_state set next_due_at = now() - interval '1 minute'
    where user_id = v_premium;

  select public.enqueue_due_notifications(1000) into v_enqueued;

  if v_enqueued < 1 then
    raise exception 'FAIL: enqueue_due_notifications returned %, expected >= 1', v_enqueued;
  end if;

  select count(*) into v_q_after from pgmq.q_push_jobs;
  if v_q_after <= v_q_before then
    raise exception 'FAIL: queue depth did not grow (% -> %)', v_q_before, v_q_after;
  end if;
  raise notice 'PASS: enqueue produced % job(s), queue depth % -> %', v_enqueued, v_q_before, v_q_after;

  -- --- assertion 3: the free user never entered the queue ------------------
  if exists (
    select 1 from pgmq.q_push_jobs
    where (message->>'user_id')::uuid = v_free
  ) then
    raise exception 'FAIL: free user has a queued push job';
  end if;
  raise notice 'PASS: free user produced no queue jobs';

  -- --- assertion 4: counters advanced -------------------------------------
  if (select quotes_sent + affirmations_sent from public.notification_state where user_id = v_premium) < 1 then
    raise exception 'FAIL: send counter did not advance for premium user';
  end if;
  raise notice 'PASS: send counter advanced';

  -- --- assertion 5: streak-risk function runs standalone -------------------
  perform public.enqueue_streak_risk(500);
  raise notice 'PASS: enqueue_streak_risk executed without error';

  -- --- cleanup -------------------------------------------------------------
  delete from pgmq.q_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from pgmq.a_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from auth.users where id in (v_premium, v_free);

  raise notice 'ALL ASSERTIONS PASSED - synthetic users removed';

exception when others then
  -- always clean up, then re-raise so the failure is visible
  delete from pgmq.q_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from pgmq.a_push_jobs where (message->>'user_id')::uuid in (v_premium, v_free);
  delete from auth.users where id in (v_premium, v_free);
  raise;
end $$;
