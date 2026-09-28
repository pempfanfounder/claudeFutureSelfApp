# Subscription review remediation — September 2026

## Status

This patch corrects the confirmed pricing defects in the active `calai-1` paywall and the other three CalAi layouts. It repairs a native-request queue timeout defect and adds privacy-preserving purchase diagnostics. **The purchase failure reported for build 17 has not been reproduced or verified as resolved in Apple's sandbox. Do not resubmit until the release checks below pass.**

`PAYWALL_VARIANT` remains `calai-1`. The inactive legacy Note/Timeline paywalls have not been redesigned; do not switch to `legacy` without a separate pricing review. No products, prices, credentials, agreements, bundle IDs or entitlement IDs were changed. This patch does not upload or submit an app.

## Confirmed findings

The old annual card emphasized the calculated `$0.69/wk` rather than the `$35.99` annual bill. Its dark banner unconditionally promised three days free, including for unknown or ineligible customers. Existing component tests explicitly required that banner. The primary button emphasized the trial, while subscription terms followed it.

The reviewed error text came from a catch-all in `src/lib/purchases.ts`. Existing monitoring intentionally removes raw SDK errors. The screenshot therefore cannot distinguish a configuration, receipt, network, account or other store error. Do not claim an agreement or key was missing without checking it.

The purchase queue also started its 10-second timeout at enqueue time, not when the native request began. A refresh waiting behind a user-mediated StoreKit sheet could incorrectly mark the SDK stalled. A separate 180-second JavaScript transaction timeout could release the transaction lock while the native request remained unresolved. These are confirmed code defects, not proof of the reviewer's exact failure cause.

## Code changes

- Full localized store bills appear at 28 points; eligible trial details are subordinate at 14 points. No calculated weekly equivalent, savings banner or unconditional trial badge is shown.
- A neutral Continue button follows the selected bill and renewal/cancellation terms in the scrollable view. Plan changes are disabled while purchasing.
- Network deadlines start when work begins. Timed-out native requests retain queue ownership until their real completion. Purchase and restore sheets do not have an arbitrary JavaScript deadline that pretends to cancel native work.
- Cancellation, pending approval, product/configuration/receipt/network failures, existing ownership and missing entitlements have distinct handling. No automatic second purchase or fabricated premium access is introduced.
- Finite diagnostic areas such as `purchases.purchase.CONFIGURATION_ERROR` survive the existing privacy scrubber. Raw SDK text, receipts, tokens and user identifiers remain excluded.
- Regression tests cover bill prominence, eligibility, localization, purchase outcomes, restore, double taps, unavailable states, queue serialization and diagnostic redaction.

## Verify live configuration; do not guess

`docs/SETUP_REQUIRED.md` records an active Paid Apps Agreement and an Apple In-App Purchase key uploaded to RevenueCat in August. That is historical documentation, not live verification. Its September section still lists creation of the weekly product as a task. Check the actual consoles before changing anything.

| Setting | Expected configuration |
| --- | --- |
| Bundle ID | `com.futureself.mobile` in the binary, App Store Connect and the RevenueCat iOS app |
| Public SDK key | The correct iOS app's `appl_` key; no `test_` Test Store key or mock purchases in production. The checked-in production profile already uses an `appl_` key. |
| Offering | `default`, documented as the current offering |
| Annual package | `$rc_annual` maps to real App Store product `yearly`, annual duration |
| Weekly package | `$rc_weekly` maps to real App Store product `weekly`, weekly duration; verify it exists and is configured |
| Entitlement | Both products unlock `FutureSelffffff Pro`, matching `EXPO_PUBLIC_RC_ENTITLEMENT_ID`. The unusual spelling is intentional in the existing setup; do not rename it cosmetically. |
| Apple credentials | RevenueCat's Apple In-App Purchase key has a valid issuer, key ID and private key. The EAS upload API key is separate. Never paste private keys into issues or chat. |
| Agreement | Account Holder verifies the Paid Apps Agreement is currently Active and required business, tax and banking information is complete |
| Products | Correct duration, price, storefront availability, localization, review information and genuine trial offers |

For StoreKit 2, RevenueCat documents an In-App Purchase key requirement. Adding only a legacy shared secret is not a general fix. Do not downgrade StoreKit or bypass receipt validation to make a test pass. Apple says products do not need prior approval merely to function in review's sandbox.

## Diagnose by the actual error reference

Reproduce with real store products in a sandbox-enabled release build. Record build, device/OS, storefront, whether the native confirmation sheet appeared and the safe Reference displayed by the app. Search Sentry area tags under `purchases.purchase.*`, `purchases.restore.*` or `purchases.offerings.*`.

