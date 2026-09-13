# Sub-processors register

Single place to track every third party that touches personal data for
Future Self. The public list users see is **Privacy Policy §5**
(`website/privacy/index.html`); this file is the internal register behind it
(GDPR Art. 28 / Art. 30 evidence).

**Rule:** any PR that adds an SDK, an env var pointing at a new host, or an
outbound call from an edge function must (1) add a row here, (2) add the same
row to Privacy Policy §5 and, if a new data category appears, §2, (3) bump the
"Last updated" date on the page, and (4) re-upload `website/` to Netlify
(manual drag-and-drop, see `website/README-DEPLOY.txt`).

| Provider                                               | Role                                                                                                            | Data categories (policy §2)           | Region / transfer mechanism                                                                        | DPA link                                             | DPA accepted on   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------- |
| Supabase, Inc. (on AWS)                                | Database, auth, edge functions, logs                                                                            | A–F, K                                | EU — Ireland (eu-west-1)                                                                           | https://supabase.com/legal/dpa                       | _fill_            |
| PostHog, Inc.                                          | Product analytics (random install id, no GeoIP, IP discarded)                                                   | G                                     | EU — Germany (PostHog EU Cloud)                                                                    | https://posthog.com/dpa                              | _fill_            |
| Functional Software, Inc. (Sentry)                     | Crash/error reporting (fixed message + area tag)                                                                | H                                     | EU — Germany (Sentry EU data region)                                                               | https://sentry.io/legal/dpa/                         | _fill_            |
| RevenueCat, Inc.                                       | Purchase validation, entitlements, restore                                                                      | A (account id), F (receipt, IP, IDFV) | United States — SCCs (not DPF-certified)                                                           | https://www.revenuecat.com/dpa/                      | _fill_            |
| 650 Industries, Inc. (Expo)                            | Push notification relay                                                                                         | E (push token, notification text)     | United States — DPF + SCCs                                                                         | https://expo.dev/dpa                                 | _fill_            |
| Apple Inc. / Apple Distribution International Ltd.     | App Store, IAP, Sign in with Apple, APNs                                                                        | A, E, F                               | Apple regions — independent controller                                                             | Apple Developer Program License Agreement            | n/a               |
| Google LLC / Google Ireland Ltd.                       | Google Play, Play Billing, Google sign-in, FCM                                                                  | A, E, F                               | Google regions — independent controller                                                            | Play Developer Distribution Agreement / Firebase DPT | n/a               |
| Netlify, Inc.                                          | Hosts joinfutureself.com                                                                                        | J                                     | Global CDN incl. United States — SCCs                                                              | https://www.netlify.com/legal/netlify-dpa/           | _fill_            |
| Resend, Inc.                                           | Sign-in code emails (email OTP is on in production)                                                             | A (email)                             | EU region (domain verified as EU per `docs/SETUP_REQUIRED.md`; re-confirm in the Resend dashboard) | https://resend.com/legal/dpa                         | _fill_            |
| Cloudflare, Inc. (Turnstile)                           | Sign-up bot protection — **currently off** (`EXPO_PUBLIC_AUTH_CAPTCHA_ENABLED` unset)                           | IP, browser/device signals            | Global — DPF + SCCs                                                                                | https://www.cloudflare.com/cloudflare-customer-dpa/  | only when enabled |
| Development and operations tooling (Cursor, Anthropic) | Cloud dev environments and AI-assisted coding; may see limited personal data only during incident investigation | any, minimised/redacted               | United States — SCCs / DPF where certified; privacy mode, no retention, no training                | Cursor DPA / Anthropic commercial terms              | _fill_            |

## Production data handling (operational rules)

1. No plaintext production dumps into agent-reachable paths. Use
   `pg_dump --schema-only`, or exclude/mask `auth.*`, `public.profiles`,
   `public.personalization`; encrypt any data dump and delete it after use.
2. Agents get a staging project or a redacted snapshot, never production
   service-role keys, unless a human runs the specific command.
3. Cursor: Privacy Mode on. Anthropic: API/Team/Enterprise terms, no training.
4. Any provider change → update this file, Privacy Policy §2/§5, and the
   "Last updated" date, then redeploy the website.

## Values the Privacy Policy depends on

| Statement in the policy                                              | Where it is set                                                                                | Current value                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Anonymous accounts deleted after **30 days** of inactivity (nightly) | `public.anonymous_cleanup_control.retention_days` (migration default 14; production set to 30) | 30 days, `dry_run = true` — flip to `false` to make the sentence true |
| Notification history deleted after 90 days                           | `public.prune_push_history()`                                                                  | 90 days                                                               |
| Deletion receipt kept 7 days                                         | `public.account_deletion_receipts`                                                             | 7 days                                                                |
| Analytics up to 12 months / crash reports up to 90 days              | PostHog / Sentry project retention settings                                                    | verify in dashboards                                                  |
