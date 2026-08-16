import { render, act, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ONBOARDING_VARIANTS } from "@/lib/experiments";

import { OnboardingFlow } from "@/features/onboarding/engine/OnboardingFlow";
import { useOnboardingStore } from "@/features/onboarding/engine/store";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
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

type Variant = (typeof ONBOARDING_VARIANTS)[number];
type Answers = OnboardingContext["answers"];

/**
 * The steps OnboardingFlow actually renders for the test context: no
 * name, no trial (offering never loads here) and the given answers —
 * mirrors the flow's `condition` filter so step indexes line up.
 */
function visibleSteps(variant: Variant, answers: Answers = {}) {
  const ctx: OnboardingContext = {
    name: null,
    answers,
    trialLength: null,
    priceLine: null,
    isAnonymous: true,
  };
  return VARIANT_CONFIGS[variant].steps.filter(
    (s) => !s.condition || s.condition(ctx),
  );
}

function indexOfStep(
  variant: Variant,
  predicate: (step: OnboardingStep) => boolean,
  answers: Answers = {},
): number {
  const index = visibleSteps(variant, answers).findIndex(predicate);
  expect(index).toBeGreaterThan(-1);
  return index;
}

function renderVariant(variant: Variant, stepIndex = 0, answers: Answers = {}) {
  act(() => {
    const store = useOnboardingStore.getState();
    store.reset();
    store.setVariant(variant);
    for (const [key, value] of Object.entries(answers)) {
      store.setAnswer(key, value);
    }
    store.setStepIndex(stepIndex);
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
      const steps = visibleSteps(variant);
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        if (!renderableTypes.has(step.type)) continue;
        const screen = renderVariant(variant, index);
        expect(screen.toJSON()).toBeTruthy();
        screen.unmount();
      }
    });
  }

  it("commits to 21 days from the streak step CTA when no goal was picked", async () => {
    const streakIndex = indexOfStep(
      "iam-claude",
      (s) => s.type === "streak-commit",
    );
    const screen = renderVariant("iam-claude", streakIndex);
    expect(screen.getByText("I'm in for 21 days")).toBeTruthy();
    fireEvent.press(screen.getByTestId("continue"));
    expect(useOnboardingStore.getState().answers["raw.streak_goal"]).toBe("21");
    screen.unmount();
  });

  it("echoes the chosen streak goal in the CTA and stores it on commit", async () => {
    const answers = { "raw.streak_goal": "7" };
    const streakIndex = indexOfStep(
      "iam-claude",
      (s) => s.type === "streak-commit",
      answers,
    );
    const screen = renderVariant("iam-claude", streakIndex, answers);
    expect(screen.getByText("I'm in for 7 days")).toBeTruthy();
    expect(screen.queryByText("I'm in for 21 days")).toBeNull();
    fireEvent.press(screen.getByTestId("continue"));
    expect(useOnboardingStore.getState().answers["raw.streak_goal"]).toBe("7");
    screen.unmount();
  });

  it("shows the affirmations primer only after answering 'new' to familiarity", async () => {
    const withPrimer = visibleSteps("iam-claude", {
      "raw.affirmation_familiarity": "new",
    });
    const withoutPrimer = visibleSteps("iam-claude", {
      "raw.affirmation_familiarity": "regularly",
    });
    expect(withPrimer.map((s) => s.id)).toContain("affirmations-intro");
    expect(withoutPrimer.map((s) => s.id)).not.toContain("affirmations-intro");
    // Both sequences keep habit-helper right after the familiarity beat(s).
    const familiarityIndex = withPrimer.findIndex(
      (s) => s.id === "familiarity",
    );
    expect(withPrimer[familiarityIndex + 1]?.id).toBe("affirmations-intro");
    expect(withPrimer[familiarityIndex + 2]?.id).toBe("habit-helper");
    expect(withoutPrimer[familiarityIndex + 1]?.id).toBe("habit-helper");

    const answers = { "raw.affirmation_familiarity": "new" };
    const introIndex = indexOfStep(
      "iam-claude",
      (s) => s.id === "affirmations-intro",
      answers,
    );
    const screen = renderVariant("iam-claude", introIndex, answers);
    expect(
      screen.getByText(
        "Affirmations are short, positive statements you repeat to yourself — until they become how you think.",
      ),
    ).toBeTruthy();
    screen.unmount();
  });

  it("renders the science screen with its citation footnote", async () => {
    const scienceIndex = indexOfStep("iam-claude", (s) => s.id === "science");
    const screen = renderVariant("iam-claude", scienceIndex);
    expect(
      screen.getByText(
        "Studies show daily self-affirmation boosts self-confidence, resilience and overall well-being.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Cohen & Sherman, Annual Review of Psychology (2014) · Cascio et al., Social Cognitive and Affective Neuroscience (2016)",
      ),
    ).toBeTruthy();
    screen.unmount();
  });

  it("renders the benefits screen with its three bullets", async () => {
    const benefitsIndex = indexOfStep("iam-claude", (s) => s.id === "benefits");
    const screen = renderVariant("iam-claude", benefitsIndex);
    expect(
      screen.getByText("The benefits of daily personalized affirmations"),
    ).toBeTruthy();
    for (const line of [
      "Focus on achieving your goals",
      "Shift negative thoughts",
      "Improve mental health",
    ]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByText("Got it")).toBeTruthy();
    screen.unmount();
  });

  it("mirrors the funnel's commitments on the result screen without 'mix'", async () => {
    const answers = {
      "raw.streak_goal": "7",
      "raw.daily_minutes": "1",
      "raw.practice_modes": ["phone", "aloud", "unsure"],
      motivation_level: "all-in",
    };
    const resultIndex = indexOfStep(
      "iam-claude",
      (s) => s.type === "result",
      answers,
    );
    const screen = renderVariant("iam-claude", resultIndex, answers);
    expect(
      screen.getByText("Your daily quotes and affirmations are ready."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "You brought the drive. Your daily quotes bring the rhythm.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("First goal: 7 days in a row.")).toBeTruthy();
    expect(screen.getByText("About 1 minute a day.")).toBeTruthy();
    expect(
      screen.getByText(
        "You'll practice by reading them on your phone and saying them out loud.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/\bmix\b/i)).toBeNull();
    screen.unmount();
  });

  it("adds no commitment rows to the result screen when those steps were skipped", async () => {
    const resultIndex = indexOfStep("iam-claude", (s) => s.type === "result");
    const screen = renderVariant("iam-claude", resultIndex);
    expect(screen.queryByText(/First goal:/)).toBeNull();
    expect(screen.queryByText(/a day\.$/)).toBeNull();
    expect(screen.queryByText(/You'll practice by/)).toBeNull();
    expect(screen.queryByText(/\bmix\b/i)).toBeNull();
    screen.unmount();
  });

  it("renders the timeline paywall step for iam-claude", async () => {
    const paywallIndex = indexOfStep("iam-claude", (s) => s.type === "paywall");
    const screen = renderVariant("iam-claude", paywallIndex);
    expect(screen.toJSON()).toBeTruthy();
    screen.unmount();
  });

  it("renders the note paywall step for stella-founder", async () => {
    const paywallIndex = indexOfStep(
      "stella-founder",
      (s) => s.type === "paywall",
    );
    const screen = renderVariant("stella-founder", paywallIndex);
    expect(screen.toJSON()).toBeTruthy();
    screen.unmount();
  });
});
