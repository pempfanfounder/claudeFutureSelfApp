-- Future Self: notifications v2
-- pgmq wrapper RPCs for the edge dispatcher, dispatch-time content picker,
-- trial-ending reminders, and entitlement period tracking.

-- ---------------------------------------------------------------------------
-- entitlements: track the RevenueCat period type ('trial'|'intro'|'normal',
-- stored lowercase) so the trial-reminder pass can find converting trials.
-- ---------------------------------------------------------------------------
alter table public.entitlements
  add column if not exists period_type text;

alter table public.notification_prefs
  add column if not exists trial_reminder boolean not null default true;

-- Partial index for the hourly trial-reminder scan.
create index if not exists entitlements_trial_expiry_idx
  on public.entitlements (expires_at)
  where is_premium and period_type = 'trial';

-- ---------------------------------------------------------------------------
-- Allow 'trial_reminder' deliveries (drop + re-add the kind check).
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_kind_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_kind_check
  check (kind in ('quote','affirmation','streak_risk','trial_reminder'));

-- ---------------------------------------------------------------------------
-- pgmq wrappers: PostgREST cannot call pgmq.* directly, so the push-dispatch
-- edge function consumes the queue through these service-role-only RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.queue_read(n int, vt int)
returns setof pgmq.message_record
language sql
security definer set search_path = ''
as $$
  select * from pgmq.read('push_jobs', vt, n);
$$;

revoke all on function public.queue_read(int, int) from public, anon, authenticated;
grant execute on function public.queue_read(int, int) to service_role;

create or replace function public.queue_delete(msg_id bigint)
returns boolean
language sql
security definer set search_path = ''
as $$
  select pgmq.delete('push_jobs', msg_id);
$$;

revoke all on function public.queue_delete(bigint) from public, anon, authenticated;
grant execute on function public.queue_delete(bigint) to service_role;

create or replace function public.queue_archive(msg_id bigint)
returns boolean
language sql
security definer set search_path = ''
as $$
  select pgmq.archive('push_jobs', msg_id);
$$;

revoke all on function public.queue_archive(bigint) from public, anon, authenticated;
grant execute on function public.queue_archive(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Dispatch-time content picker. Scores category/tag overlap with the user's
-- interests, then priority, then random tiebreak. p_exclude_days <= 0
-- disables the recently-sent exclusion (the dispatcher's fallback when every
-- eligible item went out within the window).
-- ---------------------------------------------------------------------------
create or replace function public.pick_notification_content(
  p_user uuid,
  p_kind text,
  p_interests text[],
  p_exclude_days int default 14
) returns table (content_id uuid, body text, author text)
language sql
security definer set search_path = ''
as $$
  select ci.id, ci.body, ci.author
  from public.content_items ci
  where ci.type = p_kind
    and ci.active
    and ci.notification_eligible
    and char_length(ci.body) <= 178
    and (
      p_exclude_days <= 0
      or not exists (
        select 1
        from public.notification_deliveries nd
        where nd.user_id = p_user
          and nd.content_id = ci.id
          and nd.created_at > now() - make_interval(days => p_exclude_days)
      )
    )
  order by
    (case when ci.categories && coalesce(p_interests, '{}') then 2 else 0 end
     + case when ci.tags && coalesce(p_interests, '{}') then 1 else 0 end) desc,
    ci.priority desc,
    random()
  limit 1;
$$;

revoke all on function public.pick_notification_content(uuid, text, text[], int)
  from public, anon, authenticated;
grant execute on function public.pick_notification_content(uuid, text, text[], int)
  to service_role;

-- ---------------------------------------------------------------------------
-- Trial-ending reminders: entitled users whose trial converts in 12-36 hours,
-- pref enabled, with an active granted device. One pgmq job per user; the
-- dispatcher enforces the idempotency key user:local_date:trial_reminder:0.
-- The 48-hour delivery lookback here prevents both hourly re-enqueues and a
-- second send when the user's local date rolls over inside the 24h window.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_trial_reminders(p_batch int default 200)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_local_date date;
begin
  for r in
    select e.user_id, coalesce(p.timezone, 'UTC') as tz
    from public.entitlements e
    join public.profiles p on p.id = e.user_id
    join public.notification_prefs np
      on np.user_id = e.user_id and np.trial_reminder
    where e.is_premium
      and e.period_type = 'trial'
      and e.expires_at between now() + interval '12 hours'
                           and now() + interval '36 hours'
      and exists (
        select 1 from public.devices d
        where d.user_id = e.user_id and d.active
          and d.push_token is not null
          and d.permission_status = 'granted'
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
      v_local_date := (now() at time zone r.tz)::date;
    exception when others then
      v_local_date := (now() at time zone 'UTC')::date;
    end;

    perform pgmq.send(
      'push_jobs',
      jsonb_build_object(
        'user_id', r.user_id,
        'kind', 'trial_reminder',
        'local_date', v_local_date,
        'slot', 0
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_trial_reminders(int) from public, anon, authenticated;
grant execute on function public.enqueue_trial_reminders(int) to service_role;

select cron.schedule('fs-trial-reminders', '30 * * * *',
  $$select public.enqueue_trial_reminders(200);$$);
