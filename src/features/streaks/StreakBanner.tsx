import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface StreakBannerProps {
  streak: number;
  onDismiss: () => void;
}

/** I Am-style drop-in celebration when the daily streak completes. */
export function StreakBanner({ streak, onDismiss }: StreakBannerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Monday-first index of today.
  const todayIndex = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    const t = setTimeout(onDismiss, 4200);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <Animated.View
      entering={SlideInUp.duration(420)}
      exiting={SlideOutUp.duration(320)}
      style={[
        styles.banner,
        { top: insets.top + spacing.sm, backgroundColor: colors.card },
        shadows.lg,
      ]}
    >
      <AppText variant="h3" center>
        {streak === 1
          ? "New daily streak started"
          : `Day ${streak}, streak alive`}
      </AppText>
      <View style={styles.circleWrap}>
        <View style={[styles.circle, { borderColor: colors.accent }]}>
          <AppText variant="h2">{streak}</AppText>
        </View>
        <View style={styles.spark}>
          <Icon name="sparkle" size={14} color={colors.accent} />
        </View>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <View key={d} style={styles.day}>
            <View
              style={[
                styles.dot,
                { borderColor: colors.borderStrong },
                i === todayIndex && {
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
            >
              {i === todayIndex ? <AppText variant="label">✓</AppText> : null}
            </View>
            <AppText variant="label" tone="ink3">
              {d}
            </AppText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  circleWrap: { alignItems: "center", marginTop: spacing.md },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  spark: { position: "absolute", right: "34%", top: 0 },
  week: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  day: { alignItems: "center", gap: spacing.xs },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
