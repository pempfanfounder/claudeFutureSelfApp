import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { purchasePackage } from "@/lib/purchases";

import { PaywallFooter } from "./PaywallFooter";
import {
  formatPriceLine,
  subscriptionDisclosure,
  trialInfo,
  type PaywallData,
} from "./useOffering";

interface NotePaywallProps {
  data: PaywallData;
  /** "team" (stella-claude) or "future-self" (stella-founder) voice. */
  voice: "team" | "future-self";
  userName: string | null;
  onPurchased: () => void;
  placement: string;
}

/**
 * Stella-style hard paywall: a personal note over the blurred app, no
 * close control at all. Honest copy — no fabricated demand claims, no
 * fake countdowns. Exits: purchase or restore only.
 */
export function NotePaywall({
  data,
  voice,
  userName,
  onPurchased,
  placement,
}: NotePaywallProps) {
  const colors = useColors();
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    analytics.capture("paywall_viewed", { style: "note", placement, voice });
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

  const trial = data.trialLength;
  const disclosure = subscriptionDisclosure(data.pkg);
  const header =
    voice === "team"
      ? "A note before you begin"
      : "A note from your future self";
  const body =
    voice === "team"
      ? [
          "Future Self is a small team. There are no ads here, and nothing about your attention is for sale. The app works for you, not on you.",
          `That's only possible because it's paid.${trial ? ` Start with ${trial} free, on us. If it doesn't move you, cancel anytime and pay nothing.` : ""}`,
        ]
      : [
          `You just told me who you want to become${userName ? `, ${userName}` : ""}. I'm not letting that be another tab you close.`,
          "Future Self has no ads and sells nothing about you. The app works for you, which is why it's paid.",
          trial
            ? `Take ${trial} free. If it doesn't move you, cancel anytime and pay nothing. But you didn't come this far to only come this far.`
            : "If it doesn't move you, cancel anytime. But you didn't come this far to only come this far.",
        ];

  const cta = trial ? `Start my free ${trial} →` : "Unlock Future Self";

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.card }, shadows.lg]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <AppText variant="h2" center style={styles.header}>
            {header}
          </AppText>
          {body.map((paragraph, i) => (
            <AppText
              key={i}
              variant="lead"
              tone="ink2"
              style={styles.paragraph}
            >
              {paragraph}
            </AppText>
          ))}
          {voice === "future-self" ? (
            <AppText variant="lead" tone="ink3" style={styles.signature}>
              — you, later
            </AppText>
          ) : null}

          {data.allPackages && data.allPackages.length > 1 ? (
            <View style={styles.planSelector}>
              {data.allPackages.map((p) => {
                const isSelected = data.pkg?.identifier === p.identifier;
                const pTrial = trialInfo(p);
                return (
                  <View key={p.identifier} style={styles.planWrapper}>
                    <Button
                      label={`${p.product.title || p.packageType} · ${formatPriceLine(p)}${pTrial ? ` (${pTrial.label} free)` : ""}`}
                      variant={isSelected ? "primary" : "secondary"}
                      onPress={() => data.selectPackage(p)}
                      style={styles.planButton}
                      testID={`plan-${p.identifier}`}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}

          {data.unavailable ? (
            <AppText variant="body" tone="ink2" center style={styles.paragraph}>
              {
                "The store can't be reached right now. Access stays locked until a purchase completes. Try again shortly, or Restore if you've subscribed before."
              }
            </AppText>
          ) : null}
          {data.devMock ? (
            <AppText variant="label" tone="ink3" center>
              Development mode: purchases are mocked
            </AppText>
          ) : null}

          <Button
            label={cta}
            onPress={buy}
            loading={purchasing}
            disabled={data.loading || (data.unavailable && !data.devMock)}
            style={styles.cta}
            testID="paywall-cta"
          />
          {data.priceLine ? (
            <AppText variant="label" tone="ink2" center style={styles.price}>
              {trial ? `${trial} free, then ${data.priceLine}` : data.priceLine}
            </AppText>
          ) : null}
          {disclosure ? (
            <AppText
              variant="label"
              tone="ink3"
              center
              style={styles.disclosure}
            >
              {disclosure}
            </AppText>
          ) : null}
          <PaywallFooter onRestored={onPurchased} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(42,30,22,0.45)",
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.xxl,
    maxHeight: "86%",
  },
  header: { marginBottom: spacing.lg, fontStyle: "italic" },
  paragraph: { marginBottom: spacing.lg },
  signature: {
    marginBottom: spacing.lg,
    fontStyle: "italic",
    textAlign: "right",
  },
  planSelector: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  planWrapper: {
    marginBottom: 4,
  },
  planButton: {
    width: "100%",
  },
  cta: { marginTop: spacing.sm },
  price: { marginTop: spacing.md },
  disclosure: { marginTop: spacing.sm },
});

