# QA inventory template and mandatory acceptance logic

Create concrete case IDs from the approved current feature inventory. Below is a checklist of categories, not an assertion that any case passed. Unknown/disabled variants must be reconciled against the founder's scope; disabled features need non-exposure checks, not full launch support by default.

| Family | Required state coverage |
|---|---|
| Installation/onboarding | fresh/install-over-upgrade as relevant, every enabled variant, skip/back/interruption, restored preferences, permissions and honest value/paywall copy |
| Identity | anonymous, linked Apple/Google/email as enabled, canceled/error provider flow, existing-account conflicts/recovery, logout, reinstall, restored purchases, cross-device, stale cache/telemetry/widget separation |
| Feed/content/messages/settings | initial/empty/loading/error/offline, daily selection/pagination, favorite/pinned/progress persistence, themes, deep links, keyboard, back/gesture transitions, retry and concurrent actions |
| Commerce | every approved monthly/yearly/lifetime product, trial eligible/ineligible/unknown, localized terms, success/cancel/pending/fail, no-purchase restore, ownership restore, auto-renew off with still-valid access, renewal/expiration/refund/revoke/grace/retry/transfer/alias as applicable |
| Entitlement integration | delayed/duplicate/out-of-order webhooks, failure before/after durable persistence, client/backend reconciliation, stale offline state, identity change while purchasing, environment mismatch rejection |
| Deletion/privacy | guest, unpaid/lapsed/paid, reachable entry, confirmation/cancellation, Apple revocation where applicable, local/cache/widget/processor cleanup, subscription-management warning, disclosed lawful retention, consent withdrawal |
| Push | deny/grant/revoke OS permission, token rotation, preferences/entitlement change while queued, quiet hours, delivery/receipt/invalid token, duplicate/retry budget, cold/warm taps, test-device restriction |
| Widgets | each approved type/family, generated extension install, group entitlement, pinned and daily text, rollover, expiry/log-out/delete, stale data, background update limits |
| Resilience | slow/offline/transient errors/rate limiting, foreground/background/force quit, retries, rapid taps, concurrent devices, date boundary/travel/U.S.–EU DST |
| Accessibility/visual | small/standard/large iPhone, actual oldest/recent supported runtime, large text, VoiceOver/focus, contrast, reduced motion, input/keyboard/safe area, approved typography/motion and interaction cancellation |
| Abuse/cost | cross-user/privileged denial, arbitrary/oversized input, direct API bypass, limits under many identities, cache/refetch/upstream amplification, bounded queue/retry/fan-out, telemetry/email growth |

Each case: ID, priority/mandatory gate, applicable variants/account states, source/build/backend/profile, device/OS, preconditions, command or exact steps, expected, actual, pass/fail/blocked/not_run/stale, evidence, date, reviewer and linked finding. No default PASS. Counts must include failures/blocked/not-run and the inventory denominator.

Automate deterministic unit/integration/RLS/webhook and repeatable user journeys. Use Computer Use/native tooling for real gestures, visual polish, permissions, interruption and exploratory checks. Use physical-device/store evidence for mandatory integration acceptance; simulators may support some push/store-like paths, but do not assume those equal the real installed experience. A screen recording is not a profiler measurement.

Critical money/identity/deletion journeys must all be covered; use risk-based pairwise coverage only for lower-risk device/state combinations. Agree quantitative performance budgets after measuring the baseline; do not invent frame-rate improvement percentages. Screenshots of a static final screen do not establish smooth motion.

Session 5 exit: no known unresolved critical/high launch blockers, mandatory pre-release cases actually passed, accepted lower-risk deferrals, founder visual acceptance. Exact TestFlight-candidate acceptance remains a mandatory Stage 6 pre-review gate; it cannot be silently waived by a pre-upload test. Other missing critical native/device evidence blocks launch progression.

Repair loop: finding → approved batch → Stage 4 implementation → independent Stage 5 targeted failed-case retest + neighbors + full critical regression + relevant adversarial checks → newly identified candidate. Candidate or material configuration drift makes affected passes stale. Defect absence can never be guaranteed.
