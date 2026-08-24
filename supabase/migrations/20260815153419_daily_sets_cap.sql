-- Future Self: raise the per-day content set cap from 10 to 20.
-- Reconstructed from production supabase_migrations.schema_migrations
-- (version 20260815153419) — this migration is ALREADY APPLIED in production.

alter table public.daily_sets
  drop constraint if exists daily_sets_content_ids_check;
alter table public.daily_sets
  add constraint daily_sets_content_ids_check
    check (array_length(content_ids, 1) <= 20);
