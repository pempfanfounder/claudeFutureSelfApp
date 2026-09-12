import {
  onboardingProgress,
  PROGRESS_BAR_FAMILIES,
  showsProgress,
} from "@/features/onboarding/engine/progress";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
import { VARIANT_CONFIGS } from "@/features/onboarding/variants";
import { ONBOARDING_VARIANTS } from "@/lib/experiments";

const CTX: OnboardingContext = {
  name: null,
  answers: {},
  trialLength: null,
  priceLine: null,
  isAnonymous: true,
};

const step = (
  type: OnboardingStep["type"],
  extra: Partial<OnboardingStep> = {},
): OnboardingStep => ({ id: `${type}-${Math.random()}`, type, ...extra });

describe("onboarding progress bar", () => {
  it("is a trial feature with a per-family switch", () => {
    expect(Object.keys(PROGRESS_BAR_FAMILIES).sort()).toEqual([
      "iam",
      "stella",
    ]);
    expect(PROGRESS_BAR_FAMILIES.iam).toBe(true);
  });

  it("skips framing, gates and post-purchase screens", () => {
    for (const type of [
      "welcome",
      "preparing",
      "paywall",
      "auth-sheet",
      "result",
      "widget-promo",
    ] as const) {
      expect(showsProgress(step(type))).toBe(false);
    }
    for (const type of [
      "info",
      "single",
      "multi",
      "chips",
      "text",
      "notifications",
      "streak-commit",
      "app-icon",
      "theme",
    ] as const) {
      expect(showsProgress(step(type))).toBe(true);
    }
    expect(showsProgress(step("info", { hideProgress: true }))).toBe(false);
  });

  it("advances one segment per question and fills on the last one", () => {
    const steps = [
      step("welcome"),
      step("text"),
      step("single"),
      step("info"),
      step("multi"),
      step("result"),
      step("paywall"),
    ];
    expect(onboardingProgress(steps, 0)).toBeNull();
    expect(onboardingProgress(steps, 1)).toBeCloseTo(1 / 4);
    expect(onboardingProgress(steps, 2)).toBeCloseTo(2 / 4);
    expect(onboardingProgress(steps, 3)).toBeCloseTo(3 / 4);
    expect(onboardingProgress(steps, 4)).toBe(1);
    expect(onboardingProgress(steps, 5)).toBeNull();
    expect(onboardingProgress(steps, 6)).toBeNull();
    expect(onboardingProgress(steps, 99)).toBeNull();
  });

  for (const variant of ONBOARDING_VARIANTS) {
    it(`never moves backwards through ${variant}`, () => {
      const steps = VARIANT_CONFIGS[variant].steps.filter(
        (s) => !s.condition || s.condition(CTX),
      );
      let last = 0;
      let seen = 0;
      for (let i = 0; i < steps.length; i++) {
        const value = onboardingProgress(steps, i);
        if (value === null) continue;
        expect(value).toBeGreaterThan(last);
        expect(value).toBeLessThanOrEqual(1);
        last = value;
        seen++;
      }
      expect(seen).toBeGreaterThan(5);
      expect(last).toBe(1);
    });
  }
});
