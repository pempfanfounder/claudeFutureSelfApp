-- Owner 2026-09-15: deactivate two gendered dating lines; rewrite three
-- male-coded lines to unisex. Rows are kept so favorites / deliveries /
-- daily_progress keep their FKs. Production was updated the same day via
-- the API; this file keeps new environments in sync.

update public.content_items
set active = false
where type = 'quote'
  and body in (
    'No revenge because I''ll be the most successful guy she''s ever talked to.',
    'She better cook like her mom, cuz I definitely make more money than her dad.'
  );

update public.content_items
set body = 'A person that doesn''t keep their word is no person at all.'
where type = 'quote'
  and body = 'A man that doesn''t keep his word is no man at all.';

update public.content_items
set body = 'Don''t be the 35 year old wondering what they even did with their 20s.'
where type = 'quote'
  and body = 'Don''t be the 35 year old man wondering what he even did with his 20s.';

update public.content_items
set body = 'There are people who had nothing last year - they took action, and now they are running empires.'
where type = 'quote'
  and body = 'There are men who had nothing last year - they took action, and now they are running empires.';
