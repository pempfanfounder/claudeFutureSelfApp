import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";

interface PreparingStepProps {
  headline: string;
  /** Real work to perform while the animation runs. */
  work: () => Promise<void>;
  onDone: () => void;
  minDurationMs?: number;
}

/**
 * The "preparing your direction" moment. Honest by construction: the
 * animation runs for at least minDuration, but the completion work
 * (persisting personalization, generating daily sets, registering the
 * notification plan) actually executes here.
 */
export function PreparingStep({ headline, work, onDone, minDurationMs = 5500 }: PreparingStepProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    scale.set(
      withRepeat(withTiming(1.15, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    glow.set(
      withRepeat(withTiming(0.9, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [scale, glow]);

  useEffect(() => {
    let finished = false;
    const start = Date.now();
    (async () => {
      try {
        await work();
      } finally {
        const remaining = Math.max(0, minDurationMs - (Date.now() - start));
        setTimeout(() => {
          if (!finished) {
            finished = true;
            onDone();
          }
        }, remaining);
      }
    })();
    return () => {
      finished = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
    opacity: glow.get(),
  }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.root}>
      <Animated.View style={[styles.disc, { backgroundColor: colors.accent }, discStyle]} />
      <AppText variant="h3" center style={styles.headline}>
        {headline}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  disc: { width: 120, height: 120, borderRadius: 60 },
  headline: { marginTop: spacing.xxl },
});
