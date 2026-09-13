import {
  AGE_STOP_COPY,
  isUnderMinimumAge,
  MINIMUM_AGE,
} from "@/features/onboarding/engine/ageGate";
import type { OnboardingStep } from "@/features/onboarding/engine/types";
import { VARIANT_CONFIGS } from "@/features/onboarding/variants";

const typed: Pick<OnboardingStep, "type" | "minAge"> = {
  type: "text",
  minAge: 16,
};
const band: Pick<OnboardingStep, "type" | "minAge" | "options"> = {
  type: "single",
  minAge: 16,
  options: [
    { slug: "u16", label: "Under 16", underAge: true },
    { slug: "16-17", label: "16 to 17" },
  ],
};

describe("isUnderMinimumAge", () => {
  it("stops a typed age below the minimum and lets 16+ through", () => {
    expect(isUnderMinimumAge(typed, "12")).toBe(true);
    expect(isUnderMinimumAge(typed, " 15 ")).toBe(true);
    expect(isUnderMinimumAge(typed, "0")).toBe(true);
    expect(isUnderMinimumAge(typed, "16")).toBe(false);
    expect(isUnderMinimumAge(typed, "28")).toBe(false);
  });

  it("does not gate unparseable or skipped answers", () => {
    expect(isUnderMinimumAge(typed, "")).toBe(false);
    expect(isUnderMinimumAge(typed, "twelve")).toBe(false);
    expect(isUnderMinimumAge(typed, "1e1")).toBe(false);
    expect(isUnderMinimumAge(typed, null)).toBe(false);
    expect(isUnderMinimumAge({ type: "text" }, "12")).toBe(false);
  });

  it("stops only the option flagged underAge on a band step", () => {
    expect(isUnderMinimumAge(band, "u16")).toBe(true);
    expect(isUnderMinimumAge(band, ["u16"])).toBe(true);
    expect(isUnderMinimumAge(band, "16-17")).toBe(false);
    expect(isUnderMinimumAge(band, null)).toBe(false);
  });
});

describe("age questions match the Terms (16+)", () => {
  it("iam-claude offers 16 to 17 instead of Under 18 and gates Under 16", () => {
    const age = VARIANT_CONFIGS["iam-claude"].steps.find((s) => s.id === "age");
    expect(age?.minAge).toBe(MINIMUM_AGE);
    expect(age?.skippable).toBe(true);
    const labels = age?.options?.map((o) => o.label) ?? [];
    expect(labels).not.toContain("Under 18");
    expect(labels).toContain("16 to 17");
    const under = age?.options?.filter((o) => o.underAge) ?? [];
    expect(under.map((o) => o.label)).toEqual(["Under 16"]);
  });

  it("stella-claude gates the typed age", () => {
    const age = VARIANT_CONFIGS["stella-claude"].steps.find(
      (s) => s.id === "age",
    );
    expect(age?.type).toBe("text");
    expect(age?.minAge).toBe(MINIMUM_AGE);
    expect(age?.skippable).toBe(true);
  });

  it("uses friendly copy without dashes and names the age", () => {
    for (const text of Object.values(AGE_STOP_COPY)) {
      expect(text).not.toMatch(/[—–]/);
    }
    expect(AGE_STOP_COPY.headline).toContain("16");
  });
});
