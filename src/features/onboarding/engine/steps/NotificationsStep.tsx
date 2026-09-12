import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";

import { DAILY_LIMIT } from "@/features/content/types";
import {
  getPermissionStatus,
  requestNotificationPermission,
} from "@/features/notifications/push";
import {
  applyWindowChange,
  type WindowKey,
} from "@/features/notifications/time";

import { resolveLines, resolveText } from "../resolve";
import { useOnboardingStore } from "../store";
import { StreamedLines } from "../StreamedLines";
import type { OnboardingContext, OnboardingStep } from "../types";
import { CountRow } from "./notifications/CountRow";
import { GroupCard } from "./notifications/GroupCard";
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
 * iam family: the config screen. A mock notification banner, then two
 * grouped cards on shared chrome: Quotes / Affirmations count rows
 * (0..DAILY_LIMIT; the server enforces the cap too) and Start at / End at
 * rows with the native time pickers, then "Turn on reminders". No
 * sentence restates the window (feedback 2026-09-12). The whole screen
 * fits a 6.1" phone without scrolling: keep the card rows at 52 pt.
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
  // Reinstalls and updates carry the OS permission over, so iOS shows no
  // dialog on the next request. Saying "Allow" then would promise a
  // prompt that never appears; the button only saves the counts.
  const [alreadyGranted, setAlreadyGranted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPermissionStatus()
      .then((status) => {
        if (!cancelled) setAlreadyGranted(status === "granted");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
          <GroupCard testID="count-card">
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
          </GroupCard>
          <TimeWindowCard range={notificationPrefs} onChange={changeWindow} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={
            alreadyGranted
              ? "Save"
              : (resolveText(step.cta, ctx) ?? "Turn on reminders")
          }
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
  footer: { paddingBottom: spacing.sm },
  maybeLater: { marginTop: spacing.lg },
});
