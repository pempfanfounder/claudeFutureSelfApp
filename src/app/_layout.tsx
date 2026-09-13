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
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { FontAvailability } from "@/design-system/FontAvailability";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import { initAnalytics } from "@/lib/analytics";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import { initMonitoring, withMonitoring } from "@/lib/monitoring";
import { RootErrorBoundary } from "@/lib/RootErrorBoundary";
import { AuthSheet } from "@/features/auth/AuthSheet";
import { getPendingDeletion } from "@/features/auth/deletion";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { useNotificationNavigation } from "@/features/nav/useNotificationNavigation";

initMonitoring();
initAnalytics();

SplashScreen.preventAutoHideAsync().catch(() => {});

type RecoveryCheck = { identity: Identity; surface: object };
function hasCheckIdentity(action: RecoveryCheck) {
  if (isCurrentIdentity(action.identity)) return true;
  const current = captureIdentity();
  // Confirmed deletion clears its own identity before awaited device cleanup.
  // Keep its cleanup feedback, but never carry it across another account.
  return (
    action.identity.userId !== null &&
    current.userId === null &&
    current.generation === action.identity.generation + 1
  );
}

function AccountRoutes({ fontsSettled }: { fontsSettled: boolean }) {
  const {
    initializing,
    initializationError,
    retryInitialization,
    recoverPendingDeletion,
    deleteAccount,
  } = useAuth();
  const [recoveryAuth, setRecoveryAuth] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  useEffect(() => {
    let alive = true;
    void getPendingDeletion()
      .then((value) => {
        if (alive) setPendingDeletion(Boolean(value));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initializationError]);
  const { identityGeneration, identityReady } = useAppState();
  const [checkingDeletion, setCheckingDeletion] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const liveRecovery = useRef<object | null>(null);
  const runningCheck = useRef<RecoveryCheck | null>(null);
  const recoveryVisible = Boolean(initializationError);
  // Error text can change during owned SIGNED_OUT cleanup without replacing
  // the recovery surface. Retry explicitly replaces even a same-account surface.
  const recoverySurface = useMemo(
    () => ({
      visible: recoveryVisible,
      pendingDeletion,
      recoveryAuth,
      revision: recoveryRevision,
    }),
    [recoveryVisible, pendingDeletion, recoveryAuth, recoveryRevision],
  );
  const invalidateRecovery = useCallback(() => {
    liveRecovery.current = null;
    runningCheck.current = null;
    setCheckingDeletion(false);
    setRecoveryRevision((revision) => revision + 1);
  }, []);
  useLayoutEffect(
    () =>
      useAppState.subscribe((next, previous) => {
        if (
          next.identityGeneration !== previous.identityGeneration &&
          (!runningCheck.current || !hasCheckIdentity(runningCheck.current))
        )
          invalidateRecovery();
      }),
    [invalidateRecovery],
  );
  useLayoutEffect(() => {
    liveRecovery.current =
      recoverySurface.visible &&
      recoverySurface.pendingDeletion &&
      !recoverySurface.recoveryAuth
        ? recoverySurface
        : null;
    runningCheck.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new recovery surface owns fresh UI state.
    setCheckingDeletion(false);
    return () => {
      liveRecovery.current = null;
      runningCheck.current = null;
    };
  }, [recoverySurface]);
  const retryRecovery = () => {
    invalidateRecovery();
    retryInitialization();
  };
  const checkDeletion = async () => {
    const identity = captureIdentity();
    if (
      liveRecovery.current !== recoverySurface ||
      runningCheck.current ||
      identity.generation !== identityGeneration
    )
      return;
    const action = { identity, surface: recoverySurface };
    runningCheck.current = action;
    setCheckingDeletion(true);
    const ownsCheck = () =>
      runningCheck.current === action &&
      liveRecovery.current === action.surface &&
      hasCheckIdentity(action);
    try {
      const result = await recoverPendingDeletion();
      if (!ownsCheck()) return;
      Alert.alert(
        "Account deletion",
        result.ok ? "Deletion confirmed." : (result.message ?? "Please retry."),
      );
    } catch (error) {
      if (!ownsCheck()) return;
      Alert.alert(
        "Account deletion",
        error instanceof Error && error.message
          ? error.message
          : "Could not check deletion status. Please retry.",
      );
    } finally {
      if (ownsCheck()) {
        runningCheck.current = null;
        setCheckingDeletion(false);
      }
    }
  };
  useEffect(() => {
    if (fontsSettled && (!initializing || initializationError))
      SplashScreen.hideAsync().catch(() => {});
    useAppState.getState().setBooted(fontsSettled && identityReady);
  }, [fontsSettled, initializing, initializationError, identityReady]);
  useNotificationNavigation(
    fontsSettled && identityReady && !initializing && !initializationError,
    identityGeneration,
  );
  if (initializationError)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 28,
          gap: 20,
          backgroundColor: "#EDE0D6",
        }}
      >
        <Text
          accessibilityRole="alert"
          style={{ fontSize: 18, lineHeight: 27 }}
        >
          {initializationError}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={retryRecovery}
          style={{ padding: 18 }}
        >
          <Text>Retry</Text>
        </Pressable>
        {pendingDeletion ? (
          <Pressable
            accessibilityRole="button"
            style={{ padding: 18 }}
            disabled={checkingDeletion || recoveryAuth}
            accessibilityState={{
              disabled: checkingDeletion || recoveryAuth,
              busy: checkingDeletion,
            }}
            onPress={checkDeletion}
          >
            <Text>Check pending deletion</Text>
            {checkingDeletion ? (
              <ActivityIndicator accessibilityLabel="Checking deletion status" />
            ) : null}
          </Pressable>
        ) : null}
        {pendingDeletion ? (
          <Pressable
            accessibilityRole="button"
            style={{ padding: 18 }}
            onPress={() =>
              Alert.alert(
                "Retry deleting this account?",
                "This resumes your pending deletion request for the currently signed-in account. It permanently deletes its server data.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete account",
                    style: "destructive",
                    onPress: () => {
                      void (async () => {
                        const pending = await getPendingDeletion();
                        if (
                          !pending ||
                          pending.userId !== useAppState.getState().userId
                        )
                          throw new Error(
                            "Sign in to the original account before retrying its deletion.",
                          );
                        const result = await deleteAccount();
                        Alert.alert(
                          "Account deletion",
                          result.ok
                            ? "Deletion confirmed."
                            : (result.message ?? "Please retry."),
                        );
                      })().catch((error) =>
                        Alert.alert("Deletion not confirmed", error.message),
                      );
                    },
                  },
                ],
              )
            }
          >
            <Text>Retry pending deletion</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            invalidateRecovery();
            setRecoveryAuth(true);
          }}
          style={{ padding: 18 }}
        >
          <Text>Sign in to an existing account</Text>
        </Pressable>
        <AuthSheet
          visible={recoveryAuth}
          mode="switch"
          headline="Recover your account"
          onDone={(authenticated) => {
            setRecoveryAuth(false);
            if (authenticated) retryRecovery();
          }}
        />
      </View>
    );
  if (!fontsSettled || initializing || !identityReady)
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator accessibilityLabel="Reconnecting your account" />
      </View>
    );
  return (
    <View key={identityGeneration} style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: true,
        }}
      />
    </View>
  );
}
function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [fontDeadline, setFontDeadline] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontDeadline(true), 12_000);
    return () => clearTimeout(timer);
  }, []);
  // Font failure uses the platform fallback so it cannot hold the splash forever.
  return (
    <RootErrorBoundary>
      <FontAvailability.Provider value={fontsLoaded}>
        <ThemeProvider>
          <AuthProvider>
            <AccountRoutes
              fontsSettled={fontsLoaded || Boolean(fontError) || fontDeadline}
            />
          </AuthProvider>
        </ThemeProvider>
      </FontAvailability.Provider>
    </RootErrorBoundary>
  );
}
export default withMonitoring(RootLayout);
