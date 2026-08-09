import { router } from "expo-router";
import { useEffect, useState } from "react";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

import { useAppState } from "@/lib/appState";
import { config } from "@/lib/config";
import type { OnboardingVariant } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { isConfigured, PREMIUM_ENTITLEMENT_ID } from "@/lib/purchases";

import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import { useOffering } from "@/features/paywall/useOffering";
import { getCompletedOnboardingVariant } from "@/features/onboarding/engine/store";

/**
 * Standalone hard gate: shown whenever onboarding is complete but no
 * premium entitlement is active (e.g. the user killed the app at the
 * onboarding paywall, or their subscription lapsed). Not closable —
 * the only ways forward are purchase or restore.
 *
 * When EXPO_PUBLIC_USE_RC_PAYWALL_GATE is on and purchases are really
 * configured (not the dev mock), this route tries RevenueCat's remote
 * Paywall first. Any outcome other than a completed purchase/restore
 * falls back to rendering the same custom gate paywall used otherwise.
 * This opt-in only ever applies to this standalone gate — never to the
 * in-onboarding TimelinePaywall/NotePaywall variants, which are an A/B
 * experiment and must keep their own selling logic.
 */
export default function PaywallRoute() {
  const { setPremium, displayName } = useAppState();
  const [variant, setVariant] = useState<OnboardingVariant | null>(null);
  const useRcGate =
    config.useRcPaywallGate && isConfigured() && !config.devMockPurchases;
  const [showCustomGate, setShowCustomGate] = useState(!useRcGate);

  const onPurchased = () => {
    setPremium(true);
    router.replace("/");
  };

  useEffect(() => {
    getCompletedOnboardingVariant().then((v) =>
      setVariant((v as OnboardingVariant) ?? "iam-claude"),
    );
  }, []);

  useEffect(() => {
    if (!useRcGate) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: PREMIUM_ENTITLEMENT_ID,
        });
        if (cancelled) return;
        if (
          result === PAYWALL_RESULT.PURCHASED ||
          result === PAYWALL_RESULT.RESTORED
        ) {
          onPurchased();
        } else {
          setShowCustomGate(true);
        }
      } catch (error) {
        if (cancelled) return;
        monitoring.captureError(error, { area: "paywall.rcGate" });
        setShowCustomGate(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRcGate]);

  const isNote = variant === "stella-founder" || variant === "stella-claude";
  const offering = useOffering(isNote ? "weekly" : "annual");

  if (!variant || !showCustomGate) return null;

  if (isNote) {
    return (
      <NotePaywall
        data={offering}
        voice={variant === "stella-founder" ? "future-self" : "team"}
        userName={displayName}
        placement="gate"
        onPurchased={onPurchased}
      />
    );
  }

  return (
    <TimelinePaywall
      data={offering}
      closeDelayMs={null}
      trialReminder
      onTrialReminderChange={() => {}}
      placement="gate"
      onPurchased={onPurchased}
    />
  );
}
