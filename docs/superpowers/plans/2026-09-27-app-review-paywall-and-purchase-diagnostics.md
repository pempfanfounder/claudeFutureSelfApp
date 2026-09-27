# App Review Paywall and Purchase Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the billed subscription price dominant in the Cal AI paywall and retain a privacy-safe RevenueCat error code when a purchase fails.

**Architecture:** Keep `useOffering` as the only source of store products and trial eligibility. The two Cal AI plan controls share a single price-label helper and show a trial only after `trialInfo` confirms eligibility. Purchase error codes pass through the existing finite diagnostic policy before Sentry receives them; purchase behavior otherwise stays unchanged.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript 6, RevenueCat React Native 10.7, Jest and React Native Testing Library.

---

## File map

- `src/features/paywall/calai/pricing.ts`: store-derived total/period label used by both controls and the CTA summary.
- `src/features/paywall/calai/PlanCards.tsx`: active stacked plan cards, with total billed price primary and eligible trial secondary.
- `src/features/paywall/calai/PlanToggle.tsx`: alternate segmented layout with the same price hierarchy.
- `src/features/paywall/calai/CalAiPaywall.tsx`: neutral CTA and selected plan terms next to it.
- `src/lib/diagnosticPolicy.ts`: finite code and operation allowlists plus crash-event tag scrubber.
- `src/lib/monitoring.ts`: pass only the finite purchase tags to Sentry.
- `src/lib/purchases.ts`: supply sanitized purchase failure context to monitoring.
- `src/__tests__/calAiPricing.test.ts`, `src/__tests__/calAiPaywall.test.tsx`, `src/__tests__/diagnosticPrivacy.test.ts`, and `src/__tests__/purchaseIdentity.test.ts`: regression and privacy tests.

Work only on `codex/app-review-paywall-diagnostics` in `/Users/z/.config/superpowers/worktrees/claudeFutureSelfApp/app-review-paywall`. Do not touch the original checkout or submit a build from this plan.

### Task 1: Store-derived billed price helper

**Files:** Modify `src/features/paywall/calai/pricing.ts`; test `src/__tests__/calAiPricing.test.ts`.

- [ ] **Step 1: Add a failing test** for a helper named `primaryPriceLabel`:

```ts
expect(primaryPriceLabel(annual)).toBe("$35.99/year");
expect(primaryPriceLabel(weekly)).toBe("$6.99/week");
expect(primaryPriceLabel(pkg("ANNUAL", 34.99, "€ 34,99"))).toBe("€ 34,99/year");
```

- [ ] **Step 2: Run** `npm test -- --runInBand src/__tests__/calAiPricing.test.ts`; expect a failure because `primaryPriceLabel` does not exist.
- [ ] **Step 3: Add the smallest implementation** to `pricing.ts` using the already imported `periodLabel`:

```ts
export function primaryPriceLabel(pkg: PurchasesPackage): string {
  return `${pkg.product.priceString}/${periodLabel(pkg)}`;
}
```

- [ ] **Step 4: Rerun** the same test; expect it to pass. Commit only the helper and its test with `git commit -m "feat(paywall): label full billed subscription price"`.

### Task 2: Plan controls show the billed amount first

**Files:** Modify `PlanCards.tsx` and `PlanToggle.tsx`; test `calAiPaywall.test.tsx`.

- [ ] **Step 1: Replace the old expectations with failing behavior assertions.** In versions 1, 2, and 4, the annual card must contain `$35.99/year` with test ID `plan-$rc_annual-price`, and the weekly card must contain `$6.99/week` with test ID `plan-$rc_weekly-price`. For version 3, `plan-price-line` must show the selected full billed price. In all versions, the annual per-week string must be absent. In the unknown/ineligible eligibility case, `3 days free` must be absent. Keep the existing plan selection assertion.

```ts
expect(screen.getByTestId("plan-$rc_annual-price")).toHaveTextContent("$35.99/year");
expect(screen.getByTestId("plan-$rc_weekly-price")).toHaveTextContent("$6.99/week");
expect(screen.queryByText("$0.69/wk")).toBeNull();
```

- [ ] **Step 2: Run** `npm test -- --runInBand src/__tests__/calAiPaywall.test.tsx`; expect the new price test IDs and no-per-week assertions to fail.
- [ ] **Step 3: In `PlanCards`, render** `primaryPriceLabel(pkg)` in an `AppText variant="h3"` with the price test ID. Put it inside the copy column below the plan name, not in the trailing row. Keep `Most popular` as a small annual marker; show `trialInfo(pkg, data.eligibility?.[pkg.product.identifier])?.label` as smaller text after the price. Keep savings only as a smaller `label`/`ink2` line below price and trial. Remove the unconditional `3 days free` tab and the `perWeekLabel` rendering.
- [ ] **Step 4: In `PlanToggle`, render** `primaryPriceLabel(selected)` in the existing `h3` price line; remove `perWeekLabel`, and render `trialInfo` in smaller text below the price when eligible. Keep the selection and savings badge behavior.
- [ ] **Step 5: Rerun** the target test, then `npm test -- --runInBand src/__tests__/calAiPricing.test.ts src/__tests__/calAiPaywall.test.tsx`; expect both to pass. Commit the component and test changes with `git commit -m "fix(paywall): prioritize billed amounts in plan controls"`.

### Task 3: Selected price beside a neutral purchase button

