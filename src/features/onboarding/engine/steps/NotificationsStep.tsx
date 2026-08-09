import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

import { requestNotificationPermission } from "@/features/notifications/push";

import { resolveLines, resolveText } from "../resolve";
import { useOnboardingStore } from "../store";
import { StreamedLines } from "../StreamedLines";
import type { OnboardingContext, OnboardingStep } from "../types";

interface NotificationsStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  family: "iam" | "stella";
  onDone: () => void;
}

/**
 * Notification education before the OS dialog.
 * iam family: I Am-style config screen — mock notification, per-type
 * frequency steppers (0-3, server-enforced cap), window steppers.
 * stella family: streamed voice + a single contextual ask.
 */
export function NotificationsStep({
  step,
  ctx,
  family,
  onDone,
}: NotificationsStepProps) {
  const colors = useColors();
  const { notificationPrefs, setNotificationPrefs, setPermissionStatus } =
    useOnboardingStore();
  const [requesting, setRequesting] = useState(false);
  const [streamed, setStreamed] = useState(false);

  const ask = async () => {
    setRequesting(true);
    const status = await requestNotificationPermission();
    setPermissionStatus(status);
    setRequesting(false);
    onDone();
  };

  if (family === "stella") {
    return (
      <Animated.View entering={FadeIn.duration(320)} style={styles.stellaRoot}>
        <StreamedLines
          lines={resolveLines(step, ctx)}
          onDone={() => setStreamed(true)}
        />
        {streamed ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <Button
              label={step.cta ?? "Turn them on"}
              onPress={ask}
              loading={requesting}
              testID="notif-allow"
            />
            <Pressable onPress={onDone} style={styles.maybeLater} hitSlop={8}>
              <AppText variant="body" tone="ink3" center>
                {step.secondaryCta ?? "Maybe later"}
              </AppText>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  }

  const stepper = (
    label: string,
    value: number,
    onChange: (next: number) => void,
    max: number,
    suffix: string,
  ) => (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <AppText variant="lead" style={styles.rowLabel}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <AppText variant="h3">−</AppText>
        </Pressable>
        <AppText variant="lead" style={styles.stepValue}>
          {value}
          {suffix}
        </AppText>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <AppText variant="h3">+</AppText>
        </Pressable>
      </View>
    </View>
  );

  const hourLabel = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    const suffix = h < 12 ? "AM" : "PM";
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}:00 ${suffix}`;
  };

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="h2">{resolveText(step.headline, ctx)}</AppText>
        <AppText variant="lead" tone="ink2" style={styles.sub}>
          {resolveText(step.sub, ctx)}
        </AppText>

        <View
          style={[
            styles.mockCard,
            { backgroundColor: colors.card },
            shadows.md,
          ]}
        >
          <View style={styles.mockHeader}>
            <View style={[styles.mockIcon, { backgroundColor: colors.bg }]}>
              <AppText variant="label">fs</AppText>
            </View>
            <AppText variant="label" tone="ink2">
              Future Self
            </AppText>
            <AppText variant="label" tone="ink3" style={styles.mockNow}>
              Now
            </AppText>
          </View>
          <AppText variant="body" style={styles.mockBody}>
            {step.mockLine ?? "Discipline is remembering what you want."}
          </AppText>
        </View>

        {stepper(
          "Quotes",
          notificationPrefs.quotesPerDay,
          (v) => setNotificationPrefs({ quotesPerDay: v }),
          3,
          "x a day",
        )}
        {stepper(
          "Affirmations",
          notificationPrefs.affirmationsPerDay,
          (v) => setNotificationPrefs({ affirmationsPerDay: v }),
          3,
          "x a day",
        )}
        {stepper(
          "Start at",
          notificationPrefs.windowStartMinutes / 60,
          (v) =>
            setNotificationPrefs({
              windowStartMinutes: Math.min(
                v * 60,
                notificationPrefs.windowEndMinutes - 60,
              ),
            }),
          23,
          `:00`,
        )}
        {stepper(
          "End at",
          notificationPrefs.windowEndMinutes / 60,
          (v) =>
            setNotificationPrefs({
              windowEndMinutes: Math.max(
                v * 60,
                notificationPrefs.windowStartMinutes + 60,
              ),
            }),
          23,
          ":00",
        )}
        <AppText variant="label" tone="ink3" center style={styles.windowHint}>
          {`Between ${hourLabel(notificationPrefs.windowStartMinutes)} and ${hourLabel(
            notificationPrefs.windowEndMinutes,
          )} · your future self won't wake you`}
        </AppText>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={step.cta ?? "Allow and Save"}
          onPress={ask}
          loading={requesting}
          testID="notif-allow"
        />
        <Pressable onPress={onDone} style={styles.maybeLater} hitSlop={8}>
          <AppText variant="body" tone="ink3" center>
            Not now
          </AppText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stellaRoot: { flex: 1, justifyContent: "center" },
  content: { paddingTop: 72, paddingBottom: spacing.xl },
  sub: { marginTop: spacing.md, marginBottom: spacing.xl },
  mockCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  mockHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mockIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  mockNow: { marginLeft: "auto" },
  mockBody: { marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  rowLabel: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { minWidth: 76, textAlign: "center" },
  windowHint: { marginTop: spacing.sm },
  footer: { paddingBottom: spacing.sm },
  maybeLater: { marginTop: spacing.lg },
});
