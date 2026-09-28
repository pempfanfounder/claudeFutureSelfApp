import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Button, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { purchasePackage } from "@/lib/purchases";
import type { CalAiVersion } from "../paywallVariant";
import { trialInfo, type PaywallData } from "../useOffering";
import { BillingSummary } from "./BillingSummary";
import { CompactFooter } from "./CompactFooter";
import { NotificationStack } from "./NotificationStack";
import { PlanCards } from "./PlanCards";
import { PlanToggle } from "./PlanToggle";
import { paywallPreviewNotifications } from "./previewQuotes";
import { compactDisclosure } from "./pricing";

interface CalAiPaywallProps {
  data: PaywallData;
  version: CalAiVersion;
  placement: string;
  onPurchased: () => void;
  /** null (or no onClose) = hard gate. */
  closeDelayMs?: number | null;
  onClose?: () => void;
  trialReminder?: boolean;
  onTrialReminderChange?: (value: boolean) => void;
}

export const TRIAL_REMINDER_LABEL = "Remind me 1 day before the trial ends";
export const CALAI_HEADLINES: Record<CalAiVersion, string> = {
  1: "Your future self starts today.",
  2: "This is how you won't drift.",
  3: "Become who you promised yourself.",
  4: "Your future self starts today.",
};
const V3_CTA_HEIGHT = 65;

