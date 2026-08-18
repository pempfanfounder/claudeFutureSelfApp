# Future Self — Launch Readiness (2026-08-17)

Six specialised read-only audits (paywall/entitlements · UI wiring · third-party
integrations · store submission & compliance · stability/release · backend ops
& privacy promises), run against branch tip `2f8fc8c` and the **live** Supabase,
PostHog, EAS and Netlify state. Duplicates merged; two conflicts resolved in
favour of the auditor with live evidence. Raw reports: `scratchpad/launch-audit/`
(A–F). Previous checklist: `LAUNCH_CHECKLIST.md` (its 8 blockers: 1,2,4,5,6,7 ✅
code-verified fixed on this branch; 3 and 8 still open below).

## Verdict

**The app itself is in good shape.** No paywall bypass exists (two independent
gates, deep links bounce through them, dev mocks compile out). No dead
"coming soon" buttons; every route resolves. 213/213 tests, typecheck and lint
clean. Supabase is verified healthy live (7 migrations applied, RLS on all 14
tables, 4 cron jobs 100 % green, dispatch secret proven end to end), PostHog
flag live with the right 4×25 % split, Sentry EU + auth token in EAS, legal
site live.

**Three things stand between here and a submission:**
1. **The money → entitlement → push loop has never run once.** Live counters:
   0 entitlement rows, 0 push tokens, 0 notification deliveries, 0 Apple/Google
   sign-ins ever. Every internally installable build uses RevenueCat *Test
   Store* keys, so no real StoreKit purchase has ever been made. Until one
   TestFlight session proves the chain, a paying customer could silently get
   zero notifications.
2. **~20 code fixes**, one of which is a true blocker (iOS Google Sign-In
   cannot complete — missing URL scheme). Roughly one Claude working day.
3. **Console + business tasks** — DSA trader status and a business
   address (blocks all 27 EU storefronts), IAP metadata attached to the version,
   age-rating questionnaire, App Privacy label, review notes, RevenueCat
   offering/entitlement/webhook check.

## Critical path (in order)

| # | Step | Who | Effort | Unblocks |
| --- | --- | --- | --- | --- |
| 1 | Code fixes (section A) + rebuild | Claude | ~1 day + 1 EAS build | everything on device |
| 2 | RevenueCat + Supabase secrets check (B1) | Owner *or* Claude in Chrome | 30 min | purchase → entitlement |
| 3 | EAS credentials: APNs key, FCM v1 (B2) | Owner *or* Claude in Chrome | 20 min | push |
| 4 | Business address → publish on site + KVK (C1) → DSA trader declaration (C2) | Owner (+ boekhouder) | 1 day + Apple wait | EU availability |
| 5 | TestFlight end-to-end session (section D script) | Owner on device, Claude verifying live DB | ~2 h | proof the loop works |
| 6 | ASC metadata: IAPs to version, age rating, privacy label, review notes, EULA, description, screenshots (B3) | Owner *or* Claude in Chrome | ~4 h | submit |
| 7 | `eas submit` (from the main checkout, where the `.p8` lives) | Claude | 15 min | App Review |

Android is a **separate track** (section E): a 14-day closed test is a wall-clock
requirement, so start it now only if Android is in scope for launch.

---

## A. CODE — Claude fixes (ordered by severity)

### Blockers
| # | Fix | Where | Found by |
| --- | --- | --- | --- |
| A1 | **iOS Google Sign-In cannot complete** — plugin declared without `iosUrlScheme`, so no `com.googleusercontent.apps.*` scheme reaches Info.plist; the button renders anyway. Add `{ "iosUrlScheme": "com.googleusercontent.apps.983503541251-f4srakcc70oii0og65ai2hajgfq497be" }` to the plugin entry. | `app.json:51` | C, E |
| A2 | **Test-key guard + a real-store test profile.** `initPurchases()` no longer refuses `test_` keys in release (docs say it does); all `preview*` profiles ship Test Store keys. Cherry-pick the guard from `1074ed3` (only that commit — never the bypass branch wholesale) and add a `preview-store` profile with the `appl_`/`goog_` keys for TestFlight. | `src/lib/purchases.ts`, `eas.json:19,36,54` | A |

