import { router } from "expo-router";
import { useEffect } from "react";

import { AuthSheet } from "@/features/auth/AuthSheet";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAppState } from "@/lib/appState";

/**
 * After onboarding, before the paywall. Required Apple / Google / email
 * so the subscription has an owner. Not skippable.
 */
export default function SaveAccountRoute() {
  const { isAnonymous } = useAuth();
  const isPremium = useAppState((s) => s.isPremium);

  useEffect(() => {
    if (!isAnonymous || isPremium) router.replace("/");
  }, [isAnonymous, isPremium]);

  return (
    <AuthSheet
      visible
      required
      mode="link"
      headline="Create your account"
      sub="Sign in with Apple, Google, or email. Then you can start your trial."
      onDone={(ok) => {
        if (ok) router.replace("/");
      }}
    />
  );
}
