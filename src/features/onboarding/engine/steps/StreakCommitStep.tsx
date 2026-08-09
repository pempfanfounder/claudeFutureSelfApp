import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInRight, ZoomIn } from "react-native-reanimated";

import { AppText, Button, SelectableRow } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";

import { resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";

const WEEKDAYS = ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"];

interface StreakCommitStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onAnswer: (value: string) => void;
}

/** I Am-style streak commitment: day "1", weekday tracker, goal pick. */
export function StreakCommitStep({
  step,
  ctx,
  onAnswer,
}: StreakCommitStepProps) {
  const colors = useColors();
  const [goal, setGoal] = useState<string | null>(null);

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Animated.View
          entering={ZoomIn.duration(500).delay(150)}
          style={styles.dayWrap}
        >
          <AppText variant="display" center>
            1
          </AppText>
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

        <View style={[styles.weekCard, { backgroundColor: colors.card }]}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day, i) => (
              <View key={day} style={styles.weekDay}>
                <View
                  style={[
                    styles.weekDot,
                    { borderColor: colors.borderStrong },
                    i === 0 && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                    },
                  ]}
                >
                  {i === 0 ? <AppText variant="label">✓</AppText> : null}
                </View>
                <AppText variant="label" tone="ink3">
                  {day}
                </AppText>
              </View>
            ))}
          </View>
          <AppText
            variant="label"
            tone="ink3"
            center
            style={styles.weekCaption}
          >
            Build a streak, one day at a time
          </AppText>
        </View>

        <View style={styles.options}>
          {step.options?.map((option) => (
            <SelectableRow
              key={option.slug}
              label={option.label}
              selected={goal === option.slug}
              onPress={() => setGoal(option.slug)}
              testID={`goal-${option.slug}`}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={step.cta ?? "Commit"}
          onPress={() => goal && onAnswer(goal)}
          disabled={!goal}
          testID="continue"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 64, paddingBottom: spacing.xl },
  dayWrap: { alignItems: "center", marginBottom: spacing.xl },
  groundLine: { width: 72, height: 2, borderRadius: 1, marginTop: spacing.xs },
  sub: { marginTop: spacing.md },
  weekCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
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
  weekCaption: { marginTop: spacing.md },
  options: { marginBottom: spacing.md },
  footer: { paddingBottom: spacing.sm },
});
