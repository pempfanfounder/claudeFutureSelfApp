import { SecondaryMotion } from "@/features/nav/SecondaryMotion";
import { BackButton } from "@/design-system/components/BackButton";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { AppText, Icon, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import {
  captureIdentity,
  assertCurrentIdentity,
  isCurrentIdentity,
  withDeadline,
  useAppState,
} from "@/lib/appState";
import { monitoring } from "@/lib/monitoring";
import { getIdentitySupabase } from "@/lib/supabase";

import {
  saveNotificationPreferences,
  PREFERENCE_KEYS,
  type PreferenceChanges,
} from "@/features/notifications/preferences";
import { DAILY_LIMIT } from "@/features/content/types";
import {
  applyCountChange,
  clampDailyCounts,
  dailyCapHint,
  type DailyCountKey,
  type DailyCounts,
} from "@/features/notifications/dailyCap";
import {
  getPermissionStatus,
  registerDevice,
  requestNotificationPermission,
} from "@/features/notifications/push";
import { formatMinutes } from "@/features/notifications/time";

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

const toCounts = (prefs: Prefs): DailyCounts => ({
  quotesPerDay: prefs.quotes_per_day,
  affirmationsPerDay: prefs.affirmations_per_day,
});
/** Rows written by builds that allowed 20 + 20 are shown inside the cap. */
function withinCap(prefs: Prefs): Prefs {
  const counts = clampDailyCounts(toCounts(prefs));
  return {
    ...prefs,
    quotes_per_day: counts.quotesPerDay,
    affirmations_per_day: counts.affirmationsPerDay,
  };
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

/**
 * Notification preferences. Every change writes to Supabase and
 * recalculates server-side dispatch state — delivery is entirely
 * server-driven, so these are target windows, not local schedules.
 */
export default function NotificationSettingsScreen() {
  const colors = useColors();
  const userId = useAppState((s) => s.userId);
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<
    "undetermined" | "granted" | "denied"
  >("granted");
  const quietEnabled = prefs.quiet_start_minutes !== null;
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const pending = useRef<{
    changes: PreferenceChanges;
    needsWrite: boolean;
  } | null>(null);
  useEffect(() => {
    const identity = captureIdentity();
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
    setBusy(true);
    setStatus(null);
    void (async () => {
      const client = await getIdentitySupabase(identity);
      if (!client) throw new Error("Account connection unavailable.");
      const [permission, result] = await Promise.all([
        getPermissionStatus(),
        withDeadline(
          client
            .from("notification_prefs")
            .select("*")
            .eq("user_id", identity.userId!)
            .maybeSingle(),
        ),
      ]);
      if (result.error) throw result.error;
      assertCurrentIdentity(identity);
      if (alive) {
        setPermission(permission);
        setPrefs(withinCap({ ...DEFAULT_PREFS, ...result.data }));
        setLoaded(true);
      }
      await registerDevice(identity);
    })()
      .catch(() => {
        if (alive && isCurrentIdentity(identity))
          setStatus("Could not load your preferences. Tap Retry.");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, retry]);
  // Quotes + affirmations share one daily cap: the changed count wins and
  // the other is lowered when needed, in the same write.
  const saveCount = (key: DailyCountKey, value: number) => {
    const counts = applyCountChange(toCounts(prefs), key, value);
    return save({
      ...prefs,
      quotes_per_day: counts.quotesPerDay,
      affirmations_per_day: counts.affirmationsPerDay,
    });
  };
  const save = async (next?: Prefs) => {
    if (busyRef.current || busy) return;
    const identity = captureIdentity();
    busyRef.current = true;
    setBusy(true);
    setStatus("Saving…");
    if (next) {
      const changes: PreferenceChanges = {};
      for (const key of PREFERENCE_KEYS)
        if (next[key] !== prefs[key])
          Object.assign(changes, { [key]: next[key] });
      if ("quiet_start_minutes" in changes || "quiet_end_minutes" in changes) {
        changes.quiet_start_minutes = next.quiet_start_minutes;
        changes.quiet_end_minutes = next.quiet_end_minutes;
      }
      if (
        "window_start_minutes" in changes ||
        "window_end_minutes" in changes
      ) {
        changes.window_start_minutes = next.window_start_minutes;
        changes.window_end_minutes = next.window_end_minutes;
      }
      pending.current = { changes, needsWrite: true };
    }
    const operation = pending.current;
    try {
      if (!operation) return;
      const client = await getIdentitySupabase(identity);
      if (!client) throw new Error("Account connection unavailable.");
      if (operation.needsWrite) {
        const acknowledged = await saveNotificationPreferences(
          identity,
          operation.changes,
        );
        assertCurrentIdentity(identity);
        setPrefs({ ...DEFAULT_PREFS, ...acknowledged });
        operation.needsWrite = false;
      }
      const recalculated = await withDeadline(
        client.rpc("recalc_my_notification_state"),
      );
      if (recalculated.error) throw recalculated.error;
      assertCurrentIdentity(identity);
      pending.current = null;
      setStatus(null);
      analytics.capture("notification_prefs_changed", operation.changes);
    } catch (error) {
      if (isCurrentIdentity(identity)) {
        monitoring.captureError(error, { area: "settings.notificationPrefs" });
        setStatus("Your latest change is not fully synced. Tap Retry.");
      }
    } finally {
      busyRef.current = false;
      if (isCurrentIdentity(identity)) setBusy(false);
    }
  };

  return (
    <SecondaryMotion>
      <Screen>
        <View style={styles.header}>
          <BackButton />
          <AppText variant="h3">Notifications</AppText>
          <View style={styles.spacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {status ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (pending.current) void save();
                else setRetry((v) => v + 1);
              }}
              disabled={busy}
              style={styles.permissionBanner}
            >
              <AppText accessibilityRole="alert">{status}</AppText>
            </Pressable>
          ) : busy ? (
            <AppText accessibilityRole="alert">Loading preferences…</AppText>
          ) : null}
          {permission !== "granted" ? (
            <Pressable
              onPress={async () => {
                const identity = captureIdentity();
                try {
                  const status = await requestNotificationPermission();
                  assertCurrentIdentity(identity);
                  setPermission(status);
                  await registerDevice(identity);
                } catch {
                  if (isCurrentIdentity(identity))
                    Alert.alert(
                      "Device registration pending",
                      "Your system permission may have changed. Reopen this screen to retry device registration.",
                    );
                }
              }}
              style={[
                styles.permissionBanner,
                {
                  backgroundColor: colors.bgAlt,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <AppText variant="body">
                {permission === "denied"
                  ? "Notifications are off in system settings. Tap to re-request, or enable them in Settings."
                  : "Notifications aren't on yet. Tap to allow them."}
              </AppText>
            </Pressable>
          ) : null}

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Daily words
          </AppText>
          {
            <StepperRow
              label={"Quotes"}
              value={prefs.quotes_per_day}
              onChange={(v) => saveCount("quotesPerDay", v)}
              max={DAILY_LIMIT}
              disabled={busy || !loaded}
            />
          }
          {
            <StepperRow
              label={"Affirmations"}
              value={prefs.affirmations_per_day}
              onChange={(v) => saveCount("affirmationsPerDay", v)}
              max={DAILY_LIMIT}
              disabled={busy || !loaded}
            />
          }
          <AppText
            variant="label"
            tone="ink3"
            style={styles.capHint}
            testID="daily-cap-hint"
          >
            {dailyCapHint(toCounts(prefs))}
          </AppText>

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Delivery window
          </AppText>
          {
            <StepperRow
              label={"Start"}
              value={prefs.window_start_minutes}
              onChange={(v) =>
                save({
                  ...prefs,
                  window_start_minutes: Math.min(
                    v,
                    prefs.window_end_minutes - 60,
                  ),
                })
              }
              max={23 * 60}
              formatter={formatMinutes}
              min={0}
              step={60}
              disabled={busy || !loaded}
            />
          }
          {
            <StepperRow
              label={"End"}
              value={prefs.window_end_minutes}
              onChange={(v) =>
                save({
                  ...prefs,
                  window_end_minutes: Math.max(
                    v,
                    prefs.window_start_minutes + 60,
                  ),
                })
              }
              max={23 * 60}
              formatter={formatMinutes}
              min={60}
              step={60}
              disabled={busy || !loaded}
            />
          }
          <AppText variant="label" tone="ink3" style={styles.hint}>
            Times are targets, not guarantees. Delivery adapts to your day and
            timezone.
          </AppText>

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Quiet hours
          </AppText>
          {
            <ToggleRow
              label={"Quiet hours"}
              sub={
                "Avoid sending during this window; delayed delivery is possible"
              }
              value={quietEnabled}
              onChange={(v) => {
                save({
                  ...prefs,
                  quiet_start_minutes: v ? 1320 : null,
                  quiet_end_minutes: v ? 480 : null,
                });
              }}
              disabled={busy || !loaded}
            />
          }
          {quietEnabled ? (
            <StepperRow
              label={"From"}
              value={prefs.quiet_start_minutes ?? 1320}
              onChange={(v) => save({ ...prefs, quiet_start_minutes: v })}
              max={23 * 60}
              formatter={formatMinutes}
              min={0}
              step={60}
              disabled={busy || !loaded}
            />
          ) : null}
          {quietEnabled ? (
            <StepperRow
              label={"Until"}
              value={prefs.quiet_end_minutes ?? 480}
              onChange={(v) => save({ ...prefs, quiet_end_minutes: v })}
              max={23 * 60}
              formatter={formatMinutes}
              min={0}
              step={60}
              disabled={busy || !loaded}
            />
          ) : null}

          <AppText variant="eyebrow" tone="ink3" style={styles.sectionTitle}>
            Reminders
          </AppText>
          {
            <ToggleRow
              label={"Streak at risk"}
              sub={"One evening reminder when today would break the chain"}
              value={prefs.streak_reminder}
              onChange={(v) => save({ ...prefs, streak_reminder: v })}
              disabled={busy || !loaded}
            />
          }
          {
            <ToggleRow
              label={"Before trial ends"}
              sub={
                "Optional heads-up before an eligible trial ends; delivery is not guaranteed"
              }
              value={prefs.trial_reminder}
              onChange={(v) => save({ ...prefs, trial_reminder: v })}
              disabled={busy || !loaded}
            />
          }
        </ScrollView>
      </Screen>
    </SecondaryMotion>
  );
}

function StepperRow({
  label,
  value,
  onChange,
  max,
  formatter = (v: number) => `${v}x a day`,
  min = 0,
  step = 1,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  formatter?: (v: number) => string;
  min?: number;
  step?: number;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <AppText variant="lead" style={styles.rowLabel}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}: decrease`}
          onPress={() => onChange(Math.max(min, value - step))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <Icon name="minus" size={18} color={colors.ink} />
        </Pressable>
        <AppText variant="body" style={styles.stepValue}>
          {formatter(value)}
        </AppText>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}: increase`}
          onPress={() => onChange(Math.min(max, value + step))}
          style={[styles.stepBtn, { borderColor: colors.borderStrong }]}
          hitSlop={6}
        >
          <Icon name="plus" size={18} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}
function ToggleRow({
  label,
  sub,
  value,
  onChange,
  disabled,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <View style={styles.rowLabel}>
        <AppText variant="lead">{label}</AppText>
        <AppText variant="label" tone="ink3">
          {sub}
        </AppText>
      </View>
      <Switch
        disabled={disabled}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.success }}
      />
    </View>
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
  capHint: { marginTop: spacing.sm, paddingHorizontal: spacing.xs },
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
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { minWidth: 82, textAlign: "center" },
  hint: { marginTop: spacing.xs, marginBottom: spacing.sm },
});
