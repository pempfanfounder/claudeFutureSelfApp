import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { router } from "expo-router";
import { analytics } from "@/lib/analytics";
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
jest.mock("expo-crypto", () => ({
  randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
let authEvent: (event: string, next: any) => void;
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
  });
};
beforeEach(async () => {
  await AsyncStorage.clear();
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
      onAuthStateChange: jest.fn((callback) => {
        authEvent = callback;
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
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
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

// Real AuthProvider/account orchestration; Apple, store, transport and Alert are synthetic.
const actionMethod = (kind: string) =>
  kind === "delete" ? "deleteAccount" : "signOut";
const outcome = (kind: string) =>
  kind === "delete"
    ? { ok: false, reason: "error", message: "Synthetic refusal" }
    : undefined;
async function changeAccount(id: string) {
  client.auth.getSession.mockResolvedValue({
    data: { session: session(id) },
    error: null,
  });
  await act(async () => {
    authEvent("SIGNED_IN", session(id));
  });
  await settle();
  await settle();
  expect(useAppState.getState().userId).toBe(id);
}
function spyAction(kind: string) {
  return jest
    .spyOn(auth, actionMethod(kind))
    .mockResolvedValue(outcome(kind) as any);
}

test.each(["delete", "signout"])(
  "stale %s confirmation cannot invoke any provider action after A to B",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      oldAction = spyAction(kind);
    const oldConfirm = confirm(screen, alert, kind);
    await changeAccount("fs-local-b");
    const currentAction = spyAction(kind),
      alerts = alert.mock.calls.length;
    await act(async () => {
      await oldConfirm();
    });
    expect(oldAction).not.toHaveBeenCalled();
    expect(currentAction).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(deactivateDevice).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(alerts);
  },
);

test.each(["delete", "signout"])(
  "%s consent is invalid after A to null to A even without an intermediate render",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      run = confirm(screen, alert, kind);
    act(() => {
      useAppState.getState().setUserId(null);
      useAppState.getState().setUserId("fs-local-a");
    });
    await act(async () => {
      await run();
    });
    expect(action).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  },
);

test.each(["delete", "signout"])(
  "%s confirmation is invalid after same-account unmount/remount",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      oldAction = spyAction(kind),
      run = confirm(screen, alert, kind);
    screen.unmount();
    const next = await mount(),
      action = spyAction(kind);
    await act(async () => {
      await run();
    });
    expect(oldAction).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(ids.map((id) => disabled(next, id))).toEqual([false, false, false]);
  },
);

test.each(["delete", "signout"])(
  "cancel consumes %s confirmation and a fresh confirmation still works",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      run = confirm(screen, alert, kind);
    const cancel = alert.mock.calls
      .at(-1)![2]!
      .find((b: any) => b.text === "Cancel")!;
    await act(async () => {
      await cancel.onPress?.();
      await run();
    });
    expect(action).not.toHaveBeenCalled();
    const fresh = confirm(screen, alert, kind);
    await act(async () => {
      await fresh();
    });
    expect(action).toHaveBeenCalledTimes(1);
  },
);

test.each(["delete", "signout"])(
  "settled %s confirmation is consumed and cannot run again",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      run = confirm(screen, alert, kind);
    await act(async () => {
      await run();
    });
    await act(async () => {
      await run();
    });
    expect(action).toHaveBeenCalledTimes(1);
  },
);

test.each(["delete", "signout"])(
  "replaced %s dialog and its cancel callback cannot affect the newer dialog",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      old = confirm(screen, alert, kind);
    const cancel = alert.mock.calls
      .at(-1)![2]!
      .find((b: any) => b.text === "Cancel")!;
    const fresh = confirm(screen, alert, kind);
    await act(async () => {
      await cancel.onPress?.();
      await old();
    });
    expect(action).not.toHaveBeenCalled();
    await act(async () => {
      await fresh();
    });
    expect(action).toHaveBeenCalledTimes(1);
  },
);

test.each(["delete", "signout"])(
  "%s confirmation is invalidated when Restore starts, including after it settles",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      old = confirm(screen, alert, kind);
    await act(async () => {
      await button(screen, "restore-purchases").onPress();
    });
    await act(async () => {
      await old();
    });
    expect(action).not.toHaveBeenCalled();
  },
);

