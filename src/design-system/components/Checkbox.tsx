import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useColors } from "../ThemeProvider";
import { radii, spacing } from "../tokens";
import { AppText } from "./AppText";
import { Icon } from "./Icon";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Label content; nested `AppText` links stay tappable on their own. */
  children: ReactNode;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

const BOX = 20;

/**
 * Small square consent checkbox with a caption-sized label. The whole
 * row toggles; link spans inside the label keep their own `onPress`.
 */
export function Checkbox({
  checked,
  onChange,
  children,
  accessibilityLabel,
  disabled,
  testID,
}: CheckboxProps) {
  const colors = useColors();
  const toggle = () => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(!checked);
  };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      onPress={toggle}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.row, disabled && styles.disabled]}
      testID={testID}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colors.ink : colors.borderStrong,
            backgroundColor: checked ? colors.ink : colors.card,
          },
        ]}
      >
        {checked ? <Icon name="check" size={13} color={colors.bg} /> : null}
      </View>
      <AppText variant="label" tone="ink2" style={styles.label}>
        {children}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    minHeight: 32,
  },
  disabled: { opacity: 0.5 },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radii.sm - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  label: { flex: 1 },
});
