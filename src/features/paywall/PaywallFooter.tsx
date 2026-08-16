import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { LEGAL_URLS } from "@/lib/legal";
import { restorePurchases } from "@/lib/purchases";

import { PrivacyChoicesSheet } from "./PrivacyChoicesSheet";

interface PaywallFooterProps {
  onRestored: () => void;
}

/**
 * Privacy · Terms · Restore · Privacy choices — required on every
 * paywall. "Privacy choices" opens support + account deletion so both
 * stay reachable from the hard paywall (Guideline 5.1.1(v)).
 */
export function PaywallFooter({ onRestored }: PaywallFooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);

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
      <Pressable
        onPress={() => Linking.openURL(LEGAL_URLS.privacy).catch(() => {})}
        hitSlop={8}
      >
        <AppText variant="label" tone="ink3">
          Privacy
        </AppText>
      </Pressable>
      <AppText variant="label" tone="ink3">
        ·
      </AppText>
      <Pressable
        onPress={() => Linking.openURL(LEGAL_URLS.terms).catch(() => {})}
        hitSlop={8}
      >
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
      <AppText variant="label" tone="ink3">
        ·
      </AppText>
      <Pressable
        onPress={() => setPrivacyOpen(true)}
        hitSlop={8}
        testID="privacy-choices"
      >
        <AppText variant="label" tone="ink3">
          Privacy choices
        </AppText>
      </Pressable>
      <PrivacyChoicesSheet
        visible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
