# External setup required

Everything below needs credentials or store-console access that only the app
owner has. The code for every integration is complete; each item degrades
gracefully until configured. Work through the sections in order.

> **Status update (2026-08-10, after the Codex browser session):**
> ✅ Supabase: anonymous sign-ins ON, manual linking ON, Apple provider
> enabled, `DISPATCH_SECRET` + `REVENUECAT_SECRET_API_KEY` function secrets
> set. ✅ RevenueCat: entitlement + Test Store products + offering + webhook
> in place. ✅ App Store Connect: app **"Future Self — Daily Quotes"**
> created; products `yearly` ($59.99/yr, 3-day trial), `monthly`, `lifetime`
> created; **Paid Apps agreement active**. ✅ Sentry: EU org
> `future-self-i2`, project `futureself`, DSN + source-map token in `.env`.
> ⚠️ **Bundle id changed to `com.futureself.mobile`** (Apple refused
> `com.futureself.app`); app.json + native projects already updated. iOS App
> Group is now `group.com.futureself.mobile` (creation pending).
> **Round 4 (2026-08-12):** widget App Group assigned → **iOS credentials
> fully provisioned** (cert + both profiles; build-ready pending Expo quota
> decision). Android: production `.aab` built on EAS; SHA-1 issued; Android
> OAuth client created (Google sign-in Android console-complete). Resend
> domain `joinfutureself.com` **verified** (EU, DNS at Porkbun) — Supabase
> SMTP still pending a fresh API key. Play: merchant profile created (payout
> verification pending); products blocked until a billing-enabled AAB is
> uploaded — the built artifact is ready for that upload. APNs: no key
> revoked; plan is to reuse the team-scoped EAS key `32X543A5XM`
> (Sandbox & Production) during the next credentials pass.
> **Round 2 (2026-08-10) — all console items closed:** webhook secret set
> identically on both sides and **verified live** (401 wrong secret / 200
> correct — the function now accepts raw and Bearer forms; v5 deployed);
> Supabase Apple provider lists `com.futureself.mobile,com.futureself.app`;
> App Group `group.com.futureself.mobile` created and assigned; ASC In-App
> Purchase key (ID `CZ85P76P36`) uploaded to RevenueCat; App Store products
> attached to entitlement + offering; production iOS SDK key
> `appl_DFqxkzQsOpehmQzQwabKojFgwdz` collected (commented in `.env` — dev
> stays on the Test Store key; swap for release builds).
> **Still open:** custom SMTP (blocks the email-OTP template → email
> sign-in linking deferred), terms/privacy hosting at futureself.app, and
> the intentionally skipped Google/Play/Firebase/Expo track (Android
> release, Google sign-in, and real-device push verification wait on it).

## Already live (done during the build)

- Supabase project `claudefutureself` (`ykgswczatkspryetstor`): all
  migrations applied, RLS verified, 260 seed content items, pg_cron jobs
  (`fs-enqueue-due`, `fs-push-dispatch`, `fs-push-receipts`,
  `fs-trial-reminders`), pgmq queue `push_jobs`, and all five edge functions
  deployed (`push-dispatch`, `push-receipts`, `revenuecat-webhook`,
  `sync-entitlement`, `delete-account`).
