import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { useTheme } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";
import {
  dateToMinutes,
  formatMinutes,
  minutesToDate,
  WINDOW_INTERVAL_MINUTES,
  type NotificationWindow,
  type WindowKey,
} from "@/features/notifications/time";

interface TimeWindowCardProps {
  range: NotificationWindow;
  /** Raw picker minutes; the caller applies the gap/grid rules. */
  onChange: (key: WindowKey, minutes: number) => void;
}

const ROW_HEIGHT = 52;

/**
 * I Am "Start at" / "End at" grouped card. The time control is the OS
 * one: on iOS the compact date picker draws its own grey capsule and
 * opens the wheel popover natively; on Android we draw the capsule and
 * open the platform time dialog through the library's imperative API
 * (its recommended Android path — the dialog is not a view).
 */
export function TimeWindowCard({ range, onChange }: TimeWindowCardProps) {
  const { palette: colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <TimeRow
        label="Start at"
        minutes={range.windowStartMinutes}
        onChange={(m) => onChange("windowStartMinutes", m)}
        testID="start-picker"
      />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <TimeRow
        label="End at"
        minutes={range.windowEndMinutes}
        onChange={(m) => onChange("windowEndMinutes", m)}
        testID="end-picker"
      />
    </View>
  );
}

interface TimeRowProps {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  testID: string;
}

function TimeRow({ label, minutes, onChange, testID }: TimeRowProps) {
  const { theme, palette: colors } = useTheme();
  const value = minutesToDate(minutes);
  const handlePicked = (date: Date) => onChange(dateToMinutes(date));

  const control =
    Platform.OS === "ios" ? (
      <DateTimePicker
        mode="time"
        display="compact"
        value={value}
        minuteInterval={WINDOW_INTERVAL_MINUTES}
        // Follows the app palette, not the system appearance: the screen
        // is drawn in our own theme colours.
        themeVariant={theme.category === "dark" ? "dark" : "light"}
        accentColor={colors.ink}
        onValueChange={(_event, date) => handlePicked(date)}
        accessibilityLabel={label}
        testID={testID}
      />
    ) : (
      <Pressable
        onPress={() =>
          DateTimePickerAndroid.open({
            mode: "time",
            display: "default",
            // No is24Hour: the dialog follows the device's hour cycle, like
            // the iOS compact picker and formatMinutes do.
            minuteInterval: WINDOW_INTERVAL_MINUTES,
            value,
            onValueChange: (_event, date) => handlePicked(date),
            // Cancel keeps the current value; nothing to do.
            onDismiss: () => {},
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${label} ${formatMinutes(minutes)}`}
        accessibilityHint="Opens a time picker"
        hitSlop={6}
        testID={testID}
        style={({ pressed }) => [
          styles.capsule,
          { backgroundColor: colors.bgAlt },
          pressed && styles.capsulePressed,
        ]}
      >
        <AppText variant="lead">{formatMinutes(minutes)}</AppText>
      </Pressable>
    );

  return (
    <View style={styles.row}>
      <AppText variant="lead" style={styles.label}>
        {label}
      </AppText>
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    // The compact picker's popover is presented by UIKit above the row;
    // nothing here may clip it.
    overflow: "visible",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: ROW_HEIGHT,
    overflow: "visible",
  },
  label: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  capsule: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  capsulePressed: { opacity: 0.7 },
});
