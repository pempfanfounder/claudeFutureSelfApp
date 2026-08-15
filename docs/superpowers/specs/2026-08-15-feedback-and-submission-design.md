# Feedback Round 1 + Submission Readiness — Design

Date: 2026-08-15 · Branch: `claude/app-store-launch-audit-787b06`
Inputs: LAUNCH_CHECKLIST.md audit, 11 user feedback items, 3 reference recordings.

## Reference recordings (analyzed frame-by-frame)

**A — `18-44-29` (8.6s, 120fps), Motivation app, dark feed.** Navigation reference for item 10.
Signature move: **container-transform morph**. Tapping a floating control (Profile person-icon bottom-right, Explore grid-icon bottom-left) expands the destination screen *out of the button*: a rounded card grows from the button's rect to full screen with a circular mask around the origin button visible mid-flight, spring easing (fast start, soft settle, ~350–450 ms), content fades in slightly after the container leads. Close (✕) reverses the same morph back into the button. The premium crown opens a bottom-sheet card with spring. Buttons: proper UI icons (grid, brush, person, share-sheet glyph, heart) — no emoji.

**B — `15-52-14` (4.8s), Motivation app, Profile → App icon.** Reference for item 4.
Profile "Customize the app" grid (Topics/Wallpapers/Reminders/Home Screen widgets/Lock Screen widgets/App icon/Alarm/Watch). Tapping **App icon** pushes (standard iOS push) an "App icon" screen: **4-column grid of ~24 icon tiles** — brand glyph on black/white/gradient/photo backgrounds plus text-based icons ("Do not quit", wordmark). Selected tile has a ring. Locked tiles open the premium sheet.

**C — `17-33-04` (106s), the user's own Future Self test build** (red "PAYWALL BYPASSED — internal test build" banner; that banner is **not in this repo** — external local patch, must never ship).
Complete `iam-claude` onboarding walkthrough: name→age→motivation→areas→obstacles→traits→life goal ("show up")→notification steppers (Quotes 3×/Affirmations 3×, window 9:00–21:00)→**3/7/21 streak-commit (item 1 target)**→voices→hear-more-often→theme picker→result→attribution→pre-paywall info→TimelinePaywall (dev-mock, trial timeline, reminder toggle)→taps Privacy → **Safari opens raw `…supabase.co/functions/v1/legal/…`**→main feed. Feed: serif quote centered, top bar (fs avatar · Quotes/Affirmations pills · 0/3 chip), bottom-left ♡ fab, bottom-right ◐ fab, on-card **↗ share glyph** (item 3 target).
Item 5's Motivation *widget-customization* recording is **not among the three files** — functionality proceeds from the written requirements + Motivation design language; a polish pass will match the recording once provided.

## Diagnoses (verified, not inferred)

**Item 2 — quote drift.** `feed.tsx` uses `pagingEnabled` (snap unit = FlatList's own layout height `V`) but sizes every page with `useWindowDimensions().height` (`H`) in both `ContentCard` and `getItemLayout`. After paging to index *i*, the visible offset error is `i × (H − V)`. Any chrome that shrinks the list (the test build's banner; any future inset) makes every quote sit progressively lower. Fix: measure the list with `onLayout` and use that height for pages, `getItemLayout`, and the end card. No hardcoding.

**Item 8 — onboarding/paywall bypass after deletion.** Two independent causes, both confirmed in code:
1. `AuthProvider.deleteAccount()` never clears the persisted `fs.onboarding-complete.v1` AsyncStorage key (`markOnboardingComplete` in `store.ts`); `account.tsx` only flips the in-memory flag. On relaunch `_layout.tsx` re-reads the stale key → gate skips onboarding.
2. `deleteAccount()` never calls `logOutPurchases()` (unlike `signOut()`), so RevenueCat keeps the deleted user's identity/entitlement → `getIsPremium()` stays true → gate skips the paywall. Reproduces in production builds too.
Also: switching to an existing account never reconciles the local flag with server state (either direction).

**Item 9 — notifications.** Live DB inspection (2026-08-15 14:49 UTC): all 4 `fs-*` cron jobs active and succeeding; Vault has `project_url` + `dispatch_secret`; `devices` has an active row **with a real push token**; `pgmq` queue empty; `notification_deliveries` empty; **`entitlements` has 0 rows** → the premium gate in `enqueue_due_notifications` (migration line 488) sets `next_due_at = NULL` for every user. **The pipeline works; no user has ever been eligible.** The bypass build mocks premium client-side only. Verification path: create a real (sandbox) purchase, or insert a dev entitlement row + `recalc_notification_state(uuid)`. Hardening: client should invoke the existing `sync-entitlement` edge function after purchase/restore so server entitlement doesn't depend solely on the webhook.

