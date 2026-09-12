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
  getIsPremium: jest.fn(async () => false),
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
  reconcileOnboardingState: jest.fn(async () => false),
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
  require("@/lib/config").config.emailAuthEnabled = false;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

import { AuthSheet } from "@/features/auth/AuthSheet";
import { Button } from "@/design-system/components";
test.each(["result", "rejection"])(
  "conditional email resend recovers after late %s and keeps the pending SDK fenced",
  async (settlement) => {
    const config = require("@/lib/config").config;
    config.emailAuthEnabled = true;
    let release!: (v: unknown) => void;
    let reject!: (e: Error) => void;
    client.auth.updateUser = jest.fn(
      () =>
        new Promise((r, j) => {
          release = r;
          reject = j;
        }),
    );
    const screen = render(
      <AuthProvider>
        <Probe />
        <AuthSheet visible headline="Synthetic account" onDone={() => {}} />
      </AuthProvider>,
    );
    await settle();
    await settle();
    fireEvent.press(screen.getByTestId("auth-email"));
    fireEvent.changeText(
      screen.getByTestId("auth-email-input"),
      "synthetic@example.invalid",
    );
    const send = () =>
      screen
        .UNSAFE_getAllByType(Button)
        .find((x) => x.props.testID === "auth-email-send")!
        .props.onPress();
    let first!: Promise<unknown>;
    act(() => {
      first = send();
    });
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(12001);
      await first;
    });
    expect(
      screen.getByTestId("auth-email-send").props.accessibilityState.disabled,
    ).toBe(false);
    let rejected: any = null;
    await act(async () => {
      try {
        await send();
      } catch (e) {
        rejected = e;
      }
    });
    const disabled =
      screen.getByTestId("auth-email-send").props.accessibilityState.disabled;
    const errorVisible =
      screen.queryByText(/account service has not finished/) !== null;
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (settlement === "rejection")
        reject(new Error("Synthetic late rejection"));
      else release({ error: new Error("Synthetic late failure") });
      await Promise.resolve();
    });
    await settle();
    const afterSettled =
      screen.getByTestId("auth-email-send").props.accessibilityState.disabled;
    console.log("conditional email", {
      rejected: rejected?.message,
      disabled,
      errorVisible,
      afterSettled,
    });
    client.auth.updateUser.mockResolvedValue({ error: null });
    await act(async () => {
      await send();
    });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("auth-code-input")).toBeTruthy();
    screen.unmount();
    config.emailAuthEnabled = false;
    expect(rejected).toBeNull();
    expect(disabled).toBe(false);
    expect(errorVisible).toBe(true);
    expect(afterSettled).toBe(false);
  },
);

type Outcome = Awaited<ReturnType<typeof auth.startEmailLink>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const sheet = (visible: boolean, onDone: (ok: boolean) => void) => (
  <AuthProvider>
    <Probe />
    <AuthSheet visible={visible} headline="Synthetic account" onDone={onDone} />
  </AuthProvider>
);

test("email remains hidden in the default configuration", async () => {
  const screen = render(sheet(true, jest.fn()));
  await settle();
  expect(screen.queryByTestId("auth-email")).toBeNull();
});

test("same-render email clicks have one owner and retain busy until settlement", async () => {
  require("@/lib/config").config.emailAuthEnabled = true;
  const pending = deferred<Outcome>();
  const screen = render(sheet(true, jest.fn()));
  await settle();
  await settle();
  const sendCall = jest
    .spyOn(auth, "startEmailLink")
    .mockReturnValue(pending.promise);
  fireEvent.press(screen.getByTestId("auth-email"));
  fireEvent.changeText(
    screen.getByTestId("auth-email-input"),
    "synthetic@example.invalid",
  );
  const send = screen
    .UNSAFE_getAllByType(Button)
    .find((x) => x.props.testID === "auth-email-send")!.props.onPress;
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => {
    first = send();
    second = send();
  });
  const calls = sendCall.mock.calls.length;
  const disabled =
    screen.getByTestId("auth-email-send").props.accessibilityState.disabled;
  await act(async () => {
    pending.resolve({ ok: true });
    await Promise.all([first, second]);
  });
  expect(calls).toBe(1);
  expect(disabled).toBe(true);
  expect(screen.getByTestId("auth-code-input")).toBeTruthy();
});

