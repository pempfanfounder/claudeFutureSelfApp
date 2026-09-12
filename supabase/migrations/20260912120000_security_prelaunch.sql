-- Pre-launch security hardening (security audit, "do before launch" code items).
-- Forward-only. Requires the 20260908* S4 migrations (backend budgets).
--
--  1. delete-account: a separate `delete_account_status` budget pool for
--     receipt-only (unauthenticated) status probes, keyed per receipt. The
--     Edge Function now authenticates before charging and spends the caller's
--     own `delete_account` bucket, so anonymous traffic cannot starve real
--     deletions (audit risk #5 / fix 8).
--  2. Profile-creation cap re-keyed to per-user only: an attacker signing up
--     at 3,000/min could trip the global `profile` budget and make EVERY
--     legitimate sign-up fail inside the auth trigger. The per-IP auth rate
--     limit + CAPTCHA bound sign-ups upstream; the global window is still
--     recorded for observability but no longer enforced (audit fix 14).
--  3. Nightly cleanup of anonymous accounts that never linked an identity and
--     show no activity for `retention_days` (default 14). Conservative,
--     batch-limited, and DRY-RUN BY DEFAULT: flip
--     `update public.anonymous_cleanup_control set dry_run=false` once the
--     logged candidate counts look right (audit fix 10).
--  4. pg_cron schedules for the two existing prune functions and the cleanup
--     (audit fix 9), guarded so the migration also applies without pg_cron.

-- ---------------------------------------------------------------------------
-- 1. Receipt-keyed budget pool for unauthenticated deletion status checks.
-- ---------------------------------------------------------------------------
insert into public.backend_budget_limits(operation,per_user_per_minute,global_per_minute)
values('delete_account_status',6,120)
on conflict(operation) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Optional global enforcement per operation.
-- ---------------------------------------------------------------------------
alter table public.backend_budget_limits
  add column if not exists enforce_global boolean not null default true;

create or replace function public.consume_backend_budget(p_user uuid, p_operation text, p_units integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit public.backend_budget_limits%rowtype;
  v_window timestamptz := date_trunc('minute',clock_timestamp());
  v_global integer; v_user integer;
begin
  if p_units is null or p_units not between 1 and 16 then raise exception 'invalid budget units'; end if;
  select * into v_limit from public.backend_budget_limits where operation=p_operation for update;
  if not found then raise exception 'unknown budget operation'; end if;
  select coalesce(max(used),0) into v_global from public.backend_budget_windows
    where operation=p_operation and subject='*' and window_start=v_window;
  select coalesce(max(used),0) into v_user from public.backend_budget_windows
    where operation=p_operation and subject=p_user::text and window_start=v_window;
  if v_limit.paused
     or (v_limit.enforce_global and v_global+p_units>v_limit.global_per_minute)
     or (p_user is not null and v_user+p_units>v_limit.per_user_per_minute) then
    return jsonb_build_object('allowed',false,'retry_after_seconds',60);
  end if;
  -- The global window is always recorded so usage stays observable even when
  -- it is not enforced.
  insert into public.backend_budget_windows values(p_operation,'*',v_window,p_units)
    on conflict(operation,subject,window_start) do update set used=public.backend_budget_windows.used+excluded.used;
  if p_user is not null then
    insert into public.backend_budget_windows values(p_operation,p_user::text,v_window,p_units)
      on conflict(operation,subject,window_start) do update set used=public.backend_budget_windows.used+excluded.used;
  end if;
  return jsonb_build_object('allowed',true);
end;
$$;
revoke all on function public.consume_backend_budget(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.consume_backend_budget(uuid,text,integer) to service_role;

update public.backend_budget_limits set enforce_global=false where operation='profile';

-- ---------------------------------------------------------------------------
-- 3. Stale anonymous account cleanup.
-- ---------------------------------------------------------------------------
create table public.anonymous_cleanup_control (
  id boolean primary key default true check (id),
  dry_run boolean not null default true,
  retention_days integer not null default 14 check (retention_days between 7 and 365),
  batch_limit integer not null default 500 check (batch_limit between 1 and 5000),
  updated_at timestamptz not null default now()
);
insert into public.anonymous_cleanup_control default values;

create table public.anonymous_cleanup_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  dry_run boolean not null,
  cutoff timestamptz not null,
  candidates integer not null check (candidates >= 0),
  deleted integer not null check (deleted >= 0)
);
alter table public.anonymous_cleanup_control enable row level security;
alter table public.anonymous_cleanup_runs enable row level security;
revoke all on public.anonymous_cleanup_control, public.anonymous_cleanup_runs from public, anon, authenticated;
grant all on public.anonymous_cleanup_control, public.anonymous_cleanup_runs to service_role;

-- An account is a candidate only when EVERY signal says "abandoned guest":
--   * still anonymous, no identity, no (pending) email/phone, not soft-deleted;
--   * created and last signed in before the cutoff, no session refreshed since;
--   * never touched RevenueCat (no entitlement / reconciliation row);
--   * never completed onboarding, and no profile/personalization/device/
--     daily-set/progress/streak/favorite activity since the cutoff.
-- Deleting auth.users cascades to every public.* row via FKs.
create function public.cleanup_stale_anonymous_users(
  p_dry_run boolean default null,
  p_retention_days integer default null,
  p_batch_limit integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_control public.anonymous_cleanup_control%rowtype;
  v_dry_run boolean; v_days integer; v_limit integer;
  v_cutoff timestamptz; v_ids uuid[]; v_deleted integer := 0;
begin
  select * into v_control from public.anonymous_cleanup_control where id for update;
  if not found then raise exception 'anonymous cleanup control row missing'; end if;
  v_dry_run := coalesce(p_dry_run, v_control.dry_run);
  v_days := coalesce(p_retention_days, v_control.retention_days);
  v_limit := coalesce(p_batch_limit, v_control.batch_limit);
  if v_days not between 7 and 365 or v_limit not between 1 and 5000 then
    raise exception 'invalid cleanup parameters';
  end if;
  v_cutoff := now() - make_interval(days => v_days);
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from (
    select u.id from auth.users u
    where u.is_anonymous
      and u.deleted_at is null
      and u.created_at < v_cutoff
      and coalesce(u.last_sign_in_at, u.created_at) < v_cutoff
      and coalesce(u.email,'')='' and coalesce(u.phone,'')='' and coalesce(u.email_change,'')=''
      and not exists (select 1 from auth.identities i where i.user_id=u.id)
      and not exists (select 1 from auth.sessions s where s.user_id=u.id
                        and coalesce(s.refreshed_at, s.updated_at, s.created_at) >= v_cutoff)
      and not exists (select 1 from public.entitlements e where e.user_id=u.id)
      and not exists (select 1 from public.entitlement_reconciliation r where r.user_id=u.id)
      and not exists (select 1 from public.personalization p where p.user_id=u.id
                        and (p.onboarding_completed_at is not null or p.updated_at >= v_cutoff))
      and not exists (select 1 from public.profiles pr where pr.id=u.id and pr.updated_at >= v_cutoff)
      and not exists (select 1 from public.devices d where d.user_id=u.id
                        and greatest(d.last_seen_at, d.updated_at) >= v_cutoff)
      and not exists (select 1 from public.daily_sets ds where ds.user_id=u.id and ds.local_date >= v_cutoff::date)
      and not exists (select 1 from public.daily_progress dp where dp.user_id=u.id and dp.local_date >= v_cutoff::date)
      and not exists (select 1 from public.streaks st where st.user_id=u.id
                        and (st.last_completed_date >= v_cutoff::date or st.updated_at >= v_cutoff))
      and not exists (select 1 from public.favorites f where f.user_id=u.id and f.created_at >= v_cutoff)
    order by u.created_at
    limit v_limit
  ) candidates;
  if not v_dry_run and cardinality(v_ids) > 0 then
    delete from auth.users where id = any(v_ids) and is_anonymous;
    get diagnostics v_deleted = row_count;
  end if;
  insert into public.anonymous_cleanup_runs(dry_run,cutoff,candidates,deleted)
    values(v_dry_run,v_cutoff,cardinality(v_ids),v_deleted);
  delete from public.anonymous_cleanup_runs where ran_at < now() - interval '90 days';
  return jsonb_build_object(
    'dry_run', v_dry_run, 'retention_days', v_days, 'batch_limit', v_limit,
    'cutoff', v_cutoff, 'candidates', cardinality(v_ids), 'deleted', v_deleted);
end;
$$;
revoke all on function public.cleanup_stale_anonymous_users(boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.cleanup_stale_anonymous_users(boolean,integer,integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Schedules (guarded: the migration still applies without pg_cron).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('fs-anon-cleanup','fs-prune-budget','fs-prune-deletion-receipts');
    perform cron.schedule('fs-anon-cleanup','11 4 * * *',
      $job$select public.cleanup_stale_anonymous_users();$job$);
    perform cron.schedule('fs-prune-budget','17 * * * *',
      $job$select public.prune_backend_budget_windows();$job$);
    perform cron.schedule('fs-prune-deletion-receipts','23 3 * * *',
      $job$select public.prune_account_deletion_receipts();$job$);
  else
    raise notice 'pg_cron is not installed: schedule fs-anon-cleanup, fs-prune-budget and fs-prune-deletion-receipts manually';
  end if;
end $$;
