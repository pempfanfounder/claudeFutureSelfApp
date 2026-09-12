import { StyleSheet, View } from "react-native";
import { FadeInUp } from "react-native-reanimated";

import { radii, spacing } from "@/design-system/tokens";
import { NotificationCard } from "@/features/onboarding/engine/steps/notifications/MockNotification";

import type { PreviewNotification } from "./previewQuotes";

interface NotificationStackProps {
  /** Front card first. */
  items: PreviewNotification[];
  /** "cascade": straight offsets. "fan": adds a slight tilt per card. */
  mode?: "cascade" | "fan";
  /** Pixels each card overlaps the one behind it. */
  overlap?: number;
  /** Backdrop colour the older cards fade toward (the hero's surface). */
  scrimColor: string;
  /**
   * 1 pt outline around every card. The scrim sits above it, so the
   * outline fades on the older cards together with the rest of the card.
   */
  outlineColor?: string;
}

const SCALE_STEP = 0.06;
/** Scrim opacity per depth: cards stay opaque so nothing bleeds through. */
const SCRIM = [0, 0.3, 0.55];
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
  scrimColor,
  outlineColor,
}: NotificationStackProps) {
  const ordered = [...items].reverse();
  return (
    <View style={styles.root} testID="notification-stack">
      {ordered.map((item, index) => {
        const depth = ordered.length - 1 - index;
        return (
          <View
            // Depth styling lives on a plain wrapper so the card's own
            // entering animation never fights the static transform.
            key={item.body}
            style={[
              index > 0 && { marginTop: -overlap },
              {
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
              style={
                outlineColor
                  ? { borderWidth: 1, borderColor: outlineColor }
                  : undefined
              }
            />
            {depth > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.scrim,
                  { backgroundColor: scrimColor, opacity: SCRIM[depth] ?? 0.6 },
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.xl },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.lg,
  },
});
