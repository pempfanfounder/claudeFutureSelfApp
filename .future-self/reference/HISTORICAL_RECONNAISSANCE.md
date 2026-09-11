# Historical input — previous repository reconnaissance

This is the prior supplied reconnaissance, retained for provenance. It is NOT an active workflow, approval or current local audit. The new REPOSITORY_MAP identifies the limited public files rechecked during packaging. Never execute an old referenced console plan.

# Dated reconnaissance — public repository, not a launch certificate

Observed 7 September 2026. The latest visible main commit was `24cfa23`, described as restoring production RevenueCat public keys to build profiles. Source files were inspected through GitHub/raw browser views, not a successfully cloned and executed checkout. No local tests, Xcode compile, app visuals, external console configuration, production exploit, purchase or deployment was verified here. A local checkout or current main may subsequently differ.

## Technical map

The declared stack includes Expo ~57.0.11, React Native 0.86.2, React 19.2.3, Expo Router, Reanimated/worklets, Zustand, Supabase, RevenueCat, PostHog, Sentry and Voltra widgets. The source separates routes, design-system components/tokens and feature modules. Native folders are ignored/generated; app.json/EAS configuration and plugins therefore need comparison with the generated archive. The configured iOS bundle is `com.futureself.mobile`, with a widget extension/app group and a declared deployment target of 16.4; that declaration is not proof that the entire installed dependency set supports that minimum. Android configuration also exists. [S01–S04]

Main paths: `src/app`, `src/design-system`, `src/features/auth`, `content`, `onboarding`, `paywall`, `notifications`, `widgets`, `src/lib`, `src/__tests__`, `supabase/migrations`, `supabase/functions`, and `docs`.

The inspected content path selects a cached content library and daily sets; it does not establish a live generative-AI service. Authentication bootstraps anonymous users and supports linking/recovery paths. Purchase state is represented in both client and backend. Queue/cron dispatch and receipts, a legal endpoint, and deletion are implemented. Their existence is not evidence that deployment or operational settings are correct. [S05–S08]

## Workflow-relevant leads

| ID | Source-supported observation | What remains to verify / workflow implication |
|---|---|---|
| R01 | Committed preview and production profiles point at the same Supabase target and shared telemetry/payment configuration. [S03] | Effective hosted/local values may override these. Establish isolated resources before any destructive/error/load tests. |
| R02 | Current profiles contain platform-specific RevenueCat public keys. The example-env release test-key rejection claim does not match the current initialization implementation. [S03,S09,S10] | Verify the built artifact and add approved release validation rather than blindly “switch to production keys.” |
| R03 | The webhook requires a UUID app_user_id, maps a selected set of event types, and acknowledges some processing errors with HTTP 200. [S11] | Review lifetime and transfer schemas, environment separation, duplicate/order handling, durable acceptance and bounded recovery with current RevenueCat guidance. |
| R04 | Trial display is inferred from product intro-price metadata; the inspected offering hook does not perform a customer eligibility check. The timeline UI promises a reminder. [S12,S13] | Reproduce on previously subscribed/ineligible accounts and unavailable notification permission; audit localized honest disclosures. |
| R05 | Anonymous users are created at bootstrap. The entitlement-sync handler performs upstream subscriber retrieval and backend writes without a handler-level throttle visible in that file. [S06,S14] | Inspect actual gateway/vendor protections, account plans, bounded repeated requests, identity proliferation, caching and server/global limits. No billing exploit was executed. |
| R06 | Core content-read policy checks authenticated identity rather than premium status. Own-row daily insert policies are distinct from the RPC's date validation. [S15] | Verify effective grants/policies across all migrations and deployed schema using test-user tokens; decide premium authorization and validate direct-write abuse/cardinality. |
| R07 | Main routes are premium-gated; the paywall footer offers privacy, terms and restore. Deletion exists as an auth-user deletion function. [S16,S17,S18] | Trace all entry points: ensure unpaid/guest users can delete; verify Apple revocation, caches/widgets/processor handling and subscription warning. Do not infer complete erasure from a cascade. |
| R08 | Monitoring comments describe broad scrubbing, but the shown beforeSend only reduces event.user. The legal endpoint contains broad processing/hosting/privacy assertions. [S19,S20] | Inspect error/request/breadcrumb/extra payloads and actual destinations. Founder verifies identity, legal claims and processor arrangements. This is not a proven disclosure incident. |
| R09 | The Aug 9 test report is historical and explicitly lacks complete native/store/device verification. Current onboarding tests mock native systems and mainly smoke-render steps. [S21,S22] | Re-run commands on the current SHA; establish lifecycle/integration/E2E/native coverage and independent QA. |
| R10 | Quote/affirmation selection and multiple onboarding variants are present. [S05,S22] | Founder confirms how the future-self promise is expressed and which variants/features/products ship. Do not add generation or preserve abandoned experiments automatically. |
| R11 | Existing motion tokens and route animation defaults are present. The feed's initial/loading path and interaction choices warrant runtime examination. [S23,S24,S25] | Measure before modifying; compare three native Settings options and then extend the founder-selected language. Static reading cannot diagnose perceived jank. |
| R12 | Voltra sync schedules daily widget content and pinned text; notification infrastructure includes server-only queue operations and bounded dispatcher work. [S26,S27,S28] | Verify compiled extension, entitlements, expiry/logout/delete cleanup, midnight/timezones, deployed cron, delivery/receipts and real-device behavior. Preserve existing protections. |

