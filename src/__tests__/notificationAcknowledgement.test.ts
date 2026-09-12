import { useAppState } from "@/lib/appState";
import { getSupabase, getIdentitySupabase } from "@/lib/supabase";
import { getInstallId } from "@/lib/experiments";
import {
  registerDevice,
  deactivateDevice,
} from "@/features/notifications/push";
jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(),
  getIdentitySupabase: jest.fn(),
}));
jest.mock("@/lib/experiments", () => ({
  getInstallId: jest.fn(async () => "synthetic-install"),
}));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: false,
  })),
}));
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
  getCalendars: () => [{ timeZone: "UTC" }],
}));
let rpc: jest.Mock;
beforeEach(() => {
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
  rpc = jest.fn(async () => ({ data: "synthetic-device", error: null }));
  const client = {
    rpc,
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "fs-local-a" } } },
      }),
    },
  };
  (getSupabase as jest.Mock).mockReturnValue(client);
  (getIdentitySupabase as jest.Mock).mockResolvedValue(client);
  (getInstallId as jest.Mock).mockResolvedValue("synthetic-install");
});
test.each([registerDevice, deactivateDevice])(
  "returned RPC errors are not acknowledged",
  async (operation) => {
    rpc.mockResolvedValue({ error: new Error("Synthetic rejected write") });
    await expect(operation()).rejects.toThrow("Synthetic rejected write");
  },
);
test("account switch while registration prepares cancels the old dispatch", async () => {
  let release!: (value: string) => void;
  (getInstallId as jest.Mock).mockReturnValue(
    new Promise<string>((r) => {
      release = r;
    }),
  );
  const work = registerDevice();
  await Promise.resolve();
  await Promise.resolve();
  useAppState.getState().setUserId("fs-local-b");
  release("synthetic-install");
  await expect(work).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});

test("notification URLs permit only supported in-app destinations", () => {
  const read = (url: string) =>
    require("@/features/notifications/push").getNotificationDeepLink({
      notification: { request: { content: { data: { url } } } },
    });
  expect(
    read(
      "futureself://content/11111111-1111-4111-8111-111111111111?kind=quote",
    ),
  ).toContain("/content/");
  expect(read("futureself://settings")).toBe("futureself://settings");
  for (const url of [
    "https://evil.invalid/settings",
    "futureself://settings/account",
    "futureself://content/../settings",
    "javascript:alert(1)",
  ])
    expect(read(url)).toBeNull();
});

test("sign-out fences late registration and deactivation follows any dispatched register", async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const dispatched = new Promise<void>((r) => {
    started = r;
  });
  rpc.mockImplementation(async (name) => {
    if (name === "register_device") {
      started();
      return new Promise((r) => {
        release = r;
      });
    }
    return { error: null };
  });
  const { captureIdentity } = require("@/lib/appState");
  const push = require("@/features/notifications/push");
  const identity = captureIdentity();
  const registration = registerDevice(identity);
  await dispatched;
  push.pauseDeviceRegistration(identity);
  const deactivation = deactivateDevice(identity);
  await expect(registerDevice(identity)).rejects.toThrow(/signing out/);
  expect(rpc.mock.calls.map((c: any[]) => c[0])).toEqual(["register_device"]);
  release({ error: null });
  await registration;
  await deactivation;
  expect(rpc.mock.calls.map((c: any[]) => c[0])).toEqual([
    "register_device",
    "deactivate_device",
  ]);
  push.resumeDeviceRegistration(identity);
});

test("hung permission preparation ends the caller wait and cannot dispatch when it later completes", async () => {
  jest.useFakeTimers();
  const notifications = require("expo-notifications");
  let release!: (v: unknown) => void;
  notifications.getPermissionsAsync.mockReturnValueOnce(
    new Promise((r) => {
      release = r;
    }),
  );
  const result = registerDevice().catch((e) => e);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  jest.advanceTimersByTime(12001);
  expect(await result).toBeInstanceOf(Error);
  release({ granted: false, canAskAgain: false });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(rpc).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test("S5 delivered link retains exact delivery identity and rejects malformed or conflicting payloads", () => {
  const owner = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222",
    delivery = "33333333-3333-4333-8333-333333333333";
  useAppState.getState().setUserId(owner);
  const read = (data: any) =>
    require("@/features/notifications/push").getNotificationDeepLink({
      notification: { request: { content: { data } } },
    });
  const url = `futureself://content/${id}?kind=quote`;
  const data = { url, kind: "quote", content_id: id, delivery_id: delivery };
  expect(read(data)).toBe(
    `${url}&source=delivery&delivery=${delivery}&owner=${owner}`,
  );
  for (const invalid of [
    { ...data, delivery_id: "bad" },
    { ...data, content_id: delivery },
    { ...data, kind: "affirmation" },
    { ...data, url: `${url}&delivery=bad` },
    { ...data, url: `${url}&kind=affirmation` },
  ])
    expect(read(invalid)).toBeNull();
  expect(read({ url })).toBe(url);
});
