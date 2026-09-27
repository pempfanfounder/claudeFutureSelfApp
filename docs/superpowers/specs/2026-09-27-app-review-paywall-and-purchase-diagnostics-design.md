# App Review paywall and purchase diagnostics design

Date: 2026-09-27
Status: approved

## Context and evidence

App Review rejected iOS 1.0.0 (17) under Guidelines 3.1.2(c) and 2.1(b). The review screenshot shows an annual card with a prominent three-day trial and calculated `$0.69/wk`, while `$35.99 billed yearly` is smaller. Apple's subscription guidance requires the actual billed amount to be the most prominent price.

The review purchase alert matches the generic exception path in `src/lib/purchases.ts`. It does not reveal the underlying RevenueCat or StoreKit error because `src/lib/monitoring.ts` discards raw exceptions. App Store Connect and RevenueCat product, offering, entitlement, and credential settings were checked without finding a confirmed mismatch. A TestFlight sandbox purchase of the same 1.0.0 (17) build succeeded on the device named iPhone 16Maxxx and unlocked the app. The review failure remains unproven and may depend on the review environment.

## Goals

1. Make the amount and period actually billed the clearest pricing element in every Cal AI plan layout, including the active `calai-1` layout.
2. Show trial copy for a plan only when that store product has a free introductory offer and RevenueCat reports the customer eligible.
3. Capture a finite, privacy-safe purchase failure code so a future failure can be diagnosed without retaining raw SDK messages or personal data.
4. Deliver the changes on an isolated branch as a reviewable pull request. Do not submit a new build or alter App Store Connect products in this change.

## Paywall behavior

`useOffering` remains the source of the store's localized `priceString`, product period, and trial eligibility. `PlanCards` and `PlanToggle` display the product's **full billed amount and period** as the largest pricing text, for example `$35.99/year` or `$6.99/week`. The annual card no longer shows a calculated weekly equivalent. Savings may remain only as smaller, visually subordinate text; the trial appears in smaller text only when `trialInfo` confirms eligibility. No price or trial duration is hardcoded into production UI.

The selected plan's full price and any eligible trial terms appear immediately beside the purchase button, with the billed amount first. The button reads `Continue` for either plan. The existing renewal, restore, Terms, and Privacy information remains accessible. The paywall remains usable in the iPhone compatibility window on iPad and at larger text sizes; the amount billed must remain more conspicuous than any trial or savings text.

The active `calai-1` and alternate Cal AI variants share these components. Legacy paywalls are outside this PR because they are not selected by the current `PAYWALL_VARIANT`; enabling a legacy variant later requires a separate pricing review.

## Purchase diagnostics

The transaction catch path keeps its current behavior for cancellations, identity changes, and timeouts. For non-cancelled failures, it derives a code from the SDK error and maps it to a finite allowlist, with an `unknown` fallback. It also records only the finite operation (`purchase` or `restore`). The monitoring policy allows those two tags only for `purchases.transaction`. It never forwards the raw error, message, stack variables, receipt, transaction ID, or account ID. Sentry's event scrubber preserves only these approved tags and the existing approved event fields.

This diagnostic change does not guess at or alter the unconfirmed cause of Apple's failed purchase. User-facing purchase behavior stays unchanged apart from the paywall copy and layout.

## Verification and delivery

- Tests assert the full billed amount is rendered as the primary plan price for annual and weekly choices in every Cal AI variant; no annual weekly equivalent is rendered.
- Tests assert the trial is absent when eligibility is unknown or ineligible, and that the CTA remains neutral.
- Tests verify the diagnostic allowlist preserves known codes and operations while canary text in raw errors never reaches Sentry.
- Run targeted tests, typecheck, and formatting checks; inspect the paywall on an iPhone-sized and iPad compatibility-sized viewport if the available simulator can run the build.
- Create a draft PR from the isolated branch with the test evidence and the remaining iPadOS 27 review limitation. Do not claim the reviewer-specific purchase failure is fixed without reproducing it.

## Resubmission gate

The PR and automated tests do not by themselves resolve Guideline 2.1(b). Before resubmitting, install the new TestFlight build and verify both yearly and weekly purchases with separate eligible sandbox purchase histories, entitlement unlock, and Restore Purchases. Capture the sanitized code and investigate any failure. Repeat on an iPad running iPadOS 27 if one is available; otherwise disclose that this exact review environment was unavailable. Review the final paywall on the actual build to confirm the billed amount remains the dominant price at the sizes Apple may use. Submit only after the purchase paths work or a specific cause has been found and corrected.
