import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
const STEPPER_HEIGHT = 32;
/** Narrow halves: the capsule reads as one control, about 80 pt wide. */
const STEP_BUTTON_WIDTH = 28;
const VALUE_MIN_WIDTH = 24;
/** Same size as the iOS compact time picker's chip text. */
export const VALUE_FONT_SIZE = 17;
const DISABLED_OPACITY = 0.35;

/**
 * "How many" row inside a `GroupCard`: label at left; at right a narrow
 * joined stepper capsule (outlined, faint fill, plain − / + glyphs) with
 * the count in the platform system font, followed by a small "per day"
 * caption in secondary ink so the number reads as a rate. No solid dark
 * circular buttons, no "3x". At a bound the corresponding half dims and
 * does nothing.
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
      <View style={styles.control}>
        <View
          style={[
            styles.stepper,
            { backgroundColor: colors.bgAlt, borderColor: colors.borderStrong },
          ]}
        >
          {button("minus")}
          {/* Plain Text on purpose: no fontFamily, so the numeral is set
              in the platform system font (SF Pro on iOS), the same face
              and size as the compact time picker one card below. */}
          <Text
            style={[styles.value, { color: colors.ink }]}
            testID={`${id}-value`}
            accessibilityLabel={`${value} ${lower} per day`}
          >
            {value}
          </Text>
          {button("plus")}
        </View>
        <AppText variant="label" tone="ink3" style={styles.unit}>
          per day
        </AppText>
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
  control: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  // Matches the iOS compact picker's chip text: 17 pt regular, system face.
  value: {
    minWidth: VALUE_MIN_WIDTH,
    textAlign: "center",
    fontSize: VALUE_FONT_SIZE,
    lineHeight: VALUE_FONT_SIZE * 1.3,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
  },
  unit: { minWidth: 44 },
});
