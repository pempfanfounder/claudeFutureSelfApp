# Test Report

What was actually run in the build environment (macOS, Node 22, no full
Xcode, no JDK), what passed, what failed, and what still requires a real
device or external credentials. Date: 2026-08-09.

## Ran and passed

| Check | Command | Result |
| --- | --- | --- |
| Dependency install | `npm install` (+ `expo install` per package) | ✅ clean |
| Formatting | `npx prettier --write "src/**" "docs/**"` | ✅ applied |
| Lint | `npx expo lint` | ✅ 0 errors, 0 warnings |
| Types | `npm run typecheck` (tsc strict) | ✅ 0 errors |
| Unit + component tests | `npm test` | ✅ 4 suites, **57/57 passed** |
| Edge functions type-check | `deno check` (all 5 functions) | ✅ (run by the functions build agent) |
| iOS native project generation | `npx expo prebuild` | ✅ Voltra widget extension (`FutureSelfWidgets`: `daily` + `future_self`, incl. lock-screen accessory families), Apple Sign-In, notifications, Sentry, Google Sign-In config plugins all generated |
| Android native project generation | `npx expo prebuild --platform android` | ✅ Voltra Glance receivers + initial states generated (after fixing the initial-state variants format) |

### What the 57 tests cover

- **Daily sets** (`dailySet.test.ts`): deterministic per (user, date, type);
  changes across days/users; ≤10 items of the right type; personalization
  weighting measurably biases selection; recent-content penalty; empty
  library; local-date formatting.
- **Experiment assignment** (`experiments.test.ts`): local fallback variant is
  deterministic, always valid, and distributes across all four variants.
- **Variant configs** (`variants.test.ts`): all four variants exist; exactly
  one paywall each; family rules hold (iam = timeline paywall + delayed close
  + no in-funnel auth; stella = hard note paywall + auth sheet before it);
  unique step ids; options/placeholders present; only known personalization
  model keys; core signals (motivation, traits, obstacles) collected; stella
  steps carry streamed lines; notification permission asked in every funnel.
- **Smoke renders** (`onboardingFlow.test.tsx`): every renderable step of all
  four variants renders through the real engine (providers, theme, streaming
  text, steppers, theme grid, result screen), plus the timeline and note
  paywall steps.

## Verified against the live Supabase project (`ykgswczatkspryetstor`)

Run via SQL in a rolled-back transaction, simulating authenticated users:

- **RLS cross-user reads blocked**: user A sees 1 profile (their own), 0 of
  user B's personalization/favorites, and all 260 shared active content items.
- **RLS cross-user writes blocked**: inserting into another user's
  personalization fails; client updates to `content_items` affect 0 rows.
- **Streak idempotency**: 3 unique views complete the day exactly once;
  replaying a view leaves `viewed_today=3, completed_today=true, streak=1`.
- **Seed content**: 130 quotes + 130 affirmations live (verified counts).
- **Migrations**: 5 applied (`core`, `notifications`, `seed_content`,
  `notifications_v2`, `register_device_nullif`), matching the files in
  `supabase/migrations/`.
- **Cron jobs live**: `fs-enqueue-due` (5 min), `fs-push-dispatch` (1 min),
  `fs-push-receipts` (15 min), `fs-trial-reminders` (hourly). The two HTTP
  jobs no-op safely until the vault `dispatch_secret` exists.
- **Edge functions deployed and ACTIVE**: `push-dispatch`, `push-receipts`,
  `revenuecat-webhook` (own secret auth, verify_jwt off), `delete-account`,
  `sync-entitlement` (verify_jwt on).
- **PostHog**: flag `onboarding-variant` live with 4×25% variants (EU project
  169314, flag 246537).

## Could not run here (environment limits) — and why

| Check | Blocker | Status |
| --- | --- | --- |
| iOS compile (`xcodebuild`) | Only Command Line Tools installed; no full Xcode on this Mac | Native project generated; **compile unverified** |
| CocoaPods install | `pod install` requires full Xcode for these pods | Same |
| Android compile (`gradlew assembleDebug`) | No Java runtime installed | Native project generated; **compile unverified** |
| On-device run of the four funnels | No build possible without the above | Funnels verified via config tests + smoke renders + dev-mock paywall path |
| Real push end-to-end | Needs EAS project + APNs/FCM credentials + a real device | Full pipeline deployed but **externally unverified** — exact test script in docs/SETUP_REQUIRED.md §3 |
| Real purchase/restore | Needs RevenueCat + store products | Purchase layer complete; verified only through the explicit dev-only mock (`EXPO_PUBLIC_DEV_MOCK_PURCHASES`); production keeps the gate closed without RevenueCat |
| Apple/Google/email sign-in | Needs provider config + SMTP (SETUP_REQUIRED §1) | Code complete per current supabase-js APIs (native `linkIdentity` id-token overload); unconfigured providers hide |
| Voltra widget update on device | Needs a dev-client build | Prebuild generated both platforms' widget targets; `syncWidgets` paths compile and are exercised only up to the guarded dynamic imports |
| Sentry/PostHog event delivery | PostHog key is live in `.env`; Sentry DSN absent | Both abstractions no-op safely when unconfigured (config-driven) |

## Known caveats / honest notes

1. **Shared Supabase project — resolved.** Two parallel build sessions were
   pointed at the same `claudefutureself` project; the other session's earlier
   schema (verified: zero rows, zero users) was reset by this one before the
   overlap was known. **The owner has since decided this build owns the live
   project.** The live schema, seed content, cron jobs, and edge functions all
   match this repo exactly; the other session keeps its backend as files in
   its own branch and no longer writes here.
2. **Anonymous sign-ins + manual linking** must be enabled in the Supabase
   dashboard before first run (SETUP_REQUIRED §1); the MCP tooling cannot
   toggle auth settings.
3. Jest prints a "did not exit" warning after the suite (PostHog/Supabase
   timers held open by imported modules); tests themselves all pass — CI
   should use `--forceExit` or add teardown.
4. `@testing-library/react-native` is pinned to v13 — v14's new renderer does
   not commit under jest-expo (SDK 57) yet.
5. The recordings, founder copy file, and brand source files stay in the repo
   root but are git-ignored (large binaries / source material, not app code).
