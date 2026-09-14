import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeInRight,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppText, Button, Icon } from "@/design-system/components";
import { useMotionPreference } from "@/design-system/motion";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";

import { resolveLines, resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";
import { weekStrip } from "./weekStrip";

const DEFAULT_GOAL_DAYS = "21";
const DAY_CHECK_SIZE = 14;
/** Large enough that the day "1" sits inside the body of the flame. */
const FLAME_SIZE = 200;
const INNER_FLAME_SIZE = 156;
const HERO_SIZE = 220;

interface StreakCommitStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onAnswer: (value: string) => void;
  /** Injectable clock for tests; production uses the device date. */
  now?: Date;
}

/**
 * The goal the user picked on the preceding streak-goal step (3/7/21),
 * or 21 when that step was skipped or the variant has no goal step.
 */
function chosenGoalDays(ctx: OnboardingContext): string {
  const goal = ctx.answers["raw.streak_goal"];
  return typeof goal === "string" && goal.length > 0 ? goal : DEFAULT_GOAL_DAYS;
}

/**
 * One very large theme-colored flame with the day "1" sitting in it.
 * Scale + opacity flicker reads as burning; Reduce Motion freezes it.
 */
function BurningFlame({ color }: { color: string }) {
  const reduced = useMotionPreference();
  const burn = useSharedValue(1);
  const flicker = useSharedValue(0.92);
  const inner = useSharedValue(0.88);
  useEffect(() => {
    cancelAnimation(burn);
    cancelAnimation(flicker);
    cancelAnimation(inner);
    if (reduced) {
      burn.set(1);
      flicker.set(1);
      inner.set(0.92);
      return;
    }
    burn.set(
      withRepeat(
        withSequence(
          withTiming(1.06, {
            duration: 420,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.96, {
            duration: 280,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(1.04, {
            duration: 360,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.98, {
            duration: 240,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
      ),
    );
    flicker.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.78, {
            duration: 140,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.95, {
            duration: 220,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.82, {
            duration: 160,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
      ),
    );
    inner.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.72, {
            duration: 200,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0.9, { duration: 180, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(burn);
      cancelAnimation(flicker);
      cancelAnimation(inner);
    };
  }, [reduced, burn, flicker, inner]);
  const outerStyle = useAnimatedStyle(() => ({
    opacity: flicker.get(),
    transform: [{ scale: burn.get() }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    opacity: inner.get(),
    transform: [{ scale: 0.92 + (1 - inner.get()) * 0.12 }],
  }));
  return (
    <View pointerEvents="none" testID="streak-flame" style={styles.flameWrap}>
      <Animated.View style={[styles.flameLayer, outerStyle]}>
        <Icon name="flame" size={FLAME_SIZE} color={color} weight="bold" />
      </Animated.View>
      <Animated.View style={[styles.flameLayer, innerStyle]}>
        <Icon
          name="flame"
          size={INNER_FLAME_SIZE}
          color={color}
          weight="bold"
        />
      </Animated.View>
    </View>
  );
}

/**
 * I Am-style streak commitment: the day "1", a week tracker that starts
 * on today, one line of what counts and one small line of what breaks
 * it. Variants that still want education beats can pass `lines`. No goal
 * picking here; the single CTA commits to the goal chosen one screen
 * earlier ("I'm in for {N} days"), defaulting to 21 days.
 */
export function StreakCommitStep({
  step,
  ctx,
  onAnswer,
  now,
}: StreakCommitStepProps) {
  const colors = useColors();
  const lines = resolveLines(step, ctx);
  const goalDays = chosenGoalDays(ctx);
  const days = useMemo(() => weekStrip(now ?? new Date()), [now]);

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      {/* Short content centres itself; longer variants still scroll. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Animated.View
          entering={ZoomIn.duration(500).delay(150)}
          style={styles.dayWrap}
        >
          <View style={styles.dayHero}>
            <BurningFlame color={colors.accent} />
            <AppText variant="display" center style={styles.dayNumeral}>
              1
            </AppText>
          </View>
          <View
            style={[
              styles.groundLine,
              { backgroundColor: colors.borderStrong },
            ]}
          />
        </Animated.View>

        <AppText variant="h2" center>
          {resolveText(step.headline, ctx)}
        </AppText>
        <AppText variant="lead" tone="ink2" center style={styles.sub}>
          {resolveText(step.sub, ctx)}
        </AppText>

        <View
          style={[styles.weekCard, { backgroundColor: colors.card }]}
          testID="week-strip"
        >
          <View style={styles.weekRow}>
            {days.map((day, i) => (
              // Labels can repeat in some locales, so key by position.
              <View key={i} style={styles.weekDay}>
                <View
                  style={[
                    styles.weekDot,
                    { borderColor: colors.borderStrong },
                    // The strip starts on today, so index 0 is today.
                    i === 0 && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                    },
                  ]}
                >
                  {i === 0 ? (
                    <Icon
                      name="check"
                      size={DAY_CHECK_SIZE}
                      color={colors.ctaInk}
                    />
                  ) : null}
                </View>
                <AppText variant="label" tone={i === 0 ? "ink" : "ink3"}>
                  {day}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        {lines.length > 0 ? (
          <View style={styles.lines}>
            {lines.map((line, i) => {
              const sep = line.indexOf(" · ");
              const prefix = sep >= 0 ? line.slice(0, sep) : null;
              const body = sep >= 0 ? line.slice(sep + 3) : line;
              return (
                <Animated.View
                  key={line}
                  entering={FadeInRight.duration(280).delay(150 + i * 120)}
                  style={styles.lineRow}
                >
                  {prefix ? (
                    <AppText variant="label" tone="ink3">
                      {prefix}
                    </AppText>
                  ) : null}
                  <AppText variant="body">{body}</AppText>
                </Animated.View>
              );
            })}
          </View>
        ) : null}

        {step.info ? (
          <AppText variant="label" tone="ink3" center style={styles.info}>
            {step.info}
          </AppText>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={resolveText(step.cta, ctx) ?? `I'm in for ${goalDays} days`}
          // Echo the chosen goal so raw.streak_goal holds one value
          // whether the user picked 3/7/21 or skipped (→ 21).
          onPress={() => onAnswer(goalDays)}
          testID="continue"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  dayWrap: { alignItems: "center", marginBottom: spacing.xl },
  dayHero: {
    width: HERO_SIZE,
    height: HERO_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  flameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  flameLayer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumeral: {
    fontSize: 56,
    lineHeight: 62,
    // Flame.fill is pointed at the top; sit the 1 in the body.
    transform: [{ translateY: 18 }],
  },
  groundLine: { width: 72, height: 2, borderRadius: 1, marginTop: spacing.xs },
  sub: { marginTop: spacing.md },
  weekCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: { alignItems: "center", gap: spacing.xs },
  weekDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  lines: { gap: spacing.lg, marginBottom: spacing.xl },
  lineRow: { gap: spacing.xs },
  info: { paddingHorizontal: spacing.lg },
  footer: { paddingBottom: spacing.sm },
});
