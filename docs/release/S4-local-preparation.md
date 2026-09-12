# Session 4 local preparation — unpublished draft

This source is a working implementation, not a submitted build or approved legal statement. No generated native manifests, runtime services, pricing, webhooks, schedules, legal pages or store declarations have been changed externally.

## Source configuration

- Existing bundle/package IDs, app group, widget extension IDs, curated content, icons, themes and dependency versions are retained.
- `app.config.js` derives the Google reversed URL scheme only from a validated public iOS OAuth client ID supplied to a later build. It does not read/copy credentials during these local checks. The Google plugin is omitted when the iOS client ID is absent, and the iOS Google entry must stay unavailable without it. No real value is invented.
- `futureself` scheme and Voltra app group remain in app.json. Generated URL types, associated app groups, extension entitlements, privacy manifests and merged SDK declarations require a separately approved native preparation/build. They have not been verified from a generated candidate.
- Existing encryption/age/storefront/identity declarations are not ratified by this work. The owner must review them before submission. No required-reason API privacy code is guessed.
- Fresh release assignments resolve to iam-claude. Existing persisted assignments retain their original variant. Development overrides remain development-only; the historical local hash helper remains for compatibility/tests, not new release routing.

## Data flows to reconcile with owner-approved policy

| Area              | Implemented source behavior                                                                                                                                      | Missing acceptance/evidence                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous account | Supabase account stores personalization, preferences, daily progress and favorites; the app stores account-scoped recovery/cache data                            | Provider availability, live RLS and actual deletion cascade/backup behavior                                                           |
| Purchases         | RevenueCat account identity, monthly/yearly presentation, eligibility-aware trial copy, durable server reconciliation draft                                      | Actual catalog, eligibility, Apple/Google renewal/cancellation/restore and transfer cases                                             |
| Notifications     | Server preferences, token/device registration, per-device delivery/receipt drafts; optional reminders are not guaranteed                                         | Gateway, PGMQ, scheduler, transport, actual token rotation and costs                                                                  |
| Widgets           | Account-scoped local snapshots/pinned text may reach the OS home/lock screen; neutral clear is queued after departed-account writes                              | Native replacement, app group isolation, locked-device presentation and stalled-module recovery                                       |
| Analytics         | Explicit finite event/property values only; no user profile identification or raw content. New versioned storage does not replay retired SDK queues              | Actual transport envelope and retired native caches; owner retention/processor declarations                                           |
| Diagnostics       | Explicit generic error plus finite operation area; tracing, native capture, screenshots, view hierarchy, automatic breadcrumbs and attachments disabled/scrubbed | Native generated SDK configuration and end-to-end envelopes                                                                           |
| Deletion          | An authenticated request precedes deletion; a hashed opaque receipt supports status-only retries, with local receipt preserved until cleanup                     | Per-function gateway exception, trusted admin absence behavior, provider token revocation, backup retention and owner support process |

## Retention and recovery choices awaiting owner/operations review

Migration constants are bounded engineering defaults, not legal promises or proven capacity. Review backend budget windows, entitlement inbox/dead-letter retention, per-device push attempts/snapshots, deletion receipt retention (7 days), and unscheduled pruning before any deployment. A missing schedule does not enforce deletion. Confirm legal entity/contact, processor contracts, storage regions, backup retention, support response commitments, minimum age and launch storefronts.

The repository's existing `website/privacy`, `website/terms` and `website/support` are prior drafts. Do not publish them as validated statements until they are reconciled with the table above and actual deployments. Legal/support URLs in `src/lib/legal.ts` are unchanged; their live reachability remains unverified.

## Required follow-up evidence

Rehearse the five new migrations, roles and acceptance fixtures in an independently verified development/staging or isolated local database with synthetic users. Validate concurrency/leases, RLS/grants and recovery. The founder has authorized development/staging implementation and tests across later sessions; do not ask again for that existing scope. Native recovery remains paused and needs a renewed bounded scope before probes, builds, installation or launch. Session4 hands off the reviewed source and explicit gaps; Session5 performs independent QA and integration/device acceptance, and Session6 handles gated deployment/release. Do not restart completed stages.

## Verified target discovery and real development transport

The configured Supabase project `claudefutureself` (`ykgswczatkspryetstor`) is explicitly **main / PRODUCTION** in its dashboard. No branches or backups were shown. All committed preview profiles point to this same backend. A preview build must not be treated as isolated staging. No database migration or Edge Function was deployed.

Sentry organization `future-self-i2`, project `futureself` (4511881926803536), has development and production in a shared project. Two generic synthetic development events reached its dashboard. An initial raw-envelope harness omitted SDK metadata and allowed server IP inference. A second event using the installed core envelope with ReactNativeClient 7.11.0's `infer_ip: never` setting suppressed the displayed IP, but Sentry still added geography. **Diagnostics privacy acceptance remains open.** Resolve the server enrichment behavior and verify actual device envelopes in Session5. A shared setting affecting production requires an exact target/change/rollback approval. No settings or existing data were changed/deleted.

PostHog's Future Self organization / Default project 169314 was identified; a separate staging project was not. RevenueCat and Expo browser dashboards require login; saved Session1 Expo project/build evidence remains available. No pricing, purchase, new build, submission or publication occurred.

The workflow's sanitized evidence and logs record exact events, transport limits, reviewed source and the implemented/verified/deployed distinction. Transport success does not prove a working installed app, provider sign-in, real billing, push delivery or native widgets.
