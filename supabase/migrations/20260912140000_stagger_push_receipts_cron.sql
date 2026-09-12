-- Stagger fs-push-receipts off the minute boundary.
--
-- push-receipts (every 5 min) and push-dispatch (every minute) used to fire in
-- the same second. When the receipts isolate cold-booted alongside dispatch,
-- dispatch's first PostgREST call could stall past its RPC deadline and return
-- 503 "queue unavailable" for that minute. Running receipts at :02, :07, :12, …
-- keeps both jobs on their existing cadence but never in the same minute.
--
-- cron.schedule upserts by job name, so this replaces the job in place.
select cron.schedule('fs-push-receipts', '2-59/5 * * * *',
  $$select public.invoke_push_function('push-receipts');$$);
