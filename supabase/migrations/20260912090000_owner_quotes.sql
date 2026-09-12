-- Replace the launch quote library with the owner's official quote list.
-- Source of truth: src/features/content/ownerQuotes.ts (documented in
-- docs/OWNER_QUOTE_LIST.md). Generated from that module; a jest test keeps
-- this file, the module, the local catalog and the doc in sync.
--
-- Affirmations are untouched. Existing quotes are deactivated rather than
-- deleted so favorites, notification_deliveries and daily_progress rows keep
-- their references; clients only ever read active rows.
--
-- Owner's #54 was removed by the owner as a near-duplicate of #65.
-- Owner's #10 was truncated in the original source; the owner supplied the full line.
-- Categories are editorial assignments for personalization weighting.

update public.content_items
set active = false
where type = 'quote' and active;

INSERT INTO public.content_items (type, body, author, categories, tags, priority, notification_eligible) VALUES
-- #1
('quote', 'If you don''t sacrifice for the life you want, the life you want will become the sacrifice.', NULL, ARRAY['discipline','ambition']::text[], '{}'::text[], 0, true),
-- #2
('quote', 'Until death, all defeat is psychological.', NULL, ARRAY['resilience','stoic-calm']::text[], '{}'::text[], 0, true),
-- #3
('quote', 'We suffer more in imagination than in reality.', NULL, ARRAY['stoic-calm']::text[], '{}'::text[], 0, true),
-- #4
('quote', 'Don''t fall into the trap of analysis paralysis.', NULL, ARRAY['focus','courage']::text[], '{}'::text[], 0, true),
-- #5
('quote', 'A winner is just a loser who tried one more time.', NULL, ARRAY['resilience']::text[], '{}'::text[], 0, true),
-- #6
('quote', 'If you don''t have that story of pain, then you don''t have a story at all.', NULL, ARRAY['resilience']::text[], '{}'::text[], 0, true),
-- #7
('quote', 'Are you gonna let the opportunity pass by, or are you gonna give it all you can?', NULL, ARRAY['courage','ambition']::text[], '{}'::text[], 0, true),
-- #8
('quote', 'What a privilege it is to be exhausted from work that you used to pray for.', NULL, ARRAY['gratitude']::text[], '{}'::text[], 0, true),
-- #9
('quote', 'Success is a decision.', NULL, ARRAY['ambition','discipline']::text[], '{}'::text[], 0, true),
-- #10
('quote', 'The graveyard is full of people who thought they had more time.', NULL, ARRAY['discipline','courage']::text[], '{}'::text[], 0, true),
-- #11
('quote', 'Every day your window of opportunity gets smaller and smaller …', NULL, ARRAY['ambition','focus']::text[], '{}'::text[], 0, true),
-- #12
('quote', 'People who bring you down are by definition below you.', NULL, ARRAY['stoic-calm','resilience']::text[], '{}'::text[], 0, true),
-- #13
('quote', 'A man that doesn''t keep his word is no man at all.', NULL, ARRAY['discipline']::text[], '{}'::text[], 0, true),
-- #14
('quote', 'No revenge because I''ll be the most successful guy she''s ever talked to.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #15
('quote', 'Never let less successful people tell you what your limit is.', NULL, ARRAY['ambition','courage']::text[], '{}'::text[], 0, true),
-- #16
('quote', 'We can stay here, or we can go up.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #17
('quote', 'In another life? No bro, this one. Get after it.', NULL, ARRAY['courage','ambition']::text[], '{}'::text[], 0, true),
-- #18
('quote', 'If you don''t master your time, someone else will.', NULL, ARRAY['discipline','focus']::text[], '{}'::text[], 0, true),
-- #19
('quote', 'Time doesn''t care who wastes it, it just moves on.', NULL, ARRAY['discipline','focus']::text[], '{}'::text[], 0, true),
-- #20
('quote', 'Don''t be the 35 year old man wondering what he even did with his 20s.', NULL, ARRAY['ambition','discipline']::text[], '{}'::text[], 0, true),
-- #21
('quote', 'Give something your all.', NULL, ARRAY['discipline']::text[], '{}'::text[], 0, true),
-- #22
('quote', 'The world is yours.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #23
('quote', 'You can''t have a top tier life without a top tier mindset.', NULL, ARRAY['ambition','discipline']::text[], '{}'::text[], 0, true),
-- #24
('quote', 'Do it for the scared kid.', NULL, ARRAY['courage','resilience']::text[], '{}'::text[], 0, true),
-- #25
('quote', 'Do it for the kid who felt alone, unheard, and forgotten.', NULL, ARRAY['resilience','kindness']::text[], '{}'::text[], 0, true),
-- #26
('quote', 'Do it for the kid who doubted himself every single day.', NULL, ARRAY['resilience','courage']::text[], '{}'::text[], 0, true),
-- #27
('quote', 'Do it for the kid who needed someone to believe in him.', NULL, ARRAY['courage','resilience']::text[], '{}'::text[], 0, true),
-- #28
('quote', 'It''s not over until I win.', NULL, ARRAY['resilience']::text[], '{}'::text[], 0, true),
-- #29
('quote', 'You are gonna win in the end.', NULL, ARRAY['resilience','courage']::text[], '{}'::text[], 0, true),
-- #30
('quote', 'Why be worried about a girl when there''s kids your age doing 100k months?', NULL, ARRAY['focus','ambition']::text[], '{}'::text[], 0, true),
-- #31
('quote', 'There are men who had nothing last year - they took action, and now they are running empires.', NULL, ARRAY['ambition','courage']::text[], '{}'::text[], 0, true),
-- #32
('quote', 'There will come a day when your body can''t keep up with your ambition, and on that day, you''ll pray for just one more chance to go all in.', NULL, ARRAY['ambition','discipline']::text[], '{}'::text[], 0, true),
-- #33
('quote', 'One moment of savage clarity can change your entire life onward.', NULL, ARRAY['focus','courage']::text[], '{}'::text[], 0, true),
-- #34
('quote', 'You don''t have time.', NULL, ARRAY['discipline','focus']::text[], '{}'::text[], 0, true),
-- #35
('quote', 'You survived days you never thought you''d make it through. The strength you are looking for is already inside you.', NULL, ARRAY['resilience','courage']::text[], '{}'::text[], 0, true),
-- #36
('quote', 'Everything you think you own, you''ll lose one day. Everything is temporary. Embrace it, it''s liberating.', NULL, ARRAY['stoic-calm','gratitude']::text[], '{}'::text[], 0, true),
-- #37
('quote', 'Dad''s getting older, mom''s getting tired. It''s now or never.', NULL, ARRAY['ambition','gratitude']::text[], '{}'::text[], 0, true),
-- #38
('quote', 'And when you see me with everything I''ve ever wanted, just know I probably worked harder than you.', NULL, ARRAY['discipline','ambition']::text[], '{}'::text[], 0, true),
-- #39
('quote', 'God gave you that dream for a reason.', NULL, ARRAY['courage','ambition']::text[], '{}'::text[], 0, true),
-- #40
('quote', 'It''s 2030, south of France, and you just made 8.7 million last month.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #41
('quote', 'I thought you wanted this.', NULL, ARRAY['discipline']::text[], '{}'::text[], 0, true),
-- #42
('quote', 'Pick yourself up, and get back to work.', NULL, ARRAY['resilience','discipline']::text[], '{}'::text[], 0, true),
-- #43
('quote', 'Remember who you are.', NULL, ARRAY['courage','focus']::text[], '{}'::text[], 0, true),
-- #44
('quote', 'When someone teaches you how to fish, you don''t fish in their pond.', NULL, ARRAY['kindness']::text[], '{}'::text[], 0, true),
-- #45
('quote', 'Chase happiness and you''ll end up on the dopamine treadmill. Chase being proud of yourself and you''ll end up happy.', NULL, ARRAY['focus','discipline']::text[], '{}'::text[], 0, true),
-- #46
('quote', 'Success is the ultimate revenge.', NULL, ARRAY['ambition','resilience']::text[], '{}'::text[], 0, true),
-- #47
('quote', 'Some wake up at 25, some at 16. Most? They never wake up.', NULL, ARRAY['focus','ambition']::text[], '{}'::text[], 0, true),
-- #48
('quote', '"Maybe in another life." No, you only have this one. Make it happen.', NULL, ARRAY['courage','ambition']::text[], '{}'::text[], 0, true),
-- #49
('quote', 'She better cook like her mom, cuz I definitely make more money than her dad.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #50
('quote', 'I just want to make my people proud.', NULL, ARRAY['gratitude','kindness']::text[], '{}'::text[], 0, true),
-- #51
('quote', 'If no one believes in you, believe in yourself.', NULL, ARRAY['courage','resilience']::text[], '{}'::text[], 0, true),
-- #52
('quote', 'Don''t wish for it, work for it.', NULL, ARRAY['discipline']::text[], '{}'::text[], 0, true),
-- #53
('quote', 'Bro, I am counting on you.', NULL, ARRAY['kindness','discipline']::text[], '{}'::text[], 0, true),
-- #55
('quote', 'If I play, I play to win.', NULL, ARRAY['ambition','courage']::text[], '{}'::text[], 0, true),
-- #56
('quote', 'Do it because they said you couldn''t.', NULL, ARRAY['courage','resilience']::text[], '{}'::text[], 0, true),
-- #57
('quote', 'Comfort will deter you from your goal. Don''t be stuck in comfort.', NULL, ARRAY['discipline']::text[], '{}'::text[], 0, true),
-- #58
('quote', 'Chase something bigger.', NULL, ARRAY['ambition']::text[], '{}'::text[], 0, true),
-- #59
('quote', 'Simply refuse to end on a loss. One day you will win.', NULL, ARRAY['resilience']::text[], '{}'::text[], 0, true),
-- #60
('quote', 'Regret exists because time is limited. Regret is a product of scarcity. Scarcity of time.', NULL, ARRAY['stoic-calm','focus']::text[], '{}'::text[], 0, true),
-- #61
('quote', 'You have to want it more than your fear wants you to stop.', NULL, ARRAY['courage']::text[], '{}'::text[], 0, true),
-- #62
('quote', 'The graveyards are full of men who swore they''d start tomorrow.', NULL, ARRAY['discipline','courage']::text[], '{}'::text[], 0, true),
-- #63
('quote', 'The saddest thing in life is laying on your death bed realizing you still had more gas left in the tank.', NULL, ARRAY['ambition','resilience']::text[], '{}'::text[], 0, true),
-- #64
('quote', 'Try to constantly be in rooms you don''t deserve to be in.', NULL, ARRAY['courage','ambition']::text[], '{}'::text[], 0, true),
-- #65
('quote', 'While you are overthinking, someone less intelligent than you is becoming successful just by trying.', NULL, ARRAY['courage','focus']::text[], '{}'::text[], 0, true),
-- #66
('quote', 'You gotta be more afraid of wasting your life than being embarrassed of what other people think of you.', NULL, ARRAY['courage','discipline']::text[], '{}'::text[], 0, true);

-- Quote counts: 65 active owner quotes (author IS NULL, all original);
-- all 65 are notification_eligible (every body <= 140 chars). 130 affirmations unchanged.
-- content_items total after this migration: 260 + 65 = 325 rows (130 legacy quotes inactive).
