import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { APP_ICON_IDS } from "@/design-system/appIcons";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { THEMES } from "@/design-system/themes";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { OnboardingFlow } from "@/features/onboarding/engine/OnboardingFlow";
import { useOnboardingStore } from "@/features/onboarding/engine/store";
import {
  APPLY_DEBOUNCE_MS,
  AppIconStep,
} from "@/features/onboarding/engine/steps/AppIconStep";

import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
import { VARIANT_CONFIGS } from "@/features/onboarding/variants";

// A device that supports alternate icons, with the primary icon active.
const mockSetAlternateAppIcon = jest.fn(async (name: string | null) => name);
const mockGetAppIconName = jest.fn<string | null, []>(() => null);
let mockSupports = true;
jest.mock("expo-alternate-app-icons", () => ({
  get supportsAlternateIcons() {
    return mockSupports;
  },
  setAlternateAppIcon: (name: string | null) => mockSetAlternateAppIcon(name),
  getAppIconName: () => mockGetAppIconName(),
  resetAppIcon: () => mockSetAlternateAppIcon(null),
}));

beforeEach(() => {
  mockSupports = true;
  mockSetAlternateAppIcon.mockClear();
  mockGetAppIconName.mockReset();
  mockGetAppIconName.mockReturnValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

/** Lets the debounce fire and the async apply settle. */
async function settleApply() {
  await act(async () => {
    jest.advanceTimersByTime(APPLY_DEBOUNCE_MS + 1);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The flow-level cases below mount OnboardingFlow, which pulls in the
// purchase/notification/auth surfaces; mock their native edges the same
// way onboardingFlow.test.tsx does.
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

const ctx: OnboardingContext = {
  name: null,
  answers: {},
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

const STEP: OnboardingStep = {
  id: "app-icon",
  type: "app-icon",
  headline: "Pick the icon you want to see every day.",
  sub: "This becomes Future Self's icon on your Home Screen. Change it anytime.",
  trialCaption: true,
  cta: "Continue",
  modelKey: "raw.app_icon",
};

function renderStep(step: OnboardingStep = STEP) {
  const onAnswer = jest.fn();
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <AppIconStep step={step} ctx={ctx} onAnswer={onAnswer} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { screen, onAnswer };
}

function ringColor(node: { props: Record<string, unknown> }): string {
  const style = StyleSheet.flatten(
    node.props.style as Parameters<typeof StyleSheet.flatten>[0],
  ) as { borderColor?: string };
  return style.borderColor ?? "";
}

describe("AppIconStep", () => {
  it("renders the copy, the trial caption and one tile per theme", () => {
    const { screen } = renderStep();
    expect(
      screen.getByText("Pick the icon you want to see every day."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This becomes Future Self's icon on your Home Screen. Change it anytime.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Try everything free")).toBeTruthy();
    for (const id of APP_ICON_IDS) {
      expect(screen.getByTestId(`app-icon-${id}`)).toBeTruthy();
    }
    expect(screen.queryByText("Skip")).toBeNull();
    screen.unmount();
  });

  it("pre-selects the first tile (Minimal Sand) and continues with it", () => {
    const { screen, onAnswer } = renderStep();
    const first = screen.getByTestId("app-icon-minimal_sand");
    const other = screen.getByTestId("app-icon-midnight_focus");
    // Selected tile carries the ink ring; the rest are ringless.
    expect(ringColor(first)).toBe(THEMES[0]!.ink);
    expect(ringColor(other)).toBe("transparent");

    fireEvent.press(screen.getByTestId("continue"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("minimal_sand");
    screen.unmount();
  });

  it("moves the ring to the tapped tile and reports that id on Continue", () => {
    const { screen, onAnswer } = renderStep();
    fireEvent.press(screen.getByTestId("app-icon-midnight_focus"));
    expect(ringColor(screen.getByTestId("app-icon-midnight_focus"))).toBe(
      THEMES[0]!.ink,
    );
    expect(ringColor(screen.getByTestId("app-icon-minimal_sand"))).toBe(
      "transparent",
    );
    // Only Continue records the choice; tapping applies the icon but
    // never advances.
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("continue"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("midnight_focus");
    screen.unmount();
  });

  it("applies the tapped icon after the debounce, last tap wins", async () => {
    jest.useFakeTimers();
    const { screen } = renderStep();
    fireEvent.press(screen.getByTestId("app-icon-midnight_focus"));
    fireEvent.press(screen.getByTestId("app-icon-arctic"));
    fireEvent.press(screen.getByTestId("app-icon-evergreen"));
    // Nothing yet: rapid taps are collapsed.
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();

    await settleApply();
    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(1);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("Evergreen");
    expect(screen.queryByTestId("app-icon-failed")).toBeNull();
    screen.unmount();
  });

  it("resets to the primary icon when Minimal Sand is picked after another icon", async () => {
    jest.useFakeTimers();
    mockGetAppIconName.mockReturnValue("Arctic");
    const { screen } = renderStep();
    fireEvent.press(screen.getByTestId("app-icon-minimal_sand"));
    await settleApply();
    // Not a no-op and not "MinimalSand" by name: the primary icon is reset.
    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(1);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith(null);
    screen.unmount();
  });

  it("Continue flushes a pending apply instead of letting it die with the step", () => {
    jest.useFakeTimers();
    const { screen, onAnswer } = renderStep();
    fireEvent.press(screen.getByTestId("app-icon-ocean_clarity"));
    expect(mockSetAlternateAppIcon).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("continue"));
    // Applied synchronously up to the native call; no debounce wait.
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith("OceanClarity");
    expect(onAnswer).toHaveBeenCalledWith("ocean_clarity");
    screen.unmount();
  });

  it("shows a hint when the icon could not be changed, and clears it on the next tap", async () => {
    jest.useFakeTimers();
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    mockSetAlternateAppIcon.mockRejectedValueOnce(new Error("busy"));
    const { screen } = renderStep();

    fireEvent.press(screen.getByTestId("app-icon-terracotta"));
    await settleApply();
    expect(screen.getByTestId("app-icon-failed")).toHaveTextContent(
      "Couldn't change the icon. You can try again from Themes later.",
    );
    expect(consoleWarn).toHaveBeenCalled();

    // The next tap retries and, on success, the hint goes away.
    fireEvent.press(screen.getByTestId("app-icon-golden_success"));
    expect(screen.queryByTestId("app-icon-failed")).toBeNull();
    await settleApply();
    expect(mockSetAlternateAppIcon).toHaveBeenLastCalledWith("GoldenSuccess");
    expect(screen.queryByTestId("app-icon-failed")).toBeNull();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
    screen.unmount();
  });

  it("falls back to 'Continue' when the step has no CTA copy", () => {
    const { screen } = renderStep({ ...STEP, cta: undefined });
    expect(screen.getByText("Continue")).toBeTruthy();
    screen.unmount();
  });
});

describe("OnboardingFlow app-icon step", () => {
  function renderFlowAt(variant: "iam-claude" | "iam-founder") {
    const steps = VARIANT_CONFIGS[variant].steps.filter(
      (s) => !s.condition || s.condition(ctx),
    );
    const iconIndex = steps.findIndex((s) => s.type === "app-icon");
    expect(iconIndex).toBeGreaterThan(-1);
    act(() => {
      const store = useOnboardingStore.getState();
      store.reset();
      store.setVariant(variant);
      store.setStepIndex(iconIndex);
    });
    const screen = render(
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
    return { screen, iconIndex, steps };
  }

  it.each(["iam-claude", "iam-founder"] as const)(
    "%s records raw.app_icon on Continue and moves on to the theme step",
    (variant) => {
      const { screen, iconIndex, steps } = renderFlowAt(variant);
      expect(screen.getByTestId("app-icon-minimal_sand")).toBeTruthy();

      fireEvent.press(screen.getByTestId("app-icon-evergreen"));
      // Selecting applies the icon (debounced) but records nothing yet.
      expect(
        useOnboardingStore.getState().answers["raw.app_icon"],
      ).toBeUndefined();

      fireEvent.press(screen.getByTestId("continue"));
      const state = useOnboardingStore.getState();
      expect(state.answers["raw.app_icon"]).toBe("evergreen");
      expect(state.stepIndex).toBe(iconIndex + 1);
      expect(steps[iconIndex + 1]?.type).toBe("theme");
      screen.unmount();
    },
  );
});