**Item 7 — quote architecture (explanation only; no separation implemented).**
- *Selection:* client-side `selectDailySet` — deterministic weighted sample, seed `userId:localDate:type`, personalization-weighted, excludes yesterday's ids, `DAILY_LIMIT` per type/day.
- *State:* first device to generate inserts `daily_sets` (user_id, local_date, type, content_ids) in Supabase — the day's source of truth (insert-if-absent, race-safe re-read). Content library cached locally 12 h.
- *Widget vs app:* **same source.** `syncWidgets()` reads the feed store's sets, interleaves quotes+affirmations, schedules an iOS WidgetKit timeline (07:00–22:00 slots) / Android current-item; refreshed on app foreground. The `future_self` widget is separate (pinned line → AsyncStorage `fs.widget.pinned.v1`, fallback life goal).
- *Notifications:* **already independent** — server cron picks content via `pick_notification_content` SQL (personalization-weighted, recent-delivery exclusion), never reads `daily_sets`. Deep links resolve via library, falling back to per-delivery snapshots.
So separating widget-quotes from in-app-quotes would be a small, contained change (a second seed/source in `syncWidgets`), not an architectural one — awaiting the user's decision.

## Design decisions

**Item 1 — replace 3/7/21 with a 21-day commitment (iamFounder + iamClaude only; stella variants have no such step).** Keep the Day-1 numeral + week-dot card. Replace the three options with three short education beats (rendered as a staged list): days 1–3 novelty, days 4–14 the dip where most people quit, days 15–21 it starts to hold — honest framing ("most habit research puts the first real foothold around three weeks"), no fake precision. Single CTA "I'm in for 21 days" storing `raw.streak_goal = "21"`. Engine: `streak-commit` steps use existing `lines?` field for beats; `options` becomes unnecessary for this type (update variants test accordingly).

**Item 2 fix.** `onLayout`-measured page height drives `ContentCard height` prop, `getItemLayout`, `EndCard`; render list only after first measure.

**Items 3+11.** New `Icon` design-system component: SF Symbols via `expo-symbols` on iOS, Ionicons (`@expo/vector-icons`) fallback elsewhere; semantic names (share, heart, heartFill, close, back, chevronRight, settings, palette, sparkle, plus, minus, grid, person, widget, bell). Replace standalone glyph buttons app-wide (↗ ♡ ♥ ✕ ‹ › ◐ − +). Chip prefixes (+/✓) stay — the Motivation reference uses exactly that pattern. Rename all user-facing "Saved words" → "Saved Quotes" (favorites header, account strings, stellaClaude copy).

**Item 6.** Raise caps 3→20: DB check constraints (`quotes_per_day`, `affirmations_per_day` 0..20), onboarding + settings steppers max 20, `DAILY_LIMIT` 10→20 so the feed scrolls 20/type/day. `STREAK_TARGET` stays 3; end-card copy stops hardcoding "ten". Server enqueue/spacing logic is already count-generic.

**Item 8 fix.** `clearOnboardingState()` (removes key + resets stores); called on delete **and** sign-out ("fresh start" copy already promises this). `deleteAccount` additionally `logOutPurchases()` and clears pinned-line + per-user local caches. New `reconcileOnboardingState(userId)`: fetch `personalization` row existence; on success, server wins (set or clear local flag + variant); on network failure keep local (offline grace). Called from the auth-state listener on user change and after switch-sign-in.

**Item 10.** In-app container-transform morph (`MorphOverlay`): tap captures the button rect (`measureInWindow`), an overlay card springs from that rect (borderRadius from half-size → screen radius, content fade-in ~100 ms delayed), reverse on close; screens (Themes, Saved Quotes, Profile/Settings hub) become embeddable (`onClose` prop) and remain routable for deep links. Spring tuned to the 120 fps reference (≈400 ms settle, no bounce overshoot beyond ~2%).

**Item 4.** `expo-alternate-app-icons` plugin; generate one icon per theme (theme `bg` + existing foreground glyph, composed by a `sharp` script committed to `scripts/`) plus the default. Themes screen gains an "App icon" 4-column grid with selection ring, per recording B.

**Item 5.** Local-first `widgetPrefs` store: `{ home: { themeId, source: 'daily'|'pinned', showAuthor }, lock: { source } }`; `widgetSync` derives widget palette from the chosen theme (replacing the hardcoded sand palette) and content source per family. `settings/widgets.tsx` becomes a tabbed **Home Screen Widget / Lock Screen Widget** screen: animated tab indicator, live widget preview (crossfade + spring on changes), theme swatch row, source selector, author toggle, pinned-line editor, add-widget instructions. Exact animation parity deferred to the missing reference recording (flagged to user).

**Checklist blockers executed in code:** subscription disclosure block on both paywalls + CTA "Start 3-day free trial" (length read from store data, falls back to "free trial"); paywall footer gains "Privacy choices" → sheet with delete-my-data (wired to `deleteAccount`) + support contact; email sign-in gated behind `EXPO_PUBLIC_EMAIL_AUTH_ENABLED`; `expo-secure-store` removed; RevenueCat log level DEBUG only in `__DEV__`; client calls `sync-entitlement` after purchase/restore; legal pages get clearly-marked owner-identity placeholders (deploy blocked until real KVK/BTW/address supplied); migration fixes the four over-exposed SECURITY DEFINER functions (`from public, anon, authenticated` pattern), pins `search_path` on `set_updated_at`/`compute_next_due`, and applies the 0..20 caps.

## Out of scope (explicitly)

Item 7 implementation (user decides after reading the explanation); non-code checklist items (D-U-N-S, DSA trader declaration, SMTP credentials, ASC metadata); deploying legal placeholders.
