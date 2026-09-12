import { Redirect } from "expo-router";

import { nextGate } from "@/lib/appGate";
import { useAppState } from "@/lib/appState";

/**
 * The gate. Hard-paywall product:
 * no onboarding -> variant funnel; onboarding done but still a guest ->
 * save-account; linked but no premium -> standalone paywall; premium ->
 * the app.
 */
export default function Index() {
  const { booted, onboardingComplete, isPremium, isAnonymous } = useAppState();
  const href = nextGate({
    booted,
    onboardingComplete,
    isAnonymous,
    isPremium,
  });

  if (!href) return null;
  return <Redirect href={href} />;
}
