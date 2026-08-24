import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAppState } from "@/lib/appState";
import { getSupabase } from "@/lib/supabase";

import {
  completeOnboarding,
  reconcileOnboardingState,
} from "@/features/onboarding/engine/completeOnboarding";
import {
  clearLocalUserData,
  clearOnboardingState,
  getCompletedOnboardingVariant,
  getPendingServerSync,
  markOnboardingComplete,
  setPendingServerSync,
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

type RetryOutcome = { error: { message: string } | null };

/**
 * Stubs getSupabase() with the minimal chainable query surface used by
 * reconcileOnboardingState:
 * from("personalization").select("variant").eq("user_id", id).maybeSingle()
 * plus the pending-sync retry path: from("personalization").upsert(row)
 */
function mockPersonalizationQuery(
  outcome: QueryOutcome,
  retryOutcome: RetryOutcome = { error: null },
) {
  const maybeSingle =
    outcome instanceof Error
      ? jest.fn().mockRejectedValue(outcome)
      : jest.fn().mockResolvedValue(outcome);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const upsert = jest.fn().mockResolvedValue(retryOutcome);
  const from = jest.fn(() => ({ select, upsert }));
  getSupabaseMock.mockReturnValue({ from });
  return { from, select, eq, maybeSingle, upsert };
}

const mockPersonalizationRow = (
  row: PersonalizationRow,
  retryOutcome?: RetryOutcome,
) => mockPersonalizationQuery({ data: row, error: null }, retryOutcome);

const mockPersonalizationError = (error: Error) =>
  mockPersonalizationQuery(error);

/**
 * Stubs getSupabase() with the surface completeOnboarding touches:
 * auth.getSession(), personalization + notification_prefs upserts,
 * profiles update and rpc(). Everything succeeds unless overridden.
 */
function mockCompletionSupabase(
  opts: {
    sessionUserId?: string | null;
    personalizationError?: { message: string } | null;
  } = {},
) {
  const { sessionUserId = "user-1", personalizationError = null } = opts;
  const personalizationUpsert = jest
    .fn()
    .mockResolvedValue({ error: personalizationError });
  const prefsUpsert = jest.fn().mockResolvedValue({ error: null });
  const profilesEq = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === "personalization") return { upsert: personalizationUpsert };
    if (table === "profiles") {
      return { update: jest.fn(() => ({ eq: profilesEq })) };
    }
    return { upsert: prefsUpsert };
  });
  getSupabaseMock.mockReturnValue({
    from,
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: sessionUserId ? { user: { id: sessionUserId } } : null,
        },
      }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  });
  return { from, personalizationUpsert };
}

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

  it("restores notification prefs to their defaults", async () => {
    useOnboardingStore.getState().setNotificationPrefs({ quotesPerDay: 17 });
    await clearOnboardingState();
    expect(useOnboardingStore.getState().notificationPrefs).toEqual({
      quotesPerDay: 3,
      affirmationsPerDay: 3,
      windowStartMinutes: 540,
      windowEndMinutes: 1260,
      // Matches the notification_prefs.trial_reminder column default.
      trialReminder: true,
    });
  });

  it("drops any pending server-sync marker with the completion flag", async () => {
    await setPendingServerSync("user-1", "iam-claude");
    await clearOnboardingState();
    expect(await getPendingServerSync()).toBeNull();
  });
});

describe("clearLocalUserData", () => {
  it("removes the pinned-widget line", async () => {
    await AsyncStorage.setItem("fs.widget.pinned.v1", "I show up.");
    await clearLocalUserData();
    expect(await AsyncStorage.getItem("fs.widget.pinned.v1")).toBeNull();
  });

  it("removes the widget prefs", async () => {
    await AsyncStorage.setItem(
      "fs.widget.prefs.v1",
      JSON.stringify({ home: { themeId: "arctic" } }),
    );
    await clearLocalUserData();
    expect(await AsyncStorage.getItem("fs.widget.prefs.v1")).toBeNull();
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

describe("pending server sync (completion that never reached the server)", () => {
  it("sets a marker on upsert failure; reconcile re-upserts instead of clearing", async () => {
    // A paying user finishes onboarding, but the personalization
    // upsert fails (server hiccup). The local flag flips anyway...
    mockCompletionSupabase({ personalizationError: { message: "boom" } });
    await completeOnboarding("iam-claude");
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
    expect(await getPendingServerSync()).toEqual({
      userId: "user-1",
      variant: "iam-claude",
    });

    // ...and the next boot's reconcile sees "no server row". The
    // pending marker must trigger a retry, not bounce the user back
    // into onboarding.
    const { upsert } = mockPersonalizationRow(null);
    const complete = await reconcileOnboardingState("user-1");
    expect(complete).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", variant: "iam-claude" }),
    );
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
    expect(useAppState.getState().onboardingComplete).toBe(true);
    expect(await getPendingServerSync()).toBeNull();
  });

  it("marks a wildcard pending sync when completing without a session", async () => {
    mockCompletionSupabase({ sessionUserId: null });
    await completeOnboarding("stella-claude");
    expect(await getPendingServerSync()).toEqual({
      userId: null,
      variant: "stella-claude",
    });

    // The wildcard marker matches whichever user reconciles next.
    const { upsert } = mockPersonalizationRow(null);
    await expect(reconcileOnboardingState("user-9")).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-9", variant: "stella-claude" }),
    );
    expect(await getPendingServerSync()).toBeNull();
  });

  it("keeps the local flag and marker when the retry upsert also fails", async () => {
    await markOnboardingComplete("iam-claude");
    await setPendingServerSync("user-1", "iam-claude");
    const { upsert } = mockPersonalizationRow(null, {
      error: { message: "still down" },
    });
    const complete = await reconcileOnboardingState("user-1");
    expect(complete).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
    expect(await getPendingServerSync()).not.toBeNull();
  });

  it("does not let another user's marker block clearing", async () => {
    await markOnboardingComplete("iam-claude");
    await setPendingServerSync("user-A", "iam-claude");
    const { upsert } = mockPersonalizationRow(null);
    const complete = await reconcileOnboardingState("user-B");
    expect(complete).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
    expect(await getCompletedOnboardingVariant()).toBeNull();
  });

  it("clears the marker when completeOnboarding succeeds", async () => {
    await setPendingServerSync(null, "iam-claude");
    mockCompletionSupabase();
    await completeOnboarding("iam-claude");
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
    expect(await getPendingServerSync()).toBeNull();
  });
});
