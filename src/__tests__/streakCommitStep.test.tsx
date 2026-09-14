import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { Icon } from "@/design-system/components";
import { StreakCommitStep } from "@/features/onboarding/engine/steps/StreakCommitStep";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";

const ctx: OnboardingContext = {
  name: "Sam",
  answers: { "raw.streak_goal": "7" },
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

const STEP: OnboardingStep = {
  id: "streak",
  type: "streak-commit",
  headline: "3 readings a day. That's the whole ask.",
  sub: "Read 3 quotes or affirmations and the day counts.",
  info: "Miss a day and the chain breaks.",
  cta: (c) => `I'm in for ${c.answers["raw.streak_goal"] ?? "21"} days`,
};

test("burns the serif day 1 — numeral burn, not a flame icon ring", () => {
  const screen = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <StreakCommitStep
          step={STEP}
          ctx={ctx}
          onAnswer={() => {}}
          now={new Date(2026, 8, 13, 12, 0, 0)}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId("streak-numeral-burn")).toBeTruthy();
  expect(screen.getByTestId("streak-day-1")).toHaveTextContent("1");
  expect(screen.queryByTestId("streak-flame")).toBeNull();
  expect(screen.queryByTestId("streak-flame-tick")).toBeNull();
  expect(
    screen
      .UNSAFE_getAllByType(Icon)
      .some((node) => node.props.name === "flame"),
  ).toBe(false);
  expect(
    screen.getByText("3 readings a day. That's the whole ask."),
  ).toBeTruthy();
  screen.unmount();
});
