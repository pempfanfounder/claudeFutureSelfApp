import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import RootLayout from "@/app/_layout";
import { useAuth } from "@/features/auth/AuthProvider";
import { getPendingDeletion } from "@/features/auth/deletion";
import { useAppState } from "@/lib/appState";

// Root ownership isolation. Original QA separately exercises the actual provider,
// AuthSheet and receipt source with synthetic SDK/network adapters.
jest.mock("@/features/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: jest.fn(),
}));
jest.mock("@/features/auth/deletion", () => ({
  getPendingDeletion: jest.fn(),
}));
jest.mock("@/features/auth/AuthSheet", () => ({
  AuthSheet: ({ visible, onDone }: any) => {
    const { Pressable, Text } = jest.requireActual("react-native");
    return visible ? (
      <Pressable onPress={() => onDone(false)}>
        <Text>Not now</Text>
      </Pressable>
    ) : null;
  },
}));
jest.mock("@/lib/analytics", () => ({ initAnalytics: jest.fn() }));
jest.mock("@/lib/monitoring", () => ({
  initMonitoring: jest.fn(),
  withMonitoring: (component: any) => component,
}));
jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("expo-router", () => ({ Stack: () => null }));
jest.mock("@/design-system/ThemeProvider", () => ({
  ThemeProvider: ({ children }: any) => children,
}));
jest.mock("@/features/nav/useNotificationNavigation", () => ({
  useNotificationNavigation: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let auth: any;
let alert: jest.SpyInstance;
const refusal = {
  ok: false,
  reason: "error",
  message: "Synthetic status refusal",
};
beforeEach(() => {
  jest.clearAllMocks();
  useAppState.getState().setUserId("synthetic-a");
  useAppState.setState({ identityReady: false });
  auth = {
    initializing: false,
    initializationError: "Recover this account.",
    retryInitialization: jest.fn(),
    recoverPendingDeletion: jest.fn(async () => refusal),
    deleteAccount: jest.fn(),
  };
  jest.mocked(useAuth).mockImplementation(() => auth);
  jest.mocked(getPendingDeletion).mockResolvedValue({
    userId: "synthetic-a",
    receipt: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  const screen = render(<RootLayout />);
  await act(async () => {
    await Promise.resolve();
  });
  return screen;
}
function control(screen: any) {
  let node = screen.getByText("Check pending deletion");
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error("Missing visible status check control");
  return node.props;
}
function busy(screen: any) {
  return control(screen).accessibilityState;
}

test("immediate duplicate retained callbacks admit one check and keep visible busy state", async () => {
  const pending = deferred<any>();
  auth.recoverPendingDeletion.mockReturnValueOnce(pending.promise);
  const screen = await mount();
  const press = control(screen).onPress;
  let first!: Promise<void>, duplicate!: Promise<void>;
  act(() => {
    first = press();
    duplicate = press();
  });
  const count = auth.recoverPendingDeletion.mock.calls.length;
  const during = busy(screen);
  await act(async () => {
    await duplicate;
  });
  const afterDuplicate = busy(screen);
  await act(async () => {
    pending.resolve(refusal);
    await first;
  });
  expect(count).toBe(1);
  expect(during).toMatchObject({ disabled: true, busy: true });
  expect(afterDuplicate).toMatchObject({ disabled: true, busy: true });
  expect(busy(screen)).toMatchObject({ disabled: false, busy: false });
  expect(alert).toHaveBeenCalledTimes(1);
  await act(async () => {
    await press();
  });
  expect(auth.recoverPendingDeletion).toHaveBeenCalledTimes(2);
});

test.each([new Error("Account service is still pending"), "untyped rejection"])(
  "outer rejection %s is contained, visible and retryable",
  async (error) => {
    auth.recoverPendingDeletion.mockRejectedValueOnce(error);
    const screen = await mount();
    let escaped: unknown;
    await act(async () => {
      try {
        await control(screen).onPress();
      } catch (caught) {
        escaped = caught;
      }
    });
    expect(escaped).toBeUndefined();
    expect(alert).toHaveBeenCalledWith(
      "Account deletion",
      error instanceof Error ? error.message : expect.stringMatching(/retry/i),
    );
    expect(busy(screen)).toMatchObject({ disabled: false, busy: false });
    await act(async () => {
      await control(screen).onPress();
    });
    expect(auth.recoverPendingDeletion).toHaveBeenCalledTimes(2);
  },
);

test.each(["retry", "leave", "identity", "signin"])(
  "%s replaces recovery ownership; old settlement cannot clear a newer check",
  async (transition) => {
    const old = deferred<any>(),
      next = deferred<any>();
    auth.recoverPendingDeletion
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const screen = await mount();
    const oldPress = control(screen).onPress;
    let first!: Promise<void>, second!: Promise<void>, escaped: unknown;
    act(() => {
      first = oldPress().catch((error: unknown) => {
        escaped = error;
      });
    });
    if (transition === "retry") {
      // Retry can clear and restore the SAME error in a batched provider turn.
      fireEvent.press(screen.getByText("Retry"));
      expect(auth.retryInitialization).toHaveBeenCalledTimes(1);
    } else if (transition === "identity") {
      act(() => {
        useAppState.getState().setUserId("synthetic-b");
        useAppState.getState().setUserId("synthetic-a");
      });
    } else if (transition === "signin") {
      fireEvent.press(screen.getByText("Sign in to an existing account"));
      fireEvent.press(screen.getByText("Not now"));
    } else {
      auth = { ...auth, initializationError: null };
      screen.rerender(<RootLayout />);
      auth = { ...auth, initializationError: "Recover this account." };
      screen.rerender(<RootLayout />);
    }
    await act(async () => {
      await Promise.resolve();
    });
    let stale!: Promise<void>;
    act(() => {
      stale = oldPress();
    });
    const callsBeforeNew = auth.recoverPendingDeletion.mock.calls.length;
    act(() => {
      second = control(screen).onPress();
    });
    await act(async () => {
      old.reject(new Error("Old result"));
      await first;
    });
    const during = busy(screen);
    const feedback = alert.mock.calls.length;
    await act(async () => {
      next.resolve(refusal);
      await second;
      await stale;
    });
    expect(escaped).toBeUndefined();
    expect(callsBeforeNew).toBe(1);
    expect(during).toMatchObject({ disabled: true, busy: true });
    expect(feedback).toBe(0);
    expect(busy(screen)).toMatchObject({ disabled: false, busy: false });
    expect(alert).toHaveBeenCalledWith("Account deletion", refusal.message);
  },
);

test.each(["resolve", "reject"])(
  "unmount suppresses old %s and retained input",
  async (outcome) => {
    const pending = deferred<any>();
    auth.recoverPendingDeletion.mockReturnValueOnce(pending.promise);
    const screen = await mount();
    const press = control(screen).onPress;
    let first!: Promise<void>;
    act(() => {
      first = press();
    });
    screen.unmount();
    let escaped: unknown;
    await act(async () => {
      if (outcome === "resolve") pending.resolve(refusal);
      else pending.reject(new Error("Old failure"));
      try {
        await first;
        await press();
      } catch (error) {
        escaped = error;
      }
    });
    expect(escaped).toBeUndefined();
    expect(alert).not.toHaveBeenCalled();
    expect(auth.recoverPendingDeletion).toHaveBeenCalledTimes(1);
  },
);

test("own null cleanup failure survives error-text update; replacement identity never receives old success", async () => {
  const cleanup = deferred<any>();
  auth.recoverPendingDeletion.mockReturnValueOnce(cleanup.promise);
  const screen = await mount();
  let first!: Promise<void>;
  act(() => {
    first = control(screen).onPress();
    useAppState.getState().setUserId(null);
  });
  auth = {
    ...auth,
    initializationError: "Session ended. Reconnect to continue.",
  };
  screen.rerender(<RootLayout />);
  await act(async () => {
    cleanup.resolve({
      ...refusal,
      message: "Deletion confirmed, but device cleanup needs a restart.",
    });
    await first;
  });
  expect(alert).toHaveBeenCalledWith(
    "Account deletion",
    expect.stringMatching(/cleanup needs a restart/),
  );
  expect(busy(screen)).toMatchObject({ disabled: false, busy: false });
  const replaced = deferred<any>();
  auth.recoverPendingDeletion.mockReturnValueOnce(replaced.promise);
  let second!: Promise<void>;
  act(() => {
    second = control(screen).onPress();
    useAppState.getState().setUserId("synthetic-b");
    useAppState.getState().setUserId(null);
  });
  alert.mockClear();
  await act(async () => {
    replaced.resolve({ ok: true });
    await second;
  });
  expect(alert).not.toHaveBeenCalled();
});

test("status check never invokes destructive deletion; its separate confirmation remains", async () => {
  const screen = await mount();
  await act(async () => {
    await control(screen).onPress();
  });
  expect(auth.deleteAccount).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Retry pending deletion"));
  expect(alert).toHaveBeenLastCalledWith(
    "Retry deleting this account?",
    expect.any(String),
    expect.arrayContaining([
      expect.objectContaining({ text: "Delete account", style: "destructive" }),
    ]),
  );
  expect(auth.deleteAccount).not.toHaveBeenCalled();
});
