# Future Self — App Store Launch Checklist

Audit date: **2026-08-15** · Branch: `claude/app-store-launch-audit-787b06` · App version `1.0.0` (build `1`)

**Not legal or tax advice.** Sections marked 🇳🇱 need confirmation from a Dutch
accountant (boekhouder), the KVK, the Belastingdienst, or Apple Developer Support.

---

## Verification performed for this audit

Everything below was run in this worktree; claims are based on actual output, not inspection alone.

| Check | Command | Result |
| --- | --- | --- |
| Type safety | `npx tsc --noEmit` | ✅ exit 0, no errors |
| Tests | `npx jest` | ✅ 57 passed / 57, 4 suites |
| Lint | `npx expo lint` | ✅ exit 0, no findings |
| Native config | `npx expo prebuild -p ios --clean` | ✅ succeeded; real `Info.plist` + entitlements inspected, then deleted |
| DB security | Supabase advisors + live `has_function_privilege()` query | ⚠️ 4 over-exposed functions confirmed |

Three things I initially suspected were **disproved** by generating the real native project — recorded here so nobody re-raises them:

- `NSAllowsArbitraryLoads` is **`false`** in the generated `Info.plist` (Expo's introspect *template* shows `true`, the written plist does not).
- The 1024×1024 app icon **is** alpha-flattened by prebuild (`hasAlpha: no`) — no ITMS-90717 risk.
- `_expo._tcp` / the Expo Dev Launcher local-network string **are** stripped from non-Debug builds by a build phase that `expo-dev-launcher` installs (verified present in the generated `.pbxproj`).

---

## 🔴 Blockers — must fix before submission

### 1. Non-paying users are permanently trapped, with no in-app account deletion
**Why:** App Review Guideline 5.1.1(v) requires in-app account deletion for any app that
supports account creation. GDPR Art. 17 requires an erasure route. This app creates an
account and stores personal data *before* the paywall, then locks the user out forever.

The trap, end to end:

- Every install gets an anonymous Supabase account at first launch — [AuthProvider.tsx:94](src/features/auth/AuthProvider.tsx:94)
- In the `stella-*` variants, `completeOnboarding` runs at the `preparing` step — [OnboardingFlow.tsx:202](src/features/onboarding/engine/OnboardingFlow.tsx:202) — which writes `display_name`, `gender`, `life_goal` and all raw free-text answers to Supabase — [completeOnboarding.ts:44](src/features/onboarding/engine/completeOnboarding.ts:44)
- That happens **before** the paywall. Step order in [stellaClaude.ts:225](src/features/onboarding/variants/stellaClaude.ts:225): `preparing` → `auth-sheet` → `paywall`. A real Apple/Google/email identity can be linked at that `auth-sheet` step, pre-purchase.
- After onboarding, [index.tsx:15](src/app/index.tsx:15) redirects any non-premium user to `/paywall`
- [paywall.tsx:98](src/app/paywall.tsx:98) passes `closeDelayMs={null}` (never closable); `NotePaywall` has no close control at all
- Settings → Account → Delete account lives under `(main)/`, reachable only when `isPremium` is true

Net effect: a user gives you their name and written life goal, declines to subscribe, and
has no way to delete any of it — or to reach support — from inside the app.

**Fix:** make account deletion (and Privacy/Terms/support contact) reachable from the
paywall itself. A "Delete my data" or "Privacy choices" affordance in `PaywallFooter`
wired to `auth.deleteAccount()` is the smallest change that closes both the Apple and
the GDPR exposure.

### 2. Paywalls are missing the required auto-renewable subscription disclosures
**Why:** Guideline 3.1.2 requires the *purchase screen itself* to state the subscription
title, length, price, that payment is charged to the Apple ID at confirmation, and that
it auto-renews unless cancelled ≥24h before period end. This is one of the most common
first-submission rejections.

Both paywalls show only a bare price line:
- [TimelinePaywall.tsx:289](src/features/paywall/TimelinePaywall.tsx:289) — `Then $59.99/year`
- [NotePaywall.tsx:145](src/features/paywall/NotePaywall.tsx:145) — `3 days free, then $59.99/year`

The correct text already exists in your Terms — [legal/index.ts:46](supabase/functions/legal/index.ts:46) — but Apple requires it on the screen where the purchase happens, not only behind a link.

Related, same guideline: the CTA `"Try for $0.00"` — [TimelinePaywall.tsx:283](src/features/paywall/TimelinePaywall.tsx:283) — presents a $59.99/yr commitment as a zero-price action. Apple has rejected this pattern. `Start 3-day free trial` is the safer phrasing.

### 3. First-version IAP products must ship with the binary, or the reviewer sees a dead app
**Why:** Guideline 2.1 (App Completeness). For a **hard-paywalled** app this is the highest-probability rejection path.

If RevenueCat returns no offering, [useOffering.ts:144](src/features/paywall/useOffering.ts:144) sets `unavailable: true`, which **disables the CTA** — [TimelinePaywall.tsx:286](src/features/paywall/TimelinePaywall.tsx:286) — leaving the reviewer at a screen with no way forward. There is no reviewer bypass: `devMockPurchases` is `__DEV__`-gated at [config.ts:82](src/lib/config.ts:82).

**Fix:**
- Attach all three IAP products (monthly, yearly, lifetime) to the **version submission** in App Store Connect. On a first release they are reviewed *with* the binary; if left unattached they sit in "Waiting for Review" and cannot be purchased in the sandbox.
- Confirm the products are attached to both the entitlement **and** the current Offering in RevenueCat.
- Write App Review notes explaining the hard paywall and how to complete a sandbox purchase.

### 4. Email sign-in is offered in the UI but cannot deliver a code
**Why:** Guideline 2.1 — a visible feature that does not work.

[AuthProvider.tsx:387](src/features/auth/AuthProvider.tsx:387) sets `email: config.hasSupabase`, which is always true in production, so the email button always renders. But
[docs/SETUP_REQUIRED.md](docs/SETUP_REQUIRED.md) records custom SMTP as still open, and
Supabase's default SMTP only delivers to project team members. A reviewer who taps
"Continue with email" gets a code-entry screen and no email.

**Fix:** configure custom SMTP (the Resend domain `joinfutureself.com` is already verified per the same doc), **or** hide the email option until it works.

### 5. Placeholder Face ID permission string ships in the binary
**Why:** Guideline 5.1.1 — purpose strings must clearly explain the use. Templated defaults get rejected.

Confirmed in the generated `Info.plist`:

```
NSFaceIDUsageDescription = "Allow $(PRODUCT_NAME) to access your Face ID biometric data."
```

It is injected by the `expo-secure-store` plugin — [app.json:43](app.json:43) — and **`SecureStore` is never imported anywhere in `src/` or `widgets/`**. You are shipping a biometric permission string for a capability the app does not use. (`$(PRODUCT_NAME)` would also expand to `FutureSelf`, not `Future Self`.)

**Fix:** remove `expo-secure-store` from `plugins` and `dependencies`. See also 🟡 item on token storage — if you instead decide to *use* SecureStore, write a real purpose string.

### 6. Four `SECURITY DEFINER` functions are callable by anonymous users on the live database
**Why:** Privileged server actions exposed to the public REST API. Confirmed against the
live project (`ykgswczatkspryetstor`) — this is measured, not theoretical:

| Function | `anon` | `authenticated` | Impact |
| --- | --- | --- | --- |
| `public.invoke_push_function(text)` | ✅ can execute | ✅ | Reads `dispatch_secret` from Vault and POSTs to an **arbitrary** `/functions/v1/<path>` with the secret attached |
| `public.enqueue_due_notifications(int)` | ✅ | ✅ | Anyone can force notification enqueueing — abuse and cost vector |
| `public.handle_new_user()` | ✅ | ✅ | Trigger function exposed as an RPC endpoint |
| `public.recalc_notification_state(uuid)` | ✅ | ✅ | Accepts an arbitrary user UUID; `anon` was never intended to have this |

**Root cause** — and the fix is already in your own codebase. The older migration uses:

```sql
revoke all on function public.invoke_push_function(text) from public;   -- ❌ misses anon/authenticated
```

`revoke ... from public` only drops the `PUBLIC` pseudo-role. Supabase separately grants
`EXECUTE` to `anon` and `authenticated` on everything in the `public` schema, so those
grants survive. The later [20260809100000_notifications_v2.sql:41](supabase/migrations/20260809100000_notifications_v2.sql:41) gets it right:

```sql
revoke all on function public.queue_read(int, int) from public, anon, authenticated;  -- ✅
```

Every function revoked with the v2 pattern is correctly locked; every one using the old
pattern is exposed. Add a migration applying `from public, anon, authenticated` to the
four functions above (keeping the `service_role` / `authenticated` grants that are
genuinely intended, e.g. `recalc_notification_state` for `authenticated`).

Files: [20260809092000_notifications.sql:618](supabase/migrations/20260809092000_notifications.sql:618), [:580](supabase/migrations/20260809092000_notifications.sql:580), [:423](supabase/migrations/20260809092000_notifications.sql:423), [20260809090000_core.sql:46](supabase/migrations/20260809090000_core.sql:46)

### 7. Terms & Privacy Policy are missing legally required identity details
**Why:** Dutch/EU law requires a trader to disclose who they are. GDPR Art. 13(1)(a)
requires the controller's identity and contact details. Apple requires custom EULAs to
carry its minimum terms.

[supabase/functions/legal/index.ts:6](supabase/functions/legal/index.ts:6) declares only:

```js
const CONTACT = 'denizsahinbusiness@gmail.com';
const COMPANY = 'Improvement Labs';
```

Missing, and needed before launch:
- **Legal entity identification** — the eenmanszaak's registered trade name, the owner's name, **KVK number**, **BTW-id**, and a **postal address**. "Improvement Labs" alone identifies no legal person.
- **International transfer basis** for RevenueCat (US) — the policy names it as a processor but cites no transfer mechanism (SCCs / EU-US Data Privacy Framework). GDPR Ch. V.
- **Apple's EULA minimum terms** — if you use a custom EULA rather than Apple's standard one, it must state that Apple is not a party, has no warranty or support obligation, and is a **third-party beneficiary** entitled to enforce it. None of this is present.
- **Right of withdrawal (herroepingsrecht)** treatment for digital content.
- Governing law / dispute resolution.

The policy is otherwise genuinely good — accurate on what's collected, honest about the
no-ads/no-selling posture, and it correctly matches what the code does.

### 8. `eas submit` will fail — the App Store Connect API key is missing
[eas.json:85](eas.json:85) points at `./credentials/AuthKey_RQUZ7CT4QG.p8`. That
directory **does not exist** in the repo and `credentials/` is gitignored. Restore the
`.p8` locally (never commit it), or switch to `EXPO_APPLE_APP_SPECIFIC_PASSWORD` / EAS-managed credentials.

---

## 🟡 Should do before launch

**Product correctness**

- **Dead trial-reminder toggle on the gate paywall.** [paywall.tsx:98](src/app/paywall.tsx:98) hardcodes `trialReminder` to `true` and passes `onTrialReminderChange={() => {}}`. The switch renders ON, cannot be turned off, and displays *"We'll remind you on Aug 18 ✓"* — a promise made by a control that does nothing. Wire it or remove it from the gate.
- **Unguarded non-null assertion.** [NotePaywall.tsx:51](src/features/paywall/NotePaywall.tsx:51) calls `purchasePackage(data.pkg!)` with no null check. `TimelinePaywall` has the guard ([:71](src/features/paywall/TimelinePaywall.tsx:71)); `NotePaywall` relies on invariants in `useOffering` holding. Add the same guard.
- **Entitlement ID is a typo that has been institutionalised.** `EXPO_PUBLIC_RC_ENTITLEMENT_ID: "FutureSelffffff Pro"` across all four profiles in [eas.json](eas.json). It works today only because [purchases.ts:100](src/lib/purchases.ts:100) treats *any* active entitlement as premium. That fallback is a reasonable safety net, but it also means a genuinely broken entitlement config would never surface. Rename in the RevenueCat dashboard and here.

**Privacy & security**

- **Auth tokens stored unencrypted.** [supabase.ts:23](src/lib/supabase.ts:23) uses `AsyncStorage` for the session. `expo-secure-store` is already a dependency (and is currently only earning you a Face ID permission string — see Blocker 5). Either use it for the session, or drop it.
- **Analytics and crash reporting initialise before any consent.** [_layout.tsx:28](src/app/_layout.tsx:28) calls `initMonitoring()` and `initAnalytics()` at module load. For EU users, ePrivacy/AVG generally requires consent for analytics. Your privacy policy hedges with "legitimate interest / consent where required" — align the code with whichever basis you actually rely on.
- **`Purchases.setLogLevel(LOG_LEVEL.DEBUG)` is unconditional** — [purchases.ts:51](src/lib/purchases.ts:51). Verbose purchase logging in production. Gate on `__DEV__`.
- **No Privacy/Terms links in Settings** — only on the paywall ([PaywallFooter.tsx](src/features/paywall/PaywallFooter.tsx)). Once subscribed, users can't find them.
- **Legal pages served from a raw `*.supabase.co` functions URL** — [PaywallFooter.tsx:10](src/features/paywall/PaywallFooter.tsx:10). Works, but looks untrustworthy in App Review and in the App Store listing. You already own `joinfutureself.com`.
- **Non-constant-time secret comparison** in the RevenueCat webhook — [revenuecat-webhook/index.ts:28](supabase/functions/revenuecat-webhook/index.ts:28). Low practical risk; cheap to fix.
- **Remaining Supabase advisor items:** `campaigns` has RLS enabled with **no policies** (dead table?); `set_updated_at` and `compute_next_due` have mutable `search_path`.

**Build & release**

- **No app-level privacy manifest.** No `PrivacyInfo.xcprivacy` is generated and `ios.privacyManifests` is not set in [app.json](app.json). Apple emails ITMS-91053 warnings for undeclared required-reason API use. Pod-provided manifests (RevenueCat, Sentry, Google Sign-In) only appear after `pod install`, so this could not be fully verified here — **check the upload warnings on your first TestFlight build**.
- **Verify `aps-environment` flips to `production`.** The generated entitlements contain `development`. EAS normally overrides this for store builds — confirm on the real archive.
- **Verify the dev-launcher strip actually ran.** The build phase is present in the project, but confirm the shipped IPA's `Info.plist` has no `_expo._tcp` and no Expo Dev Launcher local-network string.
- **No CI pipeline and no git remote configured.** No automated typecheck/test/lint gate before a build goes out.
- **Test coverage gaps.** 57 tests across `dailySet`, `experiments`, `variants`, `onboardingFlow` — all green. Nothing covers **purchases, auth, the paywalls, push registration, or the edge functions**, which is where every blocker above lives.
- **`docs/SETUP_REQUIRED.md` is stale in ways that will mislead you.** It references the old bundle id `com.futureself.app` (now `com.futureself.mobile`), legal hosting at `futureself.app` (now the Supabase `legal` function), and a test-key production guard that commit `53966da` removed — `initPurchases()` no longer refuses test keys in release builds.
- **App icon is flattened onto the default background,** not your brand `#F3E9DC`. Cosmetic, but it's the first thing anyone sees.
- **iOS deployment target is 16.4** ([app.json:58](app.json:58)) — a fairly high floor. Deliberate? If not, 15.1 widens reach.

---

## 🟢 Nice to have / post-launch

- `UISupportedInterfaceOrientations` includes `PortraitUpsideDown` despite `orientation: "portrait"`.
- `NSSupportsLiveActivities: true` is declared (via the Voltra plugin) but no Live Activities are implemented.
- Widget extension `CFBundleDisplayName` is `FutureSelfWidgets` — unpolished if surfaced.
- Prebuild warns: `[Voltra] Skipping user images: directory does not exist at ./assets/voltra`.
- `LSMinimumSystemVersion: 12.0` is a macOS key inherited from the Expo template; harmless.
- iPad is disabled (`supportsTablet: false`) — fine for v1, but it's a whole device class of revenue.
- English only, though `expo-localization` is already wired. Dutch would be a natural first localization.
- Jest reports a worker that "failed to exit gracefully" — a teardown leak, not a failure.
- Supabase "leaked password protection" is disabled; irrelevant while auth is OTP/OAuth only.

---

## 📋 Non-code action items

### A. Apple Developer enrollment as a Dutch eenmanszaak 🇳🇱

Apple's enrollment types include **Individual**, **Sole Proprietor / Single Person
Business**, and **Company / Organization**. The distinction matters because it decides
what name appears as the seller on your App Store listing.

| | Individual | Sole Proprietor / Single Person Business | Company / Organization |
| --- | --- | --- | --- |
| Seller shown | Your personal name | Your business/trade name | Registered company name |
| D-U-N-S required | No | **Yes** | Yes |
| Fits an eenmanszaak | Yes | Yes — usually the right one | Generally **not** |

Key point: an eenmanszaak is **not a separate legal entity** from you as a natural
person. Apple's Organization enrollment requires a legal entity name and explicitly
excludes trade names and DBAs, so eenmanszaak owners are typically routed to
**Sole Proprietor / Single Person Business** — which still lets "Improvement Labs"
appear as the seller, but requires a D-U-N-S number. Confirm your specific case with
Apple Developer Support before paying, since Apple's handling of this varies by region.

What to gather:
- [ ] **KVK number** and an extract (uittreksel) matching the name you'll submit
- [ ] **D-U-N-S number** — free from Dun & Bradstreet; use Apple's D-U-N-S lookup tool first, as one may already exist for your KVK registration. Allow ~5 business days (occasionally up to 30). The D&B record's name and address **must match your KVK registration exactly** — mismatches are the #1 cause of enrollment delays.
- [ ] **BTW-id (VAT number)** for App Store Connect → Agreements, Tax, and Banking
- [ ] **Business bank account** for payouts (IBAN in your business name)
- [ ] Apple Developer Program membership — **€99/year**
- [ ] **W-8BEN-E** (or W-8BEN) tax form in App Store Connect, to claim the NL–US treaty rate and avoid 30% US withholding on US sales
- [ ] Decide the public seller name now — changing it after launch is awkward

### B. EU Digital Services Act trader status 🇳🇱 — easy to miss, will delist you

Apple requires every developer distributing in the EU to declare **trader status** and
supply a verifiable name, address, phone number, and email. Since February 2025, apps
from developers who haven't completed trader verification are **removed from EU
storefronts**. Selling a paid subscription makes you unambiguously a trader.

- [ ] Complete the trader declaration in App Store Connect → Business
- [ ] Note the contact details you provide are **published on your App Store listing** — use a business address and a business email, not a home address and not `denizsahinbusiness@gmail.com` if you'd rather keep that private. A KVK-registered business address or a post box works.

### C. VAT / BTW handling 🇳🇱 — confirm with your boekhouder

General shape (verify, do not rely on this):
- For EU sales, **Apple acts as commissionaire** — Apple Distribution International Ltd (Ireland) is the seller of record to the end customer and handles consumer VAT, including per-country rates.
- Your supply is therefore **B2B to Apple in Ireland**, normally an intra-community service under the reverse-charge mechanism at 0% Dutch BTW, reported in your BTW-aangifte and your **opgaaf ICP**.
- Apple pays you **net of its commission** (15% under the Small Business Program if you're under $1M/yr — apply for it, it is not automatic; otherwise 30%).

- [ ] Confirm reverse-charge and ICP treatment with your boekhouder
- [ ] Apply for the **App Store Small Business Program** (15% rate)
- [ ] Enter your BTW-id in App Store Connect
- [ ] Sign the **Paid Applications Agreement** — `docs/SETUP_REQUIRED.md` records this as already active ✅
- [ ] Confirm whether the Kleineondernemersregeling (KOR) interacts badly with intra-community supplies — it often does

### D. App Store Connect metadata to prepare

- [ ] **App name** (30 chars) — ASC currently has "Future Self — Daily Quotes"; the on-device name is "Future Self"
- [ ] **Subtitle** (30 chars)
- [ ] **Description** (4000 chars) — must state plainly that a subscription is required, since the app is unusable without one
- [ ] **Keywords** (100 chars)
- [ ] **Promotional text** (170 chars, editable without a new build)
- [ ] **Screenshots** — required: 6.9" and 6.5" iPhone. Others are optional/inherited. Portrait only. Note your paywall-first flow means screenshots must sell the *content*, not the gate.
- [ ] **App preview video** (optional)
- [ ] **Support URL** (required) and **Marketing URL** (optional) — `joinfutureself.com`
- [ ] **Privacy Policy URL** (required) — currently the Supabase functions URL
- [ ] **License Agreement** — either accept Apple's standard EULA or attach your custom Terms (see Blocker 7)
- [ ] **Age rating questionnaire** — motivational content should land at 4+
- [ ] **Pricing and availability** — including whether to ship outside the EU at launch
- [ ] **Export compliance** — already handled in code: `ITSAppUsesNonExemptEncryption: false` is set in [app.json:16](app.json:16) and confirmed present in the built `Info.plist` ✅
- [ ] **App Review notes** — hard paywall explanation + sandbox purchase instructions (see Blocker 3)

### E. App Privacy "nutrition label" — what the code actually does

Based on the SDKs and calls in this repo, your declarations should be:

| Data type | Collected | Linked to user | Tracking | Source |
| --- | --- | --- | --- | --- |
| Email address | Yes (optional sign-in) | Yes | No | Supabase auth |
| Name | Yes (onboarding) | Yes | No | `profiles.display_name` |
| User content (life goal, free text) | Yes | Yes | No | `personalization.life_goal`, `raw_answers` |
| Product interaction | Yes | Yes | No | PostHog |
| Crash data | Yes | Yes* | No | Sentry |
| Purchase history | Yes | Yes | No | RevenueCat |
| Device ID / push token | Yes | Yes | No | `devices` table |
| Coarse location | **No** | — | — | Timezone/locale only — not location |

\* Sentry is configured with `sendDefaultPii: false` and a `beforeSend` that strips
everything but the anonymous ID — [monitoring.ts:21](src/lib/monitoring.ts:21).

Two things that make this easier than it looks:
- **Answer "No" to tracking across apps.** No IDFA, no ad SDKs, no ATT prompt — correctly, there is no `NSUserTrackingUsageDescription` in the built plist.
- The analytics layer actively strips PII by key pattern before sending — [analytics.ts:53](src/lib/analytics.ts:53) — so "free text is never sent to analytics" is a claim your code genuinely backs up.

Third-party SDKs to disclose: **RevenueCat, PostHog, Sentry, Supabase, Google Sign-In, Expo Notifications**.

### F. Remaining external setup (from `docs/SETUP_REQUIRED.md`, re-verified)

- [ ] Custom SMTP for email OTP — **blocks Blocker 4**
- [ ] Real-device push end-to-end test — pipeline is deployed but never verified with a real token
- [ ] Restore `credentials/AuthKey_RQUZ7CT4QG.p8` — **blocks Blocker 8**
- [ ] Confirm APNs key `32X543A5XM` covers Sandbox **and** Production

---

## Suggested order of attack

1. **Blocker 6** (database grants) — smallest diff, live security exposure, ~15 minutes.
2. **Blockers 2 + 5** (subscription disclosure text, drop `expo-secure-store`) — pure code, removes the two highest-probability rejection reasons.
3. **Blocker 1** (deletion route from the paywall) — the one real design change; touches Apple compliance, GDPR, and product ethics at once.
4. **Blockers 4 + 8** (SMTP, `.p8`) — external config, no code.
5. **Blocker 7** (legal identity details) — needs your KVK/BTW numbers; do it alongside the DSA trader declaration in §B since they need the same information.
6. **Blocker 3** (attach IAPs to the version submission) — at submission time, and the easiest one to forget.
