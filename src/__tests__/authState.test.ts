import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAppState } from "@/lib/appState";
import { getSupabase } from "@/lib/supabase";

import { reconcileOnboardingState } from "@/features/onboarding/engine/completeOnboarding";
import {
  clearLocalUserData,
  clearOnboardingState,
  getCompletedOnboardingVariant,
  markOnboardingComplete,
  useOnboardingStore,
} from "@/features/onboarding/engine/store";

jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(() => null),
}));

// completeOnboarding imports push registration (expo-notifications);
// none of the code under test needs it.
jest.mock("@/features/notifications/push", () => ({
  registerDevice: jest.fn(),
  deactivateDevice: jest.fn(),
}));

const getSupabaseMock = getSupabase as unknown as jest.Mock;

type PersonalizationRow = { variant: string | null } | null;
type QueryOutcome =
  { data: PersonalizationRow; error: { message: string } | null } | Error;

/**
 * Stubs getSupabase() with the minimal chainable query surface used by
 * reconcileOnboardingState:
 * from("personalization").select("variant").eq("user_id", id).maybeSingle()
 */
function mockPersonalizationQuery(outcome: QueryOutcome) {
  const maybeSingle =
    outcome instanceof Error
      ? jest.fn().mockRejectedValue(outcome)
      : jest.fn().mockResolvedValue(outcome);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from });
  return { from, select, eq, maybeSingle };
}

const mockPersonalizationRow = (row: PersonalizationRow) =>
  mockPersonalizationQuery({ data: row, error: null });

const mockPersonalizationError = (error: Error) =>
  mockPersonalizationQuery(error);

beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.getState().reset();
  useAppState.getState().setOnboardingComplete(false);
  getSupabaseMock.mockReset();
  getSupabaseMock.mockReturnValue(null);
});

describe("clearOnboardingState", () => {
  it("removes the persisted completion flag", async () => {
    await markOnboardingComplete("iam-claude");
    await clearOnboardingState();
    expect(await getCompletedOnboardingVariant()).toBeNull();
  });

  it("resets in-memory funnel progress", async () => {
    useOnboardingStore.getState().setVariant("iam-claude");
    useOnboardingStore.getState().setStepIndex(4);
    await clearOnboardingState();
    expect(useOnboardingStore.getState().variant).toBeNull();
    expect(useOnboardingStore.getState().stepIndex).toBe(0);
  });
});

describe("clearLocalUserData", () => {
  it("removes the pinned-widget line", async () => {
    await AsyncStorage.setItem("fs.widget.pinned.v1", "I show up.");
    await clearLocalUserData();
    expect(await AsyncStorage.getItem("fs.widget.pinned.v1")).toBeNull();
  });
});

describe("reconcileOnboardingState", () => {
  it("clears the local flag when server has no personalization row", async () => {
    await markOnboardingComplete("iam-claude");
    useAppState.getState().setOnboardingComplete(true);
    mockPersonalizationRow(null); // maybeSingle -> { data: null, error: null }
    const complete = await reconcileOnboardingState("user-1");
    expect(complete).toBe(false);
    expect(await getCompletedOnboardingVariant()).toBeNull();
    expect(useAppState.getState().onboardingComplete).toBe(false);
  });

  it("adopts server completion on account switch", async () => {
    mockPersonalizationRow({ variant: "stella-claude" });
    const complete = await reconcileOnboardingState("user-2");
    expect(complete).toBe(true);
    expect(await getCompletedOnboardingVariant()).toBe("stella-claude");
    expect(useAppState.getState().onboardingComplete).toBe(true);
  });

  it("keeps local state on network failure", async () => {
    await markOnboardingComplete("iam-claude");
    mockPersonalizationError(new Error("offline"));
    const complete = await reconcileOnboardingState("user-1");
    expect(complete).toBe(true);
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
  });

  it("keeps local state when the query returns a PostgrestError", async () => {
    await markOnboardingComplete("iam-claude");
    mockPersonalizationQuery({ data: null, error: { message: "JWT expired" } });
    const complete = await reconcileOnboardingState("user-1");
    expect(complete).toBe(true);
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
  });

  it("returns the current local flag when Supabase is not configured", async () => {
    await markOnboardingComplete("iam-claude");
    getSupabaseMock.mockReturnValue(null);
    await expect(reconcileOnboardingState("user-1")).resolves.toBe(true);
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
  });

  it("falls back to iam-claude when the server row has a null variant", async () => {
    mockPersonalizationRow({ variant: null });
    const complete = await reconcileOnboardingState("user-3");
    expect(complete).toBe(true);
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
  });

  it("does not reset the funnel store on fresh installs with nothing to clear", async () => {
    // A brand-new anonymous user reconciles while the funnel may
    // already be in progress; without a stale completion flag the
    // in-memory funnel state must survive.
    useOnboardingStore.getState().setVariant("iam-founder");
    useOnboardingStore.getState().setStepIndex(2);
    mockPersonalizationRow(null);
    const complete = await reconcileOnboardingState("user-4");
    expect(complete).toBe(false);
    expect(useOnboardingStore.getState().variant).toBe("iam-founder");
    expect(useOnboardingStore.getState().stepIndex).toBe(2);
  });
});
