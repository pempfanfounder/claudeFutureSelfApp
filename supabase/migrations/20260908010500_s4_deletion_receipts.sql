-- S4 local draft: durable deletion outcomes; deliberately no FK to auth.users.
-- No application/deployment has run. Seven-day operational receipt retention
-- requires owner/privacy/target review before deployment; no cron is installed.
create table public.account_deletion_receipts (
  nonce_hash text primary key check(nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  confirmed_at timestamptz,
  check(expires_at > created_at)
);
create index account_deletion_receipts_expiry on public.account_deletion_receipts(expires_at);
alter table public.account_deletion_receipts enable row level security;
revoke all on public.account_deletion_receipts from public,anon,authenticated;
grant all on public.account_deletion_receipts to service_role;
insert into public.backend_budget_limits(operation,per_user_per_minute,global_per_minute)
values('delete_account',6,120);
create function public.prune_account_deletion_receipts() returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with expired as (select nonce_hash from public.account_deletion_receipts where expires_at < now() order by expires_at limit 100 for update skip locked),
  removed as (delete from public.account_deletion_receipts r using expired e where r.nonce_hash=e.nonce_hash returning 1)
  select count(*) into v_count from removed;
  return v_count;
end;
$$;
revoke all on function public.prune_account_deletion_receipts() from public,anon,authenticated;
grant execute on function public.prune_account_deletion_receipts() to service_role;
