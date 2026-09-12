# Onboarding Conversion Refinements — Implementation Plan

Spec: `docs/superpowers/specs/2026-08-16-onboarding-conversion-refinements-design.md`
Execution model: orchestrator + specialised subagents on disjoint file sets,
integrated and verified by the orchestrator (typecheck, lint, jest, review).

## Task 0 — Contract (orchestrator, done first)

- `types.ts`: `bullets?`, `footnote?`, `cta` may be `(ctx) => string`;
  all `step.cta` consumers use `resolveText`.
- `src/lib/legal.ts`: `LEGAL_URLS` (joinfutureself.com/terms|privacy|support).
- Spec + this plan committed with the work.

## Task 1 — Reference analyst

Output `docs/REFERENCE_IAM_SCREENS.md`: 1 fps + scene-change frames of the
I Am recording; exact copy/options/order for welcome footer, familiarity,
habit helper, repetition/science education, notification config (counts,
start/end times, picker), time devotion, streak goal + commit, belief
questions, benefits, practice modes, achieve, trial pre-frames, paywall.
Key frames saved as `key_*.png` in the session scratchpad.

## Task 2 — Agent K (step renderers)

Files: `KeyboardAvoider.tsx` (new), `LegalFooter.tsx` (new), `IamStep.tsx`,
`StellaStep.tsx`, `iamStep.test.tsx`, `keyboardAvoider.test.tsx`.

- KeyboardAvoider (padding on both platforms, measured window-Y offset).
- Counter removed, `maxLength` kept, return-key submit on single-line inputs.
- Welcome: tappable Terms / Privacy Policy (LEGAL_URLS), icon tile styling.
- `info` renders `bullets` (icon list) and `footnote`.

## Task 3 — Agent L (assets / legal URLs)

Files: `assets/images/{splash-icon,icon,android-icon-foreground}.png`,
`scripts/heal-icon-band.py`, `PaywallFooter.tsx`, `PrivacyChoicesSheet.tsx`,
`TimelinePaywall.tsx`, `website/README-DEPLOY.txt`, `legalUrls.test.ts`.

- Heal the left band (measured, seam-free), verify numerically + visually.
- Legal URLs centralised; "daily mix" retired from the paywall body.

## Task 4 — Agent N (notifications config UI)

Files: `NotificationsStep.tsx`, `steps/notifications/*` (new),
`src/features/notifications/time.ts` (new), `settings/notifications.tsx`
(label helper only), `package.json`/lock, `jest.setup.js`,
`notificationsStep.test.tsx`.

- Blocked by Task 1 (key frames). I Am look: stacked mock card, round −/+
  count controls, Start/End card with the native time picker
  (`@react-native-community/datetimepicker`), "Allow and Save" / "Not now".
- Same store contract; counts 0..DAILY_LIMIT; 30-minute slots; window ≥ 1 h
  kept by moving the other bound; locale-aware labels.

## Task 5 — Agent C (flow + copy)

Files: `iamClaude.ts`, `StreakCommitStep.tsx`, `ResultStep.tsx`,
`docs/ONBOARDING_COPY_IAM_CLAUDE.md`, `variants.test.ts`,
`onboardingFlow.test.tsx`.

- Blocked by Task 1 (exact I Am wording). Implements D3, D4, D6.

## Task 6 — Integration (orchestrator)

- `npm run typecheck && npm run lint && npm test`; reviewer subagent on the
  full diff; fix findings; commit; push branch to GitHub; open PR; final
  report with owner reminders (Netlify deploy, native rebuild, TestFlight
  keyboard check).
