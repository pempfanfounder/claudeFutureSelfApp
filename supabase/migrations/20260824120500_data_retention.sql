-- Future Self: bounded retention.
-- Nothing purged these tables, so they grew monotonically: roughly
-- 30-50 GB/year at 100k DAU. Deletes run in bounded batches so no single
-- statement holds a long lock.
--
-- public.streaks is deliberately NOT purged: current_streak and
-- longest_streak are derived state that must survive the purge window.

create or replace function public.purge_old_data(
  p_days int default 90,
  p_batch int default 5000,
  p_max_loops int default 200
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_cutoff_date date := (now() at time zone 'UTC')::date - p_days;
  v_cutoff_ts timestamptz := now() - make_interval(days => p_days);
  v_deleted bigint;
  v_sum bigint;
  v_loops int;
  v_result jsonb := '{}'::jsonb;
begin
  if p_days < 1 then
    raise exception 'purge_old_data: p_days must be >= 1 (got %)', p_days;
  end if;

  -- daily_progress
  v_sum := 0; v_loops := 0;
  loop
    delete from public.daily_progress
    where ctid in (
      select ctid from public.daily_progress
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('daily_progress', v_sum);

  -- daily_sets
  v_sum := 0; v_loops := 0;
  loop
    delete from public.daily_sets
    where ctid in (
      select ctid from public.daily_sets
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('daily_sets', v_sum);

  -- streak_completions (the streaks table itself is never purged)
  v_sum := 0; v_loops := 0;
  loop
    delete from public.streak_completions
    where ctid in (
      select ctid from public.streak_completions
      where local_date < v_cutoff_date
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('streak_completions', v_sum);

  -- notification_deliveries
  v_sum := 0; v_loops := 0;
  loop
    delete from public.notification_deliveries
    where ctid in (
      select ctid from public.notification_deliveries
      where created_at < v_cutoff_ts
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('notification_deliveries', v_sum);

  -- pgmq archive
  v_sum := 0; v_loops := 0;
  loop
    delete from pgmq.a_push_jobs
    where ctid in (
      select ctid from pgmq.a_push_jobs
      where archived_at < v_cutoff_ts
      limit p_batch
    );
    get diagnostics v_deleted = row_count;
    v_sum := v_sum + v_deleted;
    v_loops := v_loops + 1;
    exit when v_deleted = 0 or v_loops >= p_max_loops;
  end loop;
  v_result := v_result || jsonb_build_object('pgmq_archive', v_sum);

  return v_result;
end;
$$;

revoke all on function public.purge_old_data(int, int, int) from public, anon, authenticated;
grant execute on function public.purge_old_data(int, int, int) to service_role;

select cron.schedule('fs-purge-old-data', '15 3 * * *',
  $$select public.purge_old_data(90, 5000);$$);
