import type { ComponentProps } from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

interface MockNotificationProps {
  /** Notification body — the quote/affirmation preview. */
  body: string;
}

interface NotificationCardProps {
  body: string;
  /** Delivery time shown top-right; defaults to "Now". */
  time?: string;
  /** Mount animation; the paywall stack staggers its own. */
  entering?: ComponentProps<typeof Animated.View>["entering"];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_SIZE = 24;
/** How much of the back card shows under the front one. */
const PEEK = 8;

/**
 * The single iOS-style banner (app icon, "Future Self", time, body).
 * Shared between the onboarding notifications step and the paywall's
 * stacked hero so both previews are literally the same drawing.
 */
export function NotificationCard({
  body,
  time = "Now",
  entering,
  style,
  testID,
}: NotificationCardProps) {
  const colors = useColors();
  return (
    <Animated.View
      entering={entering}
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        shadows.md,
        style,
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
          <AppText variant="label" tone="ink3">
            {time}
          </AppText>
        </View>
        <AppText variant="body" style={styles.body}>
          {body}
        </AppText>
      </View>
    </Animated.View>
  );
}

/**
 * I Am-style preview of what a delivery looks like: an iOS notification
 * group — the front banner (app icon, "Future Self", "Now", body) with a
 * slightly narrower second card peeking out below it. The front card
 * drops in from above once on mount, like a real banner.
 */
export function MockNotification({ body }: MockNotificationProps) {
  const colors = useColors();
  return (
    <View style={styles.stack} testID="mock-notification">
      <View
        // Sits behind the front card; only its bottom edge is visible.
        style={[styles.backCard, { backgroundColor: colors.card }]}
      />
      <NotificationCard body={body} entering={FadeInUp.duration(300)} />
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
