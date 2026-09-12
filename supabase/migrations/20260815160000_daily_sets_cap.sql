-- Companion to 20260815120000_security_grants_and_caps.sql (review
-- finding): DAILY_LIMIT rose 10 → 20, but daily_sets still capped its
-- content_ids array at 10, so every 20-item daily-set insert failed
-- silently (swallowed by the concurrent-race re-read), breaking the
-- "stored row wins, the set never changes mid-day" invariant and the
-- yesterday-exclusion feature.
alter table public.daily_sets
  drop constraint if exists daily_sets_content_ids_check;
alter table public.daily_sets
  add constraint daily_sets_content_ids_check
    check (array_length(content_ids, 1) <= 20);
