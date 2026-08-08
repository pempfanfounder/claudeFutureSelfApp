# Onboarding Copy Spec — `iam-founder`

Founder ideas from `possibleonboardingcopy.md` reinterpreted through the
**I Am** UX framework (serif-on-cream quiz rhythm, auto-advance single-selects,
no progress bar, interstitial breathers, name reuse, notification education
before the OS dialog, streak commitment, trial seeding, timeline paywall with
delayed X, no visible authentication).

**How the founder file was used:** the future-self letter (Screen 1) becomes
the welcome hook; the qualification framing (Screen 3) and readiness question
(Screen 5) open the quiz; gender, motivation, areas, obstacles, and the pick-3
traits are kept nearly verbatim (grammar and answer sets completed); the
founder quote (Screen 2) is an interstitial at the emotional midpoint; the
"Science has shown that…" fragment is **rewritten without a science claim**
(no legitimate source was supplied, and we fabricate nothing); the "Analysis
complete… we have just built a plan" screen becomes an honest, dynamically
composed result screen. Supporting screens (name, notifications, streak,
theme, trial pre-frame) are added so the funnel is complete in the I Am style.

Interaction key: `single` = auto-advance pills · `multi` = checkmarks +
Continue · `chips` = tag grid + Continue · `text` = free text · `info` =
interstitial + Continue. Skip is top-right except on welcome and paywall.

