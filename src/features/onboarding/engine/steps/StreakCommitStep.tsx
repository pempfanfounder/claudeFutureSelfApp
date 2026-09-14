import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import { radii, spacing, type } from "@/design-system/tokens";

import { resolveLines, resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";
import { weekStrip } from "./weekStrip";

const DEFAULT_GOAL_DAYS = "21";
const DAY_CHECK_SIZE = 14;
const HERO_WIDTH = 200;
const HERO_HEIGHT = 210;
/** Preview option 7: 4.4rem serif 1. */
const NUMERAL_SIZE = 70;
const GRADIENT_HEIGHT = Math.round(NUMERAL_SIZE * 2.8);
const GRADIENT_TRAVEL = GRADIENT_HEIGHT - NUMERAL_SIZE;
const RISE_MS = 2800;
const HALO_MS = 2400;
const TIP_MS = 2600;

/** Brand fire stops from the numeral-burn preview (cream, terracotta, gold, umber). */
const BURN_COLORS = [
  "#2A1E16",
  "#B4553C",
  "#C9A97A",
  "#4A2418",
  "#B4553C",
  "#F3E9DC",
  "#93432F",
] as const;
const BURN_STOPS = [0, 0.18, 0.36, 0.52, 0.7, 0.86, 1] as const;

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
 * Preview option 7 — Numeral burn. The serif "1" is the flame: Future Self
 * fire colors rise through the glyph. A terracotta halo and ghost tongue
 * breathe behind it. Upright only (scale / fade, no rotate). Reduce Motion
 * freezes the still frame.
 */
function NumeralBurn() {
  const reduced = useMotionPreference();
  const rise = useSharedValue(0);
  const halo = useSharedValue(0.5);
  const tip = useSharedValue(0.5);
  useEffect(() => {
    cancelAnimation(rise);
    cancelAnimation(halo);
    cancelAnimation(tip);
    if (reduced) {
      rise.set(0);
      halo.set(0.5);
      tip.set(0.5);
      return;
    }
    rise.set(0);
    rise.set(
      withRepeat(
        withTiming(1, { duration: RISE_MS, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    halo.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: HALO_MS / 2,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0, {
            duration: HALO_MS / 2,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
      ),
    );
    tip.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: TIP_MS / 2,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0, {
            duration: TIP_MS / 2,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(rise);
      cancelAnimation(halo);
      cancelAnimation(tip);
    };
  }, [reduced, rise, halo, tip]);
  const haloStyle = useAnimatedStyle(() => {
    const t = halo.get();
    return {
      opacity: 0.55 + t * 0.4,
      transform: [{ scale: 0.88 + t * 0.24 }],
    };
  });
  const ghostStyle = useAnimatedStyle(() => {
    const t = tip.get();
    return {
      opacity: 0.55 + t * 0.4,
      transform: [{ translateY: 4 - t * 10 }, { scaleY: 0.92 + t * 0.16 }],
    };
  });
  const burnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -rise.get() * GRADIENT_TRAVEL }],
  }));
  return (
    <View pointerEvents="none" testID="streak-numeral-burn" style={styles.flameWrap}>
      <Animated.View style={[styles.halo, haloStyle]} />
      <Animated.View style={[styles.ghostFlame, ghostStyle]}>
        <View style={styles.ghostTongue} />
        <View style={styles.ghostBase} />
      </Animated.View>
      <View style={styles.numeralGlow}>
        <MaskedView
          style={styles.numeralMask}
          maskElement={
            <View style={styles.numeralMaskFill}>
              <Text style={styles.numeral} testID="streak-day-1">
                1
              </Text>
            </View>
          }
        >
          <Animated.View style={[styles.burnStrip, burnStyle]}>
            <LinearGradient
              colors={BURN_COLORS}
              locations={BURN_STOPS}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </MaskedView>
      </View>
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
            <NumeralBurn />
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
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  flameWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(180, 85, 60, 0.28)",
  },
  ghostFlame: {
    position: "absolute",
    width: 120,
    height: 150,
    alignItems: "center",
    justifyContent: "flex-end",
    transformOrigin: "bottom",
  },
  ghostTongue: {
    position: "absolute",
    top: 8,
    width: 56,
    height: 118,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: "rgba(180, 85, 60, 0.22)",
  },
  ghostBase: {
    width: 86,
    height: 44,
    borderRadius: 18,
    backgroundColor: "rgba(180, 85, 60, 0.2)",
    marginBottom: 0,
  },
  numeralGlow: {
    zIndex: 3,
    shadowColor: "#B4553C",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  numeralMask: {
    width: 88,
    height: NUMERAL_SIZE,
    overflow: "hidden",
  },
  numeralMaskFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  numeral: {
    fontFamily: type.serif,
    fontSize: NUMERAL_SIZE,
    lineHeight: NUMERAL_SIZE,
    letterSpacing: NUMERAL_SIZE * -0.03,
    color: "#000000",
    fontWeight: "400",
    textAlign: "center",
  },
  burnStrip: {
    width: 88,
    height: GRADIENT_HEIGHT,
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
