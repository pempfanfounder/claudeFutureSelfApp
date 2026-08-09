# Reference Analysis

Analysis of the two supplied recordings. Frames were extracted both periodically
(every 2s) and on scene changes, reviewed chronologically, with unclear frames
re-extracted at full resolution.

## Recording identities (verified from content)

| File                                                    | App                                                   | Evidence                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `copy_262C0BDD-4CCE-4DE9-83F7-9DBBAEFE02B6.MOV` (9:33)  | **I Am — Daily Affirmations** (Monkey Taps)           | ATT dialog `Allow "I am" to track…`, StoreKit product "I am Premium (1 year)", "Welcome to I am" splash, Monkey Taps 6-app bundle cross-promo |
| `copy_99D9D6D6-B394-47BD-9FF3-4A5AE965D887.MOV` (10:54) | **Stella — Manifest Anything** (AI manifestation app) | Stella wordmark on splash/home, StoreKit product "Stella - Unlimited", manifestation copy throughout                                          |

## I Am — onboarding funnel (0:00–3:30 to paywall)

**Structure:** Welcome (social proof: "+20 million Lives changed", rotating
testimonials, single "Get started" CTA, terms in footer) → ATT dialog (no
education) → ~26 question screens → trial pre-frames → paywall.

**Interaction grammar (the core of the I Am feel):**

- Serif headline + one-line sans subheader explaining _why_ the question is asked
  ("Your age is used to personalize your content").
- Single-select = full-width cream pill rows with radio circles, **auto-advance
  ~0.5s after tap, no Continue button**. Multi-select = checkmark circles +
  Continue. Chips grid for topics ("+" flips to "✓"). Most screens have top-right Skip.
- **No progress bar anywhere.** Pacing is rhythm: 2–4 quick questions, then an
  interstitial breather (centered serif aphorism/education + Continue).
- Name asked early ("Your name will appear in your affirmations"), then reused in
  later headlines ("…, Jasmin?") to make personalization visible.
- Transitions: horizontal slide + cross-fade (~300 ms); selections auto-advance.

**Question arc:** attribution → name → demographics (age/gender/relationship/
employment/religion/zodiac) → familiarity → habit drivers → **notification
education screen** → mood → mood causes → mental-health practices → blockers →
time commitment → streak goal → **streak commitment screen** (animated growing
plant, weekday tracker) → belief questions (vision/manifestation/thoughts/
rewiring) → benefits screen → change areas → **topic chips** → practice modes →
**app icon picker** → **theme picker** → cross-promo → improvement goals →
letting go → avoidance → **free-text goals** (250-char textarea, "I want to…",
Save goals) → outcome goals → stat interstitial → trial pre-frames → paywall.
Deep/vulnerable questions are deliberately LAST, right before the ask.

**Notification education (before OS dialog):** "Get positivity throughout the
day" + mock notification card, **count stepper (default 10x/day)**, start/end
time wheels (9:00 AM–10:00 PM defaults), CTA "Allow and Save" → OS dialog.

**Trial seeding:** caption "Try it 3 days for free" quietly appears above
Continue from the topic-chips screen onward; then two pre-frames ("We offer 3
days of Premium access for free, just for you"; "We'll send you a reminder 1 day
before your trial ends — No surprises, no pressure").

**Paywall ("How your free trial works" timeline):** 4-step vertical timeline
(Install ✓ → Today free trial → Aug 10 reminder → Aug 11 member), optional
"Reminder before trial ends" toggle, shimmer CTA **"Try for $0.00"**, fine print
"$4.99/month, billed yearly as $59.99/year", Restore/Terms/Privacy footer,
**X appears top-left after ~2s delay**. Single plan, no picker. StoreKit sheet
completes the purchase.

**Authentication: none.** No sign-in exists anywhere in the recording; purchase
is StoreKit-only on an anonymous install.

**Post-purchase:** straight into retention setup — lock-screen widget education
→ home-screen widget promo ("Install widget" deep-links to the Home Screen) →
in-app Widgets configurator — before the main feed is ever shown.

## I Am — main app

- **No tab bar.** Full-bleed one-affirmation-per-screen vertical feed; floating
  controls: avatar (top-left → Profile), grid (bottom-left → Explore topics),
  "🧘 Practice" pill (bottom-center), paint-roller (bottom-right → Themes).
  Cold start shows "Welcome to I am — Swipe up" gate.
- **Save-5 coaching loop:** dim-overlay tooltip "Save 5 affirmations to
  personalize your feed", 0/5 progress pill top-center, heart-burst animation on
  save, completion banner, then the pill is removed permanently. Rating prompt
  fires right after the first save (emotional high).
- **Streak:** starts just by using the feed ("New daily streak started" drop-in
  banner, circled count, weekday checkmarks); streak card on Profile; streak
  widget variant.
- **Explore topics:** Favorites / Collections / My own affirmations / History +
  followable topic packs ("Follow" pills, "Follow all" per section).
- **Themes:** one theme system reused by feed, widgets, and practice ("mirror
  the app" default + per-surface override). Picker: filter chips (Surprise me,
  - Create, All, Seasonal, Most popular…), "Theme mixes" carousels, grid of live
    "I am" previews, current theme outlined + Edit.
- **Practice:** auto-advancing 1-min slideshow (6 segments progress bar, mute,
  settings) ending in "Great job!" recap with heart/bookmark per item.
- **Widgets:** in-app configurator with live device-mock preview; per-widget
  configs (rename, Topics, Theme, border toggle, refresh frequency Hourly
  24/day → Never, Show buttons); widget taps cycle affirmations; deep-link back
  into app shows "Edit your widgets" banner. Lock-screen widget in iOS gallery.

## Stella — onboarding funnel

**Structure:** long splash → cinematic 3D window/sunset intro → tagline
"Create the life you desire" fades in word-by-word → Continue + "Already have an
account? Sign in with Apple" → **notification education ("Stella works better
with Notifications :)") + OS dialog at ~0:30** → App Store rating ask at ~0:40
(!) → referral code (skippable) → conversational intake → "generating" moment →
home (visible) → skippable Apple auth sheet → **hard paywall**.

