import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { purchasePackage } from "@/lib/purchases";

import { PaywallFooter } from "./PaywallFooter";
import { shortDateInDays, type PaywallData } from "./useOffering";

interface TimelinePaywallProps {
  data: PaywallData;
  /** null = not closable (standalone hard gate) */
  closeDelayMs: number | null;
  trialReminder: boolean;
  onTrialReminderChange: (value: boolean) => void;
  onPurchased: () => void;
  onClose?: () => void;
  placement: string;
}

/**
 * I Am-style "How your free trial works" timeline paywall. Single
 * package, price straight from the store, delayed X, no bypass: the
 * only exits are purchase, restore, or (during onboarding) the X.
 */
export function TimelinePaywall({
  data,
  closeDelayMs,
  trialReminder,
  onTrialReminderChange,
  onPurchased,
  onClose,
  placement,
}: TimelinePaywallProps) {
  const colors = useColors();
  const [purchasing, setPurchasing] = useState(false);
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    analytics.capture("paywall_viewed", { style: "timeline", placement });
    if (closeDelayMs === null || !onClose) return;
    const t = setTimeout(() => setShowClose(true), closeDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async () => {
    if (data.unavailable) {
      Alert.alert(
        "Purchases unavailable",
        "The store can't be reached right now. Please check your connection and try again.",
      );
      return;
    }
    if (!data.pkg && !data.devMock) return;
    setPurchasing(true);
    const result = await purchasePackage(data.pkg!);
    setPurchasing(false);
    if (result.status === "purchased") {
      onPurchased();
    } else if (result.status === "error") {
      Alert.alert("Purchase failed", result.message);
    }
  };

  const hasTrial = data.trialLength !== null && data.trialDays !== null;
  const reminderDay = hasTrial
    ? shortDateInDays(Math.max(0, data.trialDays! - 1))
    : null;
  const startDay = hasTrial ? shortDateInDays(data.trialDays!) : null;

  const steps = [
    {
      icon: "✓",
      title: "Install the app",
      body: "Set it up to match your goals",
      done: true,
    },
    hasTrial
      ? {
          icon: "🔓",
          title: "Today — free trial starts",
          body: `Everything unlocks: your full daily mix, streaks, widgets and every theme, free for ${data.trialLength}`,
          done: false,
        }
      : {
          icon: "🔓",
          title: "Today — everything unlocks",
          body: "Your full daily mix, streaks, widgets and every theme",
          done: false,
        },
    ...(hasTrial
      ? [
          {
            icon: "🔔",
            title: `${reminderDay} — heads-up`,
            body: "One reminder, so nothing surprises you",
            done: false,
          },
          {
            icon: "💎",
            title: `${startDay} — membership begins`,
            body: "Unless you've cancelled — no hard feelings",
            done: false,
          },
        ]
      : []),
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {showClose && onClose ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.close}>
          <Pressable onPress={onClose} hitSlop={12} testID="paywall-close">
            <AppText variant="h3" tone="ink3">
              ✕
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="h2" center>
          {hasTrial ? "How your free trial works" : "Unlock Future Self"}
        </AppText>

        <View style={styles.timeline}>
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.iconCol}>
                <View
                  style={[
                    styles.iconCircle,
                    { borderColor: colors.borderStrong },
                    s.done && {
                      backgroundColor: colors.success,
                      borderColor: colors.success,
                    },
                  ]}
                >
                  <AppText variant="body" tone={s.done ? "ctaInk" : "ink"}>
                    {s.icon}
                  </AppText>
                </View>
                {i < steps.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      { backgroundColor: colors.borderStrong },
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.stepText}>
                <AppText
                  variant="lead"
                  style={
                    s.done ? { textDecorationLine: "line-through" } : undefined
                  }
                >
                  {s.title}
                </AppText>
                <AppText variant="body" tone="ink2">
                  {s.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {hasTrial ? (
          <View
            style={[
              styles.reminderRow,
              { backgroundColor: colors.card },
              shadows.sm,
            ]}
          >
            <AppText variant="body" style={styles.reminderLabel}>
              {trialReminder && reminderDay
                ? `We'll remind you on ${reminderDay} ✓`
                : "Reminder before trial ends"}
            </AppText>
            <Switch
              value={trialReminder}
              onValueChange={onTrialReminderChange}
              trackColor={{ true: colors.success }}
              testID="trial-reminder-toggle"
            />
          </View>
        ) : null}

        {data.unavailable ? (
          <AppText variant="body" tone="ink2" center style={styles.unavailable}>
            {
              "The store can't be reached right now. Your access stays locked until a purchase completes — try again shortly, or Restore if you've subscribed before."
            }
          </AppText>
        ) : null}
        {data.devMock ? (
          <AppText
            variant="label"
            tone="ink3"
            center
            style={styles.unavailable}
          >
            Development mode: purchases are mocked
            (EXPO_PUBLIC_DEV_MOCK_PURCHASES)
          </AppText>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={hasTrial ? "Try for $0.00" : "Continue"}
          onPress={buy}
          loading={purchasing}
          disabled={data.loading || (data.unavailable && !data.devMock)}
          testID="paywall-cta"
        />
        {data.priceLine ? (
          <AppText variant="label" tone="ink2" center style={styles.price}>
            {hasTrial ? `Then ${data.priceLine}` : data.priceLine}
          </AppText>
        ) : null}
        <PaywallFooter onRestored={onPurchased} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: { position: "absolute", top: 64, left: spacing.xl, zIndex: 10 },
  content: {
    paddingTop: 108,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  timeline: { marginTop: spacing.xxl },
  step: { flexDirection: "row", gap: spacing.lg },
  iconCol: { alignItems: "center" },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  connector: { width: 2, flex: 1, minHeight: 22, marginVertical: 4 },
  stepText: { flex: 1, paddingBottom: spacing.xl },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  reminderLabel: { flex: 1 },
  unavailable: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  price: { marginTop: spacing.md },
});
