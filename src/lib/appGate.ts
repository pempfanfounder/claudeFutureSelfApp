export type AppGate =
  | null
  | "/onboarding"
  | "/save-account"
  | "/paywall"
  | "/(main)/feed";

/**
 * Hard-paywall product. An unpaid guest must create an Apple / Google /
 * email account before they ever see the paywall.
 */
export function nextGate(state: {
  booted: boolean;
  onboardingComplete: boolean;
  isAnonymous: boolean;
  isPremium: boolean;
}): AppGate {
  if (!state.booted) return null;
  if (!state.onboardingComplete) return "/onboarding";
  if (!state.isPremium && state.isAnonymous) return "/save-account";
  if (!state.isPremium) return "/paywall";
  return "/(main)/feed";
}
