import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Button, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { shadows, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { purchasePackage } from "@/lib/purchases";

import { PaywallFooter } from "../PaywallFooter";
import type { CalAiVersion } from "../paywallVariant";
import {
  ctaLabel,
  subscriptionDisclosure,
  type PaywallData,
} from "../useOffering";
import { NotificationStack } from "./NotificationStack";
import { PlanCards } from "./PlanCards";
import { PlanToggle } from "./PlanToggle";
import { paywallPreviewNotifications } from "./previewQuotes";
import { priceNote } from "./pricing";

interface CalAiPaywallProps {
  data: PaywallData;
  version: CalAiVersion;
  placement: string;
  onPurchased: () => void;
  /** Close control appears after this delay; null (or no onClose) = hard gate. */
  closeDelayMs?: number | null;
  onClose?: () => void;
}

/** One headline per version, in the app's voice. Users don't read: no sub. */
export const CALAI_HEADLINES: Record<CalAiVersion, string> = {
  1: "Your future self starts today.",
  2: "This is how you won't drift.",
  3: "Become who you promised yourself.",
  4: "Your future self starts today.",
};

/** Tallest CTA (owner's note) for the single-line version. */
const V3_CTA_HEIGHT = 65;

/**
 * Cal AI-structured paywall in Future Self's design system: a stacked
 * notification preview as the hero, one headline, the plan choice, one
 * CTA, then the store-mandated small print. Three layouts share the
 * purchase plumbing and differ only in hero treatment and plan control.
 */
export function CalAiPaywall({
  data,
  version,
  placement,
  onPurchased,
  closeDelayMs = null,
  onClose,
}: CalAiPaywallProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [purchasing, setPurchasing] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const notifications = useMemo(() => paywallPreviewNotifications(), []);

  useEffect(() => {
    analytics.capture("paywall_viewed", {
      style: `calai-${version}`,
      placement,
    });
    if (closeDelayMs === null || !onClose) return;
    const t = setTimeout(() => setShowClose(true), closeDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async () => {
    if (purchasing || data.loading) return;
    if (data.unavailable) {
      Alert.alert(
        "Purchases unavailable",
        "The store can't be reached right now. Please check your connection and try again.",
      );
      return;
    }
    if (!data.pkg) return;
    setPurchasing(true);
    const result = await purchasePackage(data.pkg);
    setPurchasing(false);
    if (result.status === "purchased") {
      onPurchased();
    } else if (result.status === "error") {
      Alert.alert("Purchase failed", result.message);
    }
  };

  const disclosure = subscriptionDisclosure(
    data.pkg,
    data.pkg ? data.eligibility?.[data.pkg.product.identifier] : "unknown",
  );
  const note = priceNote(data);
  const heroTop = insets.top + spacing.xxxl + spacing.lg;

  // v2 fades from the near-black CTA brown; v4 from the warm ink brown
  // (#4B3A35 in Minimal Sand) with v1's straight stack.
  const gradientHero = version === 2 || version === 4;
  const heroColor = version === 4 ? colors.ink : colors.ctaBg;

  const hero = gradientHero ? (
    <View style={styles.heroDark} testID={`hero-${version}`}>
      <LinearGradient
        colors={[heroColor, heroColor, colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingTop: heroTop }}>
        {version === 2 ? (
          <NotificationStack
            items={notifications}
            mode="fan"
            overlap={14}
            scrimColor={heroColor}
          />
        ) : (
          <NotificationStack
            items={notifications}
            overlap={16}
            scrimColor={heroColor}
          />
        )}
      </View>
      <LinearGradient
        // Fades the stack's lower edge into the surface so the headline
        // that follows can sit on top of it.
        colors={["rgba(0,0,0,0)", colors.bg]}
        style={styles.heroFade}
        pointerEvents="none"
      />
    </View>
  ) : (
    <View style={styles.hero} testID={`hero-${version}`}>
      <LinearGradient
        colors={[colors.bgAlt, colors.bg]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingTop: heroTop }}>
        <NotificationStack
          items={notifications}
          overlap={version === 3 ? 20 : 16}
          scrimColor={colors.bgAlt}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {hero}

        <View
          style={[
            styles.headlineWrap,
            gradientHero && styles.headlineOverlap,
            version === 3 && styles.headlineTight,
          ]}
        >
          {version === 3 ? (
            <AppText
              variant="eyebrow"
              tone="ink3"
              center
              style={styles.eyebrow}
            >
              Future Self
            </AppText>
          ) : null}
          <AppText variant="h1" center testID="paywall-headline">
            {CALAI_HEADLINES[version]}
          </AppText>
        </View>

        <View style={styles.plans}>
          {version === 3 ? (
            <PlanToggle data={data} />
          ) : (
            <PlanCards data={data} />
          )}
        </View>

        {data.unavailable ? (
          <AppText variant="body" tone="ink2" center style={styles.notice}>
            {
              "The store can't be reached right now. Your access stays locked until a purchase completes. Try again shortly, or Restore if you've subscribed before."
            }
          </AppText>
        ) : null}
        {data.unavailable && data.retry ? (
          <View style={styles.retry}>
            <Button
              label="Retry store"
              variant="secondary"
              onPress={data.retry}
            />
          </View>
        ) : null}
        {data.devMock ? (
          <AppText variant="label" tone="ink3" center style={styles.notice}>
            Development preview
          </AppText>
        ) : null}

        <View style={styles.spacer} />

        <View style={styles.ctaWrap}>
          <Button
            label={data.trialLength ? ctaLabel(data.trialLength) : "Continue"}
            onPress={buy}
            loading={purchasing}
            disabled={data.loading || data.unavailable || !data.pkg}
            style={version === 3 ? styles.ctaTall : undefined}
            testID="paywall-cta"
          />
          {note ? (
            <AppText variant="label" tone="ink2" center style={styles.note}>
              {note}
            </AppText>
          ) : null}
          {disclosure ? (
            <AppText
              variant="label"
              tone="ink3"
              center
              style={styles.disclosure}
              testID="paywall-disclosure"
            >
              {disclosure}
            </AppText>
          ) : null}
          <PaywallFooter onRestored={onPurchased} />
        </View>
      </ScrollView>

      {showClose && onClose ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.close, { top: insets.top + spacing.sm }]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="paywall-close"
            style={[
              styles.closeCircle,
              { backgroundColor: colors.card },
              shadows.md,
            ]}
          >
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
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
  },
  headlineWrap: { paddingHorizontal: spacing.xxl, marginTop: spacing.md },
  // Pulls the headline up over the front card's faded lower edge.
  headlineOverlap: { marginTop: -(spacing.xxxl + spacing.xs) },
  headlineTight: { marginTop: 0 },
  eyebrow: { marginBottom: spacing.sm },
  plans: { paddingHorizontal: spacing.xl, marginTop: spacing.xxl },
  notice: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  retry: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
  spacer: { flex: 1, minHeight: spacing.xxl },
  ctaWrap: { paddingHorizontal: spacing.xl },
  ctaTall: { minHeight: V3_CTA_HEIGHT },
  note: { marginTop: spacing.md },
  disclosure: { marginTop: spacing.sm },
  close: { position: "absolute", left: spacing.xl, zIndex: 10 },
  closeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