### Must fix before submitting
| # | Fix | Where | Found by |
| --- | --- | --- | --- |
| A3 | **Trial-reminder switch is decorative** in both places: gate paywall hard-wired ON with a no-op handler; onboarding writes only `raw.trial_reminder`, never `notification_prefs.trial_reminder` (DB default true → "off" still sends). Persist to `notification_prefs` (and `streak_reminder`), lift the flag into the store, wire or hide the gate switch. | `src/app/paywall.tsx:98`, `TimelinePaywall.tsx:204`, `completeOnboarding.ts:88` | A, B, D, F |
| A4 | **Buy → kill app → funnel restarts.** iam variants call `completeOnboarding` only after the two post-paywall widget promos. Call it in the paywall's `onPurchased` (idempotent) and skip the paywall step when already premium. | `OnboardingFlow.tsx:81-93` | B |
| A5 | **Webhook misses refunds and lifetime.** All `CANCELLATION` events ignored (refunded user keeps server premium); `NON_RENEWING_PURCHASE` absent (lifetime relies on one un-retried `sync-entitlement` call). Handle both; retry sync on foreground when the local row is missing. | `supabase/functions/revenuecat-webhook` | A |
| A6 | **Wellness copy** — "Improve your mental health" → "Support your mental well-being"; keep the citations; add one small "Not medical advice" line on the science screen. Decides the age-rating medical/wellness answer and removes a 1.4.1/2.3.1 exposure. | `variants/iamClaude.ts` (benefits, science) | D, legal review |
| A7 | **Age band vs Terms (16+).** Replace "Under 18" with "Under 16" + "16 or 17"; "Under 16" ends the funnel politely; Stella typed age < 16 rejected. | `iamClaude.ts`, `iamFounder.ts`, `stella*.ts` | D, F, legal |
| A8 | **No error boundary** — any render throw is a white screen in release. Export `ErrorBoundary` from the root layout (expo-router picks it up), report via `monitoring.captureError`. | `src/app/_layout.tsx:101` | E |
| A9 | **Two unbounded awaits hang the UI:** `PreparingStep` awaits 6 sequential Supabase calls before its timer (race against ~8 s); `/onboarding` blocks on the PostHog flag fetch after splash hides (race against ~1.5 s, fall back to `localFallbackVariant`). | `PreparingStep.tsx:57-73`, `src/app/onboarding/index.tsx` | E |
| A10 | **Stella blank screen after sign-in:** last step is filtered out when `isAnonymous` flips → `steps[stepIndex]` undefined → `null`. Clamp the index, render a terminal state; wrap `AuthSheet.run`'s `await fn()` in try/catch. | `OnboardingFlow.tsx:79,169`, `AuthSheet.tsx:57` | E |
| A11 | **Gate paywall ignores safe areas** — hardcoded 108/64/28; Restore/Terms/Privacy sit under Android's nav bar. Use `useSafeAreaInsets()`. | `TimelinePaywall.tsx:308,310,356` | E |
| A12 | **iOS privacy manifest** — add `ios.privacyManifests` (UserDefaults `CA92.1`, FileTimestamp `C617.1`) to avoid ITMS-91053 mails on first upload. | `app.json` | D |
| A13 | **Legal links for subscribers** — add "Privacy Policy" and "Terms of Service" rows to Profile (3.1.2 in-binary links exist only on the paywall today). | `settings/index.tsx` | D |
| A14 | **NotePaywall footer scrolls** — pin `PaywallFooter` + disclosure outside the ScrollView like TimelinePaywall (Restore must be visible without scrolling). | `NotePaywall.tsx` | D |
| A15 | **Feed shows "That's the whole set for today" while loading / forever when offline.** Render a loading state and a "Couldn't load — Try again" card. | `feed.tsx:113-119,176-182` | B |
| A16 | **Icon grids decode ~40 MB** — ten 1024² PNGs at 64 pt via RN `Image`. Generate 128 px previews (keep 1024 for the asset catalogue) and/or use `expo-image`. | `themes.tsx`, `AppIconStep.tsx` | E |
| A17 | **Old Supabase `legal` function still serves a contradicting policy** (Aug-10, Gmail, "under 13"). Replace body with a 302 to joinfutureself.com and repoint Play Console / OAuth consent screen (B5). | `supabase/functions/legal` | C, F |
| A18 | **"24-month anonymous clean-up" is promised but not implemented.** Add a monthly cron deleting anonymous, identity-less, entitlement-less users inactive > 24 months (cascade handles the rest) — *or* remove the sentence. Owner decision (D-3). | new migration | F, legal |
| A19 | **Experiment is blind:** analytics `sanitize()` strips `answer`/`answered` from every `onboarding_answered` event (regex `/answer/i`). Fix the PII filter to allow option slugs. | `lib/analytics.ts:53-58`, `OnboardingFlow.tsx:109` | B, F |
| A20 | Deep links lose their query string (`kind` always "unknown"). | `_layout.tsx:66-68` | B |

