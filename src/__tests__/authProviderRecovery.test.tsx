import React from "react";
import { act, render } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { useAppState } from "@/lib/appState";
import { getSupabase, getIdentitySupabase } from "@/lib/supabase";
import { deactivateDevice } from "@/features/notifications/push";
import { logOutPurchases } from "@/lib/purchases";
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
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
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
  jest.useRealTimers();
});
test("adopt writes anonymous vs linked onto app state", async () => {
  const guest = {
    user: { id: "fs-local-a", is_anonymous: true },
    access_token: "synthetic-token",
  };
  client.auth.getSession.mockResolvedValue({
    data: { session: guest },
    error: null,
  });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  expect(useAppState.getState().isAnonymous).toBe(true);
  act(() =>
    emit("USER_UPDATED", {
      user: { id: "fs-local-a", is_anonymous: false },
      access_token: "synthetic-token",
    }),
  );
  await settle();
  expect(useAppState.getState().isAnonymous).toBe(false);
});

test("late initial null cannot replace a newer signed-in session", async () => {
  client.auth.getSession.mockReturnValue(new Promise(() => {}));
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  act(() => {
    emit("SIGNED_IN", session("fs-local-b"));
    emit("INITIAL_SESSION", null);
  });
  await settle();
  expect(useAppState.getState().userId).toBe("fs-local-b");
});
test("unsolicited sign-out settles into recovery instead of a permanent spinner", async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  act(() => emit("SIGNED_OUT", null));
  await settle();
  expect(auth.initializationError).not.toBeNull();
});
test("delayed A sign-out cannot sign out B", async () => {
  let release!: () => void;
  (deactivateDevice as jest.Mock).mockReturnValue(
    new Promise<void>((r) => {
      release = r;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  let result!: Promise<unknown>;
  act(() => {
    result = auth.signOut().catch(() => undefined);
  });
  act(() => emit("SIGNED_IN", session("fs-local-b")));
  await settle();
  await act(async () => {
    release();
    await result;
  });
  expect(client.auth.signOut).not.toHaveBeenCalled();
  expect(logOutPurchases).not.toHaveBeenCalled();
  expect(useAppState.getState().userId).toBe("fs-local-b");
});
test.each([401, "wrong-subject"])(
  "unconfirmed deletion %s keeps credentials and account",
  async (kind) => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await settle();
    await settle();
    client.functions.invoke.mockResolvedValue(
      kind === 401
        ? { error: { context: { status: 401 } } }
        : { data: { ok: true, deleted_user_id: "fs-local-b" }, error: null },
    );
    let result: unknown;
    await act(async () => {
      result = await auth.deleteAccount();
    });
    expect(result).toMatchObject({ ok: false });
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(useAppState.getState().userId).toBe("fs-local-a");
  },
);

jest.mock("@/features/auth/deletion", () => ({
  getPendingDeletion: jest.fn(async () => null),
  clearDeletionReceipt: jest.fn(async () => {}),
  checkPendingDeletion: jest.fn(),
  requestAccountDeletion: async (identity: { userId: string }) => {
    const client =
      await require("@/lib/supabase").getIdentitySupabase(identity);
    const { data, error } = await client.functions.invoke("delete-account", {
      body: { receipt: "synthetic" },
    });
    if (error || !data?.ok || data.deleted_user_id !== identity.userId)
      throw new Error("Unconfirmed");
    return identity.userId;
  },
}));

test("SDK clear-then-error reports local signout rather than kept credentials", async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  client.auth.signOut.mockImplementation(async () => {
    emit("SIGNED_OUT", null);
    client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    return { error: new Error("Synthetic revocation failure") };
  });
  let error: unknown;
  await act(async () => {
    try {
      await auth.signOut();
    } catch (value) {
      error = value;
    }
  });
  expect(useAppState.getState().userId).toBeNull();
  expect(String(error)).toContain("device is signed out");
  expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
});

test("retrying an already ready account settles the loading state", async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  expect(useAppState.getState().identityReady).toBe(true);
  act(() => auth.retryInitialization());
  await settle();
  await settle();
  expect(auth.initializing).toBe(false);
  expect(auth.initializationError).toBeNull();
});
test("confirmed A deletion clears only A data when B was adopted meanwhile", async () => {
  let release!: (value: unknown) => void;
  client.functions.invoke.mockReturnValue(
    new Promise((r) => {
      release = r;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  let deletion!: Promise<unknown>;
  act(() => {
    deletion = auth.deleteAccount();
  });
  await settle();
  act(() => emit("SIGNED_IN", session("fs-local-b")));
  await settle();
  await settle();
  await act(async () => {
    release({ data: { ok: true, deleted_user_id: "fs-local-a" }, error: null });
    await deletion;
  });
  expect(
    require("@/features/onboarding/engine/store").clearLocalUserData,
  ).toHaveBeenCalledWith("fs-local-a");
  expect(
    require("@/features/auth/deletion").clearDeletionReceipt,
  ).toHaveBeenCalledWith("fs-local-a");
  expect(client.auth.signOut).not.toHaveBeenCalled();
  expect(logOutPurchases).not.toHaveBeenCalled();
  expect(useAppState.getState().userId).toBe("fs-local-b");
});
test("a timed-out SDK signout fences a newer signin until its actual completion", async () => {
  let release!: (value: unknown) => void;
  client.auth.signOut.mockReturnValue(
    new Promise((r) => {
      release = r;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  let signout!: Promise<unknown>;
  act(() => {
    signout = auth.signOut().catch((e) => e);
  });
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(12_001);
    await signout;
  });
  await expect(auth.signInExistingWithApple()).rejects.toThrow(
    /not finished|in progress/,
  );
  expect(
    require("expo-apple-authentication").signInAsync,
  ).not.toHaveBeenCalled();
  await act(async () => {
    release({ error: null });
    await Promise.resolve();
  });
});

test.each([false, true])(
  "S5 bootstrap stays fenced through timeout/retry (remount=%s) and accepts settlement",
  async (remount) => {
    let persisted: any = null;
    let release!: (value: any) => void;
    client.auth.getSession.mockImplementation(async () => ({
      data: { session: persisted },
      error: null,
    }));
    client.auth.signInAnonymously.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = (value) => {
            persisted = value;
            emit("SIGNED_IN", value);
            resolve({ data: { session: value }, error: null });
          };
        }),
    );
    let screen = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(12001);
      await Promise.resolve();
    });
    if (remount) {
      screen.unmount();
      screen = render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    } else act(() => auth.retryInitialization());
    await settle();
    const calls = client.auth.signInAnonymously.mock.calls.length;
    let blocked = false;
    try {
      await auth.signInExistingWithApple();
    } catch {
      blocked = true;
    }
    await act(async () => release(session("settled-guest")));
    await settle();
    await settle();
    expect(calls).toBe(1);
    expect(blocked).toBe(true);
    expect(useAppState.getState().userId).toBe("settled-guest");
    expect(persisted.user.id).toBe("settled-guest");
    expect(useAppState.getState().identityReady).toBe(true);
    expect(auth.initializing).toBe(false);
    expect(auth.initializationError).toBeNull();
    screen.unmount();
  },
);

