import { StyleSheet, View } from "react-native";
import { FadeInUp } from "react-native-reanimated";

import { spacing } from "@/design-system/tokens";
import { NotificationCard } from "@/features/onboarding/engine/steps/notifications/MockNotification";

import type { PreviewNotification } from "./previewQuotes";

interface NotificationStackProps {
  /** Front card first. */
  items: PreviewNotification[];
  /** "cascade": straight offsets. "fan": adds a slight tilt per card. */
  mode?: "cascade" | "fan";
  /** Pixels each card overlaps the one behind it. */
  overlap?: number;
}

const SCALE_STEP = 0.06;
const OPACITY = [1, 0.72, 0.46];
const TILT = ["0deg", "-2.5deg", "2deg"];
const SHIFT = [0, -6, 8];

/**
 * Three notification banners stacked like an iOS group: the newest one
 * in front at full size, each older one peeking out above it slightly
 * smaller and fainter. Cards are laid out back-to-front so the front
 * card naturally paints on top.
 */
export function NotificationStack({
  items,
  mode = "cascade",
  overlap = 34,
}: NotificationStackProps) {
  const ordered = [...items].reverse();
  return (
    <View style={styles.root} testID="notification-stack">
      {ordered.map((item, index) => {
        const depth = ordered.length - 1 - index;
        return (
          <View
            // Depth styling lives on a plain wrapper so the card's own
            // entering animation never fights the static opacity/transform.
            key={item.body}
            style={[
              index > 0 && { marginTop: -overlap },
              {
                opacity: OPACITY[depth] ?? 0.4,
                transform: [
                  { scale: 1 - depth * SCALE_STEP },
                  { translateX: mode === "fan" ? (SHIFT[depth] ?? 0) : 0 },
                  { rotate: mode === "fan" ? (TILT[depth] ?? "0deg") : "0deg" },
                ],
              },
            ]}
          >
            <NotificationCard
              body={item.body}
              time={item.time}
              testID={`notification-card-${depth}`}
              entering={FadeInUp.duration(360).delay(depth * 90)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.xl },
});