**Conversational grammar (the core of the Stella feel):**

- Full-screen pale pink gradient; **no chat bubbles**. Stella "speaks" in a
  large editorial serif, text **streams in word-by-word** (grey→black fade);
  Continue fades in only after streaming completes. Blank ~1s beats between
  screens read as "Stella is thinking."
- First-person voice with memory: "First, what should I call you?" → "Lovely.
  Welcome, danny." → later questions reuse the name and partner's name.
- **Free-text dominant** (14 free-text vs 5 chip questions), keyboard
  auto-appears, every field has an evocative placeholder ("Love, confidence,
  peace…", "Doubt, timing, money, fear…", "What will change if this came true?").
- Thin progress bar top; disappears for the finale.
- Trust framing up front: "The more honest you are, the more personal Stella can
  feel." / "Everything you share is completely confidential."

**Question arc:** name → location → age → gender (chips) → sexuality (free
text) → kids (chips) → hopes ("what are you hoping changes in your life right
now?") → **why it matters** ("What will change if this came true?" — longest
dwell, 25s) → obstacle → relationship status (chips, branches) → partner name +
"what do you appreciate about them" → important-people list (+ Add Person
sheet) → work → work feeling (chips) → self-description → past ("Only share
what feels relevant…") → **"Now dream a little bigger… Don't be realistic.
Don't hold back."** pivot → dream location → dream home (chips) → relationship
desire → wrap-up ("That's all the information I need for now") → "Give me a
moment to personalize your app experience… / Generating your stories…" +
shimmering orb (~7s).

**Auth placement:** skippable "Save Your Stories" Apple-only sheet the moment
home appears ("…so your stories and manifestations are never lost… pick up
right where you left off on any device", "Not now"); re-offered after purchase
if skipped. Never required.

**Paywall (immediately after auth sheet, ~5:20 in): hard gate, NO close
button.** Cream card over blurred home: live countdown pill "Your stories
expire in 3:00:00", serif "Note from the team", personal letter copy
(fabricated "overwhelming demand" justification), single CTA "Try Stella for
free →", fine print "7-day free trial, then $6.99 per week",
Privacy/Terms/Restore only. User converts on first exposure; no discount fallback seen.

**Post-purchase:** auth sheet again → home ("danny, what do you want to
manifest?", trending chips, daily-refresh countdown) → lock-screen widget
installation. (Stella's main app is NOT a reference for Future Self.)

## What Future Self adopts (decisions)

1. **iam-\* variants** copy the I Am grammar: serif+cream design language,
   auto-advance single-selects, no progress bar, interstitial breathers, early
   name capture with reuse, notification education with per-type frequency
   steppers and time window, streak commitment moment, topic chips, theme
   picker, free-text goal, trial-seeding captions, two trial pre-frames, then a
   **timeline paywall** (single annual package, delayed X, Restore/Terms/
   Privacy). **No visible auth in onboarding** (anonymous session under the
   hood; sign-in offered in Settings, mirroring I Am's zero-auth funnel).
2. **stella-\* variants** copy the Stella grammar: streamed serif text
   full-screen conversation, free-text with evocative placeholders, thin
   progress bar, early contextual notification permission, name echo, deep →
   dream-bigger arc, "preparing your direction" moment (honest — we really do
   personalize), then skippable auth sheet (Apple/Google/email per platform),
   then a **hard paywall with no close button** (single weekly-with-trial
   package, personal note framing, Privacy/Terms/Restore).
3. **Not reproduced** (deliberate): fabricated claims ("+20M lives changed"
   unless truthful, "overwhelming demand" letter), fake expiry countdowns,
   pre-value rating prompts (Stella's 40-second ask), referral-code screen (no
   referral system exists), ATT prompt (we do no cross-app tracking), Monkey
   Taps cross-promo, zodiac/religion/sexuality questions (sensitive, low value
   for quotes/affirmations personalization).
4. **Main app** follows I Am: chrome-less vertical card feed with floating
   controls, but with **separate Quotes and Affirmations destinations** (product
   requirement), 10-item daily sets per type, combined 3-item streak with
   drop-in celebration banner, heart/double-tap favorites with burst animation,
   theme system shared across feed and widgets, notification settings with
   per-type frequency + windows + quiet hours, in-app widget configurator with
   live preview, settings with subscription management/restore/sign-in/delete.
   Practice mode, custom user affirmations, collections, followable topic
   packs, app-icon picker, and video themes are noted as v2 candidates — they
   are significant scope and not required for launch parity.

## Pacing targets

- I Am: ~3.5 min tap-to-subscribe; questions in bursts of 2–4 with breathers;
  vulnerable questions last; paywall after ~26 screens.
- Stella: ~5.2 min to paywall; slower, contemplative single-question rhythm
  with streaming text; dwell peaks on introspective questions.
- Future Self variants aim for the same rhythm with fewer, higher-purpose
  questions (every answer feeds the personalization model — see onboarding copy
  specs).
