import React from "react";
import { act, render, fireEvent } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { useAppState } from "@/lib/appState";
import { getSupabase, getIdentitySupabase } from "@/lib/supabase";
import { deactivateDevice } from "@/features/notifications/push";
jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(),
  getIdentitySupabase: jest.fn(),
}));
jest.mock("@/lib/analytics", () => ({
  analytics: { identify: jest.fn(), reset: jest.fn(), capture: jest.fn() },
}));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { setUser: jest.fn(), captureError: jest.fn() },
}));
jest.mock("@/lib/config", () => ({
  config: { hasSupabase: true, hasGoogleAuth: false, emailAuthEnabled: false },
}));
jest.mock("@/lib/purchases", () => ({
  purchasesNeedRestart: () => false,
  logInPurchases: jest.fn(async () => {}),
  logOutPurchases: jest.fn(async () => {}),
  getIsPremium: jest.fn(async () => true),
  syncEntitlementToServer: jest.fn(async () => {}),
}));
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("@/features/notifications/push", () => ({
  deactivateDevice: jest.fn(async () => {}),
  pauseDeviceRegistration: jest.fn(),
  resumeDeviceRegistration: jest.fn(),
  registerDevice: jest.fn(async () => {}),
}));
jest.mock("@/features/onboarding/engine/completeOnboarding", () => ({
  reconcileOnboardingState: jest.fn(async () => true),
}));
jest.mock("@/features/onboarding/engine/store", () => ({
  clearOnboardingState: jest.fn(async () => {}),
  clearLocalUserData: jest.fn(async () => {}),
  useOnboardingStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock("@/features/content/feedStore", () => ({ resetFeed: jest.fn() }));
jest.mock("@/features/widgets/widgetPrefs", () => ({
  resetWidgetPrefs: jest.fn(),
}));
jest.mock("@/features/widgets/widgetSync", () => ({
  clearWidgets: jest.fn(async () => {}),
}));
let auth: ReturnType<typeof useAuth>;
function Probe() {
  const value = useAuth();
  React.useLayoutEffect(() => {
    auth = value;
  }, [value]);
  return null;
}
const session = (id: string) => ({
  user: { id, is_anonymous: false },
  access_token: "synthetic-token",
});
let emit: (event: string, next: unknown) => void;
let client: any;
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
  });
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  require("@/features/onboarding/engine/completeOnboarding").reconcileOnboardingState.mockResolvedValue(
    true,
  );
  require("@/lib/purchases").getIsPremium.mockResolvedValue(true);
  useAppState.getState().setUserId(null);
  client = {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: session("fs-local-a") },
        error: null,
      })),
      signInAnonymously: jest.fn(async () => ({
        data: { session: session("fs-local-fresh") },
        error: null,
      })),
      onAuthStateChange: jest.fn((fn) => {
        emit = fn;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: jest.fn(async () => ({ error: null })),
    },
    functions: { invoke: jest.fn() },
  };
  (getSupabase as jest.Mock).mockReturnValue(client);
  (getIdentitySupabase as jest.Mock).mockResolvedValue(client);
  (deactivateDevice as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

import AccountScreen from "@/app/(main)/settings/account";
import { Alert } from "react-native";
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/features/nav/SecondaryMotion", () => ({
  SecondaryMotion: ({ children }: any) => children,
}));
jest.mock("@/design-system/components/BackButton", () => ({
  BackButton: () => null,
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

test("delete confirmation recovers from a pending auth SDK fence", async () => {
  let release!: (v: unknown) => void;
  client.auth.signOut.mockReturnValue(
    new Promise((r) => {
      release = r;
    }),
  );
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(
    <AuthProvider>
      <Probe />
      <AccountScreen />
    </AuthProvider>,
  );
  await settle();
  await settle();
  fireEvent.press(screen.getByTestId("sign-out"));
  const confirmSignout = alert.mock.calls
    .at(-1)![2]!
    .find((b) => b.text === "Sign out")!.onPress!;
  let signout!: Promise<unknown>;
  act(() => {
    signout = confirmSignout() as any;
  });
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(12001);
    await signout;
  });
  expect(auth.initializationError).toBeNull();
  expect(useAppState.getState().identityReady).toBe(true);
  expect(useAppState.getState().isPremium).toBe(true);
  expect(useAppState.getState().onboardingComplete).toBe(true);
  expect(screen.getByTestId("sign-out").props.accessibilityState.disabled).toBe(
    false,
  );
  fireEvent.press(screen.getByTestId("delete-account"));
  const confirmDelete = alert.mock.calls
    .at(-1)![2]!
    .find((b) => b.text === "Delete forever")!.onPress!;
  const beforeAlerts = alert.mock.calls.length;
  let rejected: any = null;
  await act(async () => {
    try {
      await confirmDelete();
    } catch (e) {
      rejected = e;
    }
  });
  const disabled =
    screen.getByTestId("delete-account").props.accessibilityState.disabled;
  const messages = alert.mock.calls.slice(beforeAlerts).map((v) => v[1]);
  expect(client.functions.invoke).not.toHaveBeenCalled();
  await act(async () => {
    release({
      error: new Error("Synthetic signout failure without session removal"),
    });
    await Promise.resolve();
  });
  await settle();
  const afterSettled =
    screen.getByTestId("delete-account").props.accessibilityState.disabled;
  console.log("deletion fence UI", {
    rejected: rejected?.message,
    disabled,
    messages,
    afterSettled,
  });
  screen.unmount();
  alert.mockRestore();
  expect(rejected).toBeNull();
  expect(disabled).toBe(false);
  expect(messages.length).toBeGreaterThan(0);
  expect(afterSettled).toBe(false);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("duplicate deletion confirmation cannot clear the owning busy state and fresh confirmation retries", async () => {
  const pending = deferred<any>();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(
    <AuthProvider>
      <Probe />
      <AccountScreen />
    </AuthProvider>,
  );
  await settle();
  await settle();
  const deletion = jest
    .spyOn(auth, "deleteAccount")
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({
      ok: false,
      reason: "error",
      message: "Deletion was not confirmed.",
    });
  fireEvent.press(screen.getByTestId("delete-account"));
  const confirm = alert.mock.calls
    .at(-1)![2]!
    .find((b) => b.text === "Delete forever")!.onPress!;
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = confirm() as any;
    second = confirm() as any;
  });
  const calls = deletion.mock.calls.length;
  await act(async () => {
    await second;
  });
  const busyBeforeSettlement =
    screen.getByTestId("delete-account").props.accessibilityState.disabled;
  await act(async () => {
    pending.resolve({
      ok: false,
      reason: "error",
      message: "Deletion was not confirmed.",
    });
    await first;
  });
  expect(calls).toBe(1);
  expect(busyBeforeSettlement).toBe(true);
  expect(
    screen.getByTestId("delete-account").props.accessibilityState.disabled,
  ).toBe(false);
  expect(require("expo-router").router.replace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("delete-account"));
  const retry = alert.mock.calls
    .at(-1)![2]!
    .find((b) => b.text === "Delete forever")!.onPress!;
  await act(async () => {
    await retry();
  });
  expect(deletion).toHaveBeenCalledTimes(2);
  expect(alert.mock.calls.at(-1)![1]).toMatch(/not confirmed/);
});

test("cancel deletion makes no request and successful sign-out routes once", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(
    <AuthProvider>
      <Probe />
      <AccountScreen />
    </AuthProvider>,
  );
  await settle();
  await settle();
  fireEvent.press(screen.getByTestId("delete-account"));
  const cancel = alert.mock.calls.at(-1)![2]!.find((b) => b.text === "Cancel")!;
  if (cancel.onPress)
    await act(async () => {
      await cancel.onPress!();
    });
  expect(client.functions.invoke).not.toHaveBeenCalled();
  client.auth.signOut.mockImplementation(async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    client.auth.signInAnonymously.mockResolvedValue({
      data: {
        session: {
          ...session("fs-local-fresh"),
          user: { id: "fs-local-fresh", is_anonymous: true },
        },
      },
      error: null,
    });
    require("@/features/onboarding/engine/completeOnboarding").reconcileOnboardingState.mockResolvedValue(
      false,
    );
    require("@/lib/purchases").getIsPremium.mockResolvedValue(false);
    emit("SIGNED_OUT", null);
    return { error: null };
  });
  fireEvent.press(screen.getByTestId("sign-out"));
  const confirm = alert.mock.calls
    .at(-1)![2]!
    .find((b) => b.text === "Sign out")!.onPress!;
  await act(async () => {
    await confirm();
  });
  await settle();
  expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  expect(useAppState.getState().userId).toBe("fs-local-fresh");
  expect(useAppState.getState().identityReady).toBe(true);
  expect(useAppState.getState().onboardingComplete).toBe(false);
  expect(useAppState.getState().isPremium).toBe(false);
  expect(auth.isAnonymous).toBe(true);
  expect(require("expo-router").router.replace).toHaveBeenCalledTimes(1);
  expect(require("expo-router").router.replace).toHaveBeenCalledWith("/");
  expect(require("@/lib/analytics").analytics.capture).toHaveBeenCalledWith(
    "signed_out",
  );
});
