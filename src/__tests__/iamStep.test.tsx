import { fireEvent, render } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { radii } from "@/design-system/tokens";
import { IamStep } from "@/features/onboarding/engine/steps/IamStep";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
import { LEGAL_URLS } from "@/lib/legal";

const ctx: OnboardingContext = {
  name: null,
  answers: {},
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

const WELCOME: OnboardingStep = {
  id: "welcome",
  type: "welcome",
  headline: "Become the person you keep promising yourself.",
  sub: "Small daily pushes.",
  cta: "Begin",
};

const NAME: OnboardingStep = {
  id: "name",
  type: "text",
  headline: "What should we call you?",
  placeholder: "Your name",
  cta: "Continue",
  maxLength: 40,
  modelKey: "name",
};

const LIFE_GOAL: OnboardingStep = {
  id: "life-goal",
  type: "text",
  headline: "A year from now, I want to be…",
  placeholder: "…someone who shows up",
  multiline: true,
  maxLength: 280,
  cta: "Save it",
  modelKey: "life_goal",
};

const BENEFITS: OnboardingStep = {
  id: "benefits",
  type: "info",
  headline: "Daily personalized quotes and affirmations help you:",
  bullets: [
    "Focus on achieving your goals",
    "Shift negative thoughts",
    "Improve your mental health",
  ],
  footnote: "Self-affirmation research: Cohen & Sherman (2014).",
  cta: "Continue",
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

describe("IamStep welcome", () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest
      .spyOn(Linking, "openURL")
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  it("opens the Terms and Privacy Policy links", () => {
    const { screen } = renderStep(WELCOME);
    // One sentence, nested spans: reads as a whole (spaces intact).
    expect(
      screen.getByText(
        "By continuing you agree to our Terms and Privacy Policy",
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("legal-terms"));
    expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.terms);

    fireEvent.press(screen.getByTestId("legal-privacy"));
    expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.privacy);

    expect(screen.getByTestId("legal-terms").props.accessibilityRole).toBe(
      "link",
    );
    expect(screen.getByTestId("legal-privacy").props.accessibilityRole).toBe(
      "link",
    );
    screen.unmount();
  });

  it("styles the logo as an app-icon tile (hairline border, xl radius)", () => {
    const { screen } = renderStep(WELCOME);
    const tile = screen.getByTestId("welcome-logo");
    const style = StyleSheet.flatten(tile.props.style) as {
      borderWidth?: number;
      borderRadius?: number;
      width?: number;
      height?: number;
      shadowOpacity?: number;
    };
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderRadius).toBe(radii.xl);
    expect(style.width).toBe(96);
    expect(style.height).toBe(96);
    expect(style.shadowOpacity).toBeGreaterThan(0);
    screen.unmount();
  });
});

describe("IamStep text input", () => {
  it("enforces maxLength without a visible character counter", () => {
    const { screen } = renderStep(LIFE_GOAL);
    const input = screen.getByTestId("text-input");
    expect(input.props.maxLength).toBe(280);
    expect(input.props.multiline).toBe(true);
    // Multiline keeps return = newline: no keyboard submit path.
    expect(input.props.onSubmitEditing).toBeUndefined();

    fireEvent.changeText(input, "someone who shows up");
    expect(screen.queryByText(/\/280/)).toBeNull();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
    screen.unmount();
  });

  it("submits the trimmed single-line value from the return key", () => {
    const { screen, onAnswer } = renderStep(NAME);
    const input = screen.getByTestId("text-input");
    expect(input.props.returnKeyType).toBe("done");

    fireEvent.changeText(input, "  Zed ");
    fireEvent(input, "submitEditing");
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("Zed");
    screen.unmount();
  });

  it("ignores the return key while the field is empty", () => {
    const { screen, onAnswer } = renderStep(NAME);
    const input = screen.getByTestId("text-input");

    fireEvent(input, "submitEditing");
    fireEvent.changeText(input, "   ");
    fireEvent(input, "submitEditing");
    expect(onAnswer).not.toHaveBeenCalled();
    screen.unmount();
  });

  it("keeps Continue disabled until something is typed", () => {
    const { screen, onAnswer } = renderStep(NAME);
    const button = screen.getByTestId("continue");
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId("text-input"), "Zed");
    expect(
      screen.getByTestId("continue").props.accessibilityState.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId("continue"));
    expect(onAnswer).toHaveBeenCalledWith("Zed");
    screen.unmount();
  });
});

describe("IamStep info", () => {
  it("renders bullets and the footnote", () => {
    const { screen } = renderStep(BENEFITS);
    for (const line of BENEFITS.bullets!) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByText(BENEFITS.footnote!)).toBeTruthy();
    expect(
      screen.getByTestId("continue").props.accessibilityState.disabled,
    ).toBe(false);
    screen.unmount();
  });

  it("renders a plain info step without bullets or footnote", () => {
    const { screen, onAnswer } = renderStep({
      id: "gap",
      type: "info",
      headline: "The person you'll be in five years is built today.",
      cta: "Continue",
    });
    expect(screen.queryByText(/Cohen/)).toBeNull();
    fireEvent.press(screen.getByTestId("continue"));
    expect(onAnswer).toHaveBeenCalledWith(null);
    screen.unmount();
  });
});
