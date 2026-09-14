import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
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

test("rings the day 1 with upright theme flame icons", () => {
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
  expect(screen.getByTestId("streak-flame-ring")).toBeTruthy();
  expect(screen.queryByTestId("streak-numeral-burn")).toBeNull();
  expect(screen.getByText("1")).toBeTruthy();
  expect(
    screen.getByText("3 readings a day. That's the whole ask."),
  ).toBeTruthy();
  const ticks = screen.getAllByTestId("streak-flame-tick");
  expect(ticks).toHaveLength(8);
  for (const tick of ticks) {
    const style = StyleSheet.flatten(tick.props.style) as {
      transform?: Array<Record<string, unknown>>;
    };
    expect((style.transform ?? []).some((t) => "rotate" in t)).toBe(false);
  }
  screen.unmount();
});
