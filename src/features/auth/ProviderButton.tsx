import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import {
  CONTROLLED_SPRING,
  MOTION,
  useMotionPreference,
} from "@/design-system/motion";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

interface ProviderButtonProps {
  label: string;
  /** Rendered left of the label; receives the resolved foreground color. */
  icon: (color: string, background: string) => ReactNode;
  onPress: () => void;
  /** solid = high-contrast CTA (Apple); outline = card with a thin border. */
  variant?: "solid" | "outline";
  loading?: boolean;
  disabled?: boolean;
  /** Visually muted but still tappable, so a tap can explain the gate. */
  dimmed?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export const PROVIDER_BUTTON_HEIGHT = 58;

/**
 * Tall, fully rounded sign-in pill with a centred icon + label pair.
 * Solid uses the theme CTA colors (dark ink on light themes, inverted on
 * dark themes — matching Apple's black/white button guidance); outline
 * uses the card surface with the strong border.
 */
export function ProviderButton({
  label,
  icon,
  onPress,
  variant = "outline",
  loading,
  disabled,
  dimmed,
  style,
  testID,
}: ProviderButtonProps) {
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

  const solid = variant === "solid";
  const background = solid ? colors.ctaBg : colors.card;
  const foreground = solid ? colors.ctaInk : colors.ink;
  const inert = Boolean(disabled || loading);

  const handlePress = () => {
    if (inert) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, styles.wrap]}>
      <Pressable
        disabled={inert}
        onPressIn={() => {
          setPressed(true);
          if (!inert && !reduced) {
            cancelAnimation(scale);
            scale.set(MOTION.pressScale);
          }
        }}
        onPressOut={() => {
          setPressed(false);
          cancelAnimation(scale);
          scale.set(reduced ? 1 : withSpring(1, CONTROLLED_SPRING));
        }}
        onPress={handlePress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert, busy: Boolean(loading) }}
        style={[
          styles.base,
          { backgroundColor: background },
          solid
            ? shadows.md
            : { borderWidth: 1, borderColor: colors.borderStrong },
          (inert || dimmed) && { opacity: 0.5 },
          pressed && !inert && { opacity: 0.92 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <>
            {icon(foreground, background)}
            <AppText
              variant="lead"
              style={[styles.label, { color: foreground }]}
            >
              {label}
            </AppText>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch" },
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderRadius: radii.pill,
    minHeight: PROVIDER_BUTTON_HEIGHT,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  label: { fontFamily: type.sansSemi },
});
