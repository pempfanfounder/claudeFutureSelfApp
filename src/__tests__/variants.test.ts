import { resolveText } from "@/features/onboarding/engine/resolve";
import type {
  OnboardingContext,
  OnboardingStep,
  VariantConfig,
} from "@/features/onboarding/engine/types";
import { VARIANT_CONFIGS } from "@/features/onboarding/variants";
import { ONBOARDING_VARIANTS } from "@/lib/experiments";

const CTX: OnboardingContext = {
  name: "Sam",
  answers: {},
  trialLength: "3 days",
  priceLine: null,
  isAnonymous: true,
};

/** Every string a user can read on a variant's screens. */
function userFacingStrings(config: VariantConfig): string[] {
  const strings: string[] = [];
  for (const step of config.steps) {
    strings.push(
      resolveText(step.headline, CTX) ?? "",
      resolveText(step.sub, CTX) ?? "",
      resolveText(step.cta, CTX) ?? "",
      step.info ?? "",
      step.footnote ?? "",
      step.placeholder ?? "",
      step.mockLine ?? "",
      step.secondaryCta ?? "",
      ...(step.bullets ?? []),
      ...(step.options ?? []).map((o) => o.label),
      ...(step.lines ?? []).map((line) =>
        typeof line === "function" ? line(CTX) : line,
      ),
    );
  }
  return strings.filter(Boolean);
}

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

      it("replaces streak goal choices with a single commitment CTA", () => {
        for (const step of config.steps) {
          if (step.type !== "streak-commit") continue;
          // No 3/7/21 picker on this screen (iam-claude asks the goal one
          // screen earlier and echoes it through a CTA function). One
          // headline, one sub, one small supporting line.
          expect(step.options).toBeUndefined();
          expect(step.headline).toBeTruthy();
          expect(step.sub).toBeTruthy();
          expect(step.info).toBeTruthy();
          expect(typeof step.cta === "function" || Boolean(step.cta)).toBe(
            true,
          );
        }
      });

      it("writes no em or en dashes in user-facing copy", () => {
        const strings = userFacingStrings(config);
        expect(strings.length).toBeGreaterThan(30);
        for (const text of strings) {
          expect(text).not.toMatch(/[—–]/);
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

      it("asks for the app icon right before the theme, and only there", () => {
        const themeIndex = config.steps.findIndex((s) => s.type === "theme");
        const iconSteps = config.steps.filter((s) => s.type === "app-icon");
        if (themeIndex === -1) {
          // No theme picker → no icon picker (the pair travels together).
          expect(iconSteps).toHaveLength(0);
          return;
        }
        // I Am screens 33–34: icon picker, then theme picker.
        expect(iconSteps).toHaveLength(1);
        const iconIndex = config.steps.findIndex((s) => s.type === "app-icon");
        expect(iconIndex).toBe(themeIndex - 1);
        const icon = iconSteps[0]!;
        expect(icon.id).toBe("app-icon");
        expect(icon.modelKey).toBe("raw.app_icon");
        expect(icon.trialCaption).toBe(true);
        expect(icon.skippable).toBeFalsy();
        expect(icon.cta).toBe("Continue");
        expect(icon.headline).toBeTruthy();
        expect(icon.sub).toBeTruthy();
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
      "app-icon",
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
    const strings = userFacingStrings(config);
    expect(strings.length).toBeGreaterThan(50);
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
      "Keep your goals in sight",
      "Soften negative self-talk",
      "Support your mental well-being",
    ]);
    expect(benefits.cta).toBe("Got it");
  });

  it("states the science within what the citations support", () => {
    const science = stepById("science");
    const headline = resolveText(science.headline, dummyCtx) ?? "";
    const sub = resolveText(science.sub, dummyCtx) ?? "";
    // "daily" self-affirmation and "most strongly ... future selves" both
    // overstated the papers (docs/ONBOARDING_CLAIMS_AND_IP_REVIEW.md §A).
    expect(headline).not.toMatch(/daily self-affirmation/i);
    expect(headline).not.toMatch(/boosts self-confidence/i);
    expect(sub).not.toMatch(/most strongly/i);
    expect(sub).not.toMatch(/future selves/i);
    // Every claim on the screen is carried by a named citation.
    expect(science.footnote).toMatch(/Cohen & Sherman/);
    expect(science.footnote).toMatch(/Zhang et al\./);
    expect(science.footnote).toMatch(/Cascio et al\./);
    // The clinical-sounding bullet the legal review flagged is gone.
    const benefits = stepById("benefits");
    for (const bullet of benefits.bullets ?? []) {
      expect(bullet).not.toMatch(/improve mental health/i);
    }
  });

  it("carries none of the reference app's verbatim strings", () => {
    // Every string here was word-for-word I Am copy before the
    // 2026-08-21 IP review; the flow may rhyme, the wording may not.
    const borrowed = [
      "Through daily repetition, you can change your beliefs and your mindset.",
      "The benefits of daily personalized affirmations",
      "Focus on achieving your goals",
      "Shift negative thoughts",
      "Improve mental health",
      "Do you have a clear vision of the life you want?",
      "Do you believe in the power of manifestation?",
      "Do you believe your thoughts help shape your reality?",
      "How familiar are you with affirmations?",
      "What would help make affirmations a daily habit?",
      "What goal do you want to start with?",
      "What do you want to achieve with Future Self?",
      "Allow and Save",
    ];
    const strings = userFacingStrings(config);
    for (const phrase of borrowed) {
      expect(strings).not.toContain(phrase);
    }
  });

  it("lets every goal be picked, and says what goals are for", () => {
    const goals = stepById("goals");
    expect(goals.type).toBe("multi");
    expect(goals.maxSelect).toBeUndefined();
    expect(goals.minSelect).toBe(1);
    expect(goals.sub).toBe("They shape your daily quotes and affirmations.");
    expect(goals.options?.length).toBe(7);
    expect(goals.modelKey).toBe("primary_goals");
  });

  it("keeps the streak screen short: no education beats, one small line", () => {
    const streak = stepById("streak");
    expect(streak.lines).toBeUndefined();
    const onScreen = [
      resolveText(streak.headline, dummyCtx) ?? "",
      resolveText(streak.sub, dummyCtx) ?? "",
      streak.info ?? "",
    ];
    // Was 80 words across a headline, sub, three beats and a footnote.
    const words = onScreen.join(" ").trim().split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(32);
  });

  it("frames the practice question around the words, not a person", () => {
    const practice = stepById("practice-mode");
    expect(resolveText(practice.headline, dummyCtx)).toBe(
      "How will you use your quotes and affirmations?",
    );
    // Slugs are analytics: the labels may be reworded, the slugs may not.
    expect(practice.options?.map((o) => o.slug)).toEqual([
      "phone",
      "widget",
      "aloud",
      "journal",
      "post-it",
      "unsure",
    ]);
    expect(practice.options?.[0]?.label).toBe("Reading them in the app");
    for (const option of practice.options ?? []) {
      expect(option.label).not.toMatch(/future self/i);
    }
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
      "Where are you with affirmations, Sam?",
    );
    expect(resolveText(familiarity.headline, { ...dummyCtx, name: null })).toBe(
      "Where are you with affirmations?",
    );
  });
});
