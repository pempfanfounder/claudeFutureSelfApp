import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { resolveOptionIcon } from "../optionIcon";
import { useColors } from "../ThemeProvider";
import { radii, spacing } from "../tokens";
import { AppText } from "./AppText";
import { Icon } from "./Icon";

interface SelectableRowProps {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Tighter vertical rhythm for long option lists (6+), so every answer
   * fits on one screen. Still a 53 pt row: comfortably above the 44 pt
   * minimum touch target.
   */
  compact?: boolean;
  testID?: string;
}

/** Onboarding answer row: rounded card, accent border when selected. */
export function SelectableRow({
  label,
  emoji,
  selected,
  onPress,
  compact,
  testID,
}: SelectableRowProps) {
  const colors = useColors();
  const iconName = emoji ? resolveOptionIcon(emoji) : null;
  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        {
          backgroundColor: selected ? colors.bgAlt : colors.card,
          borderColor: selected ? colors.ink : colors.border,
        },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {iconName ? (
        <View testID={testID ? `${testID}-icon` : "option-icon"}>
          <Icon name={iconName} size={22} color={colors.ink} />
        </View>
      ) : null}
      <AppText variant="lead" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.dot,
          { borderColor: selected ? colors.ink : colors.borderStrong },
          selected && { backgroundColor: colors.ink },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  // 12 + 12 padding + a 26 pt lead line + 3 pt of border = ~53 pt.
  rowCompact: { paddingVertical: spacing.md, marginBottom: spacing.sm },
  label: { flex: 1 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
});
