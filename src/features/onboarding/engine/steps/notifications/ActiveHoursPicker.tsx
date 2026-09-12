import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useTheme } from "@/design-system/ThemeProvider";
import { motion, radii, spacing } from "@/design-system/tokens";
import {
  dateToMinutes,
  formatHour,
  formatMinutes,
  MINUTES_PER_DAY,
  minutesToDate,
  WINDOW_INTERVAL_MINUTES,
  type NotificationWindow,
  type WindowKey,
} from "@/features/notifications/time";

interface ActiveHoursPickerProps {
  range: NotificationWindow;
  /** Raw picker minutes; the caller applies the gap/grid rules. */
  onChange: (key: WindowKey, minutes: number) => void;
}

const TRACK_HEIGHT = 6;
const HANDLE_SIZE = 14;
/** Axis ticks under the track (quarter days). */
const TICKS = [6 * 60, 12 * 60, 18 * 60];

const pct = (minutes: number) => (minutes / MINUTES_PER_DAY) * 100;

/**
 * "Active hours" card: a 24-hour track with the chosen window drawn as a
 * filled band (animated as the bounds move), then two side-by-side
 * "From" / "Until" tiles with the times in large serif type. Tapping a
 * tile on iOS unfolds an inline wheel picker under the tiles (tap again
 * to fold it); on Android it opens the platform time dialog through the
 * library's imperative API (its recommended Android path).
 */
export function ActiveHoursPicker({ range, onChange }: ActiveHoursPickerProps) {
  const { theme, palette: colors } = useTheme();
  const [open, setOpen] = useState<WindowKey | null>(null);

  const start = useSharedValue(pct(range.windowStartMinutes));
  const end = useSharedValue(pct(range.windowEndMinutes));
  useEffect(() => {
    start.set(
      withTiming(pct(range.windowStartMinutes), { duration: motion.base }),
    );
    end.set(withTiming(pct(range.windowEndMinutes), { duration: motion.base }));
  }, [range.windowStartMinutes, range.windowEndMinutes, start, end]);

  const bandStyle = useAnimatedStyle(() => ({
    left: `${start.get()}%`,
    width: `${Math.max(0, end.get() - start.get())}%`,
  }));
  const startHandleStyle = useAnimatedStyle(() => ({
    left: `${start.get()}%`,
  }));
  const endHandleStyle = useAnimatedStyle(() => ({ left: `${end.get()}%` }));

  const openFor = (key: WindowKey) => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === "ios") {
      setOpen((current) => (current === key ? null : key));
      return;
    }
    DateTimePickerAndroid.open({
      mode: "time",
      display: "default",
      // No is24Hour: the dialog follows the device's hour cycle, like
      // formatMinutes does.
      minuteInterval: WINDOW_INTERVAL_MINUTES,
      value: minutesToDate(range[key]),
      onValueChange: (_event, date) => onChange(key, dateToMinutes(date)),
      // Cancel keeps the current value; nothing to do.
      onDismiss: () => {},
    });
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID="active-hours"
    >
      <AppText variant="eyebrow" tone="ink3">
        Active hours
      </AppText>

      <View style={styles.axis}>
        <View style={[styles.track, { backgroundColor: colors.bgAlt }]}>
          <Animated.View
            style={[styles.band, { backgroundColor: colors.ink }, bandStyle]}
            testID="active-hours-band"
          />
        </View>
        <Animated.View
          style={[
            styles.handle,
            { backgroundColor: colors.card, borderColor: colors.ink },
            startHandleStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.handle,
            { backgroundColor: colors.card, borderColor: colors.ink },
            endHandleStyle,
          ]}
        />
        {TICKS.map((tick) => (
          <View
            key={tick}
            style={[styles.tick, { left: `${pct(tick)}%` }]}
            pointerEvents="none"
          >
            <AppText variant="label" tone="ink3" center>
              {formatHour(tick)}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.tiles}>
        <TimeTile
          label="From"
          minutes={range.windowStartMinutes}
          active={open === "windowStartMinutes"}
          onPress={() => openFor("windowStartMinutes")}
          testID="start-picker"
        />
        <TimeTile
          label="Until"
          minutes={range.windowEndMinutes}
          active={open === "windowEndMinutes"}
          onPress={() => openFor("windowEndMinutes")}
          testID="end-picker"
        />
      </View>

      {open && Platform.OS === "ios" ? (
        <Animated.View
          entering={FadeIn.duration(motion.fast)}
          exiting={FadeOut.duration(motion.fast)}
          style={styles.wheel}
        >
          <DateTimePicker
            mode="time"
            display="spinner"
            value={minutesToDate(range[open])}
            minuteInterval={WINDOW_INTERVAL_MINUTES}
            // Follows the app palette, not the system appearance: the
            // screen is drawn in our own theme colours.
            themeVariant={theme.category === "dark" ? "dark" : "light"}
            textColor={colors.ink}
            accentColor={colors.ink}
            onValueChange={(_event, date) =>
              onChange(open, dateToMinutes(date))
            }
            accessibilityLabel={
              open === "windowStartMinutes" ? "From" : "Until"
            }
            testID={`${open === "windowStartMinutes" ? "start" : "end"}-picker-wheel`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

interface TimeTileProps {
  label: string;
  minutes: number;
  active: boolean;
  onPress: () => void;
  testID: string;
}

function TimeTile({ label, minutes, active, onPress, testID }: TimeTileProps) {
  const { palette: colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${formatMinutes(minutes)}`}
      accessibilityHint="Opens a time picker"
      accessibilityState={{ expanded: active }}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: active ? colors.bgAlt : colors.bg,
          borderColor: active ? colors.ink : colors.border,
        },
        pressed && styles.tilePressed,
      ]}
    >
      <AppText variant="label" tone="ink3">
        {label}
      </AppText>
      <AppText variant="h3" style={styles.tileTime} testID={`${testID}-time`}>
        {formatMinutes(minutes)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  // Room under the track for the tick labels and around it for handles.
  axis: {
    marginTop: spacing.xs,
    marginHorizontal: HANDLE_SIZE / 2,
    paddingBottom: spacing.lg + spacing.xs,
    justifyContent: "flex-start",
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: "hidden",
  },
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  handle: {
    position: "absolute",
    top: (TRACK_HEIGHT - HANDLE_SIZE) / 2,
    marginLeft: -HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2,
  },
  tick: {
    position: "absolute",
    top: TRACK_HEIGHT + spacing.xs,
    width: 48,
    marginLeft: -24,
  },
  tiles: { flexDirection: "row", gap: spacing.md },
  tile: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  tilePressed: { opacity: 0.8 },
  tileTime: { fontVariant: ["tabular-nums"] },
  wheel: { alignItems: "center" },
});
