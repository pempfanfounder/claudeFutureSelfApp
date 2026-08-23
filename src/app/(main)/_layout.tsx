import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";

import { motion } from "@/design-system/tokens";
import { useAppState } from "@/lib/appState";

import { registerDevice } from "@/features/notifications/push";

/**
 * Shared main app (premium-gated). All variants converge here; nothing
 * inside may render without an active entitlement.
 */
export default function MainLayout() {
  const { onboardingComplete, isPremium } = useAppState();

  useEffect(() => {
    // Refresh token/timezone/last-seen whenever the main app mounts.
    registerDevice();
  }, []);

  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  if (!isPremium) return <Redirect href="/paywall" />;

  // A fast crossfade everywhere: no sliding "page" rectangle, and
  // pushes between sibling screens (settings → notifications) blend
  // instead of visibly dismissing one card to present the next.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: motion.fast,
      }}
    />
  );
}
