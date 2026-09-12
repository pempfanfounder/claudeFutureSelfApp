import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { serializedStorage as stored } from "@/lib/accountStorage";

import type { OnboardingVariant } from "@/lib/experiments";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";

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

// v1 global keys have no provable owner. Preserve them without adopting their
// contents for a different account. Server reconciliation recovers known users.
const owner = () => useAppState.getState().userId;
const key = (kind: string, userId: string | null) =>
  `fs.onboarding.${kind}.v2.${userId ?? "unassigned"}`;

function persistFor<T>(
  userId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  const identity = captureIdentity();
  if (identity.userId !== userId)
    return Promise.reject(new Error("Account changed. Please retry."));
  return stored(async () => {
    if (!isCurrentIdentity(identity))
      throw new Error("Account changed. Please retry.");
    return work();
  });
}

export async function markOnboardingComplete(
  variant: OnboardingVariant,
  userId = owner(),
) {
  await persistFor(userId, () =>
    AsyncStorage.setItem(key("complete", userId), variant),
  );
}
export async function getCompletedOnboardingVariant(
  userId = owner(),
): Promise<string | null> {
  return stored(() => AsyncStorage.getItem(key("complete", userId)));
}

export interface OnboardingPayload {
  personalization: Record<string, unknown>;
  name: string | null;
  notificationPrefs: OnboardingState["notificationPrefs"];
  trialReminder: boolean;
}
export interface PendingServerSync {
  userId: string | null;
  variant: OnboardingVariant;
  revision: string;
  payload?: OnboardingPayload;
}
export async function setPendingServerSync(
  userId: string | null,
  variant: OnboardingVariant,
  payload?: OnboardingPayload,
): Promise<PendingServerSync> {
  const pending = {
    userId,
    variant,
    payload,
    revision: `${Date.now()}:${++pendingSequence}`,
  };
  await persistFor(userId, () =>
    AsyncStorage.setItem(key("pending", userId), JSON.stringify(pending)),
  );
  return pending;
}
let pendingSequence = 0;
export async function getPendingServerSync(
  userId = owner(),
): Promise<PendingServerSync | null> {
  const raw = await stored(() => AsyncStorage.getItem(key("pending", userId)));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingServerSync;
    if (
      parsed.userId !== userId ||
      typeof parsed.revision !== "string" ||
      typeof parsed.variant !== "string"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}
export async function clearPendingServerSync(
  userId = owner(),
  revision?: string,
): Promise<void> {
  await stored(async () => {
    if (revision) {
      const raw = await AsyncStorage.getItem(key("pending", userId));
      if (!raw || (JSON.parse(raw) as PendingServerSync).revision !== revision)
        return;
    }
    await AsyncStorage.removeItem(key("pending", userId));
  });
}
export async function clearOnboardingState(userId = owner()): Promise<void> {
  await stored(() => AsyncStorage.removeItem(key("complete", userId)));
  await clearPendingServerSync(userId);
  if (owner() === userId) useOnboardingStore.getState().reset();
}
export async function devClearOnboarding() {
  if (!__DEV__) return;
  await clearOnboardingState();
}

/** Delete only the identified account's local caches. Ambiguous legacy data
 * stays preserved until its owner can be established. */
export async function clearLocalUserData(userId = owner()): Promise<void> {
  if (!userId) return;
  await stored(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const suffix = `.${userId}`;
    const prefixes = [
      `fs.viewed.${userId}.`,
      `fs.daily.${userId}.`,
      `fs.feed.${userId}.`,
    ];
    await AsyncStorage.multiRemove(
      keys.filter(
        (k) =>
          (k.startsWith("fs.") && k.endsWith(suffix)) ||
          prefixes.some((prefix) => k.startsWith(prefix)),
      ),
    );
  });
}

export async function hasLegacyDeviceProgress(): Promise<boolean> {
  const keys = await AsyncStorage.getAllKeys();
  return [
    "fs.onboarding-complete.v1",
    "fs.onboarding-pending-sync.v1",
    "fs.widget.pinned.v1",
    "fs.widget.prefs.v1",
  ].some((key) => keys.includes(key));
}
