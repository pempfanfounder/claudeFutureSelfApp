import { router } from "expo-router";
import { useEffect } from "react";

import { SaveAccountScreen } from "@/features/auth/SaveAccountScreen";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAppState } from "@/lib/appState";

/**
 * After onboarding, before the paywall. Required Apple / Google / email
 * so the subscription has an owner. Not skippable — and nothing to go
 * back to, since the gate route replaced the funnel.
 */
export default function SaveAccountRoute() {
  const { isAnonymous } = useAuth();
  const isPremium = useAppState((s) => s.isPremium);

  useEffect(() => {
    if (!isAnonymous || isPremium) router.replace("/");
  }, [isAnonymous, isPremium]);

  return (
    <SaveAccountScreen
      sub="Sign in with Apple, Google, or email. Then you can start your trial."
      progress={0.9}
      onDone={(ok) => {
        if (ok) router.replace("/");
      }}
    />
  );
}