### Should fix before public launch
Notification "Tap to re-request" banner should open Settings once denied
(`settings/notifications.tsx:165`) · Apple/Google buttons render without
Supabase configured; silent failures show nothing (`AuthProvider.tsx:459`,
`AuthSheet.tsx:57`) · Stella variants never show Terms/Privacy before the
paywall (add `LegalFooter` to `StellaStep`) · three `openURL` calls without
`.catch` (`PrivacyChoicesSheet.tsx:71,76,81`) · streak banner has no dismiss ·
Sentry `AsyncExpiringMap` interval leaks in jest only (`unref`) · pin
`targetSdkVersion 36` explicitly (Play requires it from 2026-08-31) · support
page: "request deletion without the app" mailto block (Play requirement).

---

## B. CONSOLE — owner, or Claude in your Chrome (now paired)

**B1 · RevenueCat (30 min) — the single most important check.**
Entitlement `FutureSelffffff Pro` (typo, but the client tolerates any active
entitlement — fine): confirm all store variants of `yearly` / `monthly` /
`lifetime` are attached. Current offering maps `$rc_annual` → yearly,
`$rc_monthly` → monthly, `$rc_lifetime` → lifetime (a product on the offering
but not on the entitlement = user charged, app stays locked). Webhook URL
`https://ykgswczatkspryetstor.supabase.co/functions/v1/revenuecat-webhook` with
`REVENUECAT_WEBHOOK_SECRET` as the Authorization value; App Store Connect API
key + shared secret uploaded in RC; Play service-account JSON. In Supabase edge
secrets: `REVENUECAT_SECRET_API_KEY` set (client fallback). Nothing here can be
read from code — all currently "reported done, unverified".

**B2 · EAS credentials (20 min).** `npx eas credentials`: APNs key for
`com.futureself.mobile`, FCM v1 service account for Android. Restore the ASC
`.p8` (`AuthKey_RQUZ7CT4QG.p8`) into `credentials/` of the checkout you submit
from (gitignored; today only the main checkout has it) — or drop the `asc*` keys
in `eas.json` and let EAS manage them.

**B3 · App Store Connect (~4 h, all paste-ready text in the appendix).**
1. App record: bundle id `com.futureself.mobile`; store name decision
   ("Future Self — Daily Quotes", 26/30, vs on-device "Future Self").
2. Privacy Policy URL `https://joinfutureself.com/privacy/`, Support URL
   `https://joinfutureself.com/support/`, marketing URL optional.
3. Subscription group "Future Self Membership": Yearly (3-day intro offer),
   Monthly; Lifetime non-consumable. Localized display name + description +
   review screenshot per product. **Attach all three to the 1.0.0 version** —
   the easiest thing to forget and an instant "empty offering" rejection.
4. Age rating questionnaire (2026 version; mandatory since 2026-01-31) → 4+ with
   "Medical or wellness topics: None" — *only after A6 lands*.
5. App Privacy label (appendix E2). Decision D-1: declare Coarse Location, or
   disable PostHog GeoIP enrichment and keep "No".
6. License Agreement → Custom (paste/link the Terms) and put the Terms URL in
   the description's subscription paragraph.
7. Description with the subscription-required paragraph (E5); keywords; promo
   text.
8. Screenshots: 6.9" portrait (1320×2868), 5–7 shots of feed / quote card /
   widget / themes / streak; at most one paywall shot (2.3.3).
9. App Review notes (E1). "Sign-in required" = off.
10. Business: DSA trader status (see C2), Small Business Program (submitted;
    await mail), W-8/banking/Paid Apps already active ✅.

**B4 · PostHog (5 min).** Decide GeoIP (D-1); retention is already 12 months
(verified) — optionally enable `events_retention_enforced`. `trial_started`
goal referenced in docs doesn't exist in code — remove from the dashboard or
add the event.

**B5 · Repoint the old legal URL.** Play Console → App content → Privacy
policy and Google Cloud → OAuth consent screen still reference the Supabase
`legal` function URL → change to `https://joinfutureself.com/privacy/` (A17
makes the old URL redirect meanwhile).

**B6 · Sentry.** Verified: EU DSN + auth token in all EAS envs. Just confirm
the org retention is 90 days (the policy says "up to 90 days").

**B7 · Netlify.** Done — live since today. Re-upload `website/` when the
address (C1) or the support-page deletion block (Play) changes.

