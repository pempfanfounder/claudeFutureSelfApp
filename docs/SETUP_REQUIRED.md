# External setup required

Everything below needs credentials or store-console access that only the app
owner has. The code for every integration is complete; each item degrades
gracefully until configured. Work through the sections in order.

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

1. Create the RevenueCat project; add iOS + Android apps
   (`com.futureself.app`).
2. App Store Connect / Play Console: create the subscriptions —
   an **annual** subscription with an introductory free trial (sold by the
   `iam-*` paywalls) and a **weekly** subscription with a free trial (sold by
   the `stella-*` paywalls). Any prices you like — the app reads real prices
   and trial eligibility from the store at runtime and never hardcodes them.
3. RevenueCat: create entitlement **`premium`** (exact id — the app checks it),
   attach both products, add them to the **current Offering** (the app uses
   `offering.annual` and `offering.weekly`, falling back to the first
   available package).
4. Put the **public SDK keys** in `.env`:
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
5. **Webhook** (drives server-side premium gating for notifications):
   RevenueCat → Integrations → Webhooks →
   URL `https://ykgswczatkspryetstor.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header value = a secret you generate. Then:
   `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<that secret>`.
6. **Server API key** (fallback entitlement sync when the webhook lags):
   `supabase secrets set REVENUECAT_SECRET_API_KEY=<RevenueCat secret key>`.

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
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`            | `.env`                   | purchases              |
| `EXPO_PUBLIC_POSTHOG_API_KEY` / `_HOST`                      | `.env`                   | set ✅                 |
| `EXPO_PUBLIC_SENTRY_DSN`                                     | `.env`                   | crash reporting        |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID`        | `.env`                   | Google sign-in         |
| `EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE`                    | `.env` (dev only)        | force a funnel         |
| `EXPO_PUBLIC_DEV_MOCK_PURCHASES`                             | `.env` (dev only)        | mock paywall           |
| `DISPATCH_SECRET`                                            | supabase secrets + vault | cron → dispatcher auth |
| `REVENUECAT_WEBHOOK_SECRET`                                  | supabase secrets         | webhook auth           |
| `REVENUECAT_SECRET_API_KEY`                                  | supabase secrets         | entitlement sync       |
| `SENTRY_AUTH_TOKEN` (+ org/project)                          | EAS secrets              | source maps            |
