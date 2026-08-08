import { VARIANT_CONFIGS } from "@/features/onboarding/variants";
import { ONBOARDING_VARIANTS } from "@/lib/experiments";

const MODEL_KEYS = new Set([
  "name",
  "gender",
  "motivation_level",
  "primary_goals",
  "obstacles",
  "future_traits",
  "quote_interests",
  "affirmation_interests",
  "life_goal",
]);

describe("onboarding variant configs", () => {
  it("defines all four experiment variants", () => {
    expect(Object.keys(VARIANT_CONFIGS).sort()).toEqual([...ONBOARDING_VARIANTS].sort());
  });

  for (const variant of ONBOARDING_VARIANTS) {
    const config = VARIANT_CONFIGS[variant];

    describe(variant, () => {
      it("has a consistent identity and family", () => {
        expect(config.id).toBe(variant);
        expect(config.family).toBe(variant.startsWith("iam") ? "iam" : "stella");
      });

      it("contains exactly one paywall step", () => {
        expect(config.steps.filter((s) => s.type === "paywall")).toHaveLength(1);
      });

      it("matches its family's paywall placement rules", () => {
        if (config.family === "iam") {
          // I Am: delayed-close timeline paywall, no auth in the funnel.
          expect(config.paywallStyle).toBe("timeline");
          expect(config.paywallCloseDelayMs).not.toBeNull();
          expect(config.steps.some((s) => s.type === "auth-sheet")).toBe(false);
        } else {
          // Stella: hard note paywall, skippable auth sheet before it.
          expect(config.paywallStyle).toBe("note");
          expect(config.paywallCloseDelayMs).toBeNull();
          const authIndex = config.steps.findIndex((s) => s.type === "auth-sheet");
          const paywallIndex = config.steps.findIndex((s) => s.type === "paywall");
          expect(authIndex).toBeGreaterThan(-1);
          expect(authIndex).toBeLessThan(paywallIndex);
        }
      });

      it("has unique step ids", () => {
        const ids = config.steps.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("gives every selectable step options and every text step a placeholder", () => {
        for (const step of config.steps) {
          if (["single", "multi", "chips"].includes(step.type)) {
            expect(step.options?.length ?? 0).toBeGreaterThan(1);
          }
          if (step.type === "text") {
            expect(step.placeholder).toBeTruthy();
            expect(step.maxLength).toBeGreaterThan(0);
          }
        }
      });

      it("uses only known personalization model keys", () => {
        for (const step of config.steps) {
          if (!step.modelKey) continue;
          expect(
            MODEL_KEYS.has(step.modelKey) || step.modelKey.startsWith("raw."),
          ).toBe(true);
        }
      });

      it("collects the core personalization signals", () => {
        const keys = new Set(config.steps.map((s) => s.modelKey).filter(Boolean));
        expect(keys.has("motivation_level")).toBe(true);
        expect(keys.has("future_traits")).toBe(true);
        expect(keys.has("obstacles")).toBe(true);
      });

      it("asks for notification permission inside the funnel", () => {
        expect(config.steps.some((s) => s.type === "notifications")).toBe(true);
      });

      it("presents family-appropriate copy structure", () => {
        for (const step of config.steps) {
          if (config.family === "stella") {
            if (["info", "text", "chips", "notifications"].includes(step.type)) {
              expect(step.lines?.length ?? 0).toBeGreaterThan(0);
            }
          }
        }
      });
    });
  }
});
