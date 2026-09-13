import { saveNotificationPreferences } from "@/features/notifications/preferences";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";
import type { OnboardingVariant } from "@/lib/experiments";
import { getIdentitySupabase } from "@/lib/supabase";
import { CalAiPaywall } from "@/features/paywall/calai/CalAiPaywall";
import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import {
  PAYWALL_VARIANT,
  calAiVersion,
} from "@/features/paywall/paywallVariant";
import { useOffering } from "@/features/paywall/useOffering";
import { getCompletedOnboardingVariant } from "@/features/onboarding/engine/store";

/** Local package selection enforces the approved weekly/yearly offer boundary.
 * An unverified remote paywall cannot enforce the same package guard. */
export default function PaywallRoute() {
  const displayName = useAppState((s) => s.displayName);
  const [variant, setVariant] = useState<OnboardingVariant | null>(null);
  const [trialReminder, setTrialReminder] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const calAi = calAiVersion(PAYWALL_VARIANT);
  const isNote = variant === "stella-founder" || variant === "stella-claude";
  const offering = useOffering(isNote && !calAi ? "weekly" : "annual");
  useEffect(() => {
    let active = true;
    const identity = captureIdentity();
    getCompletedOnboardingVariant()
      .then((v) => {
        if (active && isCurrentIdentity(identity))
          setVariant((v as OnboardingVariant) ?? "iam-claude");
      })
      .catch(() => {
        if (active) setVariant("iam-claude");
      });
    void getIdentitySupabase(identity)
      .then(async (client) => {
        if (!client) return;
        const { data, error } = await client
          .from("notification_prefs")
          .select("trial_reminder")
          .eq("user_id", identity.userId!)
          .maybeSingle();
        if (!error && data && active && isCurrentIdentity(identity))
          setTrialReminder(data.trial_reminder);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const saveReminder = async (value: boolean) => {
    if (savingReminder) return;
    const identity = captureIdentity();
    setSavingReminder(true);
    try {
      const client = await getIdentitySupabase(identity);
      if (!client) throw new Error("Unavailable");
      await saveNotificationPreferences(identity, { trial_reminder: value });
      if (isCurrentIdentity(identity)) setTrialReminder(value);
    } catch {
      if (isCurrentIdentity(identity))
        Alert.alert(
          "Reminder not saved",
          "Please retry when connected. Your previous setting is still selected.",
        );
    } finally {
      if (isCurrentIdentity(identity)) setSavingReminder(false);
    }
  };
  const onPurchased = () => {
    if (useAppState.getState().isPremium) router.replace("/");
  };
  const data = { ...offering, loading: offering.loading || savingReminder };
  if (calAi)
    return (
      <CalAiPaywall
        data={data}
        version={calAi}
        placement="gate"
        trialReminder={trialReminder}
        onTrialReminderChange={saveReminder}
        onPurchased={onPurchased}
      />
    );
  if (!variant) return null;
  return isNote ? (
    <NotePaywall
      data={data}
      voice={variant === "stella-founder" ? "future-self" : "team"}
      userName={displayName}
      placement="gate"
      onPurchased={onPurchased}
    />
  ) : (
    <TimelinePaywall
      data={data}
      closeDelayMs={null}
      trialReminder={trialReminder}
      onTrialReminderChange={saveReminder}
      placement="gate"
      onPurchased={onPurchased}
    />
  );
}
