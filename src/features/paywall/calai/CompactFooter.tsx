import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { LEGAL_URLS } from "@/lib/legal";

import { useRestorePurchases } from "../PaywallFooter";
import { PrivacyChoicesSheet } from "../PrivacyChoicesSheet";

interface CompactFooterProps {
  onRestored: () => void;
}

/**
 * Terms · Privacy · Restore · Privacy choices, one small row. "Privacy
 * choices" opens support and account deletion so both stay reachable
 * from the hard paywall for people who never pay (Guideline 5.1.1(v));
 * the same sheet lives under Settings › Account.
 */
export function CompactFooter({ onRestored }: CompactFooterProps) {
  const restore = useRestorePurchases(onRestored);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const links: { label: string; onPress: () => void; testID?: string }[] = [
    {
      label: "Terms",
      onPress: () => Linking.openURL(LEGAL_URLS.terms).catch(() => {}),
      testID: "terms",
    },
    {
      label: "Privacy",
      onPress: () => Linking.openURL(LEGAL_URLS.privacy).catch(() => {}),
      testID: "privacy",
    },
    { label: "Restore", onPress: restore, testID: "restore" },
    {
      label: "Privacy choices",
      onPress: () => setPrivacyOpen(true),
      testID: "privacy-choices",
    },
  ];
  return (
    <View style={styles.row} testID="paywall-links">
      {links.map((link, index) => (
        <View key={link.label} style={styles.item}>
          {index > 0 ? (
            <AppText variant="label" tone="ink3" style={styles.dot}>
              ·
            </AppText>
          ) : null}
          <Pressable
            onPress={link.onPress}
            hitSlop={10}
            accessibilityRole="link"
            testID={link.testID}
          >
            <AppText variant="label" tone="ink3">
              {link.label}
            </AppText>
          </Pressable>
        </View>
      ))}
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
    alignItems: "center",
    rowGap: spacing.xs,
    marginTop: spacing.lg,
  },
  item: { flexDirection: "row", alignItems: "center" },
  dot: { marginHorizontal: spacing.sm },
});
