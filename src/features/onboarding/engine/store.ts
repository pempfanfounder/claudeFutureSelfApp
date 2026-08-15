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

export const useOnboardingStore = create<OnboardingState>((set) => ({
  variant: null,
  stepIndex: 0,
  answers: {},
  name: null,
  notificationPrefs: {
    quotesPerDay: 3,
    affirmationsPerDay: 3,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 21 * 60,
  },
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
      permissionStatus: "undetermined",
    }),
}));

const COMPLETE_KEY = "fs.onboarding-complete.v1";

export async function markOnboardingComplete(variant: OnboardingVariant) {
  await AsyncStorage.setItem(COMPLETE_KEY, variant);
}

export async function getCompletedOnboardingVariant(): Promise<string | null> {
  return AsyncStorage.getItem(COMPLETE_KEY);
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

/**
 * Removes per-user local caches that must not survive account
 * deletion — currently the pinned widget line.
 */
export async function clearLocalUserData(): Promise<void> {
  await AsyncStorage.removeItem(PINNED_WIDGET_KEY);
}
