import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { OnboardingVariant } from "@/lib/experiments";

/**
 * Onboarding progress + collected answers. Answers are held locally
 * during the flow and written to Supabase (personalization) once, at
 * completion, so a half-finished funnel never leaves partial rows.
 */
interface OnboardingState {
  variant: OnboardingVariant | null;
  stepIndex: number;
  answers: Record<string, string | string[]>;
  name: string | null;
  notificationPrefs: {
    quotesPerDay: number;
    affirmationsPerDay: number;
    windowStartMinutes: number;
    windowEndMinutes: number;
  };
  permissionStatus: "undetermined" | "granted" | "denied";
  setVariant: (variant: OnboardingVariant) => void;
  setStepIndex: (index: number) => void;
  setAnswer: (key: string, value: string | string[]) => void;
  setName: (name: string) => void;
  setNotificationPrefs: (
    prefs: Partial<OnboardingState["notificationPrefs"]>,
  ) => void;
  setPermissionStatus: (status: OnboardingState["permissionStatus"]) => void;
  reset: () => void;
}

const DEFAULT_NOTIFICATION_PREFS: OnboardingState["notificationPrefs"] = {
  quotesPerDay: 3,
  affirmationsPerDay: 3,
  windowStartMinutes: 9 * 60,
  windowEndMinutes: 21 * 60,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  variant: null,
  stepIndex: 0,
  answers: {},
  name: null,
  notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
  permissionStatus: "undetermined",
  setVariant: (variant) => set({ variant }),
  setStepIndex: (stepIndex) => set({ stepIndex }),
  setAnswer: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),
  setName: (name) => set({ name }),
  setNotificationPrefs: (prefs) =>
    set((s) => ({ notificationPrefs: { ...s.notificationPrefs, ...prefs } })),
  setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
  reset: () =>
    set({
      variant: null,
      stepIndex: 0,
      answers: {},
      name: null,
      // The next user's funnel must not inherit the previous user's
      // notification counts/window.
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
      permissionStatus: "undetermined",
    }),
}));

const COMPLETE_KEY = "fs.onboarding-complete.v1";
const PENDING_SYNC_KEY = "fs.onboarding-pending-sync.v1";

export async function markOnboardingComplete(variant: OnboardingVariant) {
  await AsyncStorage.setItem(COMPLETE_KEY, variant);
}

export async function getCompletedOnboardingVariant(): Promise<string | null> {
  return AsyncStorage.getItem(COMPLETE_KEY);
}

/**
 * A completion whose `personalization` upsert never reached the server
 * (write failed, or there was no session at that moment). While this
 * marker exists, reconciliation must retry the write instead of
 * treating "no server row" as "never finished onboarding".
 */
export interface PendingServerSync {
  /** Null when completion happened without a session: matches any user. */
  userId: string | null;
  variant: OnboardingVariant;
}

export async function setPendingServerSync(
  userId: string | null,
  variant: OnboardingVariant,
): Promise<void> {
  await AsyncStorage.setItem(
    PENDING_SYNC_KEY,
    JSON.stringify({ userId, variant }),
  );
}

export async function getPendingServerSync(): Promise<PendingServerSync | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingServerSync> | null;
    if (!parsed || typeof parsed.variant !== "string") return null;
    return {
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      variant: parsed.variant,
    };
  } catch {
    // A corrupt marker must never wedge reconciliation.
    return null;
  }
}

export async function clearPendingServerSync(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SYNC_KEY);
}

/**
 * Forgets that onboarding ever finished on this device: removes the
 * persisted completion flag and resets the in-memory funnel state.
 * Runs on sign-out and account deletion (the sign-out copy promises
 * "this device returns to a fresh start"), so it must NOT be
 * `__DEV__`-gated.
 */
export async function clearOnboardingState(): Promise<void> {
  await AsyncStorage.removeItem(COMPLETE_KEY);
  // The pending-sync marker is a shadow of the completion flag: left
  // behind, a wildcard marker would let the NEXT (fresh) user's
  // reconcile adopt this user's completion.
  await clearPendingServerSync();
  useOnboardingStore.getState().reset();
}

export async function devClearOnboarding() {
  if (!__DEV__) return;
  await clearOnboardingState();
}

// Owned by src/features/widgets/pinned.ts; the string is duplicated
// here (rather than imported) to keep account teardown free of widget
// module side effects.
const PINNED_WIDGET_KEY = "fs.widget.pinned.v1";
// Owned by src/features/widgets/widgetPrefs.ts; duplicated for the
// same reason as the pinned key above.
const WIDGET_PREFS_KEY = "fs.widget.prefs.v1";

/**
 * Removes per-user local caches that must not survive sign-out or
 * account deletion — currently the pinned widget line and the widget
 * appearance/content prefs.
 */
export async function clearLocalUserData(): Promise<void> {
  await AsyncStorage.multiRemove([PINNED_WIDGET_KEY, WIDGET_PREFS_KEY]);
}
