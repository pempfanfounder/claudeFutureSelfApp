-- Future Self: security hardening + raised notification caps.
-- Reconstructed from production supabase_migrations.schema_migrations
-- (version 20260815145751) — this migration is ALREADY APPLIED in production.

revoke all on function public.invoke_push_function(text) from public, anon, authenticated;
revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.recalc_notification_state(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_due_notifications(int) to service_role;
grant execute on function public.recalc_notification_state(uuid) to service_role;

revoke all on function public.register_device(text, text, text, text, text, text, text) from anon;
revoke all on function public.deactivate_device(text) from anon;
revoke all on function public.record_view(uuid, date) from anon;
revoke all on function public.recalc_my_notification_state() from anon;

alter function public.set_updated_at() set search_path = '';
alter function public.compute_next_due(
  p_tz text, p_window_start integer, p_window_end integer,
  p_quiet_start integer, p_quiet_end integer,
  p_total_per_day integer, p_sent_today integer,
  p_local_now timestamp without time zone
) set search_path = '';

alter table public.notification_prefs
  drop constraint if exists notification_prefs_quotes_per_day_check;
alter table public.notification_prefs
  add constraint notification_prefs_quotes_per_day_check
    check (quotes_per_day between 0 and 20);
alter table public.notification_prefs
  drop constraint if exists notification_prefs_affirmations_per_day_check;
alter table public.notification_prefs
  add constraint notification_prefs_affirmations_per_day_check
    check (affirmations_per_day between 0 and 20);
