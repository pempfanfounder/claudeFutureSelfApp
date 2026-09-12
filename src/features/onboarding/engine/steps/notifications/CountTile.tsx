import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";

interface CountTileProps {
  /** Tile label, e.g. "Quotes". Also used in the buttons' a11y labels. */
  label: string;
  /** testID prefix: `${id}-minus`, `${id}-plus`, `${id}-value`. */
  id: string;
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
}

const BUTTON_HEIGHT = 40;
const DISABLED_OPACITY = 0.35;

/**
 * "Daily dose" tile: a square card with the label as an eyebrow, the
 * count as a large serif numeral (the same type as the streak day "1"),
 * "a day" under it and a split − | + control along the bottom edge.
 * Two tiles sit side by side, so both counts read at a glance. At a
 * bound the corresponding half dims and does nothing.
 */
export function CountTile({
  label,
  id,
  value,
  min = 0,
  max,
  onChange,
}: CountTileProps) {
  const colors = useColors();
  const lower = label.toLowerCase();

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };

  const half = (kind: "minus" | "plus") => {
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
          styles.half,
          disabled && styles.halfDisabled,
          pressed && !disabled && { backgroundColor: colors.bgAlt },
        ]}
      >
        <Icon name={kind} size={16} color={colors.ink} />
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={`${id}-tile`}
    >
      <View style={styles.body}>
        <AppText variant="eyebrow" tone="ink3">
          {label}
        </AppText>
        {/* Keyed by value so each change drops the new numeral in. */}
        <Animated.View
          key={value}
          entering={FadeInDown.duration(160)}
          exiting={FadeOutUp.duration(120)}
        >
          <AppText
            variant="display"
            center
            style={styles.value}
            testID={`${id}-value`}
            accessibilityLabel={`${value} ${lower} a day`}
          >
            {value}
          </AppText>
        </Animated.View>
        <AppText variant="label" tone="ink3">
          a day
        </AppText>
      </View>
      <View style={[styles.controls, { borderTopColor: colors.border }]}>
        {half("minus")}
        <View style={[styles.split, { backgroundColor: colors.border }]} />
        {half("plus")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  body: {
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  value: { marginTop: spacing.xs },
  controls: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  half: {
    flex: 1,
    height: BUTTON_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  halfDisabled: { opacity: DISABLED_OPACITY },
  split: { width: StyleSheet.hairlineWidth },
});
