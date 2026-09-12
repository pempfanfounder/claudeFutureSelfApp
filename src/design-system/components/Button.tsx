import { useEffect, useState } from "react";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { CONTROLLED_SPRING, MOTION, useMotionPreference } from "../motion";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";

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
  const reduced = useMotionPreference();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : scale.get() }],
  }));
  useEffect(() => {
    cancelAnimation(scale);
    scale.set(1);
  }, [reduced, scale]);
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
    <Animated.View style={[animatedStyle, styles.wrap]}>
      <Pressable
        disabled={Boolean(disabled || loading)}
        onPressIn={() => {
          setPressed(true);
          if (!disabled && !loading && !reduced) {
            cancelAnimation(scale);
            scale.set(MOTION.pressScale);
          }
        }}
        onPressOut={() => {
          setPressed(false);
          cancelAnimation(scale);
          scale.set(reduced ? 1 : withSpring(1, CONTROLLED_SPRING));
        }}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled || loading) }}
        onPress={handlePress}
        style={[
          styles.base,
          size === "lg" ? styles.lg : styles.md,
          { backgroundColor },
          isSecondary && { borderWidth: 1, borderColor: colors.borderStrong },
          isPrimary && shadows.md,
          (disabled || loading) && { opacity: 0.5 },
          pressed && !disabled && !loading && { opacity: 0.92 },
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch" },
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