For UNKNOWN_ERROR, inspect the native RevenueCat/StoreKit error locally during an authorized reproduction; do not publish receipts or account details.

- CONFIGURATION_ERROR / INVALID_CREDENTIALS_ERROR / INVALID_APPLE_SUBSCRIPTION_KEY_ERROR: validate the correct RevenueCat app and its Apple credentials using dashboard validation results.
- PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: check product setup and storefront availability.
- INVALID_RECEIPT_ERROR / MISSING_RECEIPT_FILE_ERROR: check environment, bundle ID and validation configuration. Local Xcode StoreKit products are not proof of working App Store sandbox transactions.
- RECEIPT_ALREADY_IN_USE_ERROR / PRODUCT_ALREADY_PURCHASED_ERROR: restore with the correct original app/store account; inspect the existing restore-transfer policy rather than silently changing ownership.
- ENTITLEMENT_NOT_ACTIVE: inspect product-to-entitlement mapping and the confirmed transaction; do not charge again.
- NETWORK_ERROR / STORE_PROBLEM_ERROR: check connectivity and the existing transaction before retrying. An error does not always prove no charge occurred.
- PAYMENT_PENDING_ERROR: wait for store approval/confirmation; do not grant access prematurely or present an ordinary failed-payment alert.

## Release gate

Run `npm ci`, `npm run typecheck`, and `npm test -- --runInBand`. This PR adds read-only GitHub Actions checks. Passing component tests does not establish native StoreKit correctness.

Build a new production-profile binary and test it with real sandbox products, not development preview packages. Preserve the bundle ID. EAS build numbering is remote and auto-incremented; the submitted build must be newer than 17.

| Scenario | Required result | Evidence |
| --- | --- | --- |
| Eligible new customer, annual | Correct localized full annual bill and genuine trial; successful native purchase; premium unlocks | Pending |
| Weekly purchase | Correct full weekly bill; successful native purchase; premium unlocks | Pending |
| Used trial / unknown eligibility | No unverified free-trial promise; correct store confirmation and access | Pending |
| Cancel purchase | No failure alert or new premium grant | Pending |
| Pending approval, where supported | Pending message; no access until entitlement is confirmed | Pending |
| Restore and relaunch | Existing purchased account regains/retains access without a second charge | Pending |
| Slow confirmation / overlapping refresh | No queued-refresh timeout or duplicate transaction | Pending |
| Offline / unavailable store | Safe guidance; no fabricated access or prices | Pending |
| iPad compatibility window, small iPhone, larger text | Full bill is dominant; terms, Continue, Restore and legal links remain reachable | Pending |

`supportsTablet: false` is consistent with the iPhone compatibility window in the review screenshots. Enabling tablet support alone does not fix either rejection. Test the reviewer's iPadOS version where available. Save actual updated screenshots and a sandbox purchase recording.

Local checks during preparation: strict TypeScript 5.8.3 compilation of the three pure core modules, syntax/transpilation of 12 changed TS/TSX files, and 12 standalone core checks passed. These are not the repository's full TypeScript 6/Expo/Jest run, a native iOS build or a sandbox purchase. Refer to PR checks for subsequent CI results. Keep the native evidence Pending until actually tested.

## App Review response template — use only after successful tests

Hello App Review,

We have submitted build [NEW BUILD]. The purchase flow now prominently displays the full localized annual or weekly billed amount. We removed the calculated weekly-price promotion and unconditional trial banner. Trial wording appears below the billed amount only when eligibility is confirmed. Renewal/cancellation terms precede Continue, and Restore and legal links remain available.

We addressed purchase-flow handling and verified [ACTUAL SUCCESSFUL SANDBOX PURCHASE AND RESTORE TESTS] on [DEVICES / OS VERSIONS]. [DESCRIBE THE VERIFIED ROOT-CAUSE FIX AND ATTACH ACTUAL EVIDENCE.] Relevant product and agreement configuration has been checked.

Please review the updated build. Thank you.

Do not claim successful sandbox testing, a confirmed root cause, or a corrected agreement/key until verified.

## Primary references

- Apple subscription presentation: https://developer.apple.com/app-store/subscriptions/
- Apple sandbox testing: https://developer.apple.com/help/app-store-connect/test-in-app-purchases/overview-of-testing-in-sandbox
- Apple agreement status: https://developer.apple.com/help/app-store-connect/manage-agreements/view-agreements-status
- RevenueCat errors: https://www.revenuecat.com/docs/test-and-launch/errors
- RevenueCat StoreKit credential requirements: https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret
