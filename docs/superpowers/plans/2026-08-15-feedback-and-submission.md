# Feedback Round 1 + Submission Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the code-side launch-checklist blockers and all 11 feedback items (item 7 = explanation only) so the app is submission-ready.

**Architecture:** Three parallel waves of disjoint-file workstreams on this branch; DB changes land as one migration applied live via Supabase MCP; each workstream is TDD where a seam exists (stores, pure logic, steps), render-level for chrome. Spec: `docs/superpowers/specs/2026-08-15-feedback-and-submission-design.md`.

**Tech Stack:** Expo SDK 57 / RN 0.86, TypeScript, zustand, reanimated 4, expo-symbols + @expo/vector-icons, expo-alternate-app-icons (new), sharp (dev script), Supabase (SQL migration), jest-expo.

**Wave map (disjoint file ownership):**
- **A0 (orchestrator):** migration SQL + live apply; docs.
- **A1 compliance:** `PaywallFooter.tsx`, new `PrivacyChoicesSheet.tsx`, `TimelinePaywall.tsx`, `NotePaywall.tsx`, `useOffering.ts`, `purchases.ts`, `supabase/functions/legal/index.ts`, `app.json`+`package.json` (remove expo-secure-store).
- **A2 auth-state:** `src/features/onboarding/engine/store.ts`, `completeOnboarding.ts`, `AuthProvider.tsx`, `config.ts`, new `src/__tests__/authState.test.ts`.
- **A3 feed+caps:** `feed.tsx`, `ContentCard.tsx`, `types.ts`, `NotificationsStep.tsx`, `settings/notifications.tsx`, `ResultStep.tsx`, `widgetSync.tsx` (slot count only), tests.
- **B1 icons+rename:** new `design-system/components/Icon.tsx`, glyph replacements (`ContentCard`, `feed`, `themes`, `favorites`, `settings/*`, `content/[id]`, `TimelinePaywall`, `StreakBanner`, steppers), Saved Quotes rename (`favorites.tsx`, `account.tsx`, `stellaClaude.ts`).
- **B2 onboarding-commit:** `StreakCommitStep.tsx`, `iamClaude.ts`, `iamFounder.ts`, `engine/types.ts` (only if a field is missing), `variants.test.ts`.
- **C1 morph+app-icon:** new `MorphOverlay.tsx`, embeddable refactor of `themes`/`favorites`/`settings/index`, `feed.tsx` wiring, `scripts/generate-app-icons.mjs`, `app.json` plugin, `package.json` (expo-alternate-app-icons, sharp devDep), App-icon grid in `themes.tsx`.
- **C2 widget-custom:** new `src/features/widgets/widgetPrefs.ts`, redesigned `settings/widgets.tsx`, `widgetSync.tsx` theming/source.

Conflicts intentionally serialized: `feed.tsx`/`ContentCard.tsx` (A3 → B1 → C1), `TimelinePaywall.tsx` (A1 → B1), `themes.tsx` (B1 → C1), `widgetSync.tsx` (A3 → C2), `types.ts` engine (B2 only).

---

### Task A0: Security + caps migration (orchestrator)

**Files:**
- Create: `supabase/migrations/20260815120000_security_grants_and_caps.sql`

- [ ] **Step 1: Write migration**

```sql
-- Lock down SECURITY DEFINER functions that Supabase's default grants
-- exposed to anon/authenticated (advisor 0028/0029). `from public` alone
-- does NOT drop the per-role default grants — list every role.
revoke all on function public.invoke_push_function(text) from public, anon, authenticated;
revoke all on function public.enqueue_due_notifications(int) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.recalc_notification_state(uuid) from public, anon, authenticated;
grant execute on function public.recalc_notification_state(uuid) to service_role;
grant execute on function public.enqueue_due_notifications(int) to service_role;

-- Intentionally user-facing RPCs keep `authenticated` (anonymous sign-ins
-- authenticate as the authenticated role) but drop the unused anon grant.
revoke all on function public.register_device(text, text, text, text, text, text, text) from anon;
revoke all on function public.deactivate_device(text) from anon;
revoke all on function public.record_view(uuid, date) from anon;
revoke all on function public.recalc_my_notification_state() from anon;

-- Advisor 0011: pin search_path on the two remaining mutable functions.
alter function public.set_updated_at() set search_path = '';
alter function public.compute_next_due(int, int, int, int, text, timestamptz) set search_path = '';

-- Item 6: allow up to 20 quotes/affirmations per day.
alter table public.notification_prefs
  drop constraint notification_prefs_quotes_per_day_check,
  add constraint notification_prefs_quotes_per_day_check
    check (quotes_per_day between 0 and 20),
  drop constraint notification_prefs_affirmations_per_day_check,
  add constraint notification_prefs_affirmations_per_day_check
    check (affirmations_per_day between 0 and 20);
```

(`compute_next_due` signature must be confirmed from the live catalog before applying; adjust the `alter function` argument list to match `pg_get_function_identity_arguments`.)

- [ ] **Step 2: Apply via MCP `apply_migration`, verify with `has_function_privilege` query (anon/authenticated must be false for the four locked functions), constraint check via `information_schema.check_constraints`**
- [ ] **Step 3: Commit**

### Task A1: Paywall compliance pack

**Files:** as wave map.

- [ ] **Step 1: `useOffering.ts` — export a disclosure builder (pure, testable)**

```ts
/** Guideline 3.1.2 disclosure for the selected package. */
export function subscriptionDisclosure(pkg: PurchasesPackage | null): string | null {
  if (!pkg) return null;
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `One-time purchase of ${pkg.product.priceString}. Charged to your App Store account at confirmation.`;
  }
  const period = periodLabel(pkg); // "year" | "month" | "week"
  const trial = trialInfo(pkg);
  const lead = trial
    ? `${trial.label} free, then ${pkg.product.priceString} per ${period}.`
    : `${pkg.product.priceString} per ${period}.`;
  return (
    `${lead} Payment is charged to your App Store account at confirmation. ` +
    `The subscription renews automatically unless cancelled at least 24 hours ` +
    `before the end of the current period. Manage or cancel anytime in App Store settings.`
  );
}
```

- [ ] **Step 2: test `src/__tests__/paywallCompliance.test.ts`** — disclosure for annual-with-trial contains "renews automatically" + price; lifetime contains "One-time"; CTA label helper returns "Start 3-day free trial" given `trialLength: "3 days"`, "Unlock Future Self" without trial. Run: `npx jest paywallCompliance -t disclosure` → PASS after implementation.
- [ ] **Step 3: Render the disclosure under the price line in `TimelinePaywall` and `NotePaywall` (small `label` tone `ink3`, centered); CTA: `hasTrial ? \`Start ${data.trialLength} free trial\` : "Continue"` (Timeline) / keep Note's copy but same rule.**
- [ ] **Step 4: `PrivacyChoicesSheet.tsx`** — modal listing: Privacy Policy / Terms links, "Delete my account & data" (confirm → `useAuth().deleteAccount()` → on ok route `/onboarding` via `router.replace("/")`), support mailto. Footer of both paywalls gains "Privacy choices" entry point (in `PaywallFooter`).
- [ ] **Step 5: `purchases.ts`** — `Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR)`; after successful `purchasePackage`/`restorePurchases`, fire-and-forget `getSupabase()?.functions.invoke("sync-entitlement", { body: {} })`.
- [ ] **Step 6: Remove `expo-secure-store`** from `package.json` deps + `app.json` plugins (kills placeholder `NSFaceIDUsageDescription`); `npm install` to update lockfile.
- [ ] **Step 7: `legal/index.ts`** — add an OWNER block: `const OWNER = { tradeName: 'Improvement Labs', kvk: '[KVK NUMMER — INVULLEN VOOR DEPLOY]', btw: '[BTW-ID — INVULLEN VOOR DEPLOY]', address: '[ZAKELIJK ADRES — INVULLEN VOOR DEPLOY]' }` rendered in both documents' contact sections + Apple third-party-beneficiary clause + RevenueCat SCC transfer sentence + withdrawal-right paragraph in Terms §2. Add a top-of-file comment: **do not deploy until placeholders are replaced**.
- [ ] **Step 8: run typecheck + full jest; commit.**

### Task A2: Account-state integrity (item 8 + email gate)

**Files:** as wave map.

- [ ] **Step 1: failing tests `src/__tests__/authState.test.ts`** (mock AsyncStorage + supabase):

