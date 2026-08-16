import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";

import { DAILY_LIMIT } from "@/features/content/types";
import { requestNotificationPermission } from "@/features/notifications/push";
import {
  applyWindowChange,
  formatMinutes,
  type WindowKey,
} from "@/features/notifications/time";

import { resolveLines, resolveText } from "../resolve";
import { useOnboardingStore } from "../store";
import { StreamedLines } from "../StreamedLines";
import type { OnboardingContext, OnboardingStep } from "../types";
import { CountRow } from "./notifications/CountRow";
import { MockNotification } from "./notifications/MockNotification";
import { TimeWindowCard } from "./notifications/TimeWindowCard";

interface NotificationsStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  family: "iam" | "stella";
  onDone: () => void;
}

/**
 * Notification education before the OS dialog.
 * iam family: the I Am config screen — mock notification banner, one
 * count pill per type (Quotes / Affirmations, 0..DAILY_LIMIT; the server
 * enforces the cap too), a Start at / End at card with the native time
 * pickers, then "Allow and Save".
 * stella family: streamed voice + a single contextual ask.
 */
export function NotificationsStep({
  step,
  ctx,
  family,
  onDone,
}: NotificationsStepProps) {
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
              label={resolveText(step.cta, ctx) ?? "Turn them on"}
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

  // The picker hands back raw minutes; the pure rule snaps them to the
  // 30-minute grid and moves the other bound so start ≤ end − 60.
  const changeWindow = (key: WindowKey, minutes: number) =>
    setNotificationPrefs(applyWindowChange(notificationPrefs, key, minutes));

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

        <View style={styles.mock}>
          <MockNotification
            body={step.mockLine ?? "Discipline is remembering what you want."}
          />
        </View>

        <View style={styles.rows}>
          <CountRow
            id="quotes"
            label="Quotes"
            value={notificationPrefs.quotesPerDay}
            max={DAILY_LIMIT}
            onChange={(v) => setNotificationPrefs({ quotesPerDay: v })}
          />
          <CountRow
            id="affirmations"
            label="Affirmations"
            value={notificationPrefs.affirmationsPerDay}
            max={DAILY_LIMIT}
            onChange={(v) => setNotificationPrefs({ affirmationsPerDay: v })}
          />
          <TimeWindowCard range={notificationPrefs} onChange={changeWindow} />
        </View>

        <AppText
          variant="label"
          tone="ink3"
          center
          style={styles.windowHint}
          testID="window-hint"
        >
          {`Between ${formatMinutes(notificationPrefs.windowStartMinutes)} and ${formatMinutes(
            notificationPrefs.windowEndMinutes,
          )} · your future self won't wake you`}
        </AppText>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={resolveText(step.cta, ctx) ?? "Allow and Save"}
          onPress={ask}
          loading={requesting}
          testID="notif-allow"
        />
        <Pressable
          onPress={onDone}
          style={styles.maybeLater}
          hitSlop={8}
          accessibilityRole="button"
          testID="notif-not-now"
        >
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
  sub: { marginTop: spacing.md },
  mock: { marginTop: spacing.xl },
  rows: { marginTop: spacing.xxl, gap: spacing.md },
  windowHint: { marginTop: spacing.md },
  footer: { paddingBottom: spacing.sm },
  maybeLater: { marginTop: spacing.lg },
});
