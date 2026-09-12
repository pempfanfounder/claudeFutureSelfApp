# S4 backend local draft and verification limits

Selected source: a0b21da74a137558bcfd6eac156e6a4f25a73876. This batch changes only the two entitlement Edge handlers, two new shared helpers, two forward-only migrations, and these tests. No migration, cron, provider, service, store or native operation has run. Historical migrations and existing rows are preserved.

## Client and push integration contracts

- `save_daily_set(p_local_date date,p_type text,p_content_ids uuid[]) RETURNS uuid[]`: authenticated, identity comes from JWT; returns the stored winner. Replace the former daily_sets INSERT. The caller must handle returned errors and preserve its pending local set.
- `record_view(uuid,date)`, seven-text-argument `register_device(...)`, and `deactivate_device(text)` retain signatures. Device registration permits refreshing an existing registration at the 20-total-device limit; a new registration at that limit gets a recoverable error. No device/account is deleted.
- `record_view` now rejects null/out-of-range dates while preserving accepted original dates within ±1 server-local day. This lead-requested offline contract prevents retried views being silently counted today; the client retains older unaccepted views locally with recovery status.
- `devices.registration_version bigint` increases when owner/token/active/permission changes. Push tickets must capture and match the version before deactivation.
- `entitlements.expires_at` is aggregate access expiry; `trial_expires_at` is independent and retains the actual past trial end while grace preserves access. Legacy trial scheduling falls back only for the selected legacy sources `revenuecat-webhook`/`sync-api` with trial period type. Canonical rows never substitute aggregate/grace expiry. Do not gate current trials solely on newest-product period_type.
- `safe_timezone(text)` is service/internal only. Any later scheduler replacement must use it at every timezone conversion, including candidate SELECTs, and preserve per-user exception isolation.
- Content and delivery snapshot RLS require an active entitlement. Existing curated onboarding examples stay client fixtures; account recovery/deletion/restore do not require content reads. Offline identity-bound cache behavior is a separate client acceptance item.

## Entitlement configuration and recovery

The webhook requires the existing shared secret and canonical API key plus explicit `REVENUECAT_WEBHOOK_APP_ID` and `REVENUECAT_WEBHOOK_ENVIRONMENT`. No real values are supplied. Deployment requires verified target/app/environment and canonical API contract evidence. Alternative entitlement identifiers and explicit nonexpiring entitlements remain supported. No event name grants access by itself.

`sync-entitlement` accepts the authenticated user's JWT and ignores client user/entitlement/force/budget claims. Its optional service recovery path requires a separate `ENTITLEMENT_RECOVERY_SECRET` through `x-entitlement-recovery-secret`. The gateway's JWT mode must be verified: a recovery invocation can carry the verified service JWT as well as this secret; no gateway configuration is changed by the draft. The recovery body is an empty JSON object and the SQL selects at most three due users. The handler makes at most three sequential canonical requests. No background scheduling is installed.

Failures retain work and return retryable status; successful writes atomically apply the snapshot, recalculate notification state and complete event targets. A generation and lease fence rejects superseded/expired workers. Request-date checks reject snapshots predating their event, but do not prove provider-internal consistency. Verify refund, grace, transfer aliases and post-webhook provider lag against the target contract before deployment.

Independent static review corrections: transfer finalizers acquire common inbox rows in event-ID order before updating their targets, then recompute completion in a subsequent statement after the lock. Replay also recomputes the locked inbox aggregate. Claims now set a crash-recovery timestamp, and the recovery query explicitly admits expired pending leases with a null retry timestamp. The gated SQL script contains regression assertions plus the required two-session transfer race protocol; these SQL checks remain NOT RUN.

Automatic retries stop at eight attempts, including crashed claims, with target and inbox dead-letter status. A dead-letter row retains its cause/counters and existing entitlement. User sync can restart after a 15-minute cooldown; `retry_entitlement_reconciliation(uuid)` is service-only for explicitly authorized operator recovery. Replay reuses pending targets rather than skipping work on inbox-row existence. Valid UUIDs absent from auth are preserved in bounded `subscription_events.unmapped_user_ids` for operator routing evidence; known target UUIDs remain in the deletion-cascading target table. Arbitrary custom aliases are not stored; their count is retained and mapping requires provider/owner evidence. The event hash alone cannot reconstruct a custom alias. Unmapped receipts do not grant access. Payloads contain bounded routing metadata, not arbitrary subscriber attributes/custom alias text. Retention and deletion treatment of unresolved UUID metadata remains part of the explicitly unverified owner/integration evidence.

## Budget and retention limits

Budget settings in the new migration are conservative LOCAL DRAFT values, not measured capacity or deployed cost controls. A locked server policy row checks global and user minute buckets in one transaction. Canonical fetch claims additionally cap global concurrent leases. New installs or users cannot obtain another global bucket. Policies can pause one operation; no policy is changed remotely.

Database write budgets bound successful storage mutations and idempotent guarded calls. SQL rollback also rolls back reservations on rejected input, so these controls do not establish a cap on failed HTTP/auth/DB request work. Vendor ingress/auth quotas and a verified production workload remain release blockers. Successful per-day set/view growth is constrained by authenticated identity and server-local dates; long-term retention still needs the approved retention integration and owner evidence.

`prune_backend_budget_windows()` removes at most 1,000 windows older than two days per explicit service invocation. It is unscheduled. Subscription inbox IDs/hashes currently remain durable for replay safety; a verified provider retry horizon and retention policy are needed before compacting them. No paying anonymous users, identities, user text, existing subscriptions or historical migrations are deleted/rewritten.

## Verification

`supabase/tests/s4-backend.cjs` executes the actual TypeScript handlers/pure parser in a VM with in-process DB/provider/auth fixtures. Every unexpected import fails. The sanctioned offline runner supplies sanitized environment/storage and denies all network. This proves handler behavior against fixtures only; mocked RPCs do not prove transactions, RLS, grants, concurrency or canonical-provider semantics.

`supabase/tests/s4-edge-typecheck.cjs` checks owned Edge TypeScript with structural Deno/Supabase declarations; deployed SDK/runtime compatibility remains unverified.

`supabase/tests/s4-boundaries.sql` is a NOT RUN gated transaction for a separately verified synthetic Supabase DB. It checks privileges, paid/unpaid/snapshot access, direct-write denial, basic date/array/timezone bounds, claim fencing and global budget sharing, then rolls back. Before any run, verify the auth fixture schema and disable all external SQL/cron transports in the isolated DB. Never point it at an existing project.

Additional SQL integration cases still NOT RUN: simultaneous claims/finalizers in two sessions; reverse-order transfers and fault rollback; global budgets at an exact concurrent boundary; simultaneous stable-set creation; A/B cross-user writes; null/multidimensional/duplicate content IDs; active/inactive/new/rotating-device cardinality and version fencing; three unique concurrent views; malformed legacy timezone paired with a healthy scheduler user; DST/date/window changes; actual lifetime/monthly/trial policy behavior. These cannot be replaced by static substring assertions or the Edge mocks.