test.each(["delete", "signout"])(
  "%s cannot create a delayed confirmation while Restore owns the screen",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      pending = deferred<any>();
    const open = button(
      screen,
      kind === "delete" ? "delete-account" : "sign-out",
    ).onPress;
    jest.mocked(restorePurchases).mockReturnValueOnce(pending.promise);
    let run!: Promise<any>;
    act(() => {
      run = button(screen, "restore-purchases").onPress();
    });
    const count = alert.mock.calls.length;
    act(() => {
      open();
    });
    expect(alert).toHaveBeenCalledTimes(count);
    await act(async () => {
      pending.resolve({ status: "cancelled" });
      await run;
    });
    expect(action).not.toHaveBeenCalled();
  },
);

for (const kind of ["delete", "signout", "restore"]) {
  test.each(["success", "error"])(
    `late ${kind} %s cannot alert, route or clear a newer B Restore`,
    async (result) => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const screen = await mount(),
        pending = deferred<any>();
      if (kind === "restore")
        jest.mocked(restorePurchases).mockReturnValueOnce(pending.promise);
      else spyAction(kind).mockReturnValueOnce(pending.promise);
      const callback =
        kind === "restore"
          ? button(screen, "restore-purchases").onPress
          : confirm(screen, alert, kind);
      let first!: Promise<any>;
      act(() => {
        first = callback();
      });
      await changeAccount("fs-local-b");
      expect(ids.map((id) => disabled(screen, id))).toEqual([
        false,
        false,
        false,
      ]);
      const next = deferred<any>();
      jest.mocked(restorePurchases).mockReturnValueOnce(next.promise);
      let second!: Promise<any>;
      act(() => {
        second = button(screen, "restore-purchases").onPress();
      });
      const alerts = alert.mock.calls.length;
      await act(async () => {
        if (result === "error") pending.reject(new Error("old failure"));
        else
          pending.resolve(
            kind === "delete"
              ? { ok: true }
              : kind === "restore"
                ? { status: "purchased" }
                : undefined,
          );
        await first;
      });
      expect(alert).toHaveBeenCalledTimes(alerts);
      expect(router.replace).not.toHaveBeenCalled();
      expect(analytics.capture).not.toHaveBeenCalledWith("signed_out");
      expect(button(screen, "restore-purchases").loading).toBe(true);
      expect(ids.map((id) => disabled(screen, id))).toEqual([true, true, true]);
      await act(async () => {
        next.resolve({ status: "cancelled" });
        await second;
      });
      expect(ids.map((id) => disabled(screen, id))).toEqual([
        false,
        false,
        false,
      ]);
    },
  );
  test.each(["success", "error"])(
    `late ${kind} %s after unmount has no screen effects`,
    async (result) => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const screen = await mount(),
        pending = deferred<any>();
      if (kind === "restore")
        jest.mocked(restorePurchases).mockReturnValueOnce(pending.promise);
      else spyAction(kind).mockReturnValueOnce(pending.promise);
      const callback =
        kind === "restore"
          ? button(screen, "restore-purchases").onPress
          : confirm(screen, alert, kind);
      let first!: Promise<any>;
      act(() => {
        first = callback();
      });
      screen.unmount();
      const alerts = alert.mock.calls.length;
      await act(async () => {
        if (result === "error") pending.reject(new Error("old failure"));
        else
          pending.resolve(
            kind === "delete"
              ? { ok: false, message: "old refusal" }
              : kind === "restore"
                ? { status: "purchased" }
                : undefined,
          );
        await first;
      });
      expect(alert).toHaveBeenCalledTimes(alerts);
      expect(router.replace).not.toHaveBeenCalled();
    },
  );
}

