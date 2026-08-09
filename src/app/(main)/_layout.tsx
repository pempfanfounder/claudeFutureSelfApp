import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";

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

  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "slide_from_bottom" }}
    >
      <Stack.Screen name="feed" options={{ animation: "fade" }} />
    </Stack>
  );
}