export function CalAiPaywall({
  data, version, placement, onPurchased, closeDelayMs = null, onClose,
  trialReminder, onTrialReminderChange,
}: CalAiPaywallProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [purchasing, setPurchasing] = useState(false);
  const buying = useRef(false);
  const [showClose, setShowClose] = useState(false);
  const notifications = useMemo(() => paywallPreviewNotifications(), []);

  useEffect(() => {
    analytics.capture("paywall_viewed", { style: `calai-${version}`, placement });
    if (closeDelayMs === null || !onClose) return;
    const t = setTimeout(() => setShowClose(true), closeDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async () => {
    if (buying.current || data.loading || data.unavailable || !data.pkg) return;
    buying.current = true;
    setPurchasing(true);
    try {
      const result = await purchasePackage(data.pkg);
      if (result.status === "purchased") onPurchased();
      else if (result.status === "error" || result.status === "pending") {
        Alert.alert(result.title ?? "Purchase failed", result.message);
      }
      // Cancellation intentionally produces no failure alert.
    } finally {
      buying.current = false;
      setPurchasing(false);
    }
  };

  const ready = !data.loading && !data.unavailable && data.pkg !== null;
  const eligibility = data.pkg ? data.eligibility?.[data.pkg.product.identifier] : "unknown";
  const selectedTrial = ready && data.pkg ? trialInfo(data.pkg, eligibility) : null;
  const disclosure = ready ? compactDisclosure(data.pkg, eligibility) : null;
  const heroTop = insets.top + spacing.xxxl + spacing.lg;
  const gradientHero = version === 2 || version === 4;
  const heroColor = version === 4 ? colors.ink : colors.ctaBg;

  const hero = gradientHero ? (
    <View style={styles.heroDark} testID={`hero-${version}`}>
      <LinearGradient colors={[heroColor, heroColor, colors.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ paddingTop: heroTop }}>
        {version === 2 ? (
          <NotificationStack items={notifications} mode="fan" overlap={14} scrimColor={heroColor} />
        ) : (
          <NotificationStack items={notifications} overlap={16} scrimColor={heroColor} />
        )}
      </View>
      <LinearGradient colors={["rgba(0,0,0,0)", colors.bg]} style={styles.heroFade} pointerEvents="none" />
    </View>
  ) : (
    <View style={styles.hero} testID={`hero-${version}`}>
      <LinearGradient colors={[colors.bgAlt, colors.bg]} style={StyleSheet.absoluteFill} />
      <View style={{ paddingTop: heroTop }}>
        <NotificationStack
          items={notifications}
          overlap={version === 3 ? 20 : 16}
          scrimColor={colors.bgAlt}
          outlineColor={version === 1 ? colors.ink : undefined}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]}
        showsVerticalScrollIndicator
      >
        {hero}
        <View style={[styles.headlineWrap, gradientHero && styles.headlineOverlap, version === 3 && styles.headlineTight]}>
          {version === 3 ? <AppText variant="eyebrow" tone="ink3" center style={styles.eyebrow}>Future Self</AppText> : null}
          <AppText variant="h1" center testID="paywall-headline">{CALAI_HEADLINES[version]}</AppText>
        </View>
        <View style={styles.plans}>
          {data.loading ? <AppText center>Loading subscription prices…</AppText> : null}
          {version === 3 ? <PlanToggle data={data} disabled={purchasing} /> : <PlanCards data={data} disabled={purchasing} />}
        </View>
        {data.unavailable ? (
          <AppText variant="body" tone="ink2" center style={styles.notice}>
            The store cannot load subscription prices right now. Please retry, or use Restore if you have subscribed before.
          </AppText>
        ) : null}
        {data.unavailable && data.retry ? (
          <View style={styles.retry}><Button label="Retry store" variant="secondary" onPress={data.retry} /></View>
        ) : null}
        {data.devMock ? <AppText variant="label" tone="ink3" center style={styles.notice}>Development preview</AppText> : null}
        {selectedTrial && data.trialLength && trialReminder !== undefined && onTrialReminderChange ? (
          <View style={[styles.reminderRow, { backgroundColor: colors.card, borderColor: colors.border }]} testID="trial-reminder-row">
            <AppText variant="body" style={styles.reminderLabel}>{TRIAL_REMINDER_LABEL}</AppText>
            <Switch value={trialReminder} onValueChange={onTrialReminderChange} disabled={purchasing} trackColor={{ true: colors.ctaBg }} testID="trial-reminder-toggle" />
          </View>
        ) : null}
        <View style={styles.spacer} />
        <View style={styles.ctaWrap} testID="purchase-section">
          {/* Price and terms precede the purchase control even on short/iPad compatibility viewports. */}
          {ready && data.pkg ? (
            <BillingSummary pkg={data.pkg} eligibility={eligibility} center testID="paywall-billing" />
          ) : null}
          {disclosure ? (
            <>
              <AppText variant="label" tone="ink2" center style={styles.disclosure} testID="paywall-disclosure">{disclosure}</AppText>
              <AppText variant="label" tone="ink2" center style={styles.disclosure}>
                Cancel at least 24 hours before the end of the trial or current billing period to avoid renewal.
              </AppText>
            </>
          ) : null}
          <Button
            label="Continue"
            onPress={buy}
            loading={purchasing}
            disabled={!ready}
            style={StyleSheet.flatten([styles.cta, version === 3 && styles.ctaTall])}
            testID="paywall-cta"
          />
          <CompactFooter onRestored={onPurchased} />
        </View>
      </ScrollView>
      {showClose && onClose ? (
        <Animated.View entering={FadeIn.duration(400)} style={[styles.close, { top: insets.top + spacing.sm }]}>
          <Pressable onPress={onClose} disabled={purchasing} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" testID="paywall-close" style={[styles.closeCircle, { backgroundColor: colors.card }, shadows.md]}>
            <Icon name="close" size={16} color={colors.ink} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { paddingBottom: spacing.xl },
  heroDark: { paddingBottom: spacing.xxxl + spacing.sm },
  heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  headlineWrap: { paddingHorizontal: spacing.xxl, marginTop: spacing.md },
  headlineOverlap: { marginTop: -(spacing.xxxl + spacing.xs) },
  headlineTight: { marginTop: 0 },
  eyebrow: { marginBottom: spacing.sm },
  plans: { paddingHorizontal: spacing.xl, marginTop: spacing.xxl },
  notice: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  retry: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.xl, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  reminderLabel: { flex: 1 },
  spacer: { flex: 1, minHeight: spacing.xxl },
  ctaWrap: { paddingHorizontal: spacing.xl },
  cta: { marginTop: spacing.lg },
  ctaTall: { minHeight: V3_CTA_HEIGHT },
  disclosure: { marginTop: spacing.md },
  close: { position: "absolute", left: spacing.xl, zIndex: 10 },
  closeCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
