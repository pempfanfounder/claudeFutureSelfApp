import { render, act, fireEvent, waitFor } from "@testing-library/react-native";
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

function renderVariant(
  variant: Variant,
  stepIndex = 0,
  answers: Answers = {},
  prefs: Partial<
    ReturnType<typeof useOnboardingStore.getState>["notificationPrefs"]
  > = {},
) {
  act(() => {
    const store = useOnboardingStore.getState();
    store.reset();
    store.setVariant(variant);
    for (const [key, value] of Object.entries(answers)) {
      store.setAnswer(key, value);
    }
    store.setNotificationPrefs(prefs);
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

  it("draws the progress bar on iam-claude questions, not on the welcome or paywall", async () => {
    const welcome = renderVariant("iam-claude", 0);
    expect(welcome.queryByTestId("onboarding-progress")).toBeNull();
    welcome.unmount();

    const nameIndex = indexOfStep("iam-claude", (s) => s.id === "name");
    const name = renderVariant("iam-claude", nameIndex);
    expect(name.getByTestId("onboarding-progress")).toBeTruthy();
    expect(
      name.UNSAFE_getByProps({ accessibilityRole: "progressbar" }),
    ).toBeTruthy();
    name.unmount();

    const paywallIndex = indexOfStep("iam-claude", (s) => s.type === "paywall");
    const paywall = renderVariant("iam-claude", paywallIndex);
    expect(paywall.queryByTestId("onboarding-progress")).toBeNull();
    paywall.unmount();
  });

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
        "Affirmations are short, positive statements you repeat to yourself, until they become how you think.",
      ),
    ).toBeTruthy();
    screen.unmount();
  });

  it("renders the science screen with its citation footnote", async () => {
    const scienceIndex = indexOfStep("iam-claude", (s) => s.id === "science");
    const screen = renderVariant("iam-claude", scienceIndex);
    expect(
      screen.getByText(
        "Research links self-affirmation to greater well-being, less stress and more follow-through on goals.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Cohen & Sherman, Annual Review of Psychology (2014) · Zhang et al., American Psychologist (2025) · Cascio et al., Social Cognitive and Affective Neuroscience (2016)",
      ),
    ).toBeTruthy();
    screen.unmount();
  });

  it("renders the benefits screen with its three bullets", async () => {
    const benefitsIndex = indexOfStep("iam-claude", (s) => s.id === "benefits");
    const screen = renderVariant("iam-claude", benefitsIndex);
    expect(screen.getByText("What a daily practice can do")).toBeTruthy();
    for (const line of [
      "Keep your goals in sight",
      "Soften negative self-talk",
      "Support your mental well-being",
    ]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByText("Got it")).toBeTruthy();
    screen.unmount();
  });

  it("shows the plan as a preview, a day band, count-up tiles and chips", async () => {
    const answers = {
      "raw.streak_goal": "7",
      "raw.daily_minutes": "1",
      quote_interests: ["discipline", "stoic-calm", "focus"],
      affirmation_interests: ["self-belief"],
      future_traits: ["calm", "free"],
      life_goal: "someone who shows up",
    };
    const resultIndex = indexOfStep(
      "iam-claude",
      (s) => s.type === "result",
      answers,
    );
    const screen = renderVariant("iam-claude", resultIndex, answers, {
      quotesPerDay: 4,
      affirmationsPerDay: 2,
      windowStartMinutes: 8 * 60,
      windowEndMinutes: 20 * 60,
    });
    // One serif line in the app's voice; no name in this test context.
    expect(screen.getByText("Here's how your days will go.")).toBeTruthy();
    expect(screen.queryByText("Your daily plan")).toBeNull();
    expect(screen.getByTestId("result-life-goal")).toHaveTextContent(
      "“someone who shows up”",
    );
    // The first quote previews as a notification at the chosen start time.
    expect(screen.getByTestId("mock-notification")).toBeTruthy();
    expect(screen.getByTestId("mock-notification-time")).toHaveTextContent(
      "8:00 AM",
    );
    // The window as a band with the two times under its ends.
    expect(screen.getByTestId("day-band-start")).toHaveTextContent("8:00 AM");
    expect(screen.getByTestId("day-band-end")).toHaveTextContent("8:00 PM");
    // Count-up tiles land on the real numbers (immediately under reduce
    // motion, within a second otherwise).
    await waitFor(() =>
      expect(screen.getByTestId("stat-quotes-value")).toHaveTextContent(/^4$/),
    );
    expect(screen.getByText("quotes")).toBeTruthy();
    expect(screen.getByText("Every day")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("stat-affirmations-value")).toHaveTextContent(
        /^2$/,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("stat-streak-value")).toHaveTextContent(/^7$/),
    );
    expect(screen.getByText("day goal")).toBeTruthy();
    // The streak goal wins the third tile; minutes only stand in for it.
    expect(screen.queryByTestId("stat-minutes")).toBeNull();
    // Chips: two quote leanings, the affirmation focus, then traits; capped
    // at four so they stay on one line, and never the raw slugs.
    const chips = screen.getByTestId("result-chips");
    expect(chips).toHaveTextContent("DisciplineStoic calmSelf-beliefCalm");
    expect(screen.queryByText("Free")).toBeNull();
    expect(screen.queryByText("stoic-calm")).toBeNull();
    expect(screen.queryByText(/\bmix\b/i)).toBeNull();
    // Nothing to swipe any more.
    expect(screen.queryByTestId("result-carousel")).toBeNull();
    expect(screen.queryByTestId("result-dots")).toBeNull();
    screen.unmount();
  });

  it("keeps the plan honest when steps were skipped", async () => {
    const resultIndex = indexOfStep("iam-claude", (s) => s.type === "result");
    const screen = renderVariant("iam-claude", resultIndex);
    expect(screen.getByText("Here's how your days will go.")).toBeTruthy();
    expect(screen.queryByTestId("result-life-goal")).toBeNull();
    // Defaults from the store: 3 / 3 between 9 AM and 9 PM.
    expect(screen.getByTestId("mock-notification-time")).toHaveTextContent(
      "9:00 AM",
    );
    expect(screen.getByTestId("day-band-end")).toHaveTextContent("9:00 PM");
    await waitFor(() =>
      expect(screen.getByTestId("stat-quotes-value")).toHaveTextContent(/^3$/),
    );
    await waitFor(() =>
      expect(screen.getByTestId("stat-affirmations-value")).toHaveTextContent(
        /^3$/,
      ),
    );
    // No streak goal and no minutes were picked: no third tile, no chips.
    expect(screen.queryByTestId("stat-streak")).toBeNull();
    expect(screen.queryByTestId("stat-minutes")).toBeNull();
    expect(screen.queryByTestId("result-chips")).toBeNull();
    expect(screen.queryByText(/\bmix\b/i)).toBeNull();
    screen.unmount();
  });

  it("falls back to the minutes tile when only the time commitment was made", async () => {
    const answers = { "raw.daily_minutes": "10" };
    const resultIndex = indexOfStep(
      "iam-claude",
      (s) => s.type === "result",
      answers,
    );
    const screen = renderVariant("iam-claude", resultIndex, answers);
    await waitFor(() =>
      expect(screen.getByTestId("stat-minutes-value")).toHaveTextContent(
        /^10$/,
      ),
    );
    expect(screen.getByText("minutes")).toBeTruthy();
    expect(screen.queryByTestId("stat-streak")).toBeNull();
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
