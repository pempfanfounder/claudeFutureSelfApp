# Onboarding Copy Spec — `stella-claude`

Claude-original conversion strategy on the **Stella** UX framework (full-screen
streamed serif conversation, no chat bubbles, free-text dominant with evocative
placeholders, thin top progress bar, "thinking" beats between screens, early
contextual notification permission, name echo, emotional pivot, "preparing"
moment, skippable auth sheet at home, hard paywall with no close button).
Written before `possibleonboardingcopy.md` was opened; not based on it.

**Emotional strategy — "the two days":** the conversation walks the user
through an honest mirror: what a good day looks like, what a wasted day looks
like, how often the wasted one wins, and what five more years of that would
mean. Then it turns: it helps them describe the person who followed through,
and takes one artifact from them — the sentence that person would say on a hard
morning — which becomes their pinned affirmation. Loss aversion is generated
entirely by the user's own answers. No fake demand claims, no fake countdowns,
no invented science.

Presentation: every numbered screen is a full-bleed warm-sand gradient; the
app's voice streams in word-by-word (Instrument Serif, grey→black). Inputs fade
in only after streaming ends. ~1s blank beat between screens. Thin progress bar
at top, hidden from screen 16 onward. Back arrow from screen 4 onward.

| # | Voice / copy | Input | → model |
|---|--------------|-------|---------|
| 1 | *(Splash → slow sunrise gradient; tagline streams:)* **"The rest of your life starts quietly."** | — | — |
| 2 | Wordmark **"Future Self"** over the gradient. / CTA **"Continue"** / link "Already have an account? **Sign in**" / footer: "By continuing you agree to our Terms and Privacy Policy" | button | — |
| 3 | **"Future Self works by finding you during your day — a few words, exactly when you'd otherwise drift."** / "Turn on notifications so today-you can hear from us." / CTA **"Turn them on"** → OS dialog / quiet link "Maybe later" | custom | permission status |
| 4 | **"Hi. I'm Future Self."** *(beat)* **"I have a few questions — the kind people rarely stop to answer."** *(beat)* **"Answer honestly. Nothing you write here leaves this space."** | Continue fades in | — |
| 5 | **"First — what should I call you?"** | text, placeholder "Your name" | display_name |
| 6 | **"Good to meet you, {name}."** *(auto-advance after 1.5 s)* | — | — |
| 7 | **"How old are you?"** | numeric text, placeholder "28" | age_band |
| 8 | **"How do you identify?"** | chips: Female · Male · Non-binary · Prefer not to say | gender |
| 9 | **"Tell me about a good day. One you'd be glad to repeat."** | text, placeholder "Early start, deep work, dinner with people I love…" | raw_answers.good_day |
| 10 | **"Now the other kind. What does a wasted day look like?"** | text, placeholder "Scrolling, snoozing, promising myself tomorrow…" | raw_answers.wasted_day |
| 11 | **"Honestly — how often does the second kind win?"** | chips: "Most days" · "More than I'd like" · "Now and then" · "Rarely" | motivation_level (inverse) |
| 12 | **"What are you building toward this year, {name}?"** | text, placeholder "The version of you that feels out of reach right now…" | life_goal |
| 13 | **"What's been standing between you and that?"** | chips + free text row: "I put it off" · "I lose focus" · "I burn out" · "I doubt myself" · "Life keeps happening" · "Something else…" | obstacles |
| 14 | **"Say nothing changes. The same days, five more years. Sit with that for a second."** *(beat)* **"How does it feel?"** | chips: "Honestly? Terrifying" · "Sad, but familiar" · "I refuse to find out" | raw_answers.projection |
| 15 | **"Then let's not find out."** *(beat)* **"Picture the version of you who followed through. They exist — they're just further down the road you keep stepping off."** | Continue | — |
| 16 | *(progress bar gone)* **"Three words, {name}. Who is that person?"** | chips (pick 3): Disciplined · Calm · Confident · Strong · Free · Focused · Kind · Unstoppable | future_traits |
| 17 | **"Last one. It's the important one."** *(beat)* **"You're having a hard morning. The {trait₁}, {trait₂} version of you leans in. What do they say?"** | text, placeholder "Get up. You know why." | pinned_affirmation seed |
| 18 | **"That's everything I need."** *(beat)* **"I'm putting together your daily direction — the quotes, the affirmations, and the moments in your day they should arrive."** | auto | — |
| 19 | **"Preparing your direction…"** — soft shimmering sun-disc animation, ~6 s. Under the hood this genuinely computes the personalization mix (goal/obstacle/trait weights, daily set seed, notification plan). | — | — |
| 20 | *(Main feed visible, blurred, behind a sheet)* **"Keep it safe, {name}."** / "Sign in so your goal, your streak and your saved words survive a lost phone — and follow you to a new one." / **" Sign in with Apple"** (iOS) · **"Continue with Google"** · **"Use email instead"** / link **"Not now"** | auth sheet (skippable) | identity link |
| 21 | **Hard paywall** — cream card over the blurred feed, no close control. Serif header **"A note before you begin"**. Body: "Future Self is a small team. There are no ads here, and nothing about your attention is for sale — the app works for you, not on you. That's only possible because it's paid. Start with {trial_length} free, on us. If it doesn't move you, cancel in two taps and pay nothing." CTA **"Start my free {trial_length} →"** / under it, real localized price from RevenueCat: "then {price}/{period}" / footer links "Privacy · Terms · Restore". *(If the configured package has no trial: header stays, CTA becomes "Unlock Future Self", price line shows the real price.)* Dismissal: none — matching Stella's hard gate. Restore is always available. | paywall | — |
| 22 | *(post-purchase, only if auth was skipped at 20)* Auth sheet re-offered once: **"One tap so this is never lost."** / same providers / "Not now" | auth sheet | identity link |

Then → main app feed. Screen 17's answer is offered during widget setup as the
default pinned line for the persistent widget ("Your words, on your Home
Screen"), and `life_goal` is the alternative.

## Personalization honesty contract

"Preparing your direction" performs real work: trait/goal/obstacle weights are
written to the personalization model, the first daily sets are generated from
them, and the notification plan (3 quotes + 3 affirmations inside the user's
window) is registered. Free-text answers (`good_day`, `wasted_day`, goal,
hard-morning line) are stored only in Supabase under RLS — never sent to
analytics — and are used verbatim only where the user can see them (result
copy, widget suggestion, pinned affirmation).

## Authentication placement (matches Stella)

Optional sheet after onboarding, before the paywall; Apple + Google + email on
iOS, Google + email on Android; unavailable providers hide (no dead buttons).
Skippable both times ("Not now"). Anonymous Supabase session from first launch
guarantees purchases, personalization, and the experiment assignment survive
later sign-in via identity linking.

## Analytics events

Same schema as `iam-claude` (`onboarding_*`, `paywall_viewed`, `trial_started`,
`purchase_completed`…), with `variant:"stella-claude"`. Free-text screens emit
`answered:true` only — never content.