```ts
it("clearOnboardingState removes the persisted completion flag", async () => {
  await markOnboardingComplete("iam-claude");
  await clearOnboardingState();
  expect(await getCompletedOnboardingVariant()).toBeNull();
});

it("reconcileOnboardingState clears the local flag when server has no personalization row", async () => {
  await markOnboardingComplete("iam-claude");
  mockPersonalizationRow(null); // maybeSingle -> { data: null, error: null }
  const complete = await reconcileOnboardingState("user-1");
  expect(complete).toBe(false);
  expect(await getCompletedOnboardingVariant()).toBeNull();
});

it("reconcileOnboardingState adopts server completion on account switch", async () => {
  mockPersonalizationRow({ variant: "stella-claude" });
  const complete = await reconcileOnboardingState("user-2");
  expect(complete).toBe(true);
  expect(await getCompletedOnboardingVariant()).toBe("stella-claude");
});

it("reconcileOnboardingState keeps local state on network failure", async () => {
  await markOnboardingComplete("iam-claude");
  mockPersonalizationError(new Error("offline"));
  const complete = await reconcileOnboardingState("user-1");
  expect(complete).toBe(true);
});
```

- [ ] **Step 2: implement** — `store.ts`: `clearOnboardingState()` (remove key; not `__DEV__`-gated; keep `devClearOnboarding` delegating to it). `completeOnboarding.ts`: `reconcileOnboardingState(userId)` per spec (select `variant` from personalization; server-wins on success; local-wins on thrown/network error; sync `useAppState.setOnboardingComplete` + `markOnboardingComplete`/`clearOnboardingState`).
- [ ] **Step 3: `AuthProvider`** — `deleteAccount`: on success `await logOutPurchases(); await clearOnboardingState();` remove pinned key (`AsyncStorage.removeItem("fs.widget.pinned.v1")` via a `clearLocalUserData()` helper exported from store or a small `localData.ts`). `signOut`: `await clearOnboardingState()` (copy already promises "fresh start"). `signInExistingWithApple/Google` + `verifyEmailLink`(switch mode n/a) → after success `await reconcileOnboardingState(newUserId)`. Auth listener: when `userId` changes to a non-null value, `reconcileOnboardingState(userId).catch(() => {})`.
- [ ] **Step 4: email gate** — `config.ts`: `EXPO_PUBLIC_EMAIL_AUTH_ENABLED` zod enum default off; `emailAuthEnabled` in config; `AuthProvider.availableProviders.email = config.hasSupabase && config.emailAuthEnabled`; add to `.env.example` with SMTP note.
- [ ] **Step 5: run jest authState + full suite; typecheck; commit.**

### Task A3: Feed paging + 20/day caps

**Files:** as wave map.

- [ ] **Step 1: failing test `src/__tests__/feedPaging.test.tsx`** — render `FeedScreen` inside providers with mocked store returning 3 quotes; fire `onLayout` on the FlatList with `height: 700`; assert `getItemLayout(null, 2)` → `{ length: 700, offset: 1400 }` (export a pure `pageLayout(height, index)` helper to make this directly testable) and that `ContentCard` receives `height={700}`.
- [ ] **Step 2: implement** — `feed.tsx`: `const [pageH, setPageH] = useState<number | null>(null)`; `<FlatList onLayout={(e) => setPageH(Math.round(e.nativeEvent.layout.height))} …` rendered only with data when `pageH != null` (render bare container until measured); `renderItem` passes `height={pageH}`; `getItemLayout` uses `pageH`; remove `useWindowDimensions` page math. `ContentCard`: accept `height: number` prop, drop its own `useWindowDimensions`. `EndCard` uses `pageH`.
- [ ] **Step 3: caps** — `types.ts`: `DAILY_LIMIT = 20`; `NotificationsStep` steppers max 20; `settings/notifications.tsx` maxes 20; end-card copy → "That's the whole set for today."; `ResultStep`/variant copy: replace hardcoded "3 quotes and 3 affirmations" with values from `notificationPrefs` (template through existing `resolve` ctx if already supported, else compute line in `ResultStep`). `widgetSync` unchanged except it now naturally receives 20+20 items (slot spread already generic).
- [ ] **Step 4: update `dailySet.test.ts` expectations (10 → 20; selection still deterministic + unique).**
- [ ] **Step 5: full jest + typecheck; commit.**

### Task B1: Icon system + Saved Quotes rename

- [ ] **Step 1: `design-system/components/Icon.tsx`**

