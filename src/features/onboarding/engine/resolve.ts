import type { OnboardingContext, OnboardingStep } from "./types";

export function resolveText(
  value: string | ((ctx: OnboardingContext) => string) | undefined,
  ctx: OnboardingContext,
): string | undefined {
  if (typeof value === "function") return value(ctx);
  return value;
}

export function resolveLines(step: OnboardingStep, ctx: OnboardingContext): string[] {
  if (!step.lines) return [];
  return step.lines.map((line) => (typeof line === "function" ? line(ctx) : line));
}
