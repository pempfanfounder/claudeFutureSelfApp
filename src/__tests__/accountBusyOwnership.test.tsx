import AccountScreen from "@/app/(main)/settings/account";
import { Alert } from "react-native";
import { Button } from "@/design-system/components";
import { restorePurchases, getIsPremium } from "@/lib/purchases";
import { reconcileOnboardingState } from "@/features/onboarding/engine/completeOnboarding";
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
  restorePurchases: jest.fn(),
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
  jest
    .mocked(restorePurchases)
    .mockReset()
    .mockResolvedValue({ status: "cancelled" });
  jest.mocked(reconcileOnboardingState).mockResolvedValue(true);
  jest.mocked(getIsPremium).mockResolvedValue(true);
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
      onAuthStateChange: jest.fn(() => {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const ids = ["restore-purchases", "delete-account", "sign-out"];
const disabled = (screen: any, id: string) =>
  screen.getByTestId(id).props.accessibilityState.disabled;
const button = (screen: any, id: string) =>
  screen.UNSAFE_getAllByType(Button).find((b: any) => b.props.testID === id)!
    .props;
async function mount() {
  const screen = render(
    <AuthProvider>
      <Probe />
      <AccountScreen />
    </AuthProvider>,
  );
  await settle();
  await settle();
  return screen;
}
function confirm(screen: any, alert: jest.SpyInstance, kind: string) {
  fireEvent.press(
    screen.getByTestId(kind === "delete" ? "delete-account" : "sign-out"),
  );
  return alert.mock.calls
    .at(-1)![2]!
    .find(
      (b: any) =>
        b.text === (kind === "delete" ? "Delete forever" : "Sign out"),
    )!.onPress;
}

test.each(["delete", "signout"])(
  "pending %s excludes restore and keeps owning loading state through duplicate callbacks",
  async (kind) => {
    const pending = deferred<any>(),
      restore = jest.mocked(restorePurchases);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount();
    const action = jest
      .spyOn(auth, kind === "delete" ? "deleteAccount" : "signOut")
      .mockReturnValue(pending.promise);
    const neighbor = button(screen, "restore-purchases").onPress;
    const run = confirm(screen, alert, kind);
    let first!: Promise<any>, second!: Promise<any>;
    act(() => {
      first = run();
      second = run();
    });
    const immediately = ids.map((id) => disabled(screen, id));
    let neighborResult!: Promise<unknown>;
    act(() => {
      neighborResult = neighbor();
    });
    const afterAttempt = ids.map((id) => disabled(screen, id));
    const ownerAfterAttempt = button(
      screen,
      kind === "delete" ? "delete-account" : "sign-out",
    ).loading;
    await act(async () => {
      await neighborResult;
      await second;
    });
    const whilePending = ids.map((id) => disabled(screen, id));
    const loading = button(
      screen,
      kind === "delete" ? "delete-account" : "sign-out",
    ).loading;
    const restores = restore.mock.calls.length;
    await act(async () => {
      pending.resolve(
        kind === "delete"
          ? { ok: false, reason: "error", message: "Synthetic rejection" }
          : undefined,
      );
      await first;
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(restores).toBe(0);
    expect(immediately).toEqual([true, true, true]);
    expect(afterAttempt).toEqual([true, true, true]);
    expect(ownerAfterAttempt).toBe(true);
    expect(whilePending).toEqual([true, true, true]);
    expect(loading).toBe(true);
    expect(ids.map((id) => disabled(screen, id))).toEqual([
      false,
      false,
      false,
    ]);
  },
);

test.each(["delete", "signout"])(
  "restore first excludes %s even through an already captured confirmation",
  async (kind) => {
    const pending = deferred<any>();
    const restore = jest.mocked(restorePurchases);
    restore.mockReturnValueOnce(pending.promise);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount();
    const action = jest
      .spyOn(auth, kind === "delete" ? "deleteAccount" : "signOut")
      .mockResolvedValue(
        kind === "delete"
          ? { ok: false, reason: "error", message: "Synthetic rejection" }
          : (undefined as any),
      );
    const oldConfirm = confirm(screen, alert, kind);
    let first!: Promise<any>;
    act(() => {
      first = button(screen, "restore-purchases").onPress();
    });
    const immediately = ids.map((id) => disabled(screen, id));
    let neighborResult!: Promise<unknown>, duplicateResult!: Promise<unknown>;
    act(() => {
      neighborResult = oldConfirm();
      duplicateResult = button(screen, "restore-purchases").onPress();
    });
    const afterAttempt = ids.map((id) => disabled(screen, id));
    const ownerAfterAttempt = button(screen, "restore-purchases").loading;
    await act(async () => {
      await neighborResult;
      await duplicateResult;
    });
    const whilePending = ids.map((id) => disabled(screen, id));
    const owning = button(screen, "restore-purchases").loading;
    const calls = action.mock.calls.length;
    await act(async () => {
      pending.resolve({ status: "cancelled" });
      await first;
    });
    expect(calls).toBe(0);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(immediately).toEqual([true, true, true]);
    expect(afterAttempt).toEqual([true, true, true]);
    expect(ownerAfterAttempt).toBe(true);
    expect(whilePending).toEqual([true, true, true]);
    expect(owning).toBe(true);
    expect(ids.map((id) => disabled(screen, id))).toEqual([
      false,
      false,
      false,
    ]);
    expect(alert.mock.calls.at(-1)![1]).toMatch(/cancelled/);
  },
);

test.each(["purchased", "error", "cancelled", "reject"] as const)(
  "restore %s releases only its UI ownership and allows retry",
  async (outcome) => {
    const restore = jest.mocked(restorePurchases);
    if (outcome === "reject")
      restore.mockRejectedValueOnce(new Error("Synthetic restore failed"));
    else
      restore.mockResolvedValueOnce({
        status: outcome,
        message: "Synthetic restore failed",
      });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount();
    await act(async () => {
      await button(screen, "restore-purchases").onPress();
    });
    expect(ids.map((id) => disabled(screen, id))).toEqual([
      false,
      false,
      false,
    ]);
    expect(alert.mock.calls.at(-1)![1]).toMatch(
      outcome === "purchased"
        ? /purchase is back/
        : outcome === "cancelled"
          ? /cancelled/
          : /failed/,
    );
    restore.mockResolvedValueOnce({ status: "cancelled" });
    await act(async () => {
      await button(screen, "restore-purchases").onPress();
    });
    expect(restore).toHaveBeenCalledTimes(2);
  },
);
