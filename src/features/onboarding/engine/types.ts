import type { OnboardingVariant } from "@/lib/experiments";

/** Option in a single/multi/chips step. Slugs go to analytics; labels don't. */
export interface StepOption {
  slug: string;
  label: string;
  emoji?: string;
}

export type StepType =
  | "welcome"
  | "info"
  | "single"
  | "multi"
  | "chips"
  | "text"
  | "notifications"
  | "streak-commit"
  | "app-icon"
  | "theme"
  | "result"
  | "preparing"
  | "paywall"
  | "auth-sheet"
  | "widget-promo";

export interface OnboardingContext {
  name: string | null;
  answers: Record<string, string | string[]>;
  trialLength: string | null;
  priceLine: string | null;
  /** True until the user links an identity (drives post-paywall re-offer). */
  isAnonymous: boolean;
}

export interface OnboardingStep {
  id: string;
  type: StepType;
  /** Headline; functions receive the running context for {name} etc. */
  headline?: string | ((ctx: OnboardingContext) => string);
  sub?: string | ((ctx: OnboardingContext) => string);
  /**
   * Stella-family screens stream these lines one at a time before the
   * input appears. When present, `headline` is unused.
   */
  lines?: (string | ((ctx: OnboardingContext) => string))[];
  /** Small supporting caption under the main content (streak-commit). */
  info?: string;
  /**
   * `info` steps: short benefit lines rendered as an icon-led list under
   * the headline/sub (e.g. the benefits screen).
   */
  bullets?: string[];
  /**
   * `info` steps: small ink3 line under the sub, for a source/citation
   * (e.g. the science screen). Never a marketing claim.
   */
  footnote?: string;
  options?: StepOption[];
  placeholder?: string;
  /** CTA label; functions receive the running context (e.g. "I'm in for {N} days"). */
  cta?: string | ((ctx: OnboardingContext) => string);
  secondaryCta?: string;
  skippable?: boolean;
  minSelect?: number;
  maxSelect?: number;
  multiline?: boolean;
  maxLength?: number;
  keyboard?: "default" | "number-pad";
  /** Auto-advance without input after this many ms (ack screens). */
  autoAdvanceMs?: number;
  /**
   * Where the answer lands in the personalization model. `raw.foo`
   * stores under raw_answers.foo (Supabase only, never analytics).
   */
  modelKey?: string;
  /** Shows the small "Try it free" caption above the CTA (iam family). */
  trialCaption?: boolean;
  /** Sample line shown inside the mock notification (notifications step). */
  mockLine?: string;
  /** Skip the step when it doesn't apply (e.g. no trial configured). */
  condition?: (ctx: OnboardingContext) => boolean;
  /** Stella family: hide the thin top progress bar (finale screens). */
  hideProgress?: boolean;
}

export interface VariantConfig {
  id: OnboardingVariant;
  family: "iam" | "stella";
  steps: OnboardingStep[];
  paywallStyle: "timeline" | "note";
  /** iam: X fades in after this delay; stella: never closable. */
  paywallCloseDelayMs: number | null;
  /** Required Apple / Google / email step immediately before the paywall. */
  authSheetBeforePaywall: boolean;
}
