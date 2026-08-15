import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Button, Icon, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { restorePurchases } from "@/lib/purchases";

import { AuthSheet } from "@/features/auth/AuthSheet";
import { useAuth } from "@/features/auth/AuthProvider";

/**
 * Account: save/sign in (identity linking), restore purchases, sign
 * out, and account deletion. Anonymous-first: "saving" an account
 * links an identity to the same user, so nothing is lost.
 */
export default function AccountScreen() {
  const colors = useColors();
  const auth = useAuth();
  const setOnboardingComplete = useAppState((s) => s.setOnboardingComplete);
  const [sheet, setSheet] = useState<"link" | "switch" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const email = auth.session?.user.email;

  const restore = async () => {
    setBusy("restore");
    const result = await restorePurchases();
    setBusy(null);
    Alert.alert(
      "Restore purchases",
      result.status === "purchased"
        ? "Your purchase is back. Welcome home."
        : result.status === "error"
          ? result.message
          : "Restore was cancelled.",
    );
  };

  const signOut = () => {
    Alert.alert(
      "Sign out",
      "Your data stays with your account. This device returns to a fresh start.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setBusy("signout");
            await auth.signOut();
            setBusy(null);
            analytics.capture("signed_out");
            router.replace("/");
          },
        },
      ],
    );
  };

  const deleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account, personalization, streaks, and saved quotes. Purchases can be restored through the store, but everything else is gone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            const result = await auth.deleteAccount();
            setBusy(null);
            if (result.ok) {
              setOnboardingComplete(false);
              router.replace("/");
            } else {
              Alert.alert(
                "Delete account",
                "message" in result && result.message
                  ? result.message
                  : "Something went wrong.",
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="back" size={22} color={colors.ink3} />
        </Pressable>
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
              ? "Everything lives only on this phone. Sign in so your goal, streak and saved quotes survive a lost or new device."
              : (email ?? "Your progress is safe across devices.")}
          </AppText>
          {auth.isAnonymous ? (
            <Button
              label="Save my account"
              onPress={() => setSheet("link")}
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
            testID="switch-account"
          />
        ) : (
          <Button
            label="Sign out"
            variant="secondary"
            onPress={signOut}
            loading={busy === "signout"}
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
