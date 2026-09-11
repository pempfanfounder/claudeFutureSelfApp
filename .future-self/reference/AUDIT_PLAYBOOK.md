# Targeted audit playbook — execute only in Session 2 or an authorized retest

## Shared evidence record
Follow ARTIFACT_RULES. Trace user intent → UI → local state → SDK/API → authorization → persistence/downstream jobs → monitoring/billing. Check current source and effective deployed state. Preserve demonstrated existing safeguards. Do not claim an exploit from a missing code-level guard when gateway/DB/vendor protections have not been inspected.

## Native/client correctness
Map every enabled route/onboarding variant and access gate. Inspect asynchronous cancellation, repeat taps, stale identity/cache leakage, retry states, offline read/write semantics, pagination/content limits, deep links, background/termination, safe areas, keyboard and accessibility. Confirm error/loading feedback and honest user promises. Inspect Expo configuration/plugins against generated native target, signing, widget extension and build output. Review scripts before any install/build: `format` is a write operation. Run current tests under isolation and characterize what mocks omit.

## Supabase, identity and authorization
Inventory current deployed migrations/functions/config and all grants/RLS, not just the first migration. Test cross-user denial and unauthorized fields with ordinary-user tokens, anonymous/authenticated distinctions, premium content and write authorization, malformed/oversized requests, date ranges/arbitrary date-cardinality, replay/idempotency, pagination/egress, expensive scans/query paths, privileged RPC exposure and service-role containment. Compare direct writes with guarded RPC paths. Trace account creation/link/provider conflict/recovery/log-out/reinstall/cross-device and per-user cache cleanup. Do not delete paying anonymous users as simplistic cleanup.

## RevenueCat and App Store commerce
Verify SDK key class/embedded configuration, exact environment and app identifiers, entitlement names (do not rename odd existing names casually), products/offerings/periods/localized pricing and StoreKit context. Platform-specific keys are also used for Apple sandbox/TestFlight; a transaction environment is not decided solely by key prefix. Check Test Store vs store sandbox using current official docs.

Cover purchase success/cancel/pending/fail, eligible/ineligible/unknown trial state, restore, active but auto-renew-off, expiration, refund/revoke, grace/billing retry, lifetime/nonrenewing, transfers/aliases and concurrent SDK/backend updates. Distinguish product introductory offer metadata from customer eligibility. Test reminder promises against permission, schedule and eligibility. Validate webhook authentication, schema and bounds, event environment, deduplication, ordering, durable acceptance before acknowledgment, retries/reconciliation and failure after partial persistence. Use current official event contracts; don't simply add more event names without correctness tests.

## Abuse/cost model for EVERY actual service
Map action and attacker access → work amplification → billable unit → current plan/allowance/price → per-account/device/IP/server/global control → retention and recovery. Include Supabase database/auth/storage/egress/functions; RevenueCat's actual commercial basis; Sentry/PostHog event volume and retention; notifications/receipts; email/OTP and auth-provider traffic; EAS/build usage; any external API/AI discovered. Do not assume every action is charged per request.

Test repeated entitlement sync, force-refetch/cache bypass, new anonymous accounts circumventing per-user caps, invalid/oversized/arbitrary writes, deep-link/read enumeration where authorized, repeated token registration, multi-device fan-out, retries/backlogs/dead-letter recovery, oversized diagnostics and telemetry flood. Controls may include bounded inputs, database constraints, pagination, idempotency, concurrency/global throttles, caching, capped workers, retention and kill switches. Alerts/spend dashboards are not always hard stops; identify residual maximum exposure honestly. Safe failure modes must preserve paid access/recovery and user data integrity.

Before each scenario record: isolated target, test-user/device allowlist, max requests, concurrency, duration, marginal spend, approved budget receipt, success criterion and abort conditions. If an enforceable cap cannot be established, don't run an unbounded experiment; report the limitation and mitigation plan. No unsolicited production adversarial testing.

## Notifications/widgets
Verify queue access controls and eligibility at scheduling AND sending, preferences changes while queued, time windows/quiet hours/timezone/DST, notification receipts and invalid-token cleanup, duplicate dispatch protection, retry limits, queue growth, cron identity/secrets and operational stop controls. Use only designated test devices. Validate native permission transitions/token refresh/APNs/Expo environment and cold/warm deep links.

Verify Voltra widget/native extension provisioning and app-group sharing, daily rollover, pinned text, entitlement expiry, account-switch/logout/delete cleanup, stale-content privacy and battery/performance. A JavaScript render test does not validate the compiled extension.

## Privacy, deletion and legal/platform assertions
Trace data fields, processors/destinations, identifiers/events, logs/breadcrumbs/errors/extra metadata, retention and local storage. Compare actual payloads against Sentry scrubbing and legal text/console settings. Do not capture secrets to demonstrate redaction. Trace accessible in-app deletion for guest/unpaid/paid/lapsed users, Apple token revocation when applicable, downstream and local/widget cleanup, subscription notice and legitimate retention exceptions. Verify consent/permission withdrawal behavior.

Check current authoritative Apple guidelines/privacy manifests/required-reason APIs/age rating/tracking/subscription disclosures/login/deletion/content rights/metadata. Separate technical tests, platform rules and founder/legal facts. EU establishment, processor transfers and actual U.S./other distribution create different questions. Never invent legal entity, DPA/contract terms, data residency, tax/banking or legal compliance. Unknown legal applicability is an explicit owner/adviser question.

## Consolidation
One finding register; deduplicate mechanisms and link related cases. State what is proven vs a lead. Recommend minimal remedies and regression criteria; rank safety/reliability, founder product-quality gates and optional improvements separately. Build a coverage map from approved features, service dependencies and risk mechanisms, so nothing is omitted merely because it lacked an obvious screen.