```tsx
import { Platform } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import Ionicons from "@expo/vector-icons/Ionicons";

export type IconName =
  | "share" | "heart" | "heartFill" | "close" | "back" | "chevronRight"
  | "settings" | "palette" | "sparkle" | "plus" | "minus" | "grid"
  | "person" | "widget" | "bell" | "check";

const SF: Record<IconName, SymbolViewProps["name"]> = {
  share: "square.and.arrow.up", heart: "heart", heartFill: "heart.fill",
  close: "xmark", back: "chevron.left", chevronRight: "chevron.right",
  settings: "gearshape", palette: "circle.lefthalf.filled", sparkle: "sparkles",
  plus: "plus", minus: "minus", grid: "square.grid.2x2", person: "person",
  widget: "widget.small", bell: "bell", check: "checkmark",
};
const ION: Record<IconName, keyof typeof Ionicons.glyphMap> = {
  share: "share-outline", heart: "heart-outline", heartFill: "heart",
  close: "close", back: "chevron-back", chevronRight: "chevron-forward",
  settings: "settings-outline", palette: "contrast-outline", sparkle: "sparkles-outline",
  plus: "add", minus: "remove", grid: "grid-outline", person: "person-outline",
  widget: "apps-outline", bell: "notifications-outline", check: "checkmark",
};

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  if (Platform.OS === "ios") {
    return <SymbolView name={SF[name]} size={size} tintColor={color} />;
  }
  return <Ionicons name={ION[name]} size={size} color={color} />;
}
```

(jest: `expo-symbols` renders via jest-expo mocks; add to `transformIgnorePatterns` only if the runner complains.)
- [ ] **Step 2: replace glyph buttons** — ContentCard share ↗ + hearts (burst stays but uses `heartFill` icon at 96 via size prop), feed fabs ♡→`heart`, ◐→`palette`, streak chip ✦→`sparkle` (icon+text row), all ✕ headers → `close`, ‹ → `back`, settings rows › → `chevronRight`, stepper −/+ → `minus`/`plus`, TimelinePaywall close, StreakBanner ✦. Keep chip `+`/`✓` text prefixes (reference-app pattern) and week-dot ✓ (decorative).
- [ ] **Step 3: rename** — favorites header "Saved words"→"Saved Quotes"; `account.tsx` 3 occurrences "saved words"→"saved quotes"; `stellaClaude.ts` 2 occurrences. Feed favorites-fab accessibilityLabel "Saved Quotes".
- [ ] **Step 4: full jest + typecheck; commit.**

### Task B2: 21-day commitment step

- [ ] **Step 1: variant content (both iam files), replacing the 3/7/21 options:**

```ts
{
  id: "streak",
  type: "streak-commit",
  headline: "Three small readings a day. That's the whole ask.",
  sub: "Read any 3 quotes or affirmations and the day counts. Miss a day, the chain breaks.",
  lines: [
    "Days 1–3 · Novelty carries you. Everyone survives this part.",
    "Days 4–14 · The dip. Motivation fades before results show — this is where most people quit.",
    "Days 15–21 · It stops being effort. The reading finds you, not the other way around.",
  ],
  info: "Most habit research puts the first real foothold around three weeks of daily reps.",
  cta: "I'm in for 21 days",
  modelKey: "raw.streak_goal",
},
```

(iamFounder keeps its own voice: headline "Show up for three words a day.", same beats reworded in founder voice.)
- [ ] **Step 2: `StreakCommitStep`** — drop `options`/`goal` state; render the three `lines` as staggered `FadeInRight`-delayed rows (dot + text), `info` as ink3 caption; CTA always enabled, `onAnswer("21")`.
- [ ] **Step 3: engine `types.ts`: add `info?: string` to `OnboardingStep` if absent; `variants.test.ts`: streak-commit steps assert `lines?.length === 3` + cta instead of options.**
- [ ] **Step 4: full jest (onboardingFlow smoke uses these variants — update fixtures if they tap an option) + typecheck; commit.**

### Task C1: Morph navigation + app icons

