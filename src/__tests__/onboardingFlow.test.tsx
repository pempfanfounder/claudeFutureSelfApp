import { render, act, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ONBOARDING_VARIANTS } from "@/lib/experiments";

import { OnboardingFlow } from "@/features/onboarding/engine/OnboardingFlow";
import { useOnboardingStore } from "@/features/onboarding/engine/store";
import { VARIANT_CONFIGS } from "@/features/onboarding/variants";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ current: null }),
    getCustomerInfo: jest
      .fn()
      .mockResolvedValue({ entitlements: { active: {} } }),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { ANNUAL: "ANNUAL", MONTHLY: "MONTHLY", WEEKLY: "WEEKLY" },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false, canAskAgain: true }),
  requestPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true, canAskAgain: false }),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  Redirect: () => null,
}));

function renderVariant(
  variant: (typeof ONBOARDING_VARIANTS)[number],
  stepIndex = 0,
) {
  act(() => {
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setVariant(variant);
    useOnboardingStore.getState().setStepIndex(stepIndex);
  });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <OnboardingFlow />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe("OnboardingFlow smoke render", () => {
  for (const variant of ONBOARDING_VARIANTS) {
    it(`renders the ${variant} welcome step`, async () => {
      const screen = renderVariant(variant, 0);
      expect(screen.toJSON()).toBeTruthy();
      screen.unmount();
    });

    it(`renders every non-terminal ${variant} step without crashing`, async () => {
      const config = VARIANT_CONFIGS[variant];
      // Paywall/auth/preparing steps touch native purchase/auth flows;
      // the paywall cases render separately below.
      const renderableTypes = new Set([
        "welcome",
        "info",
        "single",
        "multi",
        "chips",
        "text",
        "notifications",
        "streak-commit",
        "theme",
        "result",
        "widget-promo",
      ]);
      for (let index = 0; index < config.steps.length; index++) {
        const step = config.steps[index]!;
        if (!renderableTypes.has(step.type)) continue;
        const screen = renderVariant(variant, index);
        expect(screen.toJSON()).toBeTruthy();
        screen.unmount();
      }
    });
  }

  it("commits to 21 days from the streak step CTA", async () => {
    const config = VARIANT_CONFIGS["iam-claude"];
    const streakIndex = config.steps.findIndex(
      (s) => s.type === "streak-commit",
    );
    expect(streakIndex).toBeGreaterThan(-1);
    const screen = renderVariant("iam-claude", streakIndex);
    fireEvent.press(screen.getByTestId("continue"));
    expect(useOnboardingStore.getState().answers["raw.streak_goal"]).toBe("21");
    screen.unmount();
  });

  it("renders the timeline paywall step for iam-claude", async () => {
    const config = VARIANT_CONFIGS["iam-claude"];
    const paywallIndex = config.steps.findIndex((s) => s.type === "paywall");
    const screen = renderVariant("iam-claude", paywallIndex);
    expect(screen.toJSON()).toBeTruthy();
    screen.unmount();
  });

  it("renders the note paywall step for stella-founder", async () => {
    const config = VARIANT_CONFIGS["stella-founder"];
    const paywallIndex = config.steps.findIndex((s) => s.type === "paywall");
    const screen = renderVariant("stella-founder", paywallIndex);
    expect(screen.toJSON()).toBeTruthy();
    screen.unmount();
  });
});
