import { useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { LEGAL_URLS } from "@/lib/legal";
import { restorePurchases } from "@/lib/purchases";
import { AuthSheet } from "@/features/auth/AuthSheet";
import { PrivacyChoicesSheet } from "./PrivacyChoicesSheet";

interface PaywallFooterProps { onRestored: () => void }

/** Single-flight Restore handler shared by every paywall footer. */
export function useRestorePurchases(onRestored: () => void) {
  const restoring = useRef(false);
  return async () => {
    if (restoring.current) return;
    restoring.current = true;
    try {
      analytics.capture("restore_tapped", { placement: "paywall" });
      const result = await restorePurchases();
      if (result.status === "purchased") onRestored();
      else if (result.status === "error" || result.status === "pending") Alert.alert(result.title ?? "Restore", result.message);
    } finally { restoring.current = false; }
  };
}

/** Support and account deletion stay reachable for people who never pay. */
export function PaywallFooter({ onRestored }: PaywallFooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const restore = useRestorePurchases(onRestored);
  return (
    <View style={styles.row}>
      <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy).catch(() => {})} hitSlop={8}>
        <AppText variant="label" tone="ink3">Privacy</AppText>
      </Pressable>
      <AppText variant="label" tone="ink3">·</AppText>
      <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms).catch(() => {})} hitSlop={8}>
        <AppText variant="label" tone="ink3">Terms</AppText>
      </Pressable>
      <AppText variant="label" tone="ink3">·</AppText>
      <Pressable onPress={restore} hitSlop={8} testID="restore"><AppText variant="label" tone="ink3">Restore</AppText></Pressable>
      <AppText variant="label" tone="ink3">·</AppText>
      <Pressable onPress={() => setPrivacyOpen(true)} hitSlop={8} testID="privacy-choices"><AppText variant="label" tone="ink3">Privacy choices</AppText></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setSignInOpen(true)} hitSlop={8}>
        <AppText variant="label" tone="ink3">Already have an account? Sign in</AppText>
      </Pressable>
      <AuthSheet visible={signInOpen} mode="switch" headline="Welcome back." onDone={() => setSignInOpen(false)} />
      <PrivacyChoicesSheet visible={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.md, marginTop: spacing.lg },
});
