# ChatGPT console-configuration prompts

This file contains ready-to-paste prompts for an agentic ChatGPT session
(browser-operating mode, logged into your own accounts) to configure every
external console the Future Self app needs. Claude Code cannot click through
web consoles itself — this is the handoff.

## How to use this file (for the owner, not ChatGPT)

1. Run the sections **in order (A → J)**. Some prompts consume values
   produced by earlier ones (e.g. prompt B needs the webhook secret from A;
   prompt A's second pass needs the RevenueCat secret key from B). The
   dependency notes at the top of each section tell you when a prompt has a
   "first pass" and a "second pass."
2. Open a **new ChatGPT conversation per prompt** (don't chain them in one
   thread) and paste the entire fenced code block as your message. ChatGPT
   should be in a mode where it can operate a browser logged into your
   accounts (Supabase, RevenueCat, Apple, Google, Sentry, Expo).
3. **Review before anything irreversible.** Every prompt instructs ChatGPT to
   stop and report before payments, agreements, 2FA, identity checks, or
   deletions — but skim what it proposes before it clicks "Save," "Create,"
   or "Submit" on anything you're unsure about.
4. When a prompt finishes, it ends with an **OUTPUT BLOCK** — a filled-in
   template of every value/ID it collected or confirmed. Copy that whole
   block and paste it back into your Claude Code session (or save it
   somewhere safe — it contains secrets).
5. Once you've collected all output blocks, use the **"When everything is
   collected"** section at the bottom of this file to assemble the final
   `.env`, `supabase secrets set` calls, and CLI steps.

### Master checklist

| # | Prompt | Console | Produces | Consumed by |
|---|--------|---------|----------|-------------|
| A1 | A (first pass) | Supabase Dashboard | Auth toggles ON; Apple provider configured; `DISPATCH_SECRET`, `REVENUECAT_WEBHOOK_SECRET` generated + set (vault + edge secrets); SMTP status | `.env` n/a (server-side); `REVENUECAT_WEBHOOK_SECRET` value → prompt B |
| B | B | RevenueCat Dashboard | Verified entitlement/products/offering; webhook created (uses A1's secret); secret API key `sk_...` | `supabase secrets set REVENUECAT_SECRET_API_KEY` (→ prompt A2); later real `appl_…`/`goog_…` keys → `.env` |
| C | C | Apple Developer Portal | App ID capabilities (Sign In w/ Apple, Push, App Groups); App Group `group.com.futureself.app`; APNs Auth Key ID + Team ID | `eas credentials` (owner uploads the .p8) |
| D | D | App Store Connect | App created; subscription group + `monthly`/`yearly` products; `lifetime` IAP; product IDs to match RevenueCat | Confirms/corrects RevenueCat product identifiers in prompt B |
| E | E (first pass) | Google Cloud Console | OAuth consent screen; Web + iOS OAuth client IDs; Android client (second pass, needs SHA-1) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env`; both + Android client ID → Supabase Google provider (prompt A2) |
| F | F | Google Play Console | App created; `monthly`/`yearly` subscriptions; `lifetime` in-app product; license tester added | Confirms/corrects RevenueCat Android product identifiers |
| G | G | Firebase Console | Android app attached to same GCP project; FCM v1 confirmed; service-account JSON downloaded | `eas credentials` (owner uploads the JSON) |
| H | H | Sentry | Project created; DSN; auth token (releases+org:read scopes); org/project slugs | `EXPO_PUBLIC_SENTRY_DSN` in `.env`; `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` as EAS secrets |
| I | I | Expo (expo.dev) | Confirmed account/org name | Owner runs `npx eas init` / `eas credentials` (CLI, not ChatGPT) |
| A2 | A (second pass) | Supabase Dashboard | Google provider filled in with E's client IDs; `REVENUECAT_SECRET_API_KEY` set from B | — |
| B2 | B (return-later) | RevenueCat Dashboard | Real `appl_…`/`goog_…` public SDK keys once C/D and E/F/G are linked | `.env` `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` |
| J | J (optional) | futureself.app host | Placeholder terms/privacy pages, or an owner note to redirect the in-app URLs | none (verification only) |

Ordering dependencies to keep in mind:

- **A1 before B**: B's webhook step needs `REVENUECAT_WEBHOOK_SECRET` from A1.
- **B before A2**: A2 sets `REVENUECAT_SECRET_API_KEY`, whose value comes from B.
- **C and D before B2** (iOS side), **G and F before B2** (Android side): the
  real RevenueCat SDK keys only appear once the store apps are linked.
- **E1 before A2**: Google provider in Supabase needs all three client IDs;
  the Android one may itself be a second pass (E2) pending a SHA-1 from
  `eas credentials`.
- **I is standalone** but logically first if you don't yet have an Expo
  account — you'll need one before any `eas` CLI step referenced in C, G, or
  the final section.

---

## A. Supabase Dashboard — first pass (Auth + secrets)

```
You are operating my browser. Work only inside the Supabase dashboard
(supabase.com/dashboard), project ref ykgswczatkspryetstor (project name
"claudefutureself"). Do not change any setting not listed here. Never delete
anything. Never rotate or revoke an existing key or secret. If a listed item
already exists with the correct value, verify it and move on instead of
recreating it. If any step requires a payment/agreement action, 2FA, or an
identity check, stop and report back instead of proceeding.

GOAL: enable required auth settings, configure the Apple provider, fix the
email-change template, check SMTP status, and set two generated secrets.

STEPS:

1. Go to Authentication → Sign In / Providers (or use the dashboard's
   settings search for "anonymous" if the menu path has moved).
   - Find "Allow anonymous sign-ins" (may be under Authentication →
     Sign In / Up, or Authentication → Settings). Set it ON. Save.
   - Find "Allow manual linking of identities" (sometimes phrased "Allow
     manual linking"). Set it ON. Save.
   - Report the before/after state of both toggles.

2. Go to Authentication → Sign In / Providers → Apple.
   - Enable the Apple provider if not already enabled.
   - In the "Client IDs" field (this is a comma-separated allow-list of
     bundle IDs / Services IDs), ensure the literal string
     com.futureself.app
     is present. If the field is empty, set it to exactly:
     com.futureself.app
     If it already contains other values, append com.futureself.app to the
     existing comma-separated list rather than replacing it.
   - Leave "Secret Key (for OAuth)" empty — this is a native-only flow and
     needs no secret.
   - Save. Report the final Client IDs value.

3. Go to Authentication → Sign In / Providers → Google.
   - Do NOT enable or fill this in yet if you do not have client IDs handy
     — this step is completed in a later pass. Just report whether the
     Google provider is currently enabled and what (if anything) is already
     in its Client IDs field, without changing it.

4. Go to Authentication → Email Templates → "Change Email Address" (may be
   labeled "Email Change" or similar — use settings search for "change
   email" if not found under Email Templates).
   - Replace the template body so the email delivers the 6-digit code
     variable {{ .Token }} prominently (e.g. plain text: "Your confirmation
     code is {{ .Token }}"), instead of a magic-link button/href. Keep the
     rest of the template's branding/structure otherwise intact — only
     change the body so the {{ .Token }} code is delivered instead of (or
     in addition to, but the code must be clearly presented) a magic link.
   - Save. Report the new template body you set.

5. Go to Project Settings → Authentication → SMTP Settings (or Auth →
   Emails → SMTP). Do NOT enable or configure SMTP — just report the
   current status: is custom SMTP currently configured, or is it on
   Supabase's default/limited email sending? This is informational only.

6. Go to Edge Functions → Secrets (sometimes under Project Settings → Edge
   Functions, or "Manage secrets"). Check what secrets already exist. For
   each of the following, if it does NOT already exist, generate a random
   64-character hex value (you can generate this yourself as a random
   64-hex-digit string — 32 bytes of randomness rendered as hex) and add it
   as a new secret. If a secret with that name already exists, do NOT
   overwrite it — report its name as "already present" without revealing or
   changing its value.

   a. DISPATCH_SECRET — generate a new 64-hex-character value if absent,
      add it as an Edge Function secret named exactly DISPATCH_SECRET.

   b. REVENUECAT_WEBHOOK_SECRET — generate a new 64-hex-character value if
      absent, add it as an Edge Function secret named exactly
      REVENUECAT_WEBHOOK_SECRET.

   c. REVENUECAT_SECRET_API_KEY — this value comes from RevenueCat and is
      not yet available in this session. Skip adding it now. Report that
      it is pending a second pass.

7. Go to the SQL Editor. Run the following statement, substituting
   <DISPATCH_SECRET_VALUE> with the EXACT same value you generated and set
   in step 6a (they must match byte-for-byte):

   select vault.create_secret('<DISPATCH_SECRET_VALUE>', 'dispatch_secret');

   If a vault secret named 'dispatch_secret' already exists, do not create
   a duplicate — report that it already exists instead of running the
   insert, and flag this so the human can verify it matches the edge
   function secret from step 6a (you cannot read back the value to compare
   it yourself).

OUTPUT BLOCK — fill in and return exactly this, replacing bracketed items:

  Supabase project: ykgswczatkspryetstor
  Anonymous sign-ins: [ON / already ON / could not set — reason]
  Manual linking: [ON / already ON / could not set — reason]
  Apple provider enabled: [yes/no]
  Apple Client IDs field (final value): [value]
  Google provider currently enabled: [yes/no]
  Google provider Client IDs field (current value, unchanged): [value or empty]
  Email-change template updated to use {{ .Token }}: [yes/no + brief description of new body]
  SMTP status: [custom SMTP configured / default Supabase SMTP / unknown — where you checked]
  DISPATCH_SECRET: [newly generated value, OR "already present — not changed"]
  REVENUECAT_WEBHOOK_SECRET: [newly generated value, OR "already present — not changed"]
  REVENUECAT_SECRET_API_KEY: pending — set in second pass after RevenueCat prompt (B)
  vault.dispatch_secret: [created with value matching DISPATCH_SECRET above / already existed, not modified]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## B. RevenueCat Dashboard

Depends on: prompt A1's `REVENUECAT_WEBHOOK_SECRET` value (paste it into the
prompt below before running). Some steps here depend on C and D (Apple) and
F/G (Google) being done first — those are marked "return later."

```
You are operating my browser. Work only inside the RevenueCat dashboard
(app.revenuecat.com). Do not change any setting not listed here. Never
delete anything. Never rotate or revoke an existing API key or webhook.
If a listed item already exists with the correct configuration, verify it
instead of recreating it. If any step requires a payment/agreement action,
2FA, or an identity check, stop and report back instead of proceeding.

GOAL: verify the entitlement, products, and offering are wired correctly;
add the webhook; collect the secret API key; note which SDK keys still need
real values.

CONTEXT: the project already exists for app com.futureself.app. Skip project
creation.

STEPS:

1. Go to the project's Entitlements page. Confirm an entitlement with
   identifier exactly:
   FutureSelffffff Pro
   (note: this is the literal identifier, including the misspelling
   "Selffffff" and the trailing space before "Pro" if present — copy it
   character-for-character from what already exists rather than assuming;
   report the EXACT identifier string as it currently exists in the
   dashboard, character by character, in case it differs subtly from what
   I've described). Do not create a new entitlement if one close to this
   name already exists — report the discrepancy instead of guessing.

2. Go to Products. Confirm three products exist (exact identifiers matter —
   report each one's exact identifier string as configured):
   - a monthly subscription (expected identifier: "monthly")
   - a yearly subscription (expected identifier: "yearly")
   - a lifetime non-consumable (expected identifier: "lifetime")
   For each, report whether it exists, its exact identifier, and which
   store(s) (App Store / Play Store) it's linked to. If store linkage is
   missing because the store-side product doesn't exist yet, that's
   expected at this stage — just report it, don't try to fix it.

3. For each of the three products, confirm it is attached to the
   "FutureSelffffff Pro" entitlement (Entitlements tab on the product, or
   the entitlement's own "Products" tab). If any product is not attached,
   attach it now. Report before/after state per product.

4. Go to Offerings. Find the offering marked "Current" / default. If none
   is marked current, report that and do not silently pick one — flag it
   for the human. Inside the current offering, confirm packages:
   - a package with identifier $rc_annual containing the "yearly" product
   - a package with identifier $rc_monthly containing the "monthly" product
   - a custom package (identifier "lifetime") containing the "lifetime"
     product
   If any package is missing, add it with the exact identifier given above
   and attach the corresponding product. Report before/after per package.

5. Go to Integrations → Webhooks. Check if a webhook already exists with
   URL:
   https://ykgswczatkspryetstor.supabase.co/functions/v1/revenuecat-webhook
   If it already exists, verify (don't recreate) that its Authorization
   header is set — do not reveal or change its existing value, just report
   that it's present. If it does NOT exist, create a new webhook with:
   - URL: https://ykgswczatkspryetstor.supabase.co/functions/v1/revenuecat-webhook
   - Authorization header value: <PASTE_A1_REVENUECAT_WEBHOOK_SECRET_HERE>
   - Enable all event types (or leave at the dashboard's default "all
     events" selection if that's the default).
   Save. Report whether it was created or already existed.

6. Go to API Keys (may be under Project Settings → API Keys). Find the
   **secret** key (starts with sk_, used server-side — NOT a public SDK
   key). If one already exists, do not rotate it — copy its value for the
   output block below (secret keys are normally shown in full or can be
   revealed once; if the dashboard only shows it once and it was already
   generated previously, report that it exists but cannot be re-displayed,
   and flag that the human may need to check their password manager or
   generate a new one manually — do NOT generate a new one yourself since
   that could be treated as a rotation).

7. Go to Apps (per-platform apps within the project) or Project Settings →
   API Keys → Public app-specific keys. Report the current state of the
   iOS app's public SDK key (starts with appl_) and the Android app's
   public SDK key (starts with goog_). These will likely still show as
   placeholder/unlinked or simply not usable for billing until the App
   Store Connect app (prompt D) and Google Play app (prompt F) are fully
   linked. Report whatever is currently visible — do not attempt to force
   generation.

OUTPUT BLOCK — fill in and return exactly this:

  Entitlement identifier (exact, char-for-char, as found): [value]
  Entitlement matches "FutureSelffffff Pro"?: [yes / no — report exact diff]
  Product "monthly": [exists / missing] — identifier: [value] — linked stores: [none/iOS/Android/both]
  Product "yearly": [exists / missing] — identifier: [value] — linked stores: [none/iOS/Android/both]
  Product "lifetime": [exists / missing] — identifier: [value] — linked stores: [none/iOS/Android/both]
  All three attached to entitlement: [yes/no — detail any gaps]
  Current offering name: [value, or "none marked current — FLAG"]
  Package $rc_annual → yearly: [present/added]
  Package $rc_monthly → monthly: [present/added]
  Package "lifetime" → lifetime: [present/added]
  Webhook to revenuecat-webhook URL: [created / already existed]
  Webhook Authorization header set: [yes, confirmed present / could not verify]
  REVENUECAT_SECRET_API_KEY (sk_...): [value, or "exists but not re-displayable — human must retrieve"]
  iOS public SDK key (appl_...): [value if available, else "not yet available — pending App Store Connect app linkage (prompt D)"]
  Android public SDK key (goog_...): [value if available, else "not yet available — pending Google Play app linkage (prompt F)"]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## C. Apple Developer Portal

```
You are operating my browser. Work only inside the Apple Developer portal
(developer.apple.com/account). Do not change any setting not listed here.
Never delete or revoke any existing Identifier, Key, or Certificate. If a
listed item already exists with the correct configuration, verify it
instead of recreating it. If any step requires a payment/agreement action,
2FA, or an identity check, stop and report back instead of proceeding.

GOAL: configure the App ID's capabilities, create an App Group, and create
an APNs Auth Key.

STEPS:

1. Go to Certificates, Identifiers & Profiles → Identifiers → App IDs (App
   Groups may need to be listed via the "App Groups" filter/tab of
   Identifiers — if the exact menu label has moved, use the portal's own
   search for "App Groups").
   - Check whether an App Group with identifier
     group.com.futureself.app
     already exists. If not, create one (Identifiers → the "+" button →
     select "App Groups" as the type → description "Future Self" or similar
     → identifier exactly group.com.futureself.app). Report before/after.

2. Go to Identifiers → App IDs. Find the App ID for bundle identifier
   com.futureself.app. If it does not exist, create it (type: App, bundle
   ID: explicit, exactly com.futureself.app, description "Future Self").
   Edit its capabilities:
   - Enable "Sign In with Apple" if not already enabled.
   - Enable "Push Notifications" if not already enabled.
   - Enable "App Groups" if not already enabled, and in its configuration
     assign the group.com.futureself.app group created in step 1 (check the
     box next to it; do not create a duplicate group).
   Save. Report which capabilities were already on vs. newly enabled.

3. Go to Keys. Check existing keys for one already named something like
   "Future Self APNs" or any key with the "Apple Push Notifications
   service (APNs)" capability enabled that looks intended for this app. If
   a suitable one already exists, do NOT create a duplicate — report its
   Key ID and stop. Otherwise, create a new key:
   - Name: "Future Self APNs"
   - Enable capability: "Apple Push Notifications service (APNs)"
   - Register the key, then download the resulting .p8 file (the browser
     will download it once — it cannot be re-downloaded later). Leave it in
     the default Downloads location; do not rename or move it, and do not
     open/paste its contents anywhere.
   - Report the Key ID shown on the confirmation page, and note the
     filename it downloaded as.

4. On the same page or account Membership page, find and report the Team
   ID (10-character alphanumeric string, shown on the Membership page or
   in the top-right account info).

OUTPUT BLOCK — fill in and return exactly this:

  App Group group.com.futureself.app: [created / already existed]
  App ID com.futureself.app: [created / already existed]
  Sign In with Apple capability: [was already ON / newly enabled]
  Push Notifications capability: [was already ON / newly enabled]
  App Groups capability: [was already ON / newly enabled] — assigned group: group.com.futureself.app [yes/no]
  APNs Auth Key: [newly created / already existed — reused existing]
  APNs Key ID: [value]
  APNs .p8 filename downloaded to: [path/filename, or "n/a — reused existing key, no new download"]
  Apple Team ID: [value]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]

  NOTE TO OWNER: the .p8 file itself is not uploaded anywhere by this
  session — you upload it yourself later via `eas credentials`.
```

---

## D. App Store Connect

```
You are operating my browser. Work only inside App Store Connect
(appstoreconnect.apple.com). Do not change any setting not listed here.
Never delete anything. If a listed item already exists with the correct
configuration, verify it instead of recreating it. Do NOT attempt to fill
in banking, tax, or agreement forms — if Agreements/Tax/Banking status
blocks a step, report the status and move on rather than trying to
complete it. If any step requires 2FA or an identity check, stop and
report back.

GOAL: create the app record (if not already created), create the
subscription group with monthly/yearly auto-renewable subscriptions
(yearly gets an introductory free-trial offer), and create the lifetime
non-consumable in-app purchase. Reconcile product IDs against RevenueCat's
expectations.

STEPS:

1. Go to Apps. Check whether an app with bundle ID com.futureself.app
   already exists. If yes, open it and skip to step 2. If no, create a new
   app:
   - Platform: iOS
   - Name: "Future Self" (if unavailable, report the exact error and try
     "Future Self App" or similar, reporting whichever name you actually
     used)
   - Primary language: English (U.S.) unless a different existing default
     is already implied elsewhere in the account — use English (U.S.) if
     unsure.
   - Bundle ID: select com.futureself.app from the dropdown (it must
     already be registered from the Apple Developer portal — if it's not
     in the dropdown, stop and report this as a blocker referencing prompt
     C).
   - SKU: futureself
   - User access: default/full access.
   Create. Report the resulting App Store Connect app ID (numeric).

2. Go to the app → Subscriptions (under "Monetization" or "Features" →
   "In-App Purchases and Subscriptions" depending on current UI — use
   settings search for "Subscriptions" if not found).
   - Check for an existing subscription group. If one already exists that
     looks intended for this purpose, use it and report its name instead
     of creating a new one. Otherwise create a new subscription group
     named:
     Future Self Premium
   - Inside that group, check for existing subscriptions named "yearly"
     and "monthly" (or similar). For each that's missing, create it:
     a. yearly — Reference name: "Yearly", Product ID: yearly,
        Subscription duration: 1 year.
        Add an introductory offer: type "Free Trial". Report exactly what
        duration options the UI offers (e.g. 3 days, 1 week, etc.) and
        select a 3-day free trial if that exact option exists; if not,
        pick the closest available short duration and report which one you
        picked. Do not invent a duration not offered by the UI.
     b. monthly — Reference name: "Monthly", Product ID: monthly,
        Subscription duration: 1 month. No introductory offer needed
        unless you want to mirror yearly — leave it without one to match
        the current app design (only yearly needs an intro trial).
   - For localizations/pricing, use whatever defaults App Store Connect
     proposes (any price tier is fine per the app's design — it reads real
     prices at runtime). Report the price tier / display price you ended
     up with for each, since this is informational, not something to
     optimize.
   - Submit each subscription for review only if the UI requires it to
     save as "Ready to Submit" — otherwise leave in Draft. Do not submit
     the app itself for App Review.

3. Go to the app → In-App Purchases (non-consumable). Check for an
   existing non-consumable named "lifetime" or similar. If missing,
   create one:
   - Type: Non-Consumable
   - Reference name: "Lifetime"
   - Product ID: lifetime
   - Price: any tier (informational).
   Report result.

4. Reconciliation: report the exact three Product IDs you ended up with
   (yearly / monthly / lifetime) and explicitly compare them against
   RevenueCat's expected identifiers "yearly", "monthly", "lifetime" (from
   prompt B's output). If App Store Connect would not let you use those
   exact strings for any reason (e.g. already taken), report the actual
   string used and flag the mismatch clearly instead of silently
   proceeding — RevenueCat's product mapping must be corrected by the
   human if there's a mismatch.

5. Go to Agreements, Tax, and Banking (under the Business/Users and Access
   area). Do not fill anything in. Just report the current status of the
   "Paid Applications" agreement (active / pending / not started) — IAP
   cannot go live until this is active, but that's the owner's task.

OUTPUT BLOCK — fill in and return exactly this:

  App Store Connect app: [created / already existed] — App ID: [numeric id]
  App name used: [value]
  Bundle ID: com.futureself.app
  SKU: futureself
  Subscription group: [created "Future Self Premium" / already existed as "X"]
  Subscription "yearly": [created/already existed] — Product ID: [value] — duration: 1 year — intro trial: [duration picked, e.g. "3 days" / "none available"]
  Subscription "monthly": [created/already existed] — Product ID: [value] — duration: 1 month
  In-App Purchase "lifetime": [created/already existed] — Product ID: [value]
  Product ID mismatch vs RevenueCat expectations (yearly/monthly/lifetime): [none / describe exactly what differs]
  Paid Applications agreement status: [active / pending / not started / unknown]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## E. Google Cloud Console

```
You are operating my browser. Work only inside Google Cloud Console
(console.cloud.google.com). Do not change any setting not listed here.
Never delete anything. Never rotate or revoke an existing OAuth client. If
a listed item already exists with the correct configuration, verify it
instead of recreating it. If any step requires a payment/agreement action,
2FA, or an identity check, stop and report back instead of proceeding.

GOAL: ensure one GCP project exists for this app, configure the OAuth
consent screen, and create Web + iOS OAuth client IDs (Android client is a
second pass pending a SHA-1 fingerprint).

STEPS:

1. Check existing projects for one that looks intended for "Future Self"
   (e.g. named "Future Self", "futureself", or similar). If one exists,
   use it and report its project ID/name. Otherwise create a new project
   named "Future Self" and report the generated project ID.
   IMPORTANT: this must be the SAME project used later for Firebase
   (prompt G) — report the exact project ID clearly so it can be reused.

2. Go to APIs & Services → OAuth consent screen (in newer UIs this may be
   under "Google Auth Platform" → "Branding"/"Overview" — use the
   console's search bar for "OAuth consent screen" if the menu differs).
   - User type: External.
   - App name: "Future Self"
   - User support email: use the account's own email (the one currently
     signed in) unless a more appropriate shared support email is already
     configured elsewhere in this project — if unsure, use the signed-in
     account's email and report which one you used.
   - Developer contact email: same as above.
   - Leave scopes at the default minimal set (no additional scopes needed
     for this app beyond default profile/email — do not add extra scopes).
   - Save. If the consent screen already exists and is configured, just
     verify these fields and report current values instead of resubmitting.
   - Publishing status: leave as-is (Testing or In Production, whichever
     it currently is) — do not change publishing status, just report it.

3. Go to APIs & Services → Credentials → Create Credentials → OAuth client
   ID.
   a. Web application:
      - Name: "Future Self Web"
      - No Authorized redirect URIs are required for this use case unless
        the console requires at least one — if it requires one, use
        https://ykgswczatkspryetstor.supabase.co/auth/v1/callback
        and report that you added it.
      - Create. Report the generated Client ID (ends in
        .apps.googleusercontent.com). This is the "Web" client id.
      - Check first whether a client named "Future Self Web" (or similarly
        clearly intended for this purpose) already exists — if so, open it
        and report its existing Client ID instead of creating a duplicate.

   b. iOS application:
      - Name: "Future Self iOS"
      - Bundle ID: com.futureself.app
      - Create. Report the generated Client ID.
      - Same duplicate-check rule as above.

   c. Android application: SKIP for now. This requires a release SHA-1
      certificate fingerprint that is generated later via `eas
      credentials` (a CLI step the owner runs separately). Report that
      this is deferred to a second pass and do not attempt to guess or
      fabricate a SHA-1.

OUTPUT BLOCK — fill in and return exactly this:

  GCP project name/ID (also used for Firebase in prompt G): [value]
  OAuth consent screen: [created / already existed] — app name: Future Self — user type: External — support email used: [value]
  Web OAuth Client ID: [value ending in .apps.googleusercontent.com]
  iOS OAuth Client ID: [value ending in .apps.googleusercontent.com]
  Android OAuth Client ID: pending — requires SHA-1 from `eas credentials` (owner CLI step), second pass
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## F. Google Play Console

```
You are operating my browser. Work only inside Google Play Console
(play.google.com/console). Do not change any setting not listed here.
Never delete anything. If a listed item already exists with the correct
configuration, verify it instead of recreating it. Do NOT attempt to fill
in banking or tax/payments-profile forms — report status only. If any step
requires a payment/agreement action, 2FA, or an identity check, stop and
report back instead of proceeding.

GOAL: create the app record (if not already created), create monthly/yearly
subscription base plans, create the lifetime in-app product, and add a
license tester.

STEPS:

1. Check for an existing app with package name com.futureself.app. If it
   exists, open it and skip to step 2. If not, create a new app:
   - App name: "Future Self"
   - Default language: English (US)
   - App or game: App
   - Free or paid: Free (subscriptions/IAP are separate from the app's own
     listing price)
   - Declarations: accept only the standard developer program policy
     checkboxes required to create the app shell if prompted (these are
     not payment/agreement actions in the financial sense, just app-console
     declarations) — do NOT complete the full store listing or content
     rating questionnaire, that is out of scope here.
   - Create. Report the resulting package name and confirm it matches
     com.futureself.app.

2. Go to Monetize → Products → Subscriptions (menu may read "Monetization
   setup" → "Subscriptions" — search Play Console's own settings search
   for "Subscriptions" if not found). NOTE: Play Console may block access
   to Monetize sections until a first app bundle (AAB) has been uploaded to
   any track (even internal testing). If you hit this block, STOP this
   step, report exactly what blocking message you saw, and skip to step 5
   — do not attempt to upload a placeholder AAB yourself.
   - Check for existing subscriptions "monthly" and "yearly". Create
     whichever is missing:
     a. yearly — Product ID: yearly, Name: "Yearly", base plan: 1 year,
        auto-renewing. Report what free-trial / intro-price options the UI
        offers on the base plan and select a 3-day free trial if available
        (to mirror the iOS side), otherwise report what was available and
        leave it without a trial.
     b. monthly — Product ID: monthly, Name: "Monthly", base plan: 1
        month, auto-renewing, no trial needed.
   - Activate each base plan if the UI requires an explicit "Activate"
     step to make it usable (this is not a payment action, just a
     publish-this-plan toggle) — do so, and report it.

3. Go to Monetize → Products → In-app products. Check for existing
   "lifetime" product. If missing, create:
   - Product ID: lifetime
   - Name: "Lifetime"
   - Status: Active
   Report result.

4. Reconciliation: report the exact three Product IDs (yearly / monthly /
   lifetime) and compare against RevenueCat's expected identifiers from
   prompt B's output ("yearly", "monthly", "lifetime"). Flag any mismatch
   instead of proceeding silently.

5. Go to Setup → License testing (or "Testers" under Setup). Add the
   following email as a license tester if not already present:
   instagramecommerce38@gmail.com
   Save. Report before/after state.

OUTPUT BLOCK — fill in and return exactly this:

  Play Console app: [created / already existed] — package: com.futureself.app
  Monetize section accessible: [yes / blocked pending first AAB upload — describe exact blocking message if so]
  Subscription "yearly": [created/already existed/blocked] — Product ID: [value] — base plan: 1 year — trial: [duration or "none available"]
  Subscription "monthly": [created/already existed/blocked] — Product ID: [value] — base plan: 1 month
  In-app product "lifetime": [created/already existed/blocked] — Product ID: [value]
  Product ID mismatch vs RevenueCat expectations: [none / describe]
  License tester instagramecommerce38@gmail.com: [added / already present]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## G. Firebase Console

Depends on: the GCP project ID/name from prompt E's output.

```
You are operating my browser. Work only inside the Firebase console
(console.firebase.google.com). Do not change any setting not listed here.
Never delete anything. Never revoke an existing service-account key. If a
listed item already exists with the correct configuration, verify it
instead of recreating it. If any step requires a payment/agreement action,
2FA, or an identity check, stop and report back instead of proceeding.

GOAL: attach/create a Firebase project on top of the SAME Google Cloud
project used in prompt E, add the Android app, confirm FCM v1 is enabled,
and generate a service-account JSON key.

CONTEXT: the Google Cloud project ID/name to use is:
<PASTE_PROMPT_E_GCP_PROJECT_ID_HERE>

STEPS:

1. Go to the Firebase console project list. Check whether a Firebase
   project already wraps the GCP project above. If yes, open it and skip
   to step 2. If not, click "Add project", select "Add Firebase to an
   existing Google Cloud project", and choose the project ID from above —
   do NOT create a brand-new separate GCP project. Complete the wizard
   with default options (Google Analytics is optional — skip enabling it
   unless it's already enabled; do not enable new billing/agreements).
   Report the resulting Firebase project name/ID and confirm it maps to
   the same GCP project ID from prompt E.

2. In the Firebase project, go to Project Settings (gear icon) → General.
   Check if an Android app with package name com.futureself.app already
   exists. If not, click "Add app" → Android → package name
   com.futureself.app, nickname "Future Self", no SHA-1 needed at this
   step (skip that field). Skip downloading google-services.json unless
   you want to for reference — it's not required for this task since EAS
   manages it. Complete the wizard without adding the Firebase SDK
   manually (skip those steps, they don't apply to this Expo/EAS-managed
   setup). Report result.

3. Go to Project Settings → Cloud Messaging. Confirm the "Firebase Cloud
   Messaging API (V1)" is enabled (it should show as "Enabled" with a
   green check, alongside a Sender ID and Project ID). If it shows as
   needing enablement, enable it (this is a free API enablement, not a
   billing action). Report status.

4. Go to Project Settings → Service accounts. Under "Firebase Admin SDK",
   click "Generate new private key". Confirm the dialog, and let it
   download the JSON key file. Report the filename it downloaded as
   (do not open, paste, or transcribe its contents — it's a credential).
   If a service account key was clearly already generated for this exact
   purpose very recently (i.e. you can see prior key generation activity
   suggesting one is already in the owner's possession), ask the human
   whether they already have one before generating a new one — but if in
   doubt, it's safe to generate a new key since old ones aren't
   auto-revoked; just don't revoke any existing key.

OUTPUT BLOCK — fill in and return exactly this:

  Firebase project: [created / already existed] — maps to GCP project: [id, confirm matches prompt E]
  Android app com.futureself.app in Firebase: [created / already existed]
  Cloud Messaging API (V1): [enabled / already enabled]
  Service account JSON key: [generated — filename: X / declined because one likely already exists, human should confirm]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]

  NOTE TO OWNER: the JSON file itself is not uploaded anywhere by this
  session — you upload it yourself later via `eas credentials`.
```

---

## H. Sentry

```
You are operating my browser. Work only inside Sentry (sentry.io). Do not
change any setting not listed here. Never delete anything. Never rotate or
revoke an existing auth token. If a listed item already exists with the
correct configuration, verify it instead of recreating it. If any step
requires a payment/agreement action, 2FA, or an identity check, stop and
report back instead of proceeding.

GOAL: create a React Native project (if not already created) in the
owner's org, collect its DSN, and create an auth token scoped for source
map uploads.

STEPS:

1. Check the current org's Projects list for one already intended for this
   app (e.g. named "future-self", "futureself", "Future Self"). If one
   exists, open it and skip to step 3. Otherwise continue to step 2.

2. Create a new project:
   - Platform: React Native
   - Project name: "future-self" (or "futureself" if that's unavailable —
     report whichever you actually used)
   - Team: use the default/existing team in this org (do not create a new
     team).
   Create. Report the org slug and project slug (visible in the project
   URL, e.g. sentry.io/organizations/<org-slug>/projects/<project-slug>/).

3. Go to the project's Settings → Client Keys (DSN) (may also be reached
   via Settings → Projects → [project] → Client Keys). Copy the DSN (a URL
   starting with https:// and containing an ingest hostname). Report it in
   full.

4. Go to organization Settings → Developer Settings → (Internal
   Integrations, or "Auth Tokens" / "New Internal Integration" depending on
   current UI — search Sentry's own settings search for "Auth Tokens" or
   "Internal Integration" if not found directly). Check whether a token
   already exists that looks intended for CI/source-map uploads for this
   project (e.g. named "future-self-ci" or similar). If so, do not create a
   duplicate — report that it exists and that its value cannot be
   re-displayed if already generated previously.
   Otherwise create a new one:
   - If using "Internal Integration": name it "future-self-ci", grant
     scopes: Project: Read & Write (or minimally "project:releases"), and
     Organization: Read (org:read). Do not grant any other scopes (no
     Admin, no Issue/Event write access beyond what's needed).
   - If using a plain "Auth Token" (newer Sentry UI, org-level tokens):
     create one named "future-self-ci" with scopes limited to
     project:releases and org:read only.
   - Save/create it, and copy the token value immediately (Sentry usually
     shows it only once). Report the full token value.

OUTPUT BLOCK — fill in and return exactly this:

  Sentry org slug: [value]
  Sentry project slug: [value]
  DSN: [full value]
  Auth token (scopes project:releases + org:read): [value, or "already existed — cannot re-display, human must retrieve from password manager or regenerate manually"]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## I. Expo (expo.dev)

```
You are operating my browser. Work only inside Expo (expo.dev). Do not
change any setting not listed here. Never delete anything. If an account
or organization already exists for this purpose, verify it instead of
creating a new one. If any step requires a payment/agreement action, 2FA,
or an identity check, stop and report back instead of proceeding.

GOAL: confirm there is a usable Expo account (personal account or
organization) that will own this project, and report its account name/slug
— that's all. Project creation itself happens via the `npx eas init` CLI
command, which is NOT part of this browser session.

STEPS:

1. Go to expo.dev and confirm you're signed in. Report the signed-in
   account's username/slug.

2. Check Settings → the account/organization the owner intends to use for
   this app. If there's ambiguity between a personal account and an
   organization account, report both options and their slugs rather than
   picking one — the owner (not ChatGPT) decides which account
   `npx eas init` should target.

3. Do NOT create a new Expo project, app, or EAS build configuration here —
   that is done later via CLI (`npx eas init`) by the owner/Claude Code,
   not through this browser session. Just confirm account readiness.

OUTPUT BLOCK — fill in and return exactly this:

  Signed-in Expo account/username: [value]
  Available account(s) to own the project (personal and/or org slugs): [list]
  Recommended account to use for `npx eas init`: [value, or "ask the owner — ambiguous"]

  NOTE TO OWNER: the following are CLI steps for you / Claude Code, NOT
  ChatGPT browser steps:
    npx eas init
    npx eas credentials
      - iOS: upload the APNs .p8 from prompt C (or let EAS manage/generate
        its own APNs key if you prefer not to reuse the manually created
        one — either works, but don't mix: pick one).
      - Android: upload the FCM v1 service-account JSON from prompt G.
      - Android: retrieve the release SHA-1 fingerprint from EAS's managed
        credentials output — feed that back into prompt E's second pass
        (Android OAuth client) and prompt F if needed.
```

---

## A2. Supabase Dashboard — second pass (Google provider + RevenueCat secret)

Run this only after prompts B (RevenueCat secret API key) and E (Google
client IDs) — and ideally E's Android second pass — are done. Fill in the
placeholders before pasting.

```
You are operating my browser. Work only inside the Supabase dashboard
(supabase.com/dashboard), project ref ykgswczatkspryetstor. Do not change
any setting not listed here. Never delete anything. Never rotate or revoke
an existing secret. If any step requires a payment/agreement action, 2FA,
or an identity check, stop and report back instead of proceeding.

GOAL: finish the Google auth provider configuration and set the
REVENUECAT_SECRET_API_KEY edge function secret.

VALUES TO USE:
  Web client ID:     <PASTE_PROMPT_E_WEB_CLIENT_ID>
  iOS client ID:      <PASTE_PROMPT_E_IOS_CLIENT_ID>
  Android client ID:  <PASTE_PROMPT_E_ANDROID_CLIENT_ID_OR_"omit if not yet created">
  RevenueCat secret API key (sk_...): <PASTE_PROMPT_B_SECRET_API_KEY>

STEPS:

1. Go to Authentication → Sign In / Providers → Google.
   - Enable the provider if not already enabled.
   - Set the "Client IDs" field to the comma-separated list, **web client
     id first**, in this exact order (omit the Android one if not yet
     available, and note that this is then an incomplete/temporary state
     to revisit):
     <WEB_CLIENT_ID>,<IOS_CLIENT_ID>[,<ANDROID_CLIENT_ID>]
   - Enable "Skip nonce check" (this is a checkbox/toggle on the same
     provider config screen — needed for iOS native sign-in).
   - Save. Report the final Client IDs value and Skip-nonce-check state.

2. Go to Edge Functions → Secrets. Check whether REVENUECAT_SECRET_API_KEY
   already exists. If it does NOT exist, add it as a new secret named
   exactly REVENUECAT_SECRET_API_KEY with the value provided above. If it
   already exists, do not overwrite it — report that it's already present.

OUTPUT BLOCK — fill in and return exactly this:

  Google provider enabled: [yes]
  Google Client IDs (final, comma-separated, web-first): [value]
  Skip nonce check: [ON]
  REVENUECAT_SECRET_API_KEY secret: [newly set / already present, not changed]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## B2. RevenueCat Dashboard — return later (real SDK keys)

Run this only after prompts C+D (Apple app linked in App Store Connect) and
F+G (Android app linked in Play Console / Firebase) are far enough along
that RevenueCat can see the linked store apps.

```
You are operating my browser. Work only inside the RevenueCat dashboard
(app.revenuecat.com). Do not change any setting not listed here. Never
delete anything. Never rotate or revoke an existing key. If any step
requires a payment/agreement action, 2FA, or an identity check, stop and
report back instead of proceeding.

GOAL: retrieve the real per-platform public SDK keys now that the App
Store Connect and Google Play apps are linked.

STEPS:

1. Go to Project Settings → Apps (or the per-app configuration under the
   project). Confirm the iOS app is linked to the App Store Connect app
   for bundle com.futureself.app (App Store Connect App ID from prompt D's
   output can be used to confirm the link if the UI asks for it). If not
   yet linked, link it now using that App Store Connect app.

2. Confirm the Android app is linked to the Google Play app for package
   com.futureself.app. If not yet linked, link it now.

3. Go to the API Keys page (Project Settings → API Keys → Public app-
   specific keys, or the per-app "API Keys" tab). Copy:
   - the iOS public SDK key (starts with appl_)
   - the Android public SDK key (starts with goog_)
   Report both in full. Do NOT modify or rotate any existing key.

OUTPUT BLOCK — fill in and return exactly this:

  iOS app linked to App Store Connect: [yes / newly linked]
  Android app linked to Google Play: [yes / newly linked]
  iOS public SDK key (appl_...): [value]
  Android public SDK key (goog_...): [value]
  Any steps skipped due to payment/2FA/identity-check gate: [list, or "none"]
```

---

## J. (Optional) futureself.app terms/privacy pages

Only run this if the owner controls the futureself.app domain and wants
ChatGPT to check/publish placeholder pages. Otherwise, read the owner note
below and skip straight to changing the in-app URLs instead.

```
You are operating my browser. Work only inside whatever hosting/DNS/CMS
console manages the futureself.app domain (identify it first — do not
guess; if you cannot determine what platform hosts this domain within a
couple of navigation/search attempts, stop and report that instead of
trying random services). Do not change DNS records. Do not delete
anything. If any step requires a payment/agreement action, 2FA, or an
identity check, stop and report back instead of proceeding.

GOAL: confirm whether https://futureself.app/terms and
https://futureself.app/privacy currently resolve to real content. If they
already do, just report that (verification only, no report needed for the
publish step). If they 404 or the domain isn't set up yet, report exactly
what you find (domain not registered / registered but no host / host
exists but no CMS access found) rather than attempting to publish content
through an unfamiliar or unverified platform.

STEPS:

1. Open https://futureself.app/terms in a new tab. Report status (200 with
   real content / 404 / DNS error / other).
2. Open https://futureself.app/privacy in a new tab. Report the same.
3. If either is missing and you can identify + access the hosting console
   for this domain (e.g. it's obviously the same account already signed
   into a hosting provider), report what platform it is and STOP — do not
   publish placeholder content without the owner's explicit go-ahead in
   this session, since this is public-content publishing which needs
   confirmation. Just report what you found and what publishing would
   involve.

OUTPUT BLOCK — fill in and return exactly this:

  /terms status: [value]
  /privacy status: [value]
  Hosting platform identified (if pages missing): [value, or "not determined"]
  Recommendation: [pages already live, no action needed / owner should publish via <platform> / owner should redirect app URLs elsewhere instead]
```

**Owner note:** if you don't control futureself.app yet, don't run this
prompt — either stand up simple static pages there, or tell Claude Code to
change the URLs in `src/features/paywall/PaywallFooter.tsx` and the welcome
screen footers to wherever your real terms/privacy pages live.

---

## When everything is collected

Once you have all the OUTPUT BLOCKs back (A1, B, C, D, E, F, G, H, I, A2,
B2, and optionally J), do the following.

### 1. `.env` (project root — copy from `.env.example` if you haven't yet)

```
EXPO_PUBLIC_SUPABASE_URL=https://ykgswczatkspryetstor.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<already set — leave as-is>

EXPO_PUBLIC_REVENUECAT_IOS_KEY=<B2: iOS public SDK key, appl_...>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<B2: Android public SDK key, goog_...>
EXPO_PUBLIC_RC_ENTITLEMENT_ID="FutureSelffffff Pro"
EXPO_PUBLIC_USE_RC_PAYWALL_GATE=false

EXPO_PUBLIC_POSTHOG_API_KEY=<already set — leave as-is>
EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

EXPO_PUBLIC_SENTRY_DSN=<H: DSN>

EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<E: Web OAuth Client ID>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<E: iOS OAuth Client ID>

EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE=
EXPO_PUBLIC_DEV_MOCK_PURCHASES=false
```

Note: `EXPO_PUBLIC_RC_ENTITLEMENT_ID` must exactly match whatever prompt B
reported as the entitlement's real identifier — quote it if it contains a
space, as shown. Do not assume it's exactly `"FutureSelffffff Pro"` without
checking B's output first; use B's reported exact string.

### 2. Supabase secrets + vault (already mostly done by prompts A1/A2 — this
is the reference / fallback if you need to run it manually via the CLI
instead of the dashboard)

```bash
# Only needed if you didn't do this via the dashboard in prompt A1/A2:
supabase secrets set DISPATCH_SECRET=<A1 value> --project-ref ykgswczatkspryetstor
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<A1 value> --project-ref ykgswczatkspryetstor
supabase secrets set REVENUECAT_SECRET_API_KEY=<B value, sk_...> --project-ref ykgswczatkspryetstor
```

```sql
-- SQL editor, only if not already done in prompt A1:
select vault.create_secret('<A1 DISPATCH_SECRET value — must match exactly>', 'dispatch_secret');
```

### 3. Google sign-in — Android OAuth client (second pass, prompt E)

Once you have the release SHA-1 from `eas credentials` (step 4 below),
run prompt E's Android sub-step (or a small follow-up prompt in the same
shape) to create the Android OAuth client, then re-run prompt A2's Google
provider step to append the Android client ID to the comma-separated list
(web, iOS, android — in that order).

### 4. CLI steps (owner / Claude Code — not ChatGPT)

```bash
npx eas init
npx eas credentials
# iOS: upload the .p8 from prompt C (Key ID + Team ID also from prompt C),
#      or let EAS generate/manage its own APNs key instead.
# Android: upload the FCM v1 service-account JSON from prompt G.
# Android: note the release SHA-1 EAS reports — feed it into prompt E's
#      second pass (Google Cloud Android OAuth client) and Play Console
#      license/signing as needed.

# EAS build secrets for Sentry source maps (never EXPO_PUBLIC_*):
eas secret:create --scope project --name SENTRY_ORG --value <H: org slug>
eas secret:create --scope project --name SENTRY_PROJECT --value <H: project slug>
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <H: auth token>

# Dev build + real-device push test (docs/SETUP_REQUIRED.md §3):
npx eas build --profile development --platform ios
# run onboarding, allow notifications, then:
#   select * from devices where push_token is not null;
#   insert into entitlements (user_id, is_premium, source)
#     values ('<uuid>', true, 'dev')
#     on conflict (user_id) do update set is_premium = true;
#   select recalc_notification_state('<uuid>');
# within ~5 min, check notification_deliveries for ticket_ok -> receipt_ok,
# and confirm tapping the notification deep-links to the exact quote/affirmation.
```

### 5. Final sanity checks

- `EXPO_PUBLIC_RC_ENTITLEMENT_ID` in `.env` matches RevenueCat's real
  entitlement identifier exactly (prompt B's output), not an assumption.
- Product IDs match exactly across RevenueCat, App Store Connect, and
  Google Play (prompts B, D, F) — any flagged mismatch must be resolved
  before release (either rename the store products or update RevenueCat's
  product identifiers to match).
- Both `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` are real
  `appl_…` / `goog_…` keys, not the `test_…` Test Store key, before any
  release build.
- Custom SMTP is configured in Supabase (prompt A1's SMTP status) before
  launch — the default SMTP only delivers to team members, which will
  silently break email-linking OTPs for real users.
- `https://futureself.app/terms` and `/privacy` resolve to real content
  (prompt J), or the in-app URLs have been changed to point elsewhere.
