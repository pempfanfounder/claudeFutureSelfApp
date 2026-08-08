import { Redirect } from "expo-router";

import { useAppState } from "@/lib/appState";

/**
 * The gate. Hard-paywall product:
 * no onboarding -> variant funnel; onboarding done but no premium ->
 * standalone paywall; premium -> the app.
 */
export default function Index() {
  const { booted, onboardingComplete, isPremium } = useAppState();

  if (!booted) return null;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  if (!isPremium) return <Redirect href="/paywall" />;
  return <Redirect href="/(main)/feed" />;
}
