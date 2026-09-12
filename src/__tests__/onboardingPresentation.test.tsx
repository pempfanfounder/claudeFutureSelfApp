jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: {
    ANNUAL: "ANNUAL",
    MONTHLY: "MONTHLY",
    WEEKLY: "WEEKLY",
    LIFETIME: "LIFETIME",
  },
}));

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppText, Button } from "@/design-system/components";
import { resolveOptionIcon } from "@/design-system/optionIcon";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { IamStep } from "@/features/onboarding/engine/steps/IamStep";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
import { previewStorePackage } from "@/features/paywall/useOffering";

const ctx: OnboardingContext = {
  name: null,
  answers: {},
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

function renderStep(step: OnboardingStep) {
  const onAnswer = jest.fn();
  const onSkip = jest.fn();
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <IamStep step={step} ctx={ctx} onAnswer={onAnswer} onSkip={onSkip} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { screen, onAnswer, onSkip };
}

const MOTIVATION: OnboardingStep = {
  id: "motivation",
  type: "single",
  headline: "Where's your motivation right now?",
  options: [
    { slug: "all-in", label: "Ready to change everything", emoji: "🔥" },
    { slug: "empty", label: "Not motivated right now", emoji: "🌫️" },
  ],
  modelKey: "motivation_level",
};

describe("onboarding presentation", () => {
  it("does not show a Continue button on tap-to-advance questions", async () => {
    const { screen, onAnswer } = renderStep(MOTIVATION);
    expect(screen.queryByTestId("continue")).toBeNull();
    fireEvent.press(screen.getByTestId("option-all-in"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("all-in"));
    screen.unmount();
  });

  it("renders choice glyphs as SF symbols instead of color emoji", () => {
    const { screen } = renderStep(MOTIVATION);
    expect(screen.queryByText("🔥")).toBeNull();
    expect(screen.queryByText("🌫️")).toBeNull();
    expect(screen.getByTestId("option-all-in-icon")).toBeTruthy();
    expect(screen.getByTestId("option-empty-icon")).toBeTruthy();
    screen.unmount();
  });

  it("maps onboarding emoji including variation selectors", () => {
    expect(resolveOptionIcon("🔥")).toBe("flame");
    expect(resolveOptionIcon("🌫️")).toBe("fog");
    expect(resolveOptionIcon("❤️")).toBe("heartFill");
  });

  it("keeps a brown primary CTA on screens that need a button", () => {
    const screen = render(
      <ThemeProvider>
        <Button label="Begin" onPress={() => {}} testID="continue" />
      </ThemeProvider>,
    );
    const button = screen.getByTestId("continue");
    expect(typeof button.props.style).not.toBe("function");
    const style = StyleSheet.flatten(button.props.style) as {
      backgroundColor?: string;
    };
    expect(style.backgroundColor).toBe("#2A1E16");
    screen.unmount();
  });

  it("does not force brand fonts onto emoji-only AppText", () => {
    const screen = render(
      <ThemeProvider>
        <AppText>🔓</AppText>
      </ThemeProvider>,
    );
    const node = screen.getByText("🔓");
    const style = StyleSheet.flatten(node.props.style) as {
      fontFamily?: string;
    };
    expect(style.fontFamily).toBeUndefined();
    screen.unmount();
  });
});

describe("previewStorePackage", () => {
  it("builds an annual package the paywall can purchase in mock mode", () => {
    const pkg = previewStorePackage("annual");
    expect(pkg.packageType).toBe("ANNUAL");
    expect(pkg.product.priceString).toBe("$59.99");
    expect(pkg.product.introPrice?.periodUnit).toBe("DAY");
    expect(pkg.product.introPrice?.periodNumberOfUnits).toBe(3);
  });
});
