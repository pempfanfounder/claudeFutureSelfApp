import { useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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
  // A previously denied permission makes the request resolve "denied"
  // with no dialog at all. Advancing silently there reads as "the prompt
  // doesn't work", so the iam screen switches to an inline explanation
  // with an Open Settings action instead (feedback 2026-09-12).
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      getPermissionStatus()
        .then((status) => {
          if (cancelled) return;
          setAlreadyGranted(status === "granted");
          // Coming back from Settings with reminders switched on clears
          // the denied panel and offers the plain "Save".
          if (status === "granted") setDenied(false);
        })
        .catch(() => {});
    void sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const ask = async () => {
    setRequesting(true);
    const status = await requestNotificationPermission();
    setPermissionStatus(status);
    setRequesting(false);
    if (status === "denied" && family === "iam") {
      setDenied(true);
      return;
    }
    onDone();
  };

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
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
        {denied ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <AppText
              variant="label"
              tone="ink2"
              center
              style={styles.deniedNote}
              testID="notif-denied"
            >
              Reminders are off for Future Self in Settings. Turn them on there
              and your quotes will find you.
            </AppText>
            <Button
              label="Open Settings"
              onPress={openSettings}
              testID="notif-open-settings"
            />
            <Pressable
              onPress={onDone}
              style={styles.maybeLater}
              hitSlop={8}
              accessibilityRole="button"
              testID="notif-continue-without"
            >
              <AppText variant="body" tone="ink3" center>
                Continue without reminders
              </AppText>
            </Pressable>
          </Animated.View>
        ) : (
          <>
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
          </>
        )}
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
  // Two label lines at most, so the denied state still fits without
  // scrolling on a 6.1" phone.
  deniedNote: { marginBottom: spacing.md, paddingHorizontal: spacing.md },
  maybeLater: { marginTop: spacing.lg },
});
