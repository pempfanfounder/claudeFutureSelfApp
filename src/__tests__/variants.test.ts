import { resolveText } from "@/features/onboarding/engine/resolve";
import type {
  OnboardingContext,
  OnboardingStep,
} from "@/features/onboarding/engine/types";
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
    expect(Object.keys(VARIANT_CONFIGS).sort()).toEqual(
      [...ONBOARDING_VARIANTS].sort(),
    );
  });

  for (const variant of ONBOARDING_VARIANTS) {
    const config = VARIANT_CONFIGS[variant];

    describe(variant, () => {
      it("has a consistent identity and family", () => {
        expect(config.id).toBe(variant);
        expect(config.family).toBe(
          variant.startsWith("iam") ? "iam" : "stella",
        );
      });

      it("contains exactly one paywall step", () => {
        expect(config.steps.filter((s) => s.type === "paywall")).toHaveLength(
          1,
        );
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
          const authIndex = config.steps.findIndex(
            (s) => s.type === "auth-sheet",
          );
          const paywallIndex = config.steps.findIndex(
            (s) => s.type === "paywall",
          );
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

      it("replaces streak goal choices with a 21-day commitment", () => {
        for (const step of config.steps) {
          if (step.type !== "streak-commit") continue;
          // Education beats + single commitment CTA, no 3/7/21 picker on
          // this screen (iam-claude asks the goal one screen earlier and
          // echoes it through a CTA function).
          expect(step.options).toBeUndefined();
          expect(step.lines).toHaveLength(3);
          expect(step.info).toBeTruthy();
          expect(typeof step.cta === "function" || Boolean(step.cta)).toBe(
            true,
          );
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
        const keys = new Set(
          config.steps.map((s) => s.modelKey).filter(Boolean),
        );
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
            if (
              ["info", "text", "chips", "notifications"].includes(step.type)
            ) {
              expect(step.lines?.length ?? 0).toBeGreaterThan(0);
            }
          }
        }
      });
    });
  }
});

