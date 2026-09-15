-- Deactivate owner #30 (gendered dating line) without deleting the row.
-- Favorites, notification_deliveries, and daily_progress keep their FKs.
-- Production was updated 2026-09-15 via the same body match; this file
-- keeps new environments from re-seeding the line as active.

update public.content_items
set active = false
where type = 'quote'
  and body = 'Why be worried about a girl when there''s kids your age doing 100k months?';
