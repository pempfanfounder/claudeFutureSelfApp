import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { serializedStorage } from "./accountStorage";

import { config } from "./config";

/**
 * Onboarding experiment assignment.
 *
 * One PostHog multivariate feature flag (`onboarding-variant`) drives a
 * 2x2 experiment. Assignment rules, in priority order:
 *
 * 1. A previously persisted assignment always wins — users never switch
 *    variants mid-funnel, even across app updates or flag changes.
 * 2. EXPO_PUBLIC_ONBOARDING_VARIANT_OVERRIDE (development/testing).
 * 3. Fresh installations use the founder-selected iam-claude direction.
 * Persisted assignments remain unchanged. Remote flags cannot reroute fresh
 * release installs away from this approved direction.
 */
export const ONBOARDING_VARIANT_FLAG = "onboarding-variant";

export const ONBOARDING_VARIANTS = [
  "iam-founder",
  "iam-claude",
  "stella-founder",
  "stella-claude",
] as const;

export type OnboardingVariant = (typeof ONBOARDING_VARIANTS)[number];

const ASSIGNMENT_KEY = "fs.onboarding-variant.v1";
const ASSIGNMENT_SOURCE_KEY = "fs.onboarding-variant-source.v1";
const INSTALL_ID_KEY = "fs.install-id.v1";

export type VariantSource =
  "persisted" | "override" | "posthog" | "local-fallback" | "selected-default";

export interface VariantAssignment {
  variant: OnboardingVariant;
  source: VariantSource;
}

function isValidVariant(value: unknown): value is OnboardingVariant {
  return (
    typeof value === "string" &&
    (ONBOARDING_VARIANTS as readonly string[]).includes(value)
  );
}

export async function getInstallId(): Promise<string> {
  return serializedStorage(async () => {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(INSTALL_ID_KEY, id);
    return id;
  });
}

export async function getOnboardingVariant(): Promise<VariantAssignment> {
  return serializedStorage(async () => {
    const persisted = await AsyncStorage.getItem(ASSIGNMENT_KEY);
    if (isValidVariant(persisted)) {
      return { variant: persisted, source: "persisted" };
    }

    let assignment: VariantAssignment | null = null;

    if (__DEV__ && config.onboardingVariantOverride) {
      assignment = {
        variant: config.onboardingVariantOverride,
        source: "override",
      };
    }

    if (!assignment)
      assignment = { variant: "iam-claude", source: "selected-default" };

    await AsyncStorage.multiSet([
      [ASSIGNMENT_KEY, assignment.variant],
      [ASSIGNMENT_SOURCE_KEY, assignment.source],
    ]);
    return assignment;
  });
}

/**
 * Deterministic, uniformly distributed variant from the install id.
 * Stable across restarts because the install id is stable.
 */
export function localFallbackVariant(installId: string): OnboardingVariant {
  let hash = 0;
  for (let i = 0; i < installId.length; i++) {
    hash = (hash * 31 + installId.charCodeAt(i)) >>> 0;
  }
  return ONBOARDING_VARIANTS[hash % ONBOARDING_VARIANTS.length]!;
}

/** Clears the persisted assignment (development only). */
export async function devClearVariantAssignment() {
  if (!__DEV__) return;
  await AsyncStorage.multiRemove([ASSIGNMENT_KEY, ASSIGNMENT_SOURCE_KEY]);
}
