import type { OnboardingStep, StepType, VariantConfig } from "./types";

/**
 * Trial feature (feedback 2026-09-12): a thin progress bar above every
 * question that animates forward with each answer. Flip a family to
 * `false` to switch it off there without touching the flow.
 */
export const PROGRESS_BAR_FAMILIES: Record<VariantConfig["family"], boolean> = {
  iam: true,
  stella: true,
};

/** Framing, gates and post-purchase screens never carry the bar. */
const UNTRACKED_TYPES: ReadonlySet<StepType> = new Set<StepType>([
  "welcome",
  "preparing",
  "paywall",
  "auth-sheet",
  "result",
  "widget-promo",
]);

export function showsProgress(step: OnboardingStep): boolean {
  return !step.hideProgress && !UNTRACKED_TYPES.has(step.type);
}

/**
 * Progress (0..1) to draw on the step at `stepIndex`, or `null` when that
 * step carries no bar. Counts only the steps that carry a bar, so the
 * first question shows one segment and the last question fills the bar.
 * `steps` is the already condition-filtered sequence the flow renders.
 */
export function onboardingProgress(
  steps: readonly OnboardingStep[],
  stepIndex: number,
): number | null {
  const step = steps[stepIndex];
  if (!step || !showsProgress(step)) return null;
  const tracked = steps.filter(showsProgress);
  return (tracked.indexOf(step) + 1) / tracked.length;
}