test.each(["dismiss", "hide"])(
  "%s invalidates late email success before reopening",
  async (action) => {
    require("@/lib/config").config.emailAuthEnabled = true;
    const pending = deferred<Outcome>();
    const done = jest.fn();
    const screen = render(sheet(true, done));
    await settle();
    await settle();
    jest.spyOn(auth, "startEmailLink").mockReturnValue(pending.promise);
    fireEvent.press(screen.getByTestId("auth-email"));
    fireEvent.changeText(
      screen.getByTestId("auth-email-input"),
      "synthetic@example.invalid",
    );
    const send = screen
      .UNSAFE_getAllByType(Button)
      .find((x) => x.props.testID === "auth-email-send")!.props.onPress;
    let first!: Promise<unknown>;
    act(() => {
      first = send();
    });
    if (action === "dismiss") fireEvent.press(screen.getByText("Not now"));
    screen.rerender(sheet(false, done));
    screen.rerender(sheet(true, done));
    await act(async () => {
      pending.resolve({ ok: true });
      await first;
    });
    expect(screen.queryByTestId("auth-code-input")).toBeNull();
    expect(done.mock.calls).toEqual(action === "dismiss" ? [[false]] : []);
  },
);

test.each([true, false])(
  "dismissed provider result %s cannot finish or unlock a newer attempt",
  async (ok) => {
    const old = deferred<Outcome>();
    const next = deferred<Outcome>();
    const done = jest.fn();
    const screen = render(sheet(true, done));
    await settle();
    await settle();
    const link = jest
      .spyOn(auth, "linkWithApple")
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const press = () =>
      screen
        .UNSAFE_getAllByType(Button)
        .find((x) => x.props.testID === "auth-apple")!
        .props.onPress();
    let first!: Promise<unknown>;
    act(() => {
      first = press();
    });
    fireEvent.press(screen.getByText("Not now"));
    screen.rerender(sheet(false, done));
    screen.rerender(sheet(true, done));
    let second!: Promise<unknown>;
    act(() => {
      second = press();
    });
    await act(async () => {
      old.resolve(
        ok
          ? { ok: true }
          : { ok: false, reason: "error", message: "Old attempt failed" },
      );
      await first;
    });
    const busyAfterOld =
      screen.getByTestId("auth-apple").props.accessibilityState.disabled;
    const callsAfterOld = done.mock.calls.slice();
    const oldError = screen.queryByText("Old attempt failed");
    await act(async () => {
      next.resolve({ ok: true });
      await second;
    });
    expect(link).toHaveBeenCalledTimes(2);
    expect(callsAfterOld).toEqual([[false]]);
    expect(busyAfterOld).toBe(true);
    expect(oldError).toBeNull();
    expect(done.mock.calls).toEqual([[false], [true]]);
  },
);

test("provider cancellation is silent, ordinary failure is visible, and both allow retry", async () => {
  const done = jest.fn();
  const screen = render(sheet(true, done));
  await settle();
  await settle();
  const link = jest
    .spyOn(auth, "linkWithApple")
    .mockResolvedValueOnce({ ok: false, reason: "cancelled" })
    .mockResolvedValueOnce({ ok: false, reason: "error" })
    .mockResolvedValueOnce({ ok: true });
  const press = () =>
    screen
      .UNSAFE_getAllByType(Button)
      .find((x) => x.props.testID === "auth-apple")!
      .props.onPress();
  await act(async () => {
    await press();
  });
  expect(done).not.toHaveBeenCalled();
  expect(screen.queryByText(/Could not finish/)).toBeNull();
  expect(
    screen.getByTestId("auth-apple").props.accessibilityState.disabled,
  ).toBe(false);
  await act(async () => {
    await press();
  });
  expect(screen.getByText(/Could not finish/)).toBeTruthy();
  await act(async () => {
    await press();
  });
  expect(link).toHaveBeenCalledTimes(3);
  expect(done.mock.calls).toEqual([[true]]);
});

test.each(["modal-close", "unmount"])(
  "%s discards a late provider success",
  async (method) => {
    const done = jest.fn();
    const pending = deferred<Outcome>();
    const screen = render(sheet(true, done));
    await settle();
    await settle();
    jest.spyOn(auth, "linkWithApple").mockReturnValue(pending.promise);
    let task!: Promise<unknown>;
    act(() => {
      task = screen
        .UNSAFE_getAllByType(Button)
        .find((x) => x.props.testID === "auth-apple")!
        .props.onPress();
    });
    if (method === "unmount") screen.unmount();
    else
      act(() => {
        screen
          .UNSAFE_getByType(require("react-native").Modal)
          .props.onRequestClose();
      });
    await act(async () => {
      pending.resolve({ ok: true });
      await task;
    });
    expect(done.mock.calls).toEqual(method === "unmount" ? [] : [[false]]);
  },
);