- Vault secret `project_url` set.
- PostHog EU project "Future Self": multivariate flag `onboarding-variant`
  live with `iam-founder` / `iam-claude` / `stella-founder` / `stella-claude`
  at 25% each ([flag 246537](https://eu.posthog.com/project/169314/feature_flags/246537)).
- Local `.env` created with the Supabase publishable key + PostHog project key.

## 1. Supabase Auth settings (dashboard, ~5 min)

Dashboard → Authentication:

1. **Sign In / Up → Allow anonymous sign-ins: ON.** The app signs everyone in
   anonymously at first launch; nothing works without this. Add CAPTCHA
   (Turnstile) if abuse appears.
2. **Allow manual linking: ON** (required for `linkIdentity` — converting an
   anonymous user to Apple/Google keeps the same UUID).
3. **Providers → Apple:** add the app's **bundle ID** `com.futureself.app` to
   Client IDs. Native-only flow needs no Services ID and no secret key.
4. **Providers → Google:** create OAuth clients in Google Cloud Console
   (one **Web** client + one **iOS** client with bundle id
   `com.futureself.app`, and an **Android** client with the release SHA-1).
   Put the client IDs comma-separated in the provider config, **web client id
   first**. Enable "Skip nonce check" if iOS sign-in fails on nonce.
   Then set in `.env`:
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
5. **Email templates → Email Change:** replace the link with the 6-digit code
   (`{{ .Token }}`) — the app verifies email linking by OTP code. Configure
   custom SMTP before launch (default SMTP only delivers to team members).

Until 3/4 are configured the corresponding sign-in buttons simply don't render
(no dead buttons); email linking works as soon as SMTP does.

## 2. RevenueCat (~30 min + store console work)

The RevenueCat project already exists (see credentials below); what's left is
store-console product setup and the real per-platform keys before release.

1. RevenueCat project is live; iOS + Android apps for `com.futureself.app`
   are added.
2. App Store Connect / Play Console: create three products —
   a **monthly** subscription, a **yearly** subscription (both with an
   introductory free trial — `iam-*` paywalls sell the yearly, falling back
   to monthly), and a **lifetime** non-consumable. There's currently no
   weekly product; the `stella-*` paywalls prefer `offering.weekly` (kept
   for future flexibility) but fall back to monthly today. Any prices you
   like — the app reads real prices and trial eligibility from the store at
   runtime and never hardcodes them.
3. RevenueCat: entitlement **`FutureSelffffff Pro`** already exists (its id
   is wired via `EXPO_PUBLIC_RC_ENTITLEMENT_ID` in `.env` — the app reads it
   from config rather than hardcoding it, defaulting to `"premium"` if unset).
   Attach all three products (monthly, yearly, lifetime) to that entitlement
   **and** to the **current Offering** in the dashboard. The client also
   treats *any* active entitlement as premium as a misconfiguration
   safety net (with a loud `__DEV__` warning if it's not the configured one)
   — but that's a fallback, not a substitute for wiring the entitlement id
   correctly.
4. **API keys:** a RevenueCat **Test Store** key
   (`test_AyrDXEiqnvraxCsTJnuzvAOQAxx`) is already wired into `.env` for both
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
   — dev builds work end-to-end against the Test Store today. Test keys have
   **no billing power** and `initPurchases()` refuses to configure with one
   in a release build (paywall stays closed, no bypass). Before shipping,
   replace both with the real per-platform **public SDK keys**
   (`appl_…` / `goog_…`) from the RevenueCat dashboard.
5. **Webhook** (drives server-side premium gating for notifications):
   RevenueCat → Integrations → Webhooks →
   URL `https://ykgswczatkspryetstor.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header value = a secret you generate. Then:
   `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<that secret>`.
   The webhook also refuses events outside its configured scope, so set the
   RevenueCat **app IDs** (one per platform, from RevenueCat → Project →
   Apps; comma-separated, whitespace ignored) and the exact environment:

   ```bash
   supabase secrets set REVENUECAT_WEBHOOK_APP_ID=app6bb4e06e68,app6bbf4b6d0c   # iOS, Android
   supabase secrets set REVENUECAT_WEBHOOK_ENVIRONMENT=PRODUCTION
   ```

   Listing only one app ID is still valid, but events from the other
   platform's app are then rejected with `400 event scope mismatch`.
6. **Server API key** (fallback entitlement sync when the webhook lags):
   `supabase secrets set REVENUECAT_SECRET_API_KEY=<RevenueCat secret key>`.
   `sync-entitlement` treats the user as premium if *any* entitlement in the
   RevenueCat subscriber record is active, mirroring the client fallback.
7. **Customer Center** (`react-native-purchases-ui`): Settings → "Manage
   subscription" already presents RevenueCat's native Customer Center when
   purchases are really configured (falls back to the store's own
   subscriptions page if RevenueCat isn't configured, is dev-mocked, or
   presentation throws). Configure the Customer Center's look/options in
   RevenueCat → Customer Center in the dashboard; no code changes needed.
8. **Optional: RevenueCat remote Paywall on the standalone gate.** Set
   `EXPO_PUBLIC_USE_RC_PAYWALL_GATE=true` to make `src/app/paywall.tsx` (the
   hard gate shown when onboarding is done but there's no entitlement) try
   RevenueCat's hosted Paywall first via `presentPaywallIfNeeded`, falling
   back to the existing custom gate paywall on any non-purchase result or
   error. This is off by default and only ever applies to that standalone
   gate — the in-onboarding `TimelinePaywall`/`NotePaywall` A/B variants are
   untouched and keep their own selling logic regardless of this flag.

Until RevenueCat is configured, production builds keep the paywall closed (no
bypass); dev builds can use `EXPO_PUBLIC_DEV_MOCK_PURCHASES=true`.

## 3. Push notifications (APNs + FCM + EAS)

The full server pipeline is deployed but **externally unverified** until real
device tokens flow. Steps:

1. **EAS project:** `npx eas init` (adds `extra.eas.projectId` to app.json —
   the push-token call needs it), then `npx eas credentials`:
   - iOS: let EAS manage the **APNs key** (or upload your .p8).
   - Android: upload the **FCM v1 service account JSON** (from Firebase
     console; create a Firebase project, add the Android app, download the
     service-account key).
2. **Dispatch secret** — one secret, two places (they must match):

   ```bash
   # generate
   openssl rand -hex 32
   # a) edge function env
   supabase secrets set DISPATCH_SECRET=<value> --project-ref ykgswczatkspryetstor
   ```

   ```sql
   -- b) database vault (SQL editor)
   select vault.create_secret('<value>', 'dispatch_secret');
   ```

   The minute-cron (`fs-push-dispatch`) silently no-ops until both exist.

3. **Real-device end-to-end test:**
   - build a dev client (`npx eas build --profile development --platform ios`),
     run onboarding, allow notifications;
   - check a row exists: `select * from devices where push_token is not null;`
   - grant yourself premium for testing:
     `insert into entitlements (user_id, is_premium, source) values ('<uuid>', true, 'dev') on conflict (user_id) do update set is_premium = true;`
     then `select recalc_notification_state('<uuid>');`
   - within ~5 min `fs-enqueue-due` queues a job, the dispatcher sends it, and
     `select status, title, body from notification_deliveries` shows
     `ticket_ok` → `receipt_ok`. Tap the notification: it must deep-link to the
     exact quote/affirmation.

## 4. PostHog

Key is already in `.env`. Optional: convert flag `246537` into a PostHog
**Experiment** with your conversion goal (`trial_started` /
`purchase_completed`) once traffic flows. Consider enabling
`ensure_experience_continuity` — the app also persists its own assignment
locally, so users never switch funnels either way.

## 5. Sentry

1. Create a React Native project in Sentry; set `EXPO_PUBLIC_SENTRY_DSN` in
   `.env` (monitoring no-ops without it).
2. Source maps: set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` as
   EAS build secrets (never `EXPO_PUBLIC_*`). The `@sentry/react-native`
   config plugin is already in `app.json`.

## 6. Store-listing / legal

- `https://futureself.app/terms` and `/privacy` are referenced by the
  paywalls and welcome screens — publish real documents there or change the
  URLs in `src/features/paywall/PaywallFooter.tsx` and the welcome footers.
- Apple: hard-paywall apps must have Restore visible (it is, on every
  paywall) and account deletion (Settings → Account → Delete account, wired
  to the `delete-account` edge function).

## Environment variable reference

| Variable                                                     | Where                    | Purpose                |
| ------------------------------------------------------------ | ------------------------ | ---------------------- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env`                   | set ✅                 |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`            | `.env`                   | set ✅ (Test Store — replace with real keys for release) |
| `EXPO_PUBLIC_RC_ENTITLEMENT_ID`                              | `.env`                   | set ✅ (`FutureSelffffff Pro`; defaults to `"premium"`) |
| `EXPO_PUBLIC_USE_RC_PAYWALL_GATE`                            | `.env` (optional)        | opt in to RC Paywall on the standalone gate only |
| `EXPO_PUBLIC_POSTHOG_API_KEY` / `_HOST`                      | `.env`                   | set ✅                 |
| `EXPO_PUBLIC_SENTRY_DSN`                                     | `.env`                   | crash reporting        |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID`        | `.env`                   | Google sign-in         |
| `EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE`                    | `.env` (dev only)        | force a funnel         |
| `EXPO_PUBLIC_DEV_MOCK_PURCHASES`                             | `.env` (dev only)        | mock paywall           |
| `DISPATCH_SECRET`                                            | supabase secrets + vault | cron → dispatcher auth |
| `REVENUECAT_WEBHOOK_SECRET`                                  | supabase secrets         | webhook auth           |
| `REVENUECAT_WEBHOOK_APP_ID`                                  | supabase secrets         | accepted RC app IDs (comma-separated, e.g. `app6bb4e06e68,app6bbf4b6d0c`) |
| `REVENUECAT_WEBHOOK_ENVIRONMENT`                             | supabase secrets         | accepted RC environment (`PRODUCTION` / `SANDBOX`) |
| `REVENUECAT_SECRET_API_KEY`                                  | supabase secrets         | entitlement sync       |
| `SENTRY_AUTH_TOKEN` (+ org/project)                          | EAS secrets              | source maps            |