test.each(["delete", "signout"])(
  "fresh %s success and rejection recover for another confirmation",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind).mockResolvedValueOnce(
        (kind === "delete" ? { ok: true } : undefined) as any,
      );
    let run = confirm(screen, alert, kind);
    await act(async () => {
      await run();
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(ids.map((id) => disabled(screen, id))).toEqual([
      false,
      false,
      false,
    ]);
    if (kind === "signout") expect(router.replace).toHaveBeenCalledTimes(1);
    action.mockRejectedValueOnce(new Error("Synthetic rejected action"));
    run = confirm(screen, alert, kind);
    await act(async () => {
      await run();
    });
    expect(alert.mock.calls.at(-1)![1]).toMatch(/Synthetic rejected action/);
    expect(ids.map((id) => disabled(screen, id))).toEqual([
      false,
      false,
      false,
    ]);
  },
);

test.each(["success", "error"])(
  "live signout may finish its own A to null transition: %s",
  async (result) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      pending = deferred<any>();
    spyAction("signout").mockReturnValueOnce(pending.promise);
    const run = confirm(screen, alert, "signout");
    let action!: Promise<any>;
    act(() => {
      action = run();
    });
    act(() => {
      useAppState.getState().setUserId(null);
    });
    await act(async () => {
      if (result === "error")
        pending.reject(new Error("Device signed out; cleanup incomplete"));
      else pending.resolve(undefined);
      await action;
    });
    if (result === "success") expect(router.replace).toHaveBeenCalledTimes(1);
    else expect(alert.mock.calls.at(-1)![1]).toMatch(/cleanup incomplete/);
    expect(disabled(screen, "delete-account")).toBe(false);
  },
);

test.each(["delete", "signout"])(
  "retained %s opener from an older generation cannot create new consent",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind);
    const open = button(
      screen,
      kind === "delete" ? "delete-account" : "sign-out",
    ).onPress;
    act(() => {
      useAppState.getState().setUserId(null);
      useAppState.getState().setUserId("fs-local-a");
      open();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  },
);

test.each(["delete", "signout"])(
  "dismiss consumes %s consent and cannot cancel a newer confirmation",
  async (kind) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(),
      action = spyAction(kind),
      old = confirm(screen, alert, kind);
    const dismiss = alert.mock.calls.at(-1)![3]?.onDismiss;
    await act(async () => {
      dismiss?.();
      await old();
    });
    expect(action).not.toHaveBeenCalled();
    const fresh = confirm(screen, alert, kind);
    await act(async () => {
      dismiss?.();
      await fresh();
    });
    expect(action).toHaveBeenCalledTimes(1);
  },
);

for (const successor of ["fs-local-b", "fs-local-a"]) {
  test.each(["success", "error"])(
    `signout A to null to ${successor} suppresses late %s and preserves successor Restore`,
    async (result) => {
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const screen = await mount(),
        pending = deferred<any>();
      spyAction("signout").mockReturnValueOnce(pending.promise);
      const run = confirm(screen, alert, "signout");
      let action!: Promise<any>;
      act(() => {
        action = run();
      });
      act(() => {
        useAppState.getState().setUserId(null);
      });
      await changeAccount(successor);
      const next = deferred<any>();
      jest.mocked(restorePurchases).mockReturnValueOnce(next.promise);
      let restore!: Promise<any>;
      act(() => {
        restore = button(screen, "restore-purchases").onPress();
      });
      const alerts = alert.mock.calls.length;
      await act(async () => {
        if (result === "error")
          pending.reject(new Error("old signout failure"));
        else pending.resolve(undefined);
        await action;
      });
      expect(router.replace).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledTimes(alerts);
      expect(button(screen, "restore-purchases").loading).toBe(true);
      await act(async () => {
        next.resolve({ status: "cancelled" });
        await restore;
      });
    },
  );
}

test("late deletion refusal cannot show an alert for the next account", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = await mount(),
    pending = deferred<any>();
  spyAction("delete").mockReturnValueOnce(pending.promise);
  const run = confirm(screen, alert, "delete");
  let action!: Promise<any>;
  act(() => {
    action = run();
  });
  await changeAccount("fs-local-b");
  const count = alert.mock.calls.length;
  await act(async () => {
    pending.resolve({ ok: false, reason: "error", message: "old refusal" });
    await action;
  });
  expect(alert).toHaveBeenCalledTimes(count);
  expect(router.replace).not.toHaveBeenCalled();
});
