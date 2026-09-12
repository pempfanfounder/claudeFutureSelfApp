import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppState } from "@/lib/appState";
import {
  getCompletedOnboardingVariant,
  markOnboardingComplete,
  useOnboardingStore,
} from "@/features/onboarding/engine/store";
import { reconcileOnboardingState } from "@/features/onboarding/engine/completeOnboarding";
import { getSupabase } from "@/lib/supabase";
jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(() => null),
  getIdentitySupabase: (...args: unknown[]) =>
    (require("@/lib/supabase").getSupabase as jest.Mock)(...args),
}));
jest.mock("@/features/notifications/push", () => ({
  registerDevice: jest.fn(),
}));
const mockedSupabase = getSupabase as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.getState().reset();
  useAppState.getState().setUserId(null);
  mockedSupabase.mockReturnValue(null);
});

test("switching users clears premium, name and onboarding before asynchronous work", () => {
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setPremium(true);
  useAppState.getState().setDisplayName("Synthetic A");
  useAppState.getState().setOnboardingComplete(true);
  useAppState.getState().setAnonymous(false);
  useAppState.getState().setUserId("fs-local-b");
  expect(useAppState.getState()).toMatchObject({
    isPremium: false,
    displayName: null,
    onboardingComplete: false,
    isAnonymous: true,
  });
});

test("same user token refresh preserves linked account state", () => {
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setAnonymous(false);
  useAppState.getState().setUserId("fs-local-a");
  expect(useAppState.getState().isAnonymous).toBe(false);
});

test("same user token refresh preserves account state", () => {
  useAppState.getState().setUserId("fs-local-a");
  useAppState.getState().setPremium(true);
  useAppState.getState().setUserId("fs-local-a");
  expect(useAppState.getState().isPremium).toBe(true);
});

test("offline completion belongs only to the same identity", async () => {
  useAppState.getState().setUserId("fs-local-a");
  await markOnboardingComplete("iam-claude");
  useAppState.getState().setUserId("fs-local-b");
  expect(await getCompletedOnboardingVariant()).toBeNull();
  useAppState.getState().setUserId("fs-local-a");
  expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
});

test("late server completion for A cannot complete B onboarding", async () => {
  let resolve!: (value: unknown) => void;
  const response = new Promise((r) => {
    resolve = r;
  });
  mockedSupabase.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => response }) }),
    }),
  });
  useAppState.getState().setUserId("fs-local-a");
  const pending = reconcileOnboardingState("fs-local-a");
  useAppState.getState().setUserId("fs-local-b");
  resolve({
    data: {
      variant: "iam-claude",
      onboarding_completed_at: "2026-09-08T00:00:00Z",
    },
    error: null,
  });
  await pending;
  expect(useAppState.getState().onboardingComplete).toBe(false);
  expect(await getCompletedOnboardingVariant()).toBeNull();
});
