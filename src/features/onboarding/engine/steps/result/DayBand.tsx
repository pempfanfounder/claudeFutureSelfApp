import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";
import { formatMinutes, MINUTES_PER_DAY } from "@/features/notifications/time";

interface DayBandProps {
  startMinutes: number;
  endMinutes: number;
  /** Delay before the band grows in, so it lands after its card. */
  delayMs?: number;
}

const TRACK_HEIGHT = 6;
const MARKER_SIZE = 12;

const pct = (minutes: number) => (minutes / MINUTES_PER_DAY) * 100;

/**
 * The user's reminder window as a slice of the day: a thin 24-hour track
 * with the window filled in ink, a marker at each bound and the two times
 * under the ends. The fill springs out from the start marker on mount
 * (Reanimated honours the system reduce-motion setting).
 */
export function DayBand({
  startMinutes,
  endMinutes,
  delayMs = 0,
}: DayBandProps) {
  const colors = useColors();
  const start = pct(startMinutes);
  const span = Math.max(0, pct(endMinutes) - start);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withDelay(delayMs, withSpring(1, { damping: 18, stiffness: 120 })),
    );
  }, [progress, delayMs, startMinutes, endMinutes]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${span * progress.get()}%`,
  }));
  const endMarkerStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  return (
    <View testID="day-band">
      <View style={styles.axis}>
        <View style={[styles.track, { backgroundColor: colors.bgAlt }]}>
          <Animated.View
            style={[
              styles.fill,
              { left: `${start}%`, backgroundColor: colors.ink },
              fillStyle,
            ]}
          />
        </View>
        <View
          style={[
            styles.marker,
            {
              left: `${start}%`,
              backgroundColor: colors.card,
              borderColor: colors.ink,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.marker,
            {
              left: `${start + span}%`,
              backgroundColor: colors.card,
              borderColor: colors.ink,
            },
            endMarkerStyle,
          ]}
        />
      </View>
      <View style={styles.labels}>
        <AppText variant="label" tone="ink2" testID="day-band-start">
          {formatMinutes(startMinutes)}
        </AppText>
        <AppText variant="label" tone="ink2" testID="day-band-end">
          {formatMinutes(endMinutes)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { marginHorizontal: MARKER_SIZE / 2, justifyContent: "center" },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  marker: {
    position: "absolute",
    top: (TRACK_HEIGHT - MARKER_SIZE) / 2,
    marginLeft: -MARKER_SIZE / 2,
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 2,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
});
