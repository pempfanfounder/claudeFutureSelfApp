import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";

import { useColors } from "../ThemeProvider";
import { radii, shadows, spacing } from "../tokens";
import { AppText } from "./AppText";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "lg" | "md";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  disabled,
  loading,
  style,
  testID,
}: ButtonProps) {
  const colors = useColors();
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";

  const backgroundColor = isPrimary
    ? colors.ctaBg
    : isSecondary
      ? colors.card
      : "transparent";

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        { backgroundColor },
        isSecondary && { borderWidth: 1, borderColor: colors.borderStrong },
        isPrimary && shadows.md,
        (disabled || loading) && { opacity: 0.5 },
        pressed && !disabled && { transform: [{ scale: 0.985 }], opacity: 0.92 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.ctaInk : colors.ink} />
      ) : (
        <AppText
          variant="lead"
          tone={isPrimary ? "ctaInk" : "ink"}
          style={{ fontFamily: "Inter_600SemiBold" }}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  lg: {
    paddingVertical: spacing.lg + 2,
    paddingHorizontal: spacing.xxl,
    minHeight: 56,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
  },
});