---

## C. LEGAL / BUSINESS — owner (+ boekhouder / lawyer)

| # | Item | Why it blocks |
| --- | --- | --- |
| C1 | **Business correspondence address** (mailbox service or KVK-registerable post address), registered at KVK, then published in Terms §19 + Privacy §1 and entered identically in ASC. Today the site says "available on request" — fails the EU trader-display duty and CRD art. 6(1)(c) / 3:15d BW. | EU listing + legal exposure |
| C2 | **DSA trader declaration** in ASC → Business: name, address (or P.O. Box with proof), phone, email, KVK document, 2FA. Until verified, Apple withholds the app from all 27 EU storefronts and blocks new submissions. Needs C1 first. | EU availability |
| C3 | **Boekhouder:** VAT/BTW with Apple/Google as merchant of record (reverse charge, ICP, OSS not needed, KOR interaction). | tax |
| C4 | **Lawyer sign-offs** from `docs/LEGAL_REVIEW_2026-08-17.md` §F: US arbitration enforceability (+ AAA clause registry), age-16 choice, liability cap under 6:237 BW, DPAs on file for processors, consumer indemnity clause, UK paragraph if selling there, business liability insurance. None block a submission; all should be done before public launch. | protection |
| C5 | Decide `hello@joinfutureself.com` as the ASC/DSA contact email (already on the site). | consistency |

---

## D. DEVICE — the TestFlight end-to-end session (must happen once)

Nothing below has ever been exercised. One physical iPhone, one sitting, with
Claude watching the live DB. Prerequisites: A1–A5 built, B1, B2 done.

1. Install the TestFlight (`preview-store` or `production`) build; complete
   onboarding; allow notifications → `devices` row with a real
   `ExponentPushToken[...]` (today: 0).
2. Sandbox purchase (trial) → `entitlements` row `is_premium=true`,
   `source='revenuecat-webhook'`, `period_type='trial'` (if `source='sync-api'`
   the webhook is misconfigured).
3. `notification_state.next_due_at` non-null and inside the window (else the
   premium gate still rejects you).
4. Within 5 min: `pgmq` message → `notification_deliveries` `ticket_ok` →
   `receipt_ok` within 15 more.
5. Push arrives; body has no name in it.
6. Tap → deep link opens `futureself://content/<id>` — the exact item.
7. View 3 unique items → `record_view` `completed_today=true`, `streaks.current_streak=1`; re-view → no change.
8. Toggle trial reminder off/on in Profile → Notifications → `notification_prefs.trial_reminder` follows (A3 check).
9. Sign in with Apple, then Google (A1 check) → `auth.identities` rows on the same UUID (today: 0 ever).
10. Delete account → all 12 per-user tables 0 rows; app lands on fresh onboarding.
Also: keyboard-safe Continue on the name/life-goal steps, the native time picker, alternate app icon switch, widget add.

---

## E. ANDROID track (only if in scope now)

Personal Play account created after 2023-11-13 → **closed test with 12 testers
opted in for 14 continuous days** before production access (start it now if you
want Android at launch). Target API 36 required from 2026-08-31 (pin it). Web
account-deletion request route on `/support/` + Data-safety deletion URL. Play
products/base plans ACTIVE + merchant payout verified (last reported blocked);
data-safety form; content rating; feature graphic 1024×500. Recommendation:
ship iOS first.

---

## Verified OK (so you don't have to worry about these)

Hard paywall: two gates, deep links and widget links bounce through them, dev
mock double-gated by `__DEV__` and set in zero EAS profiles, no bypass code on
this branch (the `EXPO_PUBLIC_BYPASS_PAYWALL` commit lives only on the debug
branch). 3.1.2 disclosures generated from live StoreKit data, real trial-length
CTA, Restore + Privacy + Terms + Privacy choices on both paywalls, in-app
deletion reachable behind the paywall, Sign in with Apple shown next to Google,
Face ID string gone, no ATT/tracking SDKs, export compliance set, no external
purchase links, quotes public-domain/original. UI: zero TODO/"coming soon",
every route href resolves, all 15 step types render, every modelKey consumed,
app-icon picker wired on both platforms. Supabase live: migrations applied, 6
edge functions ACTIVE, RLS everywhere, blocker-6 grants fixed live, 4 cron jobs
green (3,696/3,696 runs), dispatch secret chain proven (384/384 HTTP 200), all
per-user tables cascade from `auth.users` (delete-account misses nothing).
PostHog flag live 4×25 %, IPs anonymised, 12-month retention. Sentry EU DSN +
auth token in EAS. Push content contains no personal data; sub-processor list
matches `package.json`; website has zero scripts/cookies. Secrets: nothing
sensitive committed. Toolchain: typecheck 0, lint 0, jest 213/213, expo-doctor
20/21 (version drift only).

