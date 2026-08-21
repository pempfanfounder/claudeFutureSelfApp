import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";

interface CountRowProps {
  /** Row label, e.g. "Quotes". Also used in the buttons' a11y labels. */
  label: string;
  /** testID prefix: `${id}-minus`, `${id}-plus`, `${id}-value`. */
  id: string;
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
}

const ROW_HEIGHT = 56;
const BUTTON_SIZE = 36;
const DISABLED_OPACITY = 0.35;

/**
 * I Am "How many" row: a full-width pill with the label at left and a
 * − value + stepper at right (solid dark round buttons). At a bound the
 * corresponding button dims and does nothing.
 */
export function CountRow({
  label,
  id,
  value,
  min = 0,
  max,
  onChange,
}: CountRowProps) {
  const colors = useColors();
  const lower = label.toLowerCase();

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };

  const button = (kind: "minus" | "plus") => {
    const disabled = kind === "minus" ? value <= min : value >= max;
    return (
      <Pressable
        onPress={() => step(kind === "minus" ? -1 : 1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          kind === "minus" ? `Fewer ${lower}` : `More ${lower}`
        }
        accessibilityState={{ disabled }}
        hitSlop={6}
        testID={`${id}-${kind}`}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.ctaBg },
          disabled && styles.buttonDisabled,
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        <Icon name={kind} size={18} color={colors.ctaInk} />
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <AppText variant="lead" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        {button("minus")}
        <AppText
          variant="lead"
          style={styles.value}
          testID={`${id}-value`}
          accessibilityLabel={`${value} ${lower} a day`}
        >
          {value}x
        </AppText>
        {button("plus")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: ROW_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.xl,
    // Keeps the round buttons concentric with the pill's rounded end.
    paddingRight: (ROW_HEIGHT - BUTTON_SIZE) / 2,
  },
  label: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center" },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: DISABLED_OPACITY },
  buttonPressed: { opacity: 0.7 },
  value: { minWidth: 64, textAlign: "center" },
});