## Historical contradictions to reconcile

Old setup instructions and test reports span multiple development rounds. Examples include older bundle-ID instructions, older RevenueCat guard claims, legal/setup status and incomplete provider configuration. Current code and commit history supersede some—but not all—of those claims. Treat SMTP/provider readiness, effective deployment and actual legal facts as unknown until the appropriate evidence is obtained. Do not execute old “console prompts” as a current authorized plan. [S02,S09,S10,S21,S29]

## Positive foundation to preserve

The source contains meaningful foundations: reusable design tokens, separated features, own-user RLS policies and payload bounds, unique progress/delivery records, server-only queue operations, bounded dispatch attempts and tests. The recommendation is targeted hardening and refinement, not a ground-up rewrite. Protection strength still needs deployed/runtime verification. [S15,S23,S27,S28]

## Repository source references

All links below refer to the public repository. Pin a full current SHA in the live STATE record during execution; these main links can change.

- S01 — package.json: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/package.json
- S02 — app.json: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/app.json
- S03 — eas.json: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/eas.json
- S04 — .gitignore: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/.gitignore
- S05 — content/repository.ts: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/content/repository.ts
- S06 — AuthProvider.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/auth/AuthProvider.tsx
- S07 — Edge Functions: https://github.com/pempfanfounder/claudeFutureSelfApp/tree/main/supabase/functions
- S08 — content/feedStore.ts: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/content/feedStore.ts
- S09 — .env.example: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/.env.example
- S10 — purchases.ts: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/lib/purchases.ts
- S11 — revenuecat-webhook: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/functions/revenuecat-webhook/index.ts
- S12 — useOffering.ts: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/paywall/useOffering.ts
- S13 — TimelinePaywall.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/paywall/TimelinePaywall.tsx
- S14 — sync-entitlement: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/functions/sync-entitlement/index.ts
- S15 — core migration: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/migrations/20260809090000_core.sql
- S16 — main layout: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/app/(main)/_layout.tsx
- S17 — PaywallFooter.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/paywall/PaywallFooter.tsx
- S18 — delete-account: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/functions/delete-account/index.ts
- S19 — monitoring.ts: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/lib/monitoring.ts
- S20 — legal: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/functions/legal/index.ts
- S21 — historical test report: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/docs/TEST_REPORT.md
- S22 — onboardingFlow.test.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/__tests__/onboardingFlow.test.tsx
- S23 — design tokens: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/design-system/tokens.ts
- S24 — root layout: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/app/_layout.tsx
- S25 — feed.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/app/(main)/feed.tsx
- S26 — widgetSync.tsx: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/src/features/widgets/widgetSync.tsx
- S27 — push-dispatch: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/supabase/functions/push-dispatch/index.ts
- S28 — migrations directory: https://github.com/pempfanfounder/claudeFutureSelfApp/tree/main/supabase/migrations
- S29 — historical setup: https://github.com/pempfanfounder/claudeFutureSelfApp/blob/main/docs/SETUP_REQUIRED.md
- S30 — commits: https://github.com/pempfanfounder/claudeFutureSelfApp/commits/main/
