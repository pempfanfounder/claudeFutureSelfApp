import { Platform, StyleSheet, Text, View } from "react-native";

import { config } from "@/lib/config";

/**
 * Unmissable marker that this build grants premium without a purchase.
 *
 * Deliberately not themeable and not dismissible: a paywall bypass that
 * looks like a normal build is how a bypass reaches a store. Renders
 * nothing unless EXPO_PUBLIC_BYPASS_PAYWALL is on.
 *
 * Uses a fixed inset rather than useSafeAreaInsets: this mounts at the
 * root, above the provider expo-router supplies, so the hook would throw
 * and take the whole app down with it.
 */
export function BypassBanner() {
  if (!config.bypassPaywall) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        PAYWALL BYPASSED — internal test build, do not ship
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#B3261E",
    paddingTop: Platform.OS === "ios" ? 56 : 32,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
});
