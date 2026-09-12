import React from "react";
import { act, render } from "@testing-library/react-native";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  cancelSignInCaptcha,
  requestSignInCaptchaToken,
  useCaptchaStore,
} from "@/features/auth/captcha";
import {
  buildTurnstileHtml,
  parseWidgetMessage,
} from "@/features/auth/TurnstileHost";
import { resolveAuthCaptcha } from "@/lib/config";
import { useAppState } from "@/lib/appState";
import { getSupabase, getIdentitySupabase } from "@/lib/supabase";

// The real resolver is exercised directly below; the module-level `config`
// is mocked so the provider runs with the captcha ARMED.
jest.mock("@/lib/config", () => ({
  ...jest.requireActual("@/lib/config"),
  config: {
    hasSupabase: true,
    hasGoogleAuth: false,
    emailAuthEnabled: false,
    authCaptchaEnabled: true,
    turnstileSiteKey: "fixture-site-key",
    turnstileBaseUrl: "https://joinfutureself.com",
  },
}));
let webViewProps: any = null;
jest.mock("react-native-webview", () => ({
  WebView: (props: any) => {
    webViewProps = props;
    return null;
  },
}));
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
jest.mock("@/lib/purchases", () => ({
  purchasesNeedRestart: () => false,
  logInPurchases: jest.fn(async () => {}),
  logOutPurchases: jest.fn(async () => {}),
  getIsPremium: jest.fn(async () => false),
  syncEntitlementToServer: jest.fn(async () => {}),
}));
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => false),
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

const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
  });
};
// The host lazy-loads the WebView module; give the import a few ticks.
const untilWidget = async () => {
  for (let i = 0; i < 10 && webViewProps === null; i++) await settle();
};

describe("resolveAuthCaptcha", () => {
  test("stays off by default and when the flag is set without a site key", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveAuthCaptcha({}).enabled).toBe(false);
    expect(resolveAuthCaptcha({ enabled: "false", siteKey: "k" }).enabled).toBe(
      false,
    );
    expect(resolveAuthCaptcha({ enabled: "true" })).toEqual({
      enabled: false,
      siteKey: undefined,
      baseUrl: "https://joinfutureself.com",
    });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
  test("arms only with flag + site key and honours a custom base URL", () => {
    expect(
      resolveAuthCaptcha({
        enabled: "true",
        siteKey: "0x-site",
        baseUrl: "https://example.test",
      }),
    ).toEqual({
      enabled: true,
      siteKey: "0x-site",
      baseUrl: "https://example.test",
    });
  });
});

describe("Turnstile page", () => {
  test("embeds the site key and theme as JSON and posts back to the app", () => {
    const html = buildTurnstileHtml('k"</script>', "dark");
    expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).toContain(
      JSON.stringify({ sitekey: 'k"</script>', theme: "dark", size: "normal" }),
    );
    expect(html).not.toContain('sitekey":"k"</script>');
    expect(html).toContain("ReactNativeWebView.postMessage");
  });
  test("only well-formed widget messages are accepted", () => {
    expect(parseWidgetMessage('{"type":"token","token":"abc"}')).toEqual({
      type: "token",
      token: "abc",
    });
    expect(parseWidgetMessage('{"type":"token","token":""}')).toBeNull();
    expect(parseWidgetMessage('{"type":"error","code":110200}')).toEqual({
      type: "error",
      code: "unknown",
    });
    expect(parseWidgetMessage('{"type":"expired"}')).toEqual({
      type: "expired",
    });
    expect(parseWidgetMessage("not json")).toBeNull();
    expect(parseWidgetMessage('{"type":"other"}')).toBeNull();
  });
});

describe("captcha broker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useCaptchaStore.setState({ request: null });
  });
  afterEach(() => jest.useRealTimers());
  test("one pending challenge at a time; cancel rejects and clears it", async () => {
    const first = requestSignInCaptchaToken();
    expect(useCaptchaStore.getState().request).not.toBeNull();
    await expect(requestSignInCaptchaToken()).rejects.toThrow(
      /already in progress/,
    );
    cancelSignInCaptcha();
    await expect(first).rejects.toThrow(/cancelled/);
    expect(useCaptchaStore.getState().request).toBeNull();
  });
  test("resolves with the widget token", async () => {
    const pending = requestSignInCaptchaToken();
    useCaptchaStore.getState().request!.resolve("tok");
    await expect(pending).resolves.toBe("tok");
    expect(useCaptchaStore.getState().request).toBeNull();
  });
  test("times out instead of hanging the bootstrap", async () => {
    const pending = requestSignInCaptchaToken();
    jest.advanceTimersByTime(120_000);
    await expect(pending).rejects.toThrow(/timed out/);
    expect(useCaptchaStore.getState().request).toBeNull();
  });
});

describe("AuthProvider anonymous sign-in with captcha", () => {
  let client: any;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    webViewProps = null;
    useCaptchaStore.setState({ request: null });
    useAppState.getState().setUserId(null);
    client = {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: null },
          error: null,
        })),
        signInAnonymously: jest.fn(async () => ({
          data: {
            session: {
              user: { id: "fs-local-fresh", is_anonymous: true },
              access_token: "synthetic-token",
            },
          },
          error: null,
        })),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
        signOut: jest.fn(async () => ({ error: null })),
      },
      functions: { invoke: jest.fn() },
    };
    (getSupabase as jest.Mock).mockReturnValue(client);
    (getIdentitySupabase as jest.Mock).mockResolvedValue(client);
  });
  afterEach(() => jest.useRealTimers());

  test("waits for the Turnstile token and forwards it to signInAnonymously", async () => {
    render(<AuthProvider>{null}</AuthProvider>);
    await untilWidget();
    // No guest is created until the widget has answered.
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(webViewProps).not.toBeNull();
    expect(webViewProps.source.baseUrl).toBe("https://joinfutureself.com");
    expect(webViewProps.source.html).toContain("fixture-site-key");
    act(() =>
      webViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: "token", token: "fixture-token" }),
        },
      }),
    );
    await settle();
    await settle();
    expect(client.auth.signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "fixture-token" },
    });
    expect(useAppState.getState().userId).toBe("fs-local-fresh");
    expect(useCaptchaStore.getState().request).toBeNull();
  });

  test("a widget error surfaces as a retryable bootstrap failure", async () => {
    render(<AuthProvider>{null}</AuthProvider>);
    await untilWidget();
    act(() =>
      webViewProps.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: "error", code: "110200" }),
        },
      }),
    );
    await settle();
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(useAppState.getState().identityError).not.toBeNull();
    expect(useCaptchaStore.getState().request).toBeNull();
  });
});
