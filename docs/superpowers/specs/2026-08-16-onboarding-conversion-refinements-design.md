# Onboarding Conversion Refinements (iam-claude) — Design

Date: 2026-08-16 · Branch: `claude/onboarding-design-refinements-4ba14f`
(based on `claude/app-store-launch-audit-787b06`, the "new version").
Inputs: 15-point owner feedback on the `iam-claude` funnel; the I Am
onboarding recording (`copy_262C0BDD-4CCE-4DE9-83F7-9DBBAEFE02B6.MOV`,
re-analyzed frame-by-frame → `docs/REFERENCE_IAM_SCREENS.md`);
`docs/REFERENCE_ANALYSIS.md`; the honesty contract in
`docs/ONBOARDING_COPY_IAM_CLAUDE.md`.

## Scope

Only the `iam-claude` funnel is restructured. Engine-level fixes (keyboard,
legal links, character counter, logo, notification screen) apply to every
variant automatically because the renderers are shared. `iam-founder` keeps
its own structure/copy (its A/B role is "founder copy"); `stella-*` untouched
beyond shared fixes.

## Diagnoses (verified in code/assets, not inferred)

1. **Logo "vertical line" (feedback #1).** `assets/images/splash-icon.png`
   (512²) and `icon.png` (1024²) carry a baked-in darker band at columns
   ≈8–20 px (RGB ≈231/219/206 vs ≈242/231/219 elsewhere; right/top/bottom
   edges are clean). Rendered at 96 pt with a 24 pt radius on the welcome
   screen it reads as a 2–4 pt darker vertical line inside the left edge. It
   also ships in the App Store icon and the splash. Fix the asset, not the
   view — then style the welcome tile so its edge is intentional.
2. **Terms/Privacy not tappable (#2).** `IamStep` renders the sentence as
   plain text. Paywall/PrivacyChoices links point at the Supabase `legal`
   edge function; the audit branch's `website/README-DEPLOY.txt` step 4
   already asks for `joinfutureself.com` URLs.
3. **Continue hidden under the keyboard (#3).** Both `IamStep` and
   `StellaStep` wrap content in `KeyboardAvoidingView behavior="padding"`
   with no `keyboardVerticalOffset`. RN's KAV computes the overlap from its
   `onLayout` frame, which is **relative to its parent**, while the keyboard
   frame is in window coordinates. `OnboardingFlow` pads the body by
   `insets.top`, so the KAV underestimates the overlap by exactly
   `insets.top` (47–62 pt) — the 56 pt Continue button ends up behind the
   keyboard. Android uses `behavior={undefined}` and the app is edge-to-edge
   (`edgeToEdgeEnabled=true`, decor does not fit system windows), so
   `adjustResize` no longer resizes the window there either.
4. **Streak step (#11).** The 3/7/21 picker was already replaced on the audit
   branch (commit `db8e524`) by an educational 21-day commitment (three
   beats + "I'm in for 21 days", stores `raw.streak_goal="21"`). The owner's
   test build predates it. `raw.streak_goal` is only stored (raw_answers),
   not used by the app — it is a commitment device.
5. **Character counter (#8).** `IamStep` shows `n/280` under multiline inputs.

## Design decisions

### D1 — Welcome screen: healed logo + intentional tile + tappable legal links

- Heal `splash-icon.png`, `icon.png` (and `android-icon-foreground.png`,
  which carries the same band) in place with a scripted, seam-free
  patch: replace the darker column band with texture copied from a clean
  band of the same image (mirror of the right edge at the same rows), with a
  feathered blend at both seams; verify by column-mean measurement (band
  mean within ±2 RGB of neighbours) and by eye. Keep dimensions/format.
- Welcome tile: 96 pt, `radii.xl`, hairline `colors.border` + `shadows.sm`
  so the rounded tile reads as the app icon, not a floating square.
- Footer becomes: "By continuing you agree to our **Terms** and **Privacy
  Policy**" with the two phrases underlined, `accessibilityRole="link"`,
  opening `LEGAL_URLS.terms` / `LEGAL_URLS.privacy` via `Linking.openURL`.
- New `src/lib/legal.ts`: `LEGAL_URLS = { terms: "https://joinfutureself.com/terms",
privacy: "https://joinfutureself.com/privacy", support: "https://joinfutureself.com/support" }`.
  `PaywallFooter`, `PrivacyChoicesSheet` and the welcome footer import it.
  **Owner reminder (must appear in the final report):** deploy the Netlify
  site so these paths resolve _before_ submitting to App Review; set the
  same Privacy URL in App Store Connect.

### D2 — Keyboard-safe Continue (all text steps, both families, both platforms)

- New engine component `KeyboardAvoider` (`src/features/onboarding/engine/KeyboardAvoider.tsx`):
  a `KeyboardAvoidingView` with `behavior="padding"` on **both** platforms,
  `keyboardVerticalOffset` = the view's own measured window Y
  (`measureInWindow` in `onLayout`; falls back to `insets.top`). This makes
  the overlap math correct regardless of ancestor padding.
- Used by `IamStep` and `StellaStep`; the footer (CTA) stays outside the
  ScrollView so it is always the element that sits directly above the
  keyboard; `keyboardShouldPersistTaps="handled"` stays.
- Single-line inputs: `returnKeyType="done"`, `onSubmitEditing` submits when
  the input is non-empty (one-thumb flow). Multiline keeps return = newline.
- Character counter removed from the UI; `maxLength` stays enforced.

### D3 — Copy fixes on existing iam-claude screens (feedback #4–#9)

| Screen                                                          | Before                                                                                         | After                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| age sub                                                         | "We tune the voice to where you are in life"                                                   | "Your age helps us personalize your quotes and affirmations."                                             |
| motivation sub                                                  | "Honest answer — it sets your starting pace"                                                   | "Be honest — we'll meet you where you are"                                                                |
| motivation option                                               | "Running on empty"                                                                             | "Not motivated right now"                                                                                 |
| motivation option                                               | "Honestly, I'm not sure"                                                                       | "I'm not sure yet"                                                                                        |
| goals sub                                                       | "Choose up to three — they shape your daily mix"                                               | "Choose up to three — they shape your daily quotes and affirmations."                                     |
| obstacles sub                                                   | "Naming it is the first push"                                                                  | "Naming it is the first step."                                                                            |
| notifications sub                                               | "Future Self finds you through the day with the right words. You control how often, and when." | "Future Self finds you through the day with the quotes you need to hear. You choose how often, and when." |
| result headline                                                 | "Your daily mix is ready, {name}."                                                             | "Your daily quotes and affirmations are ready, {name}." (fallback without name)                           |
| result mirror lines                                             | "…your mix…" ×3                                                                                | reworded without "mix" (see Agent C brief)                                                                |
| paywall timeline body                                           | "Your full daily mix, streaks, widgets…"                                                       | "All your daily quotes and affirmations, streaks, widgets and every theme"                                |
| The word "mix" is retired from all user-facing iam-claude copy. |

### D4 — New I Am-inspired beats (feedback #10–#15), adapted to Future Self

Every addition is a proven I Am beat, re-voiced for Future Self (quotes +
affirmations, "future self" framing), and honest: no feature is implied that
the app lacks (no audio → no "listening" option; "You can change your goal
later" is not promised because no goal setting exists yet). Exact I Am
wording comes from `docs/REFERENCE_IAM_SCREENS.md`; the fallback copy below
is used if the recording is ambiguous.

New screens (final, as shipped — exact wording lives in
`src/features/onboarding/variants/iamClaude.ts` and
`docs/ONBOARDING_COPY_IAM_CLAUDE.md`; I Am originals in
`docs/REFERENCE_IAM_SCREENS.md`):

- **familiarity** — `single`, "How familiar are you with affirmations,
  {name}?" / "Your answer shapes how we introduce them" — "This is new for
  me" · "I've used them occasionally" · "I use them regularly".
  `raw.affirmation_familiarity`.
- **affirmations-intro** — `info`, shown only when familiarity = new
  ("Affirmations are short, positive statements you repeat to yourself —
  until they become how you think."). The condition is what makes the
  familiarity sub honest.
- **habit-helper** — `multi`, "What would help make affirmations a daily
  habit?" / "Choose all that apply" — "Getting regular reminders" · "Tracking
  my progress" · "A Home or Lock Screen widget" · "Quotes that fit my goals" ·
  "I don't know yet" (every option is a real feature; I Am's "guided
  practice" dropped). `raw.habit_helpers`.
- **repetition** — `info`: "Through daily repetition, you can change your
  beliefs and your mindset." Then the **notifications** screen (moved here
  from after life-goal — I Am asks early, right after habit drivers, when
  momentum is highest and "reminders" was just primed).
- **results-preframe** — `info`: "A few minutes a day is all it takes. Give
  it a couple of weeks." (sets up the time question, like I Am's screen 21).
- **time-devotion** — `single`, "How much time will you give your future
  self each day?" / "Small and daily beats big and rare" — "1 minute a day" ·
  "3 minutes a day" · "10 minutes a day". `raw.daily_minutes`.
- **streak-goal** — `single`, "What goal do you want to start with?" /
  "Pick what feels doable — your streak keeps counting either way" — "3 days
  in a row" · "7 days in a row" · "21 days in a row". `raw.streak_goal`. Then
  the existing **streak-commit** screen whose CTA echoes the choice: "I'm in
  for {N} days" (21 when skipped); beats + info line kept (they explain the
  ~3-week rule the owner asked to inform about).
- **vision / belief-manifestation / belief-thoughts / belief-rewire** — four
  fast auto-advance `single` questions with I Am's option sets ("Do you have
  a clear vision of the life you want?" · "Do you believe in the power of
  manifestation?" · "Do you believe your thoughts help shape your reality?" ·
  "Did you know affirmations can rewire your brain?"), sub "Pick the one that
  feels true". Keys `raw.vision`, `raw.belief_manifestation`,
  `raw.belief_thoughts`, `raw.belief_rewire`.
- **science** — `info` with `footnote`: headline "Studies show daily
  self-affirmation boosts self-confidence, resilience and overall
  well-being." sub "In brain-imaging studies it activates the brain's reward
  and self-processing centers — most strongly when people focus on their
  future selves." footnote "Cohen & Sherman, Annual Review of Psychology
  (2014) · Cascio et al., Social Cognitive and Affective Neuroscience
  (2016)". "Self-affirmation" (not "affirmations") keeps the claim inside
  what those papers support; the future-self line is Cascio's actual finding.
- **benefits** — `info` with `bullets`: "The benefits of daily personalized
  affirmations" — "Focus on achieving your goals" · "Shift negative thoughts"
  · "Improve mental health"; CTA "Got it".
- **practice-mode** — `multi`, "How would you like to practice with Future
  Self?" — "Reading them on my phone" · "Seeing them on my Home or Lock
  Screen" (widget) · "Saying them out loud" · "Writing them in a journal" ·
  "Writing them on a post-it" · "I'm not sure yet". No "listening" (no audio
  feature). `raw.practice_modes`.
- **achieve** — `multi`, the **last question before the result/paywall**:
  "What do you want to achieve with Future Self?" — "Become the best version
  of myself" · "Build discipline that lasts" · "Feel more self-confident" ·
  "Develop a positive mindset" · "Be more present and enjoy life" · "Improve
  my mental health". `raw.outcome_goals`, trial caption on.
- **life-goal** (existing free text) moves late (I Am puts vulnerable
  free-text last, right before the ask).
- Motivation option emoji stays 🌫️ (Emoji ≤13.1 for Android 12 fonts).

Resulting iam-claude order (36 screens incl. the conditional primer; I Am
has 44): welcome → name → age → motivation → gap-interstitial → familiarity
→ (affirmations-intro) → habit-helper → repetition → notifications → goals →
obstacles → system-interstitial → results-preframe → time-devotion →
streak-goal → streak → traits → vision → belief-manifestation →
belief-thoughts → belief-rewire → science → benefits → quote-topics →
affirmation-topics (trial caption from here) → practice-mode → theme →
life-goal → achieve → result → source → trial-preframe → paywall →
widget-lock → widget-home.
Rhythm check: bursts of 2–4 quick taps, then a breather (interstitial,
notification config, streak visual, science/benefits) — I Am's grammar.

Engine additions (contract for all agents):

- `OnboardingStep.bullets?: string[]` — `info` renders a left-aligned list
  with an icon per line (benefits).
- `OnboardingStep.footnote?: string` — small `label`/`ink3` line under the
  sub (science citation).
- `OnboardingStep.cta` may be a function of context (`resolveText`), so the
  streak-commit CTA can echo the chosen goal.
- New `raw.*` keys need no schema change (`raw_answers` JSON).

### D5 — Notifications config screen restyled to the I Am look (feedback #12)

Same data contract (`notificationPrefs` in the onboarding store; per-type
counts capped by `DAILY_LIMIT`; window start/end minutes; server enforces
caps). Visuals follow the recording (`key_notifications*.png`): mock
notification card at top, count row(s) with round − / + controls, "Start at"
/ "End at" rows showing the time in a pill that opens an inline hour picker,
CTA "Allow and Save" + "Not now". Two count rows stay (Quotes /
Affirmations — product requirement). Time picker: the recording shows I Am
uses the native iOS compact `UIDatePicker` (grey capsule → wheel popover), so
we use the same control via `@react-native-community/datetimepicker@9.1.0`
(the Expo SDK 57 bundled version): `display="compact"` inline on iOS, our own
capsule opening the platform time dialog on Android; 30-minute steps, start ≤
end − 60 min enforced by moving the other bound, no midnight crossing.
Consequence: this is a native module — the owner's next TestFlight/dev-client
build must be a fresh native build (JS-only updates cannot ship it).

### D6 — Result screen stays honest

Adds rows only for real answers: streak goal ("Your first goal: 7 days in a
row.") and practice modes. Copy retires "mix".

## Answers owed to the owner (put in the final report)

- #11: yes — the 21-day commitment is already in the new version (audit
  branch); the 3/7/21 picker returns as I Am's _goal question_ feeding a
  personalized commit CTA. Rationale: chosen goal → explicit commit is a
  commitment-consistency device that raises intent right before the belief/
  proof beats and the paywall.
- #7: "Naming it is the first step." now matches what the owner quoted.
- #2: Netlify deploy reminder (paths `/terms`, `/privacy`, `/support`).

## Testing

`npm run typecheck`, `npm run lint`, `npm test` green. New/updated tests:
variant config invariants (new step ids/keys, no "mix", legal links, no
counter), keyboard avoider offset, streak CTA echo, notifications step
interaction (counts/window bounds), asset column-mean check script output.
No simulator is available on this machine (CommandLineTools only), so
device verification of keyboard behaviour is called out for the owner's
next TestFlight build.

## Out of scope

iam-founder restructure; a streak-goal setting in the main app (follow-up:
surface "Day n of N" in the streak banner); audio features; RC paywall.