- [ ] **Step 1: `MorphOverlay.tsx`** — API: `openFrom(rect: {x,y,width,height}, screen: 'themes'|'favorites'|'profile')`; reanimated shared values animate an absolute-fill card: `left/top/width/height/borderRadius` from button rect (radius = rect.width/2) → full screen (radius 0 at top, safe-area aware), `withSpring({ damping: 26, stiffness: 300, mass: 1 })` (~420 ms settle, ≤2% overshoot — tuned to recording A); content `opacity 0→1` `withDelay(90, withTiming(1,{duration:160}))`; close reverses (content fades first). Backdrop dim 0→0.25.
- [ ] **Step 2: embeddable screens** — `ThemesScreen`, `FavoritesScreen`, `SettingsScreen` accept `{ embedded?: boolean; onClose?: () => void }`; header close uses `onClose ?? router.back`. Route files stay as default exports wrapping the shared component.
- [ ] **Step 3: `feed.tsx`** — fabs + avatar capture rects via `ref.measureInWindow`, open overlay instead of `router.push` (routes remain for deep links/notifications).
- [ ] **Step 4: `scripts/generate-app-icons.mjs`** (sharp devDep): for each `THEMES` entry compose `assets/images/android-icon-foreground.png` (already alpha) centered at 70% over a `1024×1024` solid `theme.bg`, flatten, write `assets/icons/icon-<themeId>.png`; run it; commit assets.
- [ ] **Step 5: `expo-alternate-app-icons` config plugin in `app.json`** listing every generated icon by themeId; `themes.tsx` gains "App icon" section: 4-col grid (image tiles, ring on active via `getAppIconName()`), tap → `setAlternateAppIcon(id)` with graceful no-op when unsupported (Expo Go/simulator).
- [ ] **Step 6: full jest + typecheck; `npx expo prebuild -p ios --no-install` must succeed with the new plugin (then delete ios/); commit.**

### Task C2: Widget customization

- [ ] **Step 1: `widgetPrefs.ts`** — zustand + AsyncStorage (`fs.widget.prefs.v1`):

```ts
export interface WidgetPrefs {
  home: { themeId: string; source: "daily" | "pinned"; showAuthor: boolean };
  lock: { source: "daily" | "pinned" };
}
export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  home: { themeId: "minimal_sand", source: "daily", showAuthor: true },
  lock: { source: "daily" },
};
```

`loadWidgetPrefs()/setWidgetPrefs(partial)` persisting + triggering `syncWidgets()`.
- [ ] **Step 2: failing tests `widgetPrefs.test.ts`** — defaults, persistence round-trip, partial update merges, `paletteForWidget("midnight_focus")` returns that theme's bg/ink (helper reading `THEMES`, fallback to sand palette when `palette` absent → derive `{bg, ink, ink2: ink @60%}` from `bg`/`ink`).
- [ ] **Step 3: `widgetSync.tsx`** — replace hardcoded `palette()` with `paletteForWidget(prefs.home.themeId)`; `home.source === "pinned"` → daily widget renders pinned line timeline of 1; `showAuthor` gates author row; lock-screen accessory variants source per `lock.source`.
- [ ] **Step 4: `settings/widgets.tsx` redesign** — header (back icon), segmented tabs **Home Screen Widget / Lock Screen Widget**: animated indicator (`withSpring` translateX), content switch via `FadeInRight/FadeOutLeft` (~220 ms); live preview card sized like systemMedium (and a lock-screen pill on the lock tab) re-rendering from prefs with a spring scale pulse (0.97→1) on each change; option rows: theme swatch strip (horizontal scroll of `THEMES` circles, ring on active), source selector rows, author `Switch`, existing pinned-line editor + save, "How to add the widget" card. All controls test-ID'd.
- [ ] **Step 5: full jest + typecheck; commit. Flag in PR notes: animation parity pass pending the Motivation widget recording.**

### Task D: Final verification (orchestrator)

- [ ] `npx tsc --noEmit` → 0 errors; `npx jest` → all green; `npx expo lint` → clean.
- [ ] `npx expo prebuild -p ios --no-install --clean` → inspect Info.plist: **no** `NSFaceIDUsageDescription`, alternate icons present; delete `ios/`.
- [ ] Update `LAUNCH_CHECKLIST.md` statuses (done/deferred per item) + append feedback-items section.
- [ ] Commit; summary report to user.

## Self-review
- Spec coverage: items 1(B2) 2(A3) 3(B1) 4(C1) 5(C2) 6(A3+A0) 7(spec §item 7, no task — intentional) 8(A2) 9(diagnosis in spec; hardening in A1 step 5) 10(C1) 11(B1); blockers 1–2(A1) 4(A2) 5(A1) 6(A0) 7-partial(A1 step 7) 8(non-code, checklist) ✓
- No placeholder steps; code shown for every core; types consistent (`clearOnboardingState`, `reconcileOnboardingState`, `pageLayout`, `subscriptionDisclosure`, `paletteForWidget` named identically throughout. ✓)
