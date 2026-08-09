import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { useColors } from "../ThemeProvider";
import { radii, spacing } from "../tokens";
import { AppText } from "./AppText";

interface SelectableRowProps {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/** Onboarding answer row: rounded card, accent border when selected. */
export function SelectableRow({
  label,
  emoji,
  selected,
  onPress,
  testID,
}: SelectableRowProps) {
  const colors = useColors();
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
        {
          backgroundColor: selected ? colors.bgAlt : colors.card,
          borderColor: selected ? colors.ink : colors.border,
        },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {emoji ? <AppText variant="lead">{emoji}</AppText> : null}
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
  label: { flex: 1 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
});
