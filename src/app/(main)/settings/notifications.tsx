import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import { AppText, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

import {
  getPermissionStatus,
  registerDevice,
  requestNotificationPermission,
} from "@/features/notifications/push";

interface Prefs {
  quotes_per_day: number;
  affirmations_per_day: number;
  streak_reminder: boolean;
  trial_reminder: boolean;
  window_start_minutes: number;
  window_end_minutes: number;
  quiet_start_minutes: number | null;
  quiet_end_minutes: number | null;
}

const DEFAULT_PREFS: Prefs = {
  quotes_per_day: 3,
  affirmations_per_day: 3,
  streak_reminder: true,
  trial_reminder: true,
  window_start_minutes: 540,
  window_end_minutes: 1260,
  quiet_start_minutes: null,
  quiet_end_minutes: null,
};

const hourLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
};

/**
 * Notification preferences. Every change writes to Supabase and
 * recalculates server-side dispatch state — delivery is entirely
 * server-driven, so these are target windows, not local schedules.
 */
export default function NotificationSettingsScreen() {
  const colors = useColors();
  const userId = useAppState((s) => s.userId);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<"undetermined" | "granted" | "denied">("granted");
  const [quietEnabled, setQuietEnabled] = useState(false);

  useEffect(() => {
    getPermissionStatus().then(setPermission);
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    supabase
      .from("notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({ ...DEFAULT_PREFS, ...data });
          setQuietEnabled(data.quiet_start_minutes !== null);
        }
      });
  }, [userId]);

  const save = async (next: Prefs) => {
    setPrefs(next);
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    try {
      const { error } = await supabase
        .from("notification_prefs")
        .upsert({ user_id: userId, ...next });
      if (error) throw error;
      // Recompute the server's dispatch plan immediately.
      await supabase.rpc("recalc_my_notification_state");
      analytics.capture("notification_prefs_changed", {
        quotes_per_day: next.quotes_per_day,
        affirmations_per_day: next.affirmations_per_day,
        streak_reminder: next.streak_reminder,
      });
    } catch (error) {
      monitoring.captureError(error, { area: "settings.notificationPrefs" });
    }
  };

  const stepperRow = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    max: number,
    formatter: (v: number) => string = (v) => `${v}x a day`,
    min = 0,
    step = 1,
  ) => (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <AppText variant="lead" style={styles.rowLabel}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - step))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <AppText variant="h3">−</AppText>
        </Pressable>
        <AppText variant="body" style={styles.stepValue}>
          {formatter(value)}
        </AppText>
        <Pressable
          onPress={() => onChange(Math.min(max, value + step))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <AppText variant="h3">+</AppText>
        </Pressable>
      </View>
    </View>
  );

  const toggleRow = (label: string, sub: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <View style={styles.rowLabel}>
        <AppText variant="lead">{label}</AppText>
        <AppText variant="label" tone="ink3">
          {sub}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.success }} />
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AppText variant="h3" tone="ink3">
            ‹
          </AppText>
        </Pressable>
        <AppText variant="h3">Notifications</AppText>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {permission !== "granted" ? (
          <Pressable
            onPress={async () => {
              const status = await requestNotificationPermission();
              setPermission(status);
              await registerDevice();
            }}
            style={[styles.permissionBanner, { backgroundColor: colors.bgAlt, borderColor: colors.borderStrong }]}
          >
            <AppText variant="body">
              {permission === "denied"
                ? "Notifications are off in system settings. Tap to re-request — or enable them in Settings."
                : "Notifications aren't on yet. Tap to allow them."}
            </AppText>
          </Pressable>
        ) : null}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Daily words
        </AppText>
        {stepperRow("Quotes", prefs.quotes_per_day, (v) => save({ ...prefs, quotes_per_day: v }), 3)}
        {stepperRow(
          "Affirmations",
          prefs.affirmations_per_day,
          (v) => save({ ...prefs, affirmations_per_day: v }),
          3,
        )}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Delivery window
        </AppText>
        {stepperRow(
          "Start",
          prefs.window_start_minutes,
          (v) => save({ ...prefs, window_start_minutes: Math.min(v, prefs.window_end_minutes - 60) }),
          23 * 60,
          hourLabel,
          0,
          60,
        )}
        {stepperRow(
          "End",
          prefs.window_end_minutes,
          (v) => save({ ...prefs, window_end_minutes: Math.max(v, prefs.window_start_minutes + 60) }),
          23 * 60,
          hourLabel,
          60,
          60,
        )}
        <AppText variant="label" tone="ink3" style={styles.hint}>
          Times are targets, not guarantees — delivery adapts to your day and timezone.
        </AppText>

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Quiet hours
        </AppText>
        {toggleRow("Quiet hours", "Nothing arrives inside this window", quietEnabled, (v) => {
          setQuietEnabled(v);
          save({
            ...prefs,
            quiet_start_minutes: v ? 1320 : null,
            quiet_end_minutes: v ? 480 : null,
          });
        })}
        {quietEnabled
          ? stepperRow(
              "From",
              prefs.quiet_start_minutes ?? 1320,
              (v) => save({ ...prefs, quiet_start_minutes: v }),
              23 * 60,
              hourLabel,
              0,
              60,
            )
          : null}
        {quietEnabled
          ? stepperRow(
              "Until",
              prefs.quiet_end_minutes ?? 480,
              (v) => save({ ...prefs, quiet_end_minutes: v }),
              23 * 60,
              hourLabel,
              0,
              60,
            )
          : null}

        <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
          Reminders
        </AppText>
        {toggleRow(
          "Streak at risk",
          "One evening nudge when today would break the chain",
          prefs.streak_reminder,
          (v) => save({ ...prefs, streak_reminder: v }),
        )}
        {toggleRow(
          "Before trial ends",
          "A single heads-up, no surprises",
          prefs.trial_reminder,
          (v) => save({ ...prefs, trial_reminder: v }),
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  spacer: { width: 24 },
  scroll: { paddingBottom: spacing.xxxl },
  permissionBanner: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    marginBottom: spacing.sm,
  },
  rowLabel: { flex: 1, gap: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { minWidth: 82, textAlign: "center" },
  hint: { marginTop: spacing.xs, marginBottom: spacing.sm },
});
