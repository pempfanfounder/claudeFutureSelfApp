# Owner's official quote list (app content)

This is the app's quote set. Received from the owner 2026-09-12 as a numbered
list of 66; 65 ship. Source of truth in code is
`src/features/content/ownerQuotes.ts`, seeded into `content_items` by
`supabase/migrations/20260912090000_owner_quotes.sql` and served to
mock/staging builds via `LOCAL_CATALOG`. `src/__tests__/ownerQuotes.test.ts`
keeps this document, the module, the migration and the local catalog in sync.

Owner instructions: fix typos, add a trailing "." where a sentence lacks one,
do not change the words of any quote. Only these fixes were applied:
dont→don't, doesnt→doesn't, cant→can't, Everyday→Every day, and
straight-apostrophe normalization. Everything else is as written.

## Flags

- **#10** was truncated in the original source; the owner supplied the full
  line ("The graveyard is full of people who thought they had more time.").
- **#54 excluded** — owner removed it (2026-09-12) as a near-duplicate of
  #65, which is kept.
- **#11 ends with an ellipsis (" …")** — kept as written per the owner; no
  "." appended.
- **#31 uses a spaced hyphen (" - ")** as a dash — kept as written.
- Categories in the module/migration are editorial assignments for
  personalization weighting (the 8 quote slugs); the owner supplied none.

## Selection: everyone sees the same quotes (personalization OFF)

Owner decision 2026-09-12: no category/interest-based personalization of
quote selection for now. Every user sees the same daily set. The capability
stays in the code and the category data stays in the library; it is gated
behind one flag, default OFF:

| Surface                                                         | Flag                                               | Where to set                                                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| App (daily feed, widgets, onboarding preview copy)              | `EXPO_PUBLIC_CONTENT_PERSONALIZATION_ENABLED=true` | EAS build profile `env` in `eas.json` / `.env`; read by `src/lib/config.ts` as `config.contentPersonalizationEnabled` |
| Push picks + campaign audiences (`push-dispatch` edge function) | `CONTENT_PERSONALIZATION_ENABLED=true`             | Supabase edge-function secret (`supabase secrets set`)                                                                |

Both default to OFF when unset. Affirmations share the same selection path
(`selectDailySet` / `pick_notification_content`), so the flag governs both
content types.

How the daily pick works when OFF (`selectSharedDailySet` in
`src/features/content/dailySet.ts`):

- Deterministic and identical across users: a pure function of
  (active library, type, local calendar date). No `userId`, interests, tags
  or editorial `priority` involved.
- Rotation: from a fixed epoch (2026-01-01) the pool is shuffled into a
  seeded "deck" and 20 cards are dealt per day; a new seeded deck starts
  when one runs out. A card shown yesterday is passed over, so consecutive
  days never overlap and every quote gets near-equal exposure (~1 showing
  per 3.25 days for 65 quotes at 20/day).
- Same local date, same set: users in different timezones move to the next
  day's set at their own midnight, so at a given instant two users can be
  on adjacent days' sets. Once a user's day is confirmed via
  `save_daily_set` it is frozen for that user even if the library changes.
- Push notifications are **per-user by design**: `pick_notification_content`
  picks one eligible item ordered by priority then `random()`, excluding
  what that user received in the last 14 days. With the flag OFF the
  interest boost is removed (empty interests), but the pick is not
  synchronized across users — users have different windows, counts and
  delivery histories, so a global pick would be a redesign.
- Onboarding still collects interests (stored in `personalization`) so
  turning the flag on later personalizes immediately; the result screen
  copy stops claiming "weighted toward …" while OFF.

To re-enable: set both flags above to `"true"` and ship an app build.

## Quotes

1. If you don't sacrifice for the life you want, the life you want will become the sacrifice.
2. Until death, all defeat is psychological.
3. We suffer more in imagination than in reality.
4. Don't fall into the trap of analysis paralysis.
5. A winner is just a loser who tried one more time.
6. If you don't have that story of pain, then you don't have a story at all.
7. Are you gonna let the opportunity pass by, or are you gonna give it all you can?
8. What a privilege it is to be exhausted from work that you used to pray for.
9. Success is a decision.
10. The graveyard is full of people who thought they had more time.
11. Every day your window of opportunity gets smaller and smaller …
12. People who bring you down are by definition below you.
13. A man that doesn't keep his word is no man at all.
14. No revenge because I'll be the most successful guy she's ever talked to.
15. Never let less successful people tell you what your limit is.
16. We can stay here, or we can go up.
17. In another life? No bro, this one. Get after it.
18. If you don't master your time, someone else will.
19. Time doesn't care who wastes it, it just moves on.
20. Don't be the 35 year old man wondering what he even did with his 20s.
21. Give something your all.
22. The world is yours.
23. You can't have a top tier life without a top tier mindset.
24. Do it for the scared kid.
25. Do it for the kid who felt alone, unheard, and forgotten.
26. Do it for the kid who doubted himself every single day.
27. Do it for the kid who needed someone to believe in him.
28. It's not over until I win.
29. You are gonna win in the end.
30. Why be worried about a girl when there's kids your age doing 100k months?
31. There are men who had nothing last year - they took action, and now they are running empires.
32. There will come a day when your body can't keep up with your ambition, and on that day, you'll pray for just one more chance to go all in.
33. One moment of savage clarity can change your entire life onward.
34. You don't have time.
35. You survived days you never thought you'd make it through. The strength you are looking for is already inside you.
36. Everything you think you own, you'll lose one day. Everything is temporary. Embrace it, it's liberating.
37. Dad's getting older, mom's getting tired. It's now or never.
38. And when you see me with everything I've ever wanted, just know I probably worked harder than you.
39. God gave you that dream for a reason.
40. It's 2030, south of France, and you just made 8.7 million last month.
41. I thought you wanted this.
42. Pick yourself up, and get back to work.
43. Remember who you are.
44. When someone teaches you how to fish, you don't fish in their pond.
45. Chase happiness and you'll end up on the dopamine treadmill. Chase being proud of yourself and you'll end up happy.
46. Success is the ultimate revenge.
47. Some wake up at 25, some at 16. Most? They never wake up.
48. "Maybe in another life." No, you only have this one. Make it happen.
49. She better cook like her mom, cuz I definitely make more money than her dad.
50. I just want to make my people proud.
51. If no one believes in you, believe in yourself.
52. Don't wish for it, work for it.
53. Bro, I am counting on you.
54. _(excluded — removed by the owner as a near-duplicate of #65)_
55. If I play, I play to win.
56. Do it because they said you couldn't.
57. Comfort will deter you from your goal. Don't be stuck in comfort.
58. Chase something bigger.
59. Simply refuse to end on a loss. One day you will win.
60. Regret exists because time is limited. Regret is a product of scarcity. Scarcity of time.
61. You have to want it more than your fear wants you to stop.
62. The graveyards are full of men who swore they'd start tomorrow.
63. The saddest thing in life is laying on your death bed realizing you still had more gas left in the tank.
64. Try to constantly be in rooms you don't deserve to be in.
65. While you are overthinking, someone less intelligent than you is becoming successful just by trying.
66. You gotta be more afraid of wasting your life than being embarrassed of what other people think of you.

## History

The earlier version of this file held the owner's 2026-08-21 raw list
verbatim as a style reference for external quote generation; that raw
list is still reproduced in `MANUS_QUOTE_BRIEF.md` section E (numbered
differently: its unnumbered first line is #1 here, so its #N is #N+1 here).
