const mockCapture = jest.fn();

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: jest.fn(),
    screen: jest.fn(),
    reset: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}));

type Analytics = typeof import("@/lib/analytics").analytics;

let analytics: Analytics;

/** Properties actually handed to PostHog for the last capture call. */
function lastProps(): Record<string, unknown> {
  return (mockCapture.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;
}

describe("analytics sanitize", () => {
  beforeAll(() => {
    // `@/lib/config` snapshots process.env at import time, and static
    // imports are hoisted above assignments — so the key has to be set
    // before the module is first required, not before it is imported.
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the env is set
    const mod = require("@/lib/analytics");
    analytics = mod.analytics;
    mod.initAnalytics();
  });

  beforeEach(() => {
    mockCapture.mockClear();
  });

  it("keeps enum-like onboarding answers so the experiment is readable", () => {
    // The A/B test is blind without these: stripping `answer` was the
    // reason `onboarding_answered` carried no option data at all.
    analytics.capture("onboarding_answered", {
      variant: "iam-claude",
      step: "motivation",
      answer: "all-in",
      answered: true,
    });

    expect(lastProps()).toEqual({
      variant: "iam-claude",
      step: "motivation",
      answer: "all-in",
      answered: true,
    });
  });

  it("keeps comma-joined multi-selects and the 55+ band", () => {
    analytics.capture("onboarding_answered", {
      answer: "calm,focus,confidence",
    });
    expect(lastProps().answer).toBe("calm,focus,confidence");

    analytics.capture("onboarding_answered", { answer: "55+" });
    expect(lastProps().answer).toBe("55+");
  });

  it("drops an answer that stopped looking like a slug", () => {
    // Guards a future free-text step whose call site forgets to blank
    // the value: anything with spaces or punctuation fails closed.
    analytics.capture("onboarding_answered", {
      answer: "I want to be a better father to my kids",
    });
    expect(lastProps()).not.toHaveProperty("answer");
  });

  it("still strips genuinely sensitive keys", () => {
    analytics.capture("onboarding_answered", {
      email: "someone@example.com",
      name: "Deniz",
      life_goal: "run a marathon",
      affirmation: "I am enough",
      token: "abc123",
      step: "name",
    });

    expect(lastProps()).toEqual({ step: "name" });
  });

  it("drops overlong strings on otherwise allowed keys", () => {
    analytics.capture("onboarding_answered", { answer: "a".repeat(200) });
    expect(lastProps()).not.toHaveProperty("answer");
  });
});