describe("iam-claude conversion refinements", () => {
  const config = VARIANT_CONFIGS["iam-claude"];
  const stepById = (id: string): OnboardingStep => {
    const step = config.steps.find((s) => s.id === id);
    if (!step) throw new Error(`iam-claude has no step "${id}"`);
    return step;
  };
  const dummyCtx: OnboardingContext = {
    name: "Sam",
    answers: {},
    trialLength: "3 days",
    priceLine: null,
    isAnonymous: true,
  };
  const ctxWith = (
    answers: OnboardingContext["answers"],
  ): OnboardingContext => ({
    ...dummyCtx,
    answers,
  });

  it("runs the exact I Am-inspired step order", () => {
    expect(config.steps.map((s) => s.id)).toEqual([
      "welcome",
      "name",
      "age",
      "motivation",
      "gap-interstitial",
      "familiarity",
      "affirmations-intro",
      "habit-helper",
      "repetition",
      "notifications",
      "goals",
      "obstacles",
      "system-interstitial",
      "results-preframe",
      "time-devotion",
      "streak-goal",
      "streak",
      "traits",
      "vision",
      "belief-manifestation",
      "belief-thoughts",
      "belief-rewire",
      "science",
      "benefits",
      "quote-topics",
      "affirmation-topics",
      "practice-mode",
      "theme",
      "life-goal",
      "achieve",
      "result",
      "source",
      "trial-preframe",
      "paywall",
      "widget-lock",
      "widget-home",
    ]);
  });

  it("retires 'mix', 'Running on empty' and 'starting pace' from every user-facing string", () => {
    const strings: string[] = [];
    for (const step of config.steps) {
      strings.push(
        resolveText(step.headline, dummyCtx) ?? "",
        resolveText(step.sub, dummyCtx) ?? "",
        resolveText(step.cta, dummyCtx) ?? "",
        step.info ?? "",
        step.footnote ?? "",
        step.placeholder ?? "",
        step.mockLine ?? "",
        step.secondaryCta ?? "",
        ...(step.bullets ?? []),
        ...(step.options ?? []).map((o) => o.label),
        ...(step.lines ?? []).map((line) =>
          typeof line === "function" ? line(dummyCtx) : line,
        ),
      );
    }
    expect(strings.filter(Boolean).length).toBeGreaterThan(50);
    for (const text of strings) {
      expect(text).not.toMatch(/mix/i);
      expect(text).not.toContain("Running on empty");
      expect(text).not.toContain("starting pace");
    }
  });

  it("shows the affirmations primer only to newcomers", () => {
    const intro = stepById("affirmations-intro");
    expect(intro.type).toBe("info");
    expect(intro.condition).toBeDefined();
    expect(
      intro.condition!(ctxWith({ "raw.affirmation_familiarity": "new" })),
    ).toBe(true);
    for (const other of ["occasionally", "regularly"]) {
      expect(
        intro.condition!(ctxWith({ "raw.affirmation_familiarity": other })),
      ).toBe(false);
    }
    // Skipped familiarity → no primer.
    expect(intro.condition!(ctxWith({}))).toBe(false);
    // The gating answer comes from the step right before it.
    const familiarity = stepById("familiarity");
    expect(familiarity.modelKey).toBe("raw.affirmation_familiarity");
    expect(familiarity.options?.map((o) => o.slug)).toEqual([
      "new",
      "occasionally",
      "regularly",
    ]);
  });

  it("cites real sources on the science screen and lists three benefits", () => {
    const science = stepById("science");
    expect(science.type).toBe("info");
    expect(science.footnote).toMatch(/Cohen & Sherman/);
    expect(science.footnote).toMatch(/Cascio et al\./);
    const benefits = stepById("benefits");
    expect(benefits.type).toBe("info");
    expect(benefits.bullets).toEqual([
      "Focus on achieving your goals",
      "Shift negative thoughts",
      "Improve mental health",
    ]);
    expect(benefits.cta).toBe("Got it");
  });

  it("echoes the chosen streak goal in the commitment CTA (21 when skipped)", () => {
    const streak = stepById("streak");
    expect(streak.type).toBe("streak-commit");
    expect(resolveText(streak.cta, ctxWith({ "raw.streak_goal": "7" }))).toBe(
      "I'm in for 7 days",
    );
    expect(resolveText(streak.cta, ctxWith({}))).toBe("I'm in for 21 days");
    // Both the goal question and the commitment write the same key.
    const goal = stepById("streak-goal");
    expect(goal.type).toBe("single");
    expect(goal.modelKey).toBe("raw.streak_goal");
    expect(streak.modelKey).toBe("raw.streak_goal");
    expect(goal.options?.map((o) => o.slug)).toEqual(["3", "7", "21"]);
  });

  it("stores every new answer under a raw.* key (no schema change)", () => {
    const expected: Record<string, string> = {
      familiarity: "raw.affirmation_familiarity",
      "habit-helper": "raw.habit_helpers",
      "time-devotion": "raw.daily_minutes",
      "streak-goal": "raw.streak_goal",
      vision: "raw.vision",
      "belief-manifestation": "raw.belief_manifestation",
      "belief-thoughts": "raw.belief_thoughts",
      "belief-rewire": "raw.belief_rewire",
      "practice-mode": "raw.practice_modes",
      achieve: "raw.outcome_goals",
    };
    for (const [id, key] of Object.entries(expected)) {
      const step = stepById(id);
      expect(step.modelKey).toBe(key);
      expect(
        MODEL_KEYS.has(step.modelKey!) || step.modelKey!.startsWith("raw."),
      ).toBe(true);
    }
  });

  it("keeps the new questions honest about the app's features", () => {
    // No audio in the app → no "listening" practice mode.
    const practice = stepById("practice-mode");
    for (const option of practice.options ?? []) {
      expect(option.label).not.toMatch(/listen/i);
    }
    // No guided practice in the app → not offered as a habit helper.
    const helper = stepById("habit-helper");
    for (const option of helper.options ?? []) {
      expect(option.label).not.toMatch(/guided/i);
    }
    // The last question before the result carries the trial caption.
    const achieve = stepById("achieve");
    expect(achieve.trialCaption).toBe(true);
    expect(config.steps[config.steps.indexOf(achieve) + 1]?.id).toBe("result");
    // The name personalizes the familiarity headline; falls back cleanly.
    const familiarity = stepById("familiarity");
    expect(resolveText(familiarity.headline, dummyCtx)).toBe(
      "How familiar are you with affirmations, Sam?",
    );
    expect(resolveText(familiarity.headline, { ...dummyCtx, name: null })).toBe(
      "How familiar are you with affirmations?",
    );
  });
});
