import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from "@expo-google-fonts/instrument-serif";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { initAnalytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { initMonitoring, withMonitoring } from "@/lib/monitoring";
import { getIsPremium, initPurchases, subscribePremium } from "@/lib/purchases";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { BypassBanner } from "@/features/paywall/BypassBanner";
import { getNotificationDeepLink } from "@/features/notifications/push";
import { getCompletedOnboardingVariant } from "@/features/onboarding/engine/store";

initMonitoring();
initAnalytics();

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [bootReady, setBootReady] = useState(false);
  const { setBooted, setOnboardingComplete, setPremium } = useAppState();

  useEffect(() => {
    (async () => {
      await initPurchases();
      const [completedVariant, premium] = await Promise.all([
        getCompletedOnboardingVariant(),
        getIsPremium(),
      ]);
      setOnboardingComplete(Boolean(completedVariant));
      setPremium(premium);
      setBootReady(true);
      setBooted(true);
    })();

    const unsubscribe = subscribePremium((isPremium) => setPremium(isPremium));
    return unsubscribe;
  }, [setBooted, setOnboardingComplete, setPremium]);

  // Notification taps deep-link to the exact content that was sent.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = getNotificationDeepLink(response);
        if (url) {
          const parsed = Linking.parse(url);
          if (parsed.path) router.push(`/${parsed.path}` as never);
        }
      },
    );
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const url = getNotificationDeepLink(response);
      if (url) {
        const parsed = Linking.parse(url);
        if (parsed.path) router.push(`/${parsed.path}` as never);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded && bootReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, bootReady]);

  if (!fontsLoaded || !bootReady) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <BypassBanner />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default withMonitoring(RootLayout);
