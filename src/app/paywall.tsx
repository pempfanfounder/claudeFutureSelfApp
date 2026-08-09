import { router } from "expo-router";
import { useEffect, useState } from "react";

import { useAppState } from "@/lib/appState";
import type { OnboardingVariant } from "@/lib/experiments";

import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import { useOffering } from "@/features/paywall/useOffering";
import { getCompletedOnboardingVariant } from "@/features/onboarding/engine/store";

/**
 * Standalone hard gate: shown whenever onboarding is complete but no
 * premium entitlement is active (e.g. the user killed the app at the
 * onboarding paywall, or their subscription lapsed). Not closable —
 * the only ways forward are purchase or restore.
 */
export default function PaywallRoute() {
  const { setPremium, displayName } = useAppState();
  const [variant, setVariant] = useState<OnboardingVariant | null>(null);

  useEffect(() => {
    getCompletedOnboardingVariant().then((v) =>
      setVariant((v as OnboardingVariant) ?? "iam-claude"),
    );
  }, []);

  const isNote = variant === "stella-founder" || variant === "stella-claude";
  const offering = useOffering(isNote ? "weekly" : "annual");

  if (!variant) return null;

  const onPurchased = () => {
    setPremium(true);
    router.replace("/");
  };

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
