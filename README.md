# Future Self

A premium, hard-paywall iOS/Android app: motivational quotes and affirmations
delivered as small daily pushes toward the person you're becoming. Built with
Expo SDK 57 / React Native 0.86, Supabase, RevenueCat, PostHog, Sentry, and
Voltra widgets.

## Product shape

- **Four onboarding funnels, one app.** A PostHog multivariate flag
  (`onboarding-variant`) assigns each install to `iam-founder`, `iam-claude`,
  `stella-founder`, or `stella-claude`. The `iam-*` variants follow the I Am
  quiz grammar (auto-advance pills, interstitials, timeline paywall, no
  in-funnel auth); the `stella-*` variants follow the Stella conversational
  grammar (streamed serif voice, free-text answers, skippable auth sheet, hard
  note paywall). Copy specs: `docs/ONBOARDING_COPY_*.md`. Reference analysis:
  `docs/REFERENCE_ANALYSIS.md`.
- **One shared main app** (I Am-inspired): full-bleed vertical card feed with
  separate Quotes/Affirmations destinations, 10 items per type per local day
  (stable daily sets), a combined 3-item daily streak, favorites, themes,
  server-driven notifications, widgets, and account/subscription settings.
- **Hard paywall.** RevenueCat entitlement `premium` gates the entire app.
  No production bypass exists; a missing RevenueCat config keeps the gate
  closed. Development builds may opt into a mock with
  `EXPO_PUBLIC_DEV_MOCK_PURCHASES=true`.

## Run it

```bash
npm install
cp .env.example .env   # fill in what you have; see docs/SETUP_REQUIRED.md

# Native builds are required (widgets, RevenueCat, Apple auth — no Expo Go):
npx expo prebuild
npx expo run:ios       # or: npx expo run:android

# Checks
npm run typecheck
npm run lint
npm test
```

To test a specific funnel without PostHog, set
`EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE=stella-founder` (etc.) in `.env`.

## Architecture

```
src/
  app/                    expo-router routes (gate -> onboarding | paywall | main)
  design-system/          themes (10 palettes), tokens, base components
  features/
    onboarding/
      engine/             shared step renderer, streaming text, store, completion
      variants/           the four funnel configs (safe to delete individually)
    paywall/              RevenueCat offering hook + Timeline/Note paywalls
    content/              library cache, deterministic daily sets, feed store
    streaks/              streak celebration UI (logic lives in SQL record_view)
    auth/                 anonymous-first Supabase auth + identity linking
    notifications/        push registration client (delivery is server-side)
    widgets/              Voltra sync (iOS timelines, Android Glance)
supabase/
  migrations/             versioned schema: RLS everywhere, streak RPC, queue,
                          dispatch state, deliveries, campaigns, cron jobs
  functions/              Deno edge functions: push-dispatch, push-receipts,
                          revenuecat-webhook, sync-entitlement, delete-account
widgets/                  Voltra initial-state files bundled at prebuild
docs/                     reference analysis, copy specs, ops + setup guides
```

Key invariants:

- **Anonymous-first identity.** Every install signs in anonymously at first
  launch; purchases, onboarding answers and the experiment assignment attach to
  that UUID. Sign-in later *links* an identity to the same user (Apple/Google
  native ID-token linking, email OTP) — nothing migrates, nothing is lost.
- **Server-driven notifications.** Devices only register tokens and
  preferences. Supabase cron (`fs-enqueue-due`) finds due users via an indexed
  `next_due_at`, enqueues pgmq jobs, and edge functions select content at
  dispatch time, send via Expo Push, and record idempotent deliveries. Caps
  (3 quotes + 3 affirmations + 1 streak reminder per local day), quiet hours,
  windows, premium gating and dedup are all enforced server-side. See
  `docs/NOTIFICATION_OPERATIONS.md`.
- **No fabricated claims.** Result screens mirror only what the app actually
  does with the answers; quotes are original or public-domain with accurate
  attribution.

## What still needs external setup

Everything that requires store consoles or credentials (APNs/FCM, EAS,
RevenueCat products, PostHog flag, Sentry, Apple/Google sign-in config,
edge-function secrets) is listed step-by-step in `docs/SETUP_REQUIRED.md`.
Current verification status: `docs/TEST_REPORT.md`.
