import { Image, StyleSheet, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

interface MockNotificationProps {
  /** Notification body — the quote/affirmation preview. */
  body: string;
  /** Timestamp at the right of the title, "Now" by default. */
  time?: string;
}

const ICON_SIZE = 24;
/** How much of the back card shows under the front one. */
const PEEK = 8;

/**
 * I Am-style preview of what a delivery looks like: an iOS notification
 * group — the front banner (app icon, "Future Self", "Now", body) with a
 * slightly narrower second card peeking out below it. The front card
 * drops in from above once on mount, like a real banner.
 */
export function MockNotification({
  body,
  time = "Now",
}: MockNotificationProps) {
  const colors = useColors();
  return (
    <View style={styles.stack} testID="mock-notification">
      <View
        // Sits behind the front card; only its bottom edge is visible.
        style={[styles.backCard, { backgroundColor: colors.card }]}
      />
      <Animated.View
        entering={FadeInUp.duration(300)}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
          shadows.md,
        ]}
      >
        <View
          style={[
            styles.iconTile,
            { backgroundColor: colors.bg, borderColor: colors.border },
          ]}
        >
          <Image
            source={require("../../../../../../assets/images/splash-icon.png")}
            style={styles.icon}
            resizeMode="cover"
          />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="label">Future Self</AppText>
            <AppText
              variant="label"
              tone="ink3"
              testID="mock-notification-time"
            >
              {time}
            </AppText>
          </View>
          <AppText variant="body" style={styles.body}>
            {body}
          </AppText>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Bottom padding reserves the strip where the back card peeks out.
  stack: { paddingBottom: PEEK },
  backCard: {
    position: "absolute",
    left: "4%",
    right: "4%",
    top: PEEK * 2,
    bottom: 0,
    borderRadius: radii.lg,
    opacity: 0.6,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  iconTile: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    // The image rounds itself; the tile only adds the hairline edge.
  },
  icon: { width: "100%", height: "100%", borderRadius: 6 },
  text: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { marginTop: 2 },
});