test("S5 rejected anonymous operation releases its fence for explicit retry", async () => {
  let reject!: (value: unknown) => void;
  client.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  client.auth.signInAnonymously.mockImplementationOnce(
    () =>
      new Promise((_r, j) => {
        reject = j;
      }),
  );
  const screen = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await act(async () => {
    jest.advanceTimersByTime(12001);
    await Promise.resolve();
  });
  await act(async () => reject(new Error("synthetic failure")));
  act(() => auth.retryInitialization());
  await settle();
  await settle();
  expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(2);
  expect(useAppState.getState().identityReady).toBe(true);
  expect(auth.initializationError).toBeNull();
  screen.unmount();
});

test("S5 delayed existing-account token cannot race an anonymous mutation begun during session lookup", async () => {
  const apple = require("expo-apple-authentication");
  apple.AppleAuthenticationScope = { FULL_NAME: 0, EMAIL: 1 };
  let lookup!: (v: any) => void,
    token!: (v: any) => void,
    anon!: (v: any) => void;
  client.auth.getSession.mockImplementationOnce(
    () =>
      new Promise((r) => {
        lookup = r;
      }),
  );
  client.auth.signInAnonymously.mockImplementationOnce(
    () =>
      new Promise((r) => {
        anon = r;
      }),
  );
  client.auth.signInWithIdToken = jest.fn(async () => ({
    data: { session: session("existing") },
    error: null,
  }));
  apple.signInAsync.mockImplementationOnce(
    () =>
      new Promise((r: any) => {
        token = r;
      }),
  );
  const screen = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  let signIn!: Promise<unknown>;
  act(() => {
    signIn = auth.signInExistingWithApple().catch((e) => e);
  });
  await settle();
  await act(async () => lookup({ data: { session: null }, error: null }));
  await settle();
  await act(async () => {
    token({ identityToken: "synthetic" });
    await signIn;
  });
  const calls = client.auth.signInWithIdToken.mock.calls.length;
  await act(async () =>
    anon({ data: { session: session("guest") }, error: null }),
  );
  await settle();
  await settle();
  expect(calls).toBe(0);
  expect(useAppState.getState().identityReady).toBe(true);
  screen.unmount();
});

test("provider cancellation leaves the auth fence available", async () => {
  const screen = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  require("expo-apple-authentication").signInAsync.mockRejectedValueOnce({
    code: "ERR_REQUEST_CANCELED",
  });
  let outcome: unknown;
  await act(async () => {
    outcome = await auth.signInExistingWithApple();
  });
  expect(outcome).toEqual({ ok: false, reason: "cancelled" });
  expect(
    require("@/features/auth/sharedAuthOperation").sharedAuthPending(),
  ).toBe(false);
  screen.unmount();
});
test("email mutation timeout returns a recoverable outcome and fences the actual operation", async () => {
  const config = require("@/lib/config").config;
  config.emailAuthEnabled = true;
  let release!: (v: any) => void;
  client.auth.updateUser = jest.fn(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const screen = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await settle();
  await settle();
  let work!: Promise<unknown>;
  act(() => {
    work = auth.startEmailLink("synthetic@example.invalid");
  });
  await settle();
  let outcome: unknown;
  await act(async () => {
    jest.advanceTimersByTime(12001);
    outcome = await work;
  });
  expect(outcome).toMatchObject({ ok: false, reason: "error" });
  expect(
    require("@/features/auth/sharedAuthOperation").sharedAuthPending(),
  ).toBe(true);
  await act(async () => {
    release({ error: null });
    await Promise.resolve();
  });
  expect(
    require("@/features/auth/sharedAuthOperation").sharedAuthPending(),
  ).toBe(false);
  config.emailAuthEnabled = false;
  screen.unmount();
});
