-- Future Self: core schema
-- profiles, personalization, content, favorites, daily sets, progress, streaks

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (anonymous users included)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  locale text check (char_length(locale) <= 16),
  install_id text check (char_length(install_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- personalization: normalized onboarding model (one row per user)
-- Free-text fields (life_goal) live ONLY here — never in analytics.
-- ---------------------------------------------------------------------------
create table public.personalization (
  user_id uuid primary key references auth.users (id) on delete cascade,
  variant text check (variant in ('iam-founder','iam-claude','stella-founder','stella-claude')),
  primary_goals text[] not null default '{}',
  obstacles text[] not null default '{}',
  motivation_level text,
  future_traits text[] not null default '{}',
  quote_interests text[] not null default '{}',
  affirmation_interests text[] not null default '{}',
  gender text,
  life_goal text check (char_length(life_goal) <= 280),
  raw_answers jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_answers_size check (pg_column_size(raw_answers) <= 16384)
);

alter table public.personalization enable row level security;

create policy "personalization_select_own" on public.personalization
  for select using ((select auth.uid()) = user_id);
create policy "personalization_insert_own" on public.personalization
  for insert with check ((select auth.uid()) = user_id);
create policy "personalization_update_own" on public.personalization
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger personalization_updated_at
  before update on public.personalization
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- content_items: quotes and affirmations
-- Managed via dashboard/service role; clients read active items only.
-- ---------------------------------------------------------------------------
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('quote','affirmation')),
  body text not null check (char_length(body) between 1 and 400),
  author text check (char_length(author) <= 120),
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  active boolean not null default true,
  notification_eligible boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_items_type_active_idx on public.content_items (type, active);
create index content_items_categories_idx on public.content_items using gin (categories);
create index content_items_tags_idx on public.content_items using gin (tags);

alter table public.content_items enable row level security;

-- Clients may read active content only. No client writes.
create policy "content_select_active" on public.content_items
  for select using (active and (select auth.uid()) is not null);

create trigger content_items_updated_at
  before update on public.content_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null references public.content_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create index favorites_user_created_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

create policy "favorites_select_own" on public.favorites
  for select using ((select auth.uid()) = user_id);
create policy "favorites_insert_own" on public.favorites
  for insert with check ((select auth.uid()) = user_id);
create policy "favorites_delete_own" on public.favorites
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- daily_sets: the stable per-user daily selection (max 10 per type)
-- ---------------------------------------------------------------------------
create table public.daily_sets (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  type text not null check (type in ('quote','affirmation')),
  content_ids uuid[] not null check (array_length(content_ids, 1) <= 10),
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, type)
);

alter table public.daily_sets enable row level security;

create policy "daily_sets_select_own" on public.daily_sets
  for select using ((select auth.uid()) = user_id);
create policy "daily_sets_insert_own" on public.daily_sets
  for insert with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- daily_progress: unique item views per local day (streak input)
-- ---------------------------------------------------------------------------
create table public.daily_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  content_id uuid not null references public.content_items (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, local_date, content_id)
);

create index daily_progress_user_date_idx on public.daily_progress (user_id, local_date);

alter table public.daily_progress enable row level security;

create policy "daily_progress_select_own" on public.daily_progress
  for select using ((select auth.uid()) = user_id);
create policy "daily_progress_insert_own" on public.daily_progress
  for insert with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- streaks: combined daily streak (any 3 unique items per local day)
-- ---------------------------------------------------------------------------
create table public.streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_completed_date date,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "streaks_select_own" on public.streaks
  for select using ((select auth.uid()) = user_id);

create table public.streak_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.streak_completions enable row level security;

create policy "streak_completions_select_own" on public.streak_completions
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- record_view: idempotent streak write.
-- Inserts the view, and when 3 unique items have been viewed on the
-- user's local day, records the completion and advances the streak.
-- Re-running with the same inputs never double-counts.
-- ---------------------------------------------------------------------------
create or replace function public.record_view(p_content_id uuid, p_local_date date)
returns table (
  viewed_today int,
  completed_today boolean,
  current_streak int,
  longest_streak int
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_server_local date;
  v_count int;
  v_completed boolean := false;
  v_prev_completed date;
  v_current int := 0;
  v_longest int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- The client supplies its local date; accept it only if it is within
  -- one day of the server's view of that user's local date.
  select p.timezone into v_tz from public.profiles p where p.id = v_user;
  v_server_local := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if p_local_date is null or abs(p_local_date - v_server_local) > 1 then
    p_local_date := v_server_local;
  end if;

  insert into public.daily_progress (user_id, local_date, content_id)
  values (v_user, p_local_date, p_content_id)
  on conflict do nothing;

  select count(*) into v_count
  from public.daily_progress dp
  where dp.user_id = v_user and dp.local_date = p_local_date;

  if v_count >= 3 then
    insert into public.streak_completions (user_id, local_date)
    values (v_user, p_local_date)
    on conflict do nothing;

    if found then
      -- First completion for this local day: advance the streak.
      select s.last_completed_date, s.current_streak, s.longest_streak
        into v_prev_completed, v_current, v_longest
      from public.streaks s where s.user_id = v_user;

      if v_prev_completed is null then
        v_current := 1;
      elsif v_prev_completed = p_local_date - 1 then
        v_current := v_current + 1;
      elsif v_prev_completed >= p_local_date then
        -- Completion already recorded for today or later (timezone
        -- shifts): keep the streak unchanged.
        v_current := greatest(v_current, 1);
      else
        v_current := 1;
      end if;

      v_longest := greatest(coalesce(v_longest, 0), v_current);

      insert into public.streaks (user_id, current_streak, longest_streak, last_completed_date)
      values (v_user, v_current, v_longest, greatest(p_local_date, coalesce(v_prev_completed, p_local_date)))
      on conflict (user_id) do update
        set current_streak = excluded.current_streak,
            longest_streak = excluded.longest_streak,
            last_completed_date = excluded.last_completed_date,
            updated_at = now();
    end if;
  end if;

  select exists (
    select 1 from public.streak_completions sc
    where sc.user_id = v_user and sc.local_date = p_local_date
  ) into v_completed;

  select coalesce(s.current_streak, 0), coalesce(s.longest_streak, 0)
    into v_current, v_longest
  from public.streaks s where s.user_id = v_user;

  return query select v_count, v_completed, coalesce(v_current, 0), coalesce(v_longest, 0);
end;
$$;

revoke all on function public.record_view(uuid, date) from public;
grant execute on function public.record_view(uuid, date) to authenticated;