| # | Screen | Copy (headline / sub / options) | Type | → model |
|---|--------|--------------------------------|------|---------|
| 1 | Welcome (founder S1) | **"Hey — it's me. Your future self."** / "Everything I become starts with what you do today. Keep going." / CTA **"Keep going"** / footer: "By continuing you agree to our Terms and Privacy Policy" | info | — |
| 2 | Qualification (founder S3) | **"Let's find out if Future Self is built for you."** / "A few honest questions. Two minutes." / CTA "I'm in" | info | — |
| 3 | Readiness (founder S5) | **"Are you ready to change the direction of your life?"** / "There's no wrong answer — only a starting point" / "Yes — I've been waiting for this" · "I think so" · "I want to be" · "I'm not sure yet" | single | raw_answers.readiness |
| 4 | Name | **"What should your future self call you?"** / "Your name will appear in your daily words" / field "Your name" | text | display_name |
| 5 | Gender (founder S6) | **"Which best describes you, {name}?"** / "Some quotes and affirmations use your gender" / Female · Male · Non-binary · Prefer not to say | single | gender |
| 6 | Motivation (founder S7) | **"How motivated are you to make a change right now?"** / "Your answer sets the tone of your daily mix" / "I'm ready to give it everything" · "I'm motivated, but I need help staying consistent" · "I want to change, but I feel stuck" · "I'm still figuring out what I want" · "I'm mostly exploring for now" | single | motivation_level |
| 7 | Interstitial (founder S2) | **"The reason you want it so badly is because your Future Self already has it."** | info | — |
| 8 | Areas (founder S8) | **"What should Future Self help you with most?"** / "Choose up to three — they shape your daily quotes" / 🩺 "Taking care of my body" · 💼 "Building my career or business" · 💰 "Becoming financially secure" · 🎯 "Staying focused and consistent" · 🕊️ "Feeling confident and at peace" · ❤️ "Strengthening my relationships" · ✨ "Something else" | multi (max 3) | primary_goals + quote_interests |
| 9 | Obstacles (founder S9) | **"What gets in the way of your progress most often?"** / "Naming it is half the fight" / "I procrastinate" · "I get distracted" · "I lose motivation" · "I feel overwhelmed" · "I doubt myself" · "I don't know where to start" · "I'm making progress — I want help staying on track" | multi | obstacles |
| 10 | Mechanism (founder S10, rewritten without the science claim) | **"Future Self was built for exactly that."** / "The right words, arriving at the right moments, until showing up becomes who you are. Small pushes, every day — that's the whole method, and it's why the app exists." / CTA "Show me" | info | — |
| 11 | Traits (founder S11) | **"Select three characteristics of your future self."** / "This is who we're building" / chips: Disciplined · Confident · Calm · Healthy · Wealthy · Focused · Resilient · Loved | chips (exactly 3) | future_traits |
| 12 | Notifications | **"Your future self will check in during the day."** / "A few of the right words, exactly when you drift. You decide how often." / Stepper **"Quotes — 3x a day"** (0–3) · stepper **"Affirmations — 3x a day"** (0–3) · "Start at 9:00 AM" / "End at 9:00 PM" wheels / mock notification: *"Future Self — You said you were ready. Prove it for five minutes."* / CTA **"Allow and Save"** → OS dialog | custom | notification prefs |
| 13 | Streak | **"Show up for three words a day."** / "Read any 3 quotes or affirmations and the day counts. Your future self keeps score." / day "1" + weekday tracker / goal: "3 days to start" · "7 days in a row" · "21 days — a habit" | single | streak_goal |
| 14 | Affirmation topics | **"What do you need to hear more often?"** / "Your affirmations will lean this way" / chips: Self-belief · Discipline · Calm · Health & body · Abundance · Confidence · Letting go · Gratitude / caption *"Try everything free"* (from here on) | chips | affirmation_interests |
| 15 | Theme | **"Choose how your daily words should look."** / "Change it anytime" / grid of the 10 Future Self theme previews (each showing "I am becoming.") | single | theme |
| 16 | Result (founder S13, honest + dynamic) | **"That's everything we needed, {name}."** / Dynamic mirror of real answers — high motivation: "Your ambition is exactly what Future Self's daily quotes are built around."; stuck/exploring: "Starting unsure is still starting — your mix begins gently and builds."; always followed by: "Your plan: {n_quotes} quotes and {n_affirmations} affirmations a day, weighted toward **{top areas}**, aimed at the {trait₁}, {trait₂}, {trait₃} version of you." / preview card with a real quote from the top area / CTA **"See my plan"** | info | uses model |
| 17 | Trial pre-frame | **"Everything unlocked, free for {trial_length}."** / "We'll remind you before it ends. No surprises, no pressure." / CTA "How it works" *(skipped when the RevenueCat package has no trial)* | info | — |
| 18 | Paywall — timeline | **"How your free trial works"** / ✓ "Today — your plan unlocks" → 🔔 "{trial_end−1} — reminder" ("So nothing surprises you") → 💎 "{trial_end} — membership starts" ("Unless you've cancelled") / toggle "Remind me before the trial ends" / CTA **"Try for $0.00"** / real localized price from RevenueCat below / "Restore · Terms · Privacy" / X fades in after 2 s; hard gate re-shows on next open | paywall | — |
| 19 | Widget promo (post-purchase) | **"Keep me on your Lock Screen."** / "Your words, visible without unlocking your phone" / mock lock screen widget / "Got it" | info | — |
| 20 | Widget promo 2 | **"And one for your Home Screen."** / "Touch and hold your Home Screen, tap Edit, add Future Self" / mock widget: *"The reason you want it so badly is because your Future Self already has it."* / CTA **"Set up widget"** + "Later" | info | — |

Then → main app feed.

## Founder ideas: kept / adapted / omitted

- **Kept:** future-self letter (welcome), qualification framing, readiness,
  gender, motivation (5 options), areas (7), obstacles (7), pick-3 traits,
  founder quote as interstitial and widget sample, result/plan moment.
- **Adapted:** "Science has shown that…" → mechanism copy with no research
  claim (no legitimate source was provided; instructions forbid inventing one).
  "Analysis complete. Your ambition makes you a perfect candidate" → honest
  dynamic mirror that only praises ambition when the user actually reported
  it, plus a plan summary composed from real model values.
- **Added (required for a complete I Am-style funnel):** name capture,
  notification education with real steppers, streak commitment, affirmation
  topics, theme picker, trial pre-frame, widget promos.
- **Gender options extended** beyond the file's Male/Female — the reference
  apps both offer inclusive options and the answer only tailors content.

## Authentication

None in the funnel (I Am pattern): anonymous Supabase session from launch,
sign-in offered in Settings. Purchases and answers survive later sign-in via
identity linking.

## Analytics events

Same schema as the other variants with `variant:"iam-founder"`; option slugs
only, free text never leaves Supabase.
