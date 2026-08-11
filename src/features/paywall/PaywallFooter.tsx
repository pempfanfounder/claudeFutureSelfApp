import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { restorePurchases } from "@/lib/purchases";

// Hosted by the `legal` Supabase edge function — swap for a branded
// domain later without an app update being required for the store pages.
const TERMS_URL = "https://ykgswczatkspryetstor.supabase.co/functions/v1/legal/terms";
const PRIVACY_URL = "https://ykgswczatkspryetstor.supabase.co/functions/v1/legal/privacy";

interface PaywallFooterProps {
  onRestored: () => void;
}

/** Privacy · Terms · Restore — required on every paywall. */
export function PaywallFooter({ onRestored }: PaywallFooterProps) {
  const restore = async () => {
    analytics.capture("restore_tapped", { placement: "paywall" });
    const result = await restorePurchases();
    if (result.status === "purchased") {
      onRestored();
    } else if (result.status === "error") {
      Alert.alert("Restore", result.message);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
        <AppText variant="label" tone="ink3">
          Privacy
        </AppText>
      </Pressable>
      <AppText variant="label" tone="ink3">
        ·
      </AppText>
      <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
        <AppText variant="label" tone="ink3">
          Terms
        </AppText>
      </Pressable>
      <AppText variant="label" tone="ink3">
        ·
      </AppText>
      <Pressable onPress={restore} hitSlop={8} testID="restore">
        <AppText variant="label" tone="ink3">
          Restore
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
