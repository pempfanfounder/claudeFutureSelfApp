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
import { router, Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { motion, radii, spacing } from "@/design-system/tokens";
import { initAnalytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { initMonitoring, monitoring, withMonitoring } from "@/lib/monitoring";
import { getIsPremium, initPurchases, subscribePremium } from "@/lib/purchases";

import { AuthProvider } from "@/features/auth/AuthProvider";
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
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
            animationDuration: motion.fast,
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * expo-router picks this up by name and renders it instead of a white
 * screen when any route below the root throws during render. It cannot
 * use ThemeProvider/useColors — the failure may be the provider itself —
 * so it paints the default Minimal Sand palette directly.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // The splash may still be up if the throw happened during boot.
    SplashScreen.hideAsync().catch(() => {});
    monitoring.captureError(error, { boundary: "root" });
  }, [error]);

  return (
    <View style={errorStyles.root}>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.body}>
        Future Self ran into an unexpected problem. Your saved quotes and
        subscription are safe.
      </Text>
      <Pressable
        onPress={() => {
          retry().catch(() => {});
        }}
        style={errorStyles.cta}
        testID="error-boundary-retry"
      >
        <Text style={errorStyles.ctaLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EDE0D6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    color: "#4B3A35",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#6B5750",
    textAlign: "center",
  },
  cta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: "#4B3A35",
  },
  ctaLabel: {
    fontSize: 16,
    color: "#FBF4EC",
    textAlign: "center",
  },
});

export default withMonitoring(RootLayout);
