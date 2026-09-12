import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppState } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
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
  clearPendingServerSync,
  useOnboardingStore,
} from "@/features/onboarding/engine/store";
import { registerDevice } from "@/features/notifications/push";
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("@/lib/supabase", () => ({
  getIdentitySupabase: jest.fn(async () => null),
}));
jest.mock("@/features/notifications/push", () => ({
  registerDevice: jest.fn(async () => {}),
  deactivateDevice: jest.fn(),
}));
const clientMock = getIdentitySupabase as jest.Mock;
beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.getState().reset();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  clientMock.mockReset();
  clientMock.mockResolvedValue(null);
  (registerDevice as jest.Mock).mockReset();
  (registerDevice as jest.Mock).mockResolvedValue(undefined);
});
function service(failedStage?: string) {
  const writes: Record<string, unknown[]> = {};
  const write = (table: string, row: unknown) => {
    (writes[table] ??= []).push(row);
    return Promise.resolve({
      error: table === failedStage ? new Error("Synthetic offline") : null,
    });
  };
  const from = jest.fn((table: string) => ({
    upsert: (row: unknown) => write(table, row),
    update: (row: unknown) => ({ eq: () => write(table, row) }),
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            variant: "iam-claude",
            onboarding_completed_at: "2026-09-08T00:00:00Z",
          },
          error: null,
        }),
      }),
    }),
  }));
  clientMock.mockResolvedValue({
    from,
    rpc: async (name: string, args: any) => {
      if (name === "save_notification_prefs") {
        await write("notification_prefs", args.p_changes);
        return {
          data: {
            applied: true,
            prefs: {
              user_id: "fs-local-a",
              trial_reminder: args.p_changes.trial_reminder,
            },
          },
          error:
            failedStage === "notification_prefs"
              ? new Error("Synthetic offline")
              : null,
        };
      }
      return write("recalc", {});
    },
  });
  return writes;
}
test("clear completion resets only the identified account", async () => {
  await markOnboardingComplete("iam-claude");
  useOnboardingStore.getState().setStepIndex(4);
  await clearOnboardingState();
  expect(await getCompletedOnboardingVariant()).toBeNull();
  expect(useOnboardingStore.getState().stepIndex).toBe(0);
});
test("legacy unowned widget bytes are preserved, identified account bytes are removed", async () => {
  await AsyncStorage.multiSet([
    ["fs.widget.pinned.v1", "Legacy private text"],
    ["fs.widget.pinned.v2.fs-local-a", "A text"],
    ["fs.widget.pinned.v2.fs-local-b", "B text"],
  ]);
  await clearLocalUserData();
  expect(await AsyncStorage.getItem("fs.widget.pinned.v1")).toBe(
    "Legacy private text",
  );
  expect(
    await AsyncStorage.getItem("fs.widget.pinned.v2.fs-local-a"),
  ).toBeNull();
  expect(await AsyncStorage.getItem("fs.widget.pinned.v2.fs-local-b")).toBe(
    "B text",
  );
});
test.each(["personalization", "profiles", "notification_prefs", "recalc"])(
  "failure at %s retains the complete durable payload for restart",
  async (stage) => {
    service(stage);
    useOnboardingStore.getState().setName("Synthetic name");
    useOnboardingStore
      .getState()
      .setAnswer("life_goal", " Original authored text ");
    useOnboardingStore.getState().setAnswer("raw.trial_reminder", "no");
    await completeOnboarding("iam-claude");
    await new Promise((resolve) => setImmediate(resolve));
    const pending = await getPendingServerSync();
    expect(pending?.payload?.personalization.life_goal).toBe(
      " Original authored text ",
    );
    expect(pending?.payload?.name).toBe("Synthetic name");
    expect(await getCompletedOnboardingVariant()).toBe("iam-claude");
    useOnboardingStore.getState().reset();
    const writes = service();
    await reconcileOnboardingState("fs-local-a");
    expect(writes.personalization[0]).toEqual(
      pending?.payload?.personalization,
    );
    expect(writes.notification_prefs[0]).toMatchObject({
      trial_reminder: false,
    });
    expect(await getPendingServerSync()).toBeNull();
  },
);
test("registration failure keeps payload even after all data writes", async () => {
  service();
  (registerDevice as jest.Mock).mockRejectedValueOnce(
    new Error("Synthetic failure"),
  );
  await completeOnboarding("iam-claude");
  expect(await getPendingServerSync()).not.toBeNull();
});
test("old acknowledgement cannot erase a newer payload revision", async () => {
  const old = await setPendingServerSync("fs-local-a", "iam-claude");
  const latest = await setPendingServerSync("fs-local-a", "stella-claude");
  await clearPendingServerSync("fs-local-a", old.revision);
  expect((await getPendingServerSync())?.revision).toBe(latest.revision);
});
test("an unassigned draft does not become the next user completion", async () => {
  useAppState.getState().setUserId(null);
  await markOnboardingComplete("iam-claude");
  await setPendingServerSync(null, "iam-claude");
  useAppState.getState().setUserId("fs-local-b");
  expect(await reconcileOnboardingState("fs-local-b")).toBe(false);
  expect(await getPendingServerSync()).toBeNull();
});
test("an offline query preserves only this account completion", async () => {
  await markOnboardingComplete("iam-claude");
  clientMock.mockRejectedValue(new Error("Synthetic offline"));
  expect(await reconcileOnboardingState("fs-local-a")).toBe(true);
  useAppState.getState().setUserId("fs-local-b");
  expect(await reconcileOnboardingState("fs-local-b")).toBe(false);
});
test("a partial server row without completed timestamp cannot finish onboarding", async () => {
  clientMock.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { variant: "iam-claude", onboarding_completed_at: null },
            error: null,
          }),
        }),
      }),
    }),
  });
  expect(await reconcileOnboardingState("fs-local-a")).toBe(false);
});

test("crash after pending payload but before completion flag still recovers offline", async () => {
  const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
  (AsyncStorage.setItem as jest.Mock)
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error("Synthetic local write failure"));
  useOnboardingStore
    .getState()
    .setAnswer("life_goal", "Keep this complete draft");
  await completeOnboarding("iam-claude").catch(() => {});
  (AsyncStorage.setItem as jest.Mock).mockImplementation(original);
  clientMock.mockRejectedValue(new Error("Synthetic offline"));
  expect(
    (await getPendingServerSync())?.payload?.personalization.life_goal,
  ).toBe("Keep this complete draft");
  expect(await reconcileOnboardingState("fs-local-a")).toBe(true);
});
