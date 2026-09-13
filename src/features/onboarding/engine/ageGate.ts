import type { OnboardingStep } from "./types";

/** Minimum age from the Terms of Service; the variants set `minAge` to it. */
export const MINIMUM_AGE = 16;

/**
 * True when an answer to an age step says the user is younger than the
 * step's `minAge`: a typed whole number below it, or an option flagged
 * `underAge`. Anything unparseable (letters, empty, a skipped step)
 * does not trigger the gate; the question stays skippable.
 */
export function isUnderMinimumAge(
  step: Pick<OnboardingStep, "type" | "minAge" | "options">,
  value: string | string[] | null,
): boolean {
  if (step.minAge === undefined || value === null) return false;
  if (step.type === "text") {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!/^\d{1,3}$/.test(trimmed)) return false;
    return Number(trimmed) < step.minAge;
  }
  const slugs = Array.isArray(value) ? value : [value];
  return slugs.some(
    (slug) => step.options?.find((o) => o.slug === slug)?.underAge === true,
  );
}

/** Copy of the soft age stop; also asserted by tests and the legal review. */
export const AGE_STOP_COPY = {
  headline: "Future Self is made for people aged 16 and over.",
  sub: "Thanks for your interest. Come back when you're 16. Nothing you entered here has been saved.",
  back: "Go back",
} as const;
