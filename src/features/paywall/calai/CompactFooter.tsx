import { Linking, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { LEGAL_URLS } from "@/lib/legal";

import { useRestorePurchases } from "../PaywallFooter";

interface CompactFooterProps {
  onRestored: () => void;
}

/**
 * Terms · Privacy · Restore, nothing else. Support and account deletion
 * live under Settings › Account › Privacy choices; the legacy paywalls
 * keep the fuller `PaywallFooter`.
 */
export function CompactFooter({ onRestored }: CompactFooterProps) {
  const restore = useRestorePurchases(onRestored);
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.lg,
  },
  item: { flexDirection: "row", alignItems: "center" },
  dot: { marginHorizontal: spacing.md },
});