**Files:** Modify `CalAiPaywall.tsx`; test `calAiPaywall.test.tsx`.

- [ ] **Step 1: Add failing assertions** for every Cal AI version: `paywall-cta` reads `Continue`; `paywall-selected-price` shows the selected plan's store price and period; an eligible trial shows its length in smaller terms; an ineligible or unknown trial has no trial label. Confirm selecting weekly changes the summary to `$6.99/week`.

```ts
expect(screen.getByTestId("paywall-cta")).toHaveTextContent("Continue");
expect(screen.getByTestId("paywall-selected-price")).toHaveTextContent("$35.99/year");
```

- [ ] **Step 2: Run** `npm test -- --runInBand src/__tests__/calAiPaywall.test.tsx`; expect the CTA and summary assertions to fail.
- [ ] **Step 3: Render** the selected plan's `primaryPriceLabel(data.pkg)` immediately above the button in `AppText variant="h3"`; render an eligible trial underneath in `AppText variant="label"`. Use `label="Continue"` on the button. Leave the existing auto-renewal disclosure and footer below it. No hardcoded price or trial length is allowed.
- [ ] **Step 4: Rerun** the test; expect it to pass. Commit with `git commit -m "fix(paywall): show selected charge beside purchase action"`.

### Task 4: Finite purchase diagnostics

**Files:** Modify `diagnosticPolicy.ts`, `monitoring.ts`, and `purchases.ts`; test `diagnosticPrivacy.test.ts` and `purchaseIdentity.test.ts`.

- [ ] **Step 1: Add failing privacy tests.** `purchaseDiagnosticCode({code: "2"})` returns `"2"` (RevenueCat Store Problem), `purchaseDiagnosticCode({code: "11"})` returns `"11"` (invalid credentials), and unlisted codes/raw strings return `"unknown"`. `scrubCrashEvent` preserves `purchase_code` and `purchase_operation` only when `area` is `purchases.transaction`; raw error text and IDs remain absent. `monitoring.captureError` sends only these finite tags. Add a transaction test that a mocked RevenueCat rejection calls monitoring with the finite code and operation while returning the existing generic user message.

```ts
expect(purchaseDiagnosticCode({ code: "2", message: canary })).toBe("2");
expect(purchaseDiagnosticCode({ code: canary })).toBe("unknown");
expect(JSON.stringify(scrubCrashEvent({tags: {
  area: "purchases.transaction", purchase_code: "2",
  purchase_operation: "purchase", message: canary,
}}))).not.toContain(canary);
```

- [ ] **Step 2: Run** `npm test -- --runInBand src/__tests__/diagnosticPrivacy.test.ts src/__tests__/purchaseIdentity.test.ts`; expect failures for the missing helper and tags.
- [ ] **Step 3: Implement a finite set** in `diagnosticPolicy.ts` using the installed SDK's documented numeric values (`0` through `26`, `28` through `35`, and `42`), plus an `unknown` fallback. Read only the error object's `code`; never read its `message`, `underlyingErrorMessage`, `userInfo`, or stack. Accept only `purchase` and `restore` as operations.

```ts
export function purchaseDiagnosticCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && PURCHASE_CODES.has(code) ? code : "unknown";
}
```

- [ ] **Step 4: In `monitoring.captureError`,** add sanitized `purchase_code` and `purchase_operation` tags only when `diagnosticArea(context?.area)` is `purchases.transaction`. In `scrubCrashEvent`, re-apply the same finite checks before preserving those tags. All other areas keep only their existing `area` tag.
- [ ] **Step 5: In `purchases.transaction`,** call `monitoring.captureError(error, {area: "purchases.transaction", purchase_code: purchaseDiagnosticCode(error), purchase_operation: pkg ? "purchase" : "restore"})` in the existing non-cancellation catch. Do not change the purchase call, cancellation, timeout, identity, or entitlement logic.
- [ ] **Step 6: Rerun** both targeted tests; expect them to pass. Commit with `git commit -m "fix(purchases): record privacy-safe failure codes"`.

### Task 5: Verify and open draft PR

**Files:** No additional implementation files; update tests only if they reveal a real defect in the planned behavior.

- [ ] **Step 1: Run** `npm test -- --runInBand src/__tests__/calAiPricing.test.ts src/__tests__/calAiPaywall.test.tsx src/__tests__/diagnosticPrivacy.test.ts src/__tests__/purchaseIdentity.test.ts` and inspect the full results.
- [ ] **Step 2: Run** `npm run typecheck`, `npm run lint`, and `npm run format:check`; resolve any failures caused by the branch.
- [ ] **Step 3: Inspect** `git diff --check`, `git status --short`, and `git diff origin/main...HEAD`; ensure no secrets, raw SDK messages, or generated artifacts entered the commits.
- [ ] **Step 4: If a simulator build is available, visually inspect** the active paywall at iPhone and iPad compatibility sizes. Record when this cannot be run; do not infer visual success from Jest alone.
- [ ] **Step 5: Push** the isolated branch and create a draft PR. The PR body must state which tests passed, which device purchase was observed on build 17, and that the new build still needs separate yearly/weekly/restore sandbox tests before resubmission. Attach the PR to this task.

The PR is a code review artifact, not an App Store submission. Guideline 2.1(b) is not declared resolved until the resubmission gate in the approved spec is met.
