# Future Self — source-specific map and reconnaissance limits
Prepared/rechecked 7 September 2026. Public main's visible latest commit: `24cfa23` (restore RevenueCat platform public keys). The packaging session re-read the public manifest, app/EAS configuration, .gitignore, purchases module, RevenueCat webhook, offering hook and content repository. It did not clone/build/run the app, inspect a private local checkout, or access authenticated services. Use the installer/local discovery to record the full actual SHA and dirty state. Other leads below are retained from the earlier supplied reconnaissance and require revalidation.

## Rechecked anchors (main links can change)
| Path | Observed declaration/structure | Workflow consequence |
|---|---|---|
| package.json | name=futureself; expo-router/entry; Expo ~57.0.11, React Native 0.86.2, React 19.2.3; Reanimated/worklets, Zustand, Supabase, RevenueCat, PostHog, Sentry, Voltra | Preserve the existing stack. Compare lockfile/local versions; no upgrade or package-manager switch during setup. |
| package.json scripts | start/android/ios/web/lint/typecheck/format/format:check/test | Setup runs NONE. The format script writes source, functions and docs; do not use it as a read-only check. Native run scripts may generate native files. |
| app.json | com.futureself.mobile, portrait, iPhone-focused, Apple sign-in, FutureSelfWidgets, group.com.futureself.mobile, declared iOS 16.4 minimum | Verify generated native targets and actual supported dependency minimum later; a declaration is not runtime proof. |
| .gitignore | generated /ios and /android; local env/operator docs and credentials ignored | Never reset/delete ignored native or operator work. Preserve existing ignore text. |
| eas.json | preview/production share committed service targets; named onboarding preview variants; platform-specific RevenueCat key classes; submit profile references a local .p8 signing credential | No assumption of test isolation. Do not copy values/keys into workflow records. Setup must not execute build/submit or touch credentials. |
| src/lib/purchases.ts | shared SDK configuration, identity and purchase helpers | Verify effective built key class and SDK identity. Do not blindly “replace test keys.” |
| src/features/paywall/useOffering.ts | offering/package selection; trial display based on introductory metadata | Audit customer eligibility and unknown state separately from product metadata. |
| supabase/functions/revenuecat-webhook/index.ts | UUID-shaped app_user_id, selected event handling, HTTP 200 on some failures | Test nonrenewing/lifetime/transfer, retries, ordering, durable acceptance and entitlement consistency against current vendor contracts. Not a proven production exploit. |
| src/features/content/repository.ts | cached content_items library, daily_sets writes and local-date selection | Trace direct-API authorization, date/cardinality controls, per-user cache/identity, offline and timezone behavior. This path does not establish live generation. |

## Prior reconnaissance leads — not re-proven by setup
Inspect auth bootstrap/link/recovery, own-user RLS and premium policy/grants, sync-entitlement amplification, deletion reachability through a premium gate, monitoring scrubbing vs broad comments/legal claims, notification queue/receipt idempotency, widget cleanup, historical native-test limitations and existing motion tokens. Read HISTORICAL_RECONNAISSANCE for paths/evidence and label findings newly verified versus inherited.

Primary paths to reconcile: `src/app`, `src/design-system`, `src/features/{auth,content,onboarding,paywall,notifications,widgets}`, `src/lib`, `src/__tests__`, `supabase/{migrations,functions}`, `widgets`, `docs`, app.json, eas.json and lockfile. Current local files may differ or be renamed. Locate replacements; do not recreate old architecture just to match this map.

## Sources rechecked for this package
- https://github.com/pempfanfounder/claudeFutureSelfApp/commits/main/
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/package.json
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/app.json
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/eas.json
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/.gitignore
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/src/lib/purchases.ts
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/src/features/paywall/useOffering.ts
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/supabase/functions/revenuecat-webhook/index.ts
- https://raw.githubusercontent.com/pempfanfounder/claudeFutureSelfApp/refs/heads/main/src/features/content/repository.ts

The root public AGENTS.md fetch returned 404 during packaging. This does not prove the founder's checkout or instruction chain lacks one. The installer checks both AGENTS.md and AGENTS.override.md locally and preserves them.