## Decisions for the owner

- **D-1** PostHog GeoIP: disable (recommended — nothing to declare) or declare Coarse Location.
- **D-2** 24-month anonymous clean-up: implement the cron (recommended) or delete the sentence.
- **D-3** Under-16: gate the funnel (recommended, Dutch AP-safe) or lower the stated minimum.
- **D-4** Android at launch, or iOS first (recommended)?
- **D-5** Address: publish as soon as rented; DSA declaration right after.

## Appendix — paste-ready drafts (from audit D)

### E1 · App Review notes
> Future Self is a subscription-only app: a daily set of quotes and affirmations, personalized during onboarding, with home-screen widgets, streaks and reminders. All content is behind the subscription, which is why you will meet the paywall during review.
>
> **No demo account is needed.** The app signs every user in anonymously at first launch — there is no login screen and nothing to sign up for. Optional Sign in with Apple / Google exist only to back up an existing anonymous account; you can ignore them.
>
> **How to review:** 1) Launch and complete the short onboarding (every question can be skipped). 2) At the paywall, use a sandbox Apple ID (Settings → App Store → Sandbox Account) and tap "Start your 3-day free trial" — completes at no cost. 3) The full app unlocks: daily feed, saved quotes, themes, alternate app icons, widget setup, notification settings. 4) "Restore" re-attaches an existing sandbox purchase.
>
> **Products submitted with this build:** Future Self Yearly (3-day free trial, then USD 59.99/year, auto-renewing), Future Self Monthly (auto-renewing), Future Self Lifetime (one-time). Price, period and trial are read live from StoreKit; the auto-renewal disclosure, Privacy Policy, Terms and Restore are on the purchase screen.
>
> **Account deletion (5.1.1(v))** without subscribing: paywall → "Privacy choices" → "Delete my account & data". After subscribing: Profile → Account & subscription → Delete account.
>
> **Notifications and widgets** are optional; reminders deep-link to the exact quote; two widgets can be added after subscribing.
>
> Privacy Policy: https://joinfutureself.com/privacy/ · Terms: https://joinfutureself.com/terms/ · Support: https://joinfutureself.com/support/ · Contact: hello@joinfutureself.com

### E2 · App Privacy label
Tracking: **No**. Collected & linked, not tracking — Email (optional, App Functionality) · Name (App Functionality, Personalization) · Other User Content (life goal, answers, saved quotes) · User ID · Device ID · Purchase History · Product Interaction (Analytics, Personalization) · Crash Data · Performance Data · Coarse Location **only if** PostHog GeoIP stays on (D-1). Not collected: Health & Fitness (goals are self-reported aspirations — keep the wellness copy soft), Financial Info, Contacts, Browsing/Search History, Sensitive Info.

### E3 · Subscription metadata
Group "Future Self Membership" · **Future Self Yearly** — "All quotes, affirmations, widgets & themes." — free 3-day intro, 1 year · **Future Self Monthly** — same description, 1 month · **Future Self Lifetime** (non-consumable) — "One payment. Every feature, forever." · Review screenshot: 6.9" paywall with CTA, price line and auto-renew disclosure.

### E4 · Age rating
**4+** — no violence/sexual/profanity/substances/gambling/horror/contests; medical or wellness topics: None (after A6); no UGC between users, no chat, no AI chatbot, no unrestricted web, no location sharing. Terms at 16+ vs rating 4+ is normal (contract capacity vs content) — I Am ships 18+ terms against a 9+ rating.

### E5 · Description paragraph
> **Future Self is a subscription app.** A membership unlocks everything: your personalized daily set of quotes and affirmations, home- and lock-screen widgets, streaks, saved quotes, every theme and every app icon. New members start with a 3-day free trial on the yearly plan; a monthly plan and a one-time lifetime purchase are also available. Prices are shown in your local currency before you buy. Payment is charged to your Apple ID at confirmation; a subscription renews automatically unless cancelled at least 24 hours before the end of the current period, and you can manage or cancel it any time in your App Store settings — deleting the app does not cancel it. Cancel during the free trial and you are not charged. The lifetime purchase is a single payment with no renewal.
> Privacy Policy: https://joinfutureself.com/privacy/ · Terms of Use: https://joinfutureself.com/terms/
