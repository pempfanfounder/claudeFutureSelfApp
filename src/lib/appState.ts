import { create } from "zustand";

import type { OnboardingVariant } from "./experiments";

/**
 * Boot-time app gate state. `index.tsx` routes on these three flags:
 * onboarding incomplete -> /onboarding
 * complete but not premium -> /paywall (hard gate)
 * complete and premium -> /(main)
 */
interface AppState {
  booted: boolean;
  onboardingComplete: boolean;
  isPremium: boolean;
  variant: OnboardingVariant | null;
  userId: string | null;
  isAnonymous: boolean;
  identityGeneration: number;
  identityReady: boolean;
  identityError: string | null;
  displayName: string | null;
  setBooted: (booted: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setPremium: (premium: boolean) => void;
  setVariant: (variant: OnboardingVariant | null) => void;
  setUserId: (userId: string | null) => void;
  setAnonymous: (anonymous: boolean) => void;
  setDisplayName: (name: string | null) => void;
}

export const useAppState = create<AppState>((set) => ({
  booted: false,
  onboardingComplete: false,
  isPremium: false,
  variant: null,
  userId: null,
  isAnonymous: true,
  identityGeneration: 0,
  identityReady: false,
  identityError: null,
  displayName: null,
  setBooted: (booted) => set({ booted }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  setPremium: (isPremium) => set({ isPremium }),
  setVariant: (variant) => set({ variant }),
  setUserId: (userId) =>
    set((state) =>
      state.userId === userId
        ? state
        : {
            userId,
            identityGeneration: state.identityGeneration + 1,
            identityReady: false,
            identityError: null,
            isPremium: false,
            onboardingComplete: false,
            displayName: null,
            isAnonymous: true,
          },
    ),
  setAnonymous: (isAnonymous) => set({ isAnonymous }),
  setDisplayName: (displayName) => set({ displayName }),
}));

export type Identity = { userId: string | null; generation: number };
export function captureIdentity(): Identity {
  const state = useAppState.getState();
  return { userId: state.userId, generation: state.identityGeneration };
}
export function isCurrentIdentity(identity: Identity): boolean {
  const state = useAppState.getState();
  return (
    state.userId === identity.userId &&
    state.identityGeneration === identity.generation
  );
}
export function assertCurrentIdentity(identity: Identity): void {
  if (!identity.userId || !isCurrentIdentity(identity))
    throw new Error("Account changed. Please try again.");
}

export async function withDeadline<T>(
  promise: PromiseLike<T>,
  ms = 12_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("This is taking longer than expected. Please retry."),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
