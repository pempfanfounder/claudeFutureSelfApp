import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "../ThemeProvider";
import { motion } from "../tokens";

interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  height?: number;
}

export function ProgressBar({ progress, height = 4 }: ProgressBarProps) {
  const colors = useColors();
  const value = useSharedValue(progress);

  useEffect(() => {
    value.set(
      withTiming(Math.min(1, Math.max(0, progress)), { duration: motion.base }),
    );
  }, [progress, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${value.get() * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      style={[
        styles.track,
        { backgroundColor: colors.border, height, borderRadius: height / 2 },
      ]}
    >
      <Animated.View
        style={[
          fillStyle,
          { backgroundColor: colors.ink, height, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
});
