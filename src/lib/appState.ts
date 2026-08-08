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
  displayName: string | null;
  setBooted: (booted: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setPremium: (premium: boolean) => void;
  setVariant: (variant: OnboardingVariant | null) => void;
  setUserId: (userId: string | null) => void;
  setDisplayName: (name: string | null) => void;
}

export const useAppState = create<AppState>((set) => ({
  booted: false,
  onboardingComplete: false,
  isPremium: false,
  variant: null,
  userId: null,
  displayName: null,
  setBooted: (booted) => set({ booted }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  setPremium: (isPremium) => set({ isPremium }),
  setVariant: (variant) => set({ variant }),
  setUserId: (userId) => set({ userId }),
  setDisplayName: (displayName) => set({ displayName }),
}));
