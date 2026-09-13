import { SecondaryMotion } from "@/features/nav/SecondaryMotion";
import { BackButton } from "@/design-system/components/BackButton";
import { router } from "expo-router";
import { useLayoutEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Button, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import { restorePurchases } from "@/lib/purchases";

import {
  APPLE_DELETION_NOTE,
  hasAppleIdentity,
} from "@/features/auth/appleRevocation";
import { AuthSheet } from "@/features/auth/AuthSheet";
import { useAuth } from "@/features/auth/AuthProvider";

type AccountAction = {
  identity: Identity;
  screen: object;
  kind: "restore" | "signout" | "delete";
};

function hasActionIdentity(action: AccountAction) {
  if (isCurrentIdentity(action.identity)) return true;
  const current = captureIdentity();
  // Sign-out intentionally clears its own account. Only that immediate null
  // successor may finish on a still-mounted screen; a new account never may.
  return (
    action.kind === "signout" &&
    current.userId === null &&
    current.generation === action.identity.generation + 1
  );
}

/**
 * Account: save/sign in (identity linking), restore purchases, sign
 * out, and account deletion. Anonymous-first: "saving" an account
 * links an identity to the same user, so nothing is lost.
 */
export default function AccountScreen() {
  const colors = useColors();
  const auth = useAuth();
  const renderedGeneration = useAppState((state) => state.identityGeneration);
  const [sheet, setSheet] = useState<"link" | "switch" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const liveScreen = useRef<object | null>(null);
  const confirmation = useRef<AccountAction | null>(null);
  const runningAction = useRef<AccountAction | null>(null);

  useLayoutEffect(() => {
    liveScreen.current = {};
    const unsubscribe = useAppState.subscribe((next, previous) => {
      if (next.identityGeneration === previous.identityGeneration) return;
      confirmation.current = null;
      if (runningAction.current && !hasActionIdentity(runningAction.current)) {
        runningAction.current = null;
        setBusy(null);
      }
    });
    return () => {
      liveScreen.current = null;
      confirmation.current = null;
      runningAction.current = null;
      unsubscribe();
    };
  }, []);

  const createAction = (kind: AccountAction["kind"]): AccountAction | null => {
    if (!liveScreen.current || runningAction.current) return null;
    const identity = captureIdentity();
    // A retained handler from an older render cannot create consent for B.
    if (
      !identity.userId ||
      identity.userId !== auth.session?.user.id ||
      identity.generation !== renderedGeneration
    )
      return null;
    return { identity, screen: liveScreen.current, kind };
  };
  const ownsAction = (action: AccountAction) =>
    runningAction.current === action &&
    liveScreen.current === action.screen &&
    hasActionIdentity(action);
  const beginAction = (action: AccountAction) => {
    if (
      runningAction.current ||
      liveScreen.current !== action.screen ||
      !isCurrentIdentity(action.identity)
    )
      return false;
    confirmation.current = null;
    runningAction.current = action;
    setBusy(action.kind);
    return true;
  };
  const consumeConfirmation = (action: AccountAction) => {
    if (confirmation.current !== action) return false;
    confirmation.current = null;
    return beginAction(action);
  };
  const cancelConfirmation = (action: AccountAction) => {
    if (confirmation.current === action) confirmation.current = null;
  };
  const finishAction = (action: AccountAction) => {
    if (!ownsAction(action)) return;
    runningAction.current = null;
    setBusy(null);
  };

  const email = auth.session?.user.email;

  const restore = async () => {
    const action = createAction("restore");
    if (!action || !beginAction(action)) return;
    try {
      const result = await restorePurchases();
      if (!ownsAction(action)) return;
      Alert.alert(
        "Restore purchases",
        result.status === "purchased"
          ? "Your purchase is back. Welcome home."
          : result.status === "error"
            ? result.message
            : "Restore was cancelled.",
      );
    } catch (error) {
      if (!ownsAction(action)) return;
      Alert.alert(
        "Restore purchases",
        error instanceof Error && error.message
          ? error.message
          : "Could not restore purchases. Please retry.",
      );
    } finally {
      finishAction(action);
    }
  };

  const signOut = () => {
    const action = createAction("signout");
    if (!action) return;
    confirmation.current = action;
    Alert.alert(
      "Sign out",
      "Your data stays with your account. This device returns to a fresh start.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => cancelConfirmation(action),
        },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            if (!consumeConfirmation(action)) return;
            try {
              await auth.signOut();
              if (!ownsAction(action)) return;
              analytics.capture("signed_out");
              router.replace("/");
            } catch (error) {
              if (!ownsAction(action)) return;
              Alert.alert("Sign out", (error as Error).message);
            } finally {
              finishAction(action);
            }
          },
        },
      ],
      { onDismiss: () => cancelConfirmation(action) },
    );
  };

  const deleteAccount = () => {
    const action = createAction("delete");
    if (!action) return;
    confirmation.current = action;
    Alert.alert(
      "Delete account",
      "This permanently deletes your account, personalization, streaks, and saved quotes. Deleting an account does not cancel an App Store subscription. Manage or cancel it in App Store settings." +
        (hasAppleIdentity(auth.session) ? ` ${APPLE_DELETION_NOTE}` : "") +
        " Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => cancelConfirmation(action),
        },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            if (!consumeConfirmation(action)) return;
            try {
              const result = await auth.deleteAccount();
              if (!ownsAction(action)) return;
              // AuthProvider owns confirmed deletion, teardown and routing.
              if (!result.ok) {
                Alert.alert(
                  "Delete account",
                  result.message || "Deletion was not confirmed. Please retry.",
                );
              }
            } catch (error) {
              if (!ownsAction(action)) return;
              Alert.alert(
                "Delete account",
                error instanceof Error && error.message
                  ? error.message
                  : "Deletion was not confirmed. Please retry.",
              );
            } finally {
              finishAction(action);
            }
          },
        },
      ],
      { onDismiss: () => cancelConfirmation(action) },
    );
  };

  return (
    <SecondaryMotion>
      <Screen>
        <View style={styles.header}>
          <BackButton />
          <AppText variant="h3">Account</AppText>
          <View style={styles.spacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <AppText variant="lead">
              {auth.isAnonymous ? "Your account isn't saved yet" : "Signed in"}
            </AppText>
            <AppText variant="body" tone="ink2" style={styles.cardSub}>
              {auth.isAnonymous
                ? "Your progress is stored with a guest account on our service and cached on this phone. Save a sign-in to recover your history on another device."
                : (email ?? "Your progress is safe across devices.")}
            </AppText>
            {auth.isAnonymous ? (
              <Button
                label="Save my account"
                onPress={() => setSheet("link")}
                disabled={busy !== null}
                style={styles.cardBtn}
                testID="save-account"
              />
            ) : null}
          </View>

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Purchases
          </AppText>
          <Button
            label="Restore purchases"
            variant="secondary"
            onPress={restore}
            loading={busy === "restore"}
            disabled={busy !== null}
            testID="restore-purchases"
          />

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Session
          </AppText>
          {auth.isAnonymous ? (
            <Button
              label="Already have an account? Sign in"
              variant="secondary"
              onPress={() => setSheet("switch")}
              disabled={busy !== null}
              testID="switch-account"
            />
          ) : (
            <Button
              label="Sign out"
              variant="secondary"
              onPress={signOut}
              loading={busy === "signout"}
              disabled={busy !== null}
              testID="sign-out"
            />
          )}

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Danger zone
          </AppText>
          <Button
            label="Delete account"
            variant="ghost"
            onPress={deleteAccount}
            loading={busy === "delete"}
            disabled={busy !== null}
            testID="delete-account"
          />
        </ScrollView>

        <AuthSheet
          visible={sheet !== null}
          mode={sheet ?? "link"}
          headline={sheet === "switch" ? "Welcome back." : "Keep it safe."}
          sub={
            sheet === "switch"
              ? "Sign in to the account that has your history. This device's fresh data will be replaced by it."
              : "Sign in so your goal, your streak and your saved quotes survive a lost phone."
          }
          dismissLabel="Cancel"
          onDone={(authenticated) => {
            setSheet(null);
            if (authenticated) analytics.capture("account_saved_from_settings");
          }}
        />
      </Screen>
    </SecondaryMotion>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  spacer: { width: 24 },
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.sm },
  card: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  cardSub: { marginTop: spacing.sm },
  cardBtn: { marginTop: spacing.lg },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm },
});
