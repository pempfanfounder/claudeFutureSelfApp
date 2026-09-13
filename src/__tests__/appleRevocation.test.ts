import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import {
  hasAppleIdentity,
  requestAppleRevocationCode,
} from "@/features/auth/appleRevocation";
import { requestAccountDeletion } from "@/features/auth/deletion";
import { captureIdentity, useAppState } from "@/lib/appState";
import { monitoring } from "@/lib/monitoring";
import { getIdentitySupabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
}));

const session = (providers: string[]) =>
  ({
    user: {
      id: "fs-local-a",
      identities: providers.map((provider) => ({ provider })),
    },
  }) as unknown as Session;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, "OS", "ios");
  await AsyncStorage.clear();
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-a");
});
afterEach(() => jest.restoreAllMocks());

describe("hasAppleIdentity", () => {
  it("is true only when an apple identity is linked", () => {
    expect(hasAppleIdentity(null)).toBe(false);
    expect(hasAppleIdentity(session([]))).toBe(false);
    expect(hasAppleIdentity(session(["google", "email"]))).toBe(false);
    expect(hasAppleIdentity(session(["google", "apple"]))).toBe(true);
  });
});

describe("requestAppleRevocationCode", () => {
  it("returns the fresh authorization code for an Apple-linked account", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValue({ authorizationCode: "c0de.fresh" } as never);
    await expect(
      requestAppleRevocationCode(session(["apple"]), true),
    ).resolves.toBe("c0de.fresh");
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({
      requestedScopes: [],
    });
  });

  it("never shows the Apple sheet without an Apple identity, on Android, or when unavailable", async () => {
    await expect(
      requestAppleRevocationCode(session(["google"]), true),
    ).resolves.toBeNull();
    await expect(
      requestAppleRevocationCode(session(["apple"]), false),
    ).resolves.toBeNull();
    jest.replaceProperty(Platform, "OS", "android");
    await expect(
      requestAppleRevocationCode(session(["apple"]), true),
    ).resolves.toBeNull();
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  it("treats a cancelled sheet as 'skip revocation', and reports other failures", async () => {
    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce({ code: "ERR_REQUEST_CANCELED" });
    await expect(
      requestAppleRevocationCode(session(["apple"]), true),
    ).resolves.toBeNull();
    expect(monitoring.captureError).not.toHaveBeenCalled();

    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockRejectedValueOnce(new Error("Synthetic Apple failure"));
    await expect(
      requestAppleRevocationCode(session(["apple"]), true),
    ).resolves.toBeNull();
    expect(monitoring.captureError).toHaveBeenCalledWith(expect.any(Error), {
      area: "auth.appleRevoke",
    });

    jest
      .mocked(AppleAuthentication.signInAsync)
      .mockResolvedValueOnce({ authorizationCode: null } as never);
    await expect(
      requestAppleRevocationCode(session(["apple"]), true),
    ).resolves.toBeNull();
  });
});

describe("requestAccountDeletion", () => {
  it("forwards the Apple authorization code only when one was obtained", async () => {
    const invoke = jest.fn(async () => ({
      data: { ok: true, deleted_user_id: "fs-local-a" },
      error: null,
    }));
    (getIdentitySupabase as jest.Mock).mockResolvedValue({
      functions: { invoke },
    });
    await requestAccountDeletion(captureIdentity(), {
      appleAuthorizationCode: "c0de.fresh",
    });
    expect(invoke).toHaveBeenLastCalledWith("delete-account", {
      body: {
        receipt: "11111111-1111-4111-8111-111111111111",
        apple_authorization_code: "c0de.fresh",
      },
    });
    await requestAccountDeletion(captureIdentity());
    expect(invoke).toHaveBeenLastCalledWith("delete-account", {
      body: { receipt: "11111111-1111-4111-8111-111111111111" },
    });
  });
});
