import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";
import { AppText, Button, Screen } from "@/design-system/components";
import { analytics } from "@/lib/analytics";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";
import { ownedStorage } from "@/lib/accountStorage";
import { getOnboardingVariant } from "@/lib/experiments";
import { AuthSheet } from "@/features/auth/AuthSheet";
import { OnboardingFlow } from "@/features/onboarding/engine/OnboardingFlow";
import {
  hasLegacyDeviceProgress,
  useOnboardingStore,
} from "@/features/onboarding/engine/store";
export default function OnboardingRoute() {
  const [ready, setReady] = useState(false),
    [failure, setFailure] = useState(false),
    [retry, setRetry] = useState(0),
    [legacy, setLegacy] = useState(false),
    [auth, setAuth] = useState(false);
  const userId = useAppState((s) => s.userId);
  useEffect(() => {
    let alive = true;
    const identity = captureIdentity();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
    setReady(false);
    setFailure(false);
    void (async () => {
      const assignment = await getOnboardingVariant();
      const notice = await hasLegacyDeviceProgress();
      const seen = await AsyncStorage.getItem(
        `fs.legacy-notice.v1.${identity.userId}`,
      );
      if (!alive || !isCurrentIdentity(identity)) return;
      useOnboardingStore.getState().setVariant(assignment.variant);
      useAppState.getState().setVariant(assignment.variant);
      analytics.capture("onboarding_started", {
        variant: assignment.variant,
        assignment_source: assignment.source,
      });
      setLegacy(notice && !seen);
      setReady(true);
    })().catch(() => {
      if (alive) setFailure(true);
    });
    return () => {
      alive = false;
    };
  }, [userId, retry]);
  if (!ready)
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
          <AppText accessibilityRole="alert" center>
            {failure
              ? "Could not load your saved progress. Restart the app and retry."
              : "Loading your progress…"}
          </AppText>
          {failure ? (
            <Button label="Retry" onPress={() => setRetry((v) => v + 1)} />
          ) : null}
        </View>
      </Screen>
    );
  if (legacy)
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
          <AppText variant="h2">Previous device data is kept</AppText>
          <AppText>
            Sign in to your previous account to recover its saved progress.
            Older local data has no verified account owner, so it stays
            preserved on this device. Any unfinished answers from the old
            version may need to be entered again.
          </AppText>
          <Button
            label="Sign in to an existing account"
            onPress={() => setAuth(true)}
          />
          <Button
            label="Continue with this account"
            variant="secondary"
            onPress={() => {
              const identity = captureIdentity();
              void ownedStorage(identity, () =>
                AsyncStorage.setItem(
                  `fs.legacy-notice.v1.${identity.userId}`,
                  "seen",
                ),
              )
                .then(() => {
                  if (isCurrentIdentity(identity)) setLegacy(false);
                })
                .catch(() => setFailure(true));
            }}
          />
          {failure ? (
            <AppText accessibilityRole="alert">
              Could not save that choice. Please try again.
            </AppText>
          ) : null}
        </View>
        <AuthSheet
          visible={auth}
          mode="switch"
          headline="Recover your account"
          onDone={() => setAuth(false)}
        />
      </Screen>
    );
  return <OnboardingFlow />;
}
