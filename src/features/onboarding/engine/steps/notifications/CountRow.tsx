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

export const COUNT_ROW_HEIGHT = 52;
const STEPPER_HEIGHT = 34;
const STEP_BUTTON_WIDTH = 36;
const DISABLED_OPACITY = 0.35;

/**
 * "How many" row inside a `GroupCard`: label at left, a single joined
 * stepper capsule at right. The capsule is outlined (hairline edge, faint
 * fill) with plain − / + glyphs and the count as a serif numeral between
 * them: no solid dark circular buttons, no "3x". At a bound the
 * corresponding half dims and does nothing.
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
          disabled && styles.buttonDisabled,
          pressed && !disabled && { backgroundColor: colors.border },
        ]}
      >
        <Icon name={kind} size={15} color={colors.ink} />
      </Pressable>
    );
  };

  return (
    <View style={styles.row}>
      <AppText variant="lead" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.stepper,
          { backgroundColor: colors.bgAlt, borderColor: colors.borderStrong },
        ]}
      >
        {button("minus")}
        <AppText
          variant="h3"
          style={styles.value}
          testID={`${id}-value`}
          accessibilityLabel={`${value} ${lower} a day`}
        >
          {value}
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
    minHeight: COUNT_ROW_HEIGHT,
  },
  label: { flex: 1 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    height: STEPPER_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  button: {
    width: STEP_BUTTON_WIDTH,
    height: STEPPER_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: DISABLED_OPACITY },
  value: {
    minWidth: 30,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    paddingHorizontal: spacing.xs,
  },
});
