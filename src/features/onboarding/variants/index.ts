import type { OnboardingVariant } from "@/lib/experiments";

import type { VariantConfig } from "../engine/types";
import { iamClaude } from "./iamClaude";
import { iamFounder } from "./iamFounder";
import { stellaClaude } from "./stellaClaude";
import { stellaFounder } from "./stellaFounder";

export const VARIANT_CONFIGS: Record<OnboardingVariant, VariantConfig> = {
  "iam-founder": iamFounder,
  "iam-claude": iamClaude,
  "stella-founder": stellaFounder,
  "stella-claude": stellaClaude,
};

export function getVariantConfig(variant: OnboardingVariant): VariantConfig {
  return VARIANT_CONFIGS[variant];
}
