import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import type { OnboardingVariant } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

import { registerDevice } from "@/features/notifications/push";

import { markOnboardingComplete, useOnboardingStore } from "./store";

/**
 * Persists everything the funnel collected, in one pass:
 * personalization model -> Supabase, notification prefs -> Supabase,
 * device registration + dispatch state recalc, local completion flag.
 *
 * Runs during the "preparing" step (stella) or right after the paywall
 * (iam). Idempotent: upserts throughout.
 */
export async function completeOnboarding(variant: OnboardingVariant): Promise<void> {
  const { answers, name, notificationPrefs } = useOnboardingStore.getState();
  const supabase = getSupabase();

  const arrayOf = (key: string): string[] => {
    const v = answers[key];
    return Array.isArray(v) ? v : [];
  };
  const stringOf = (key: string): string | null => {
    const v = answers[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const rawAnswers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (key.startsWith("raw.")) rawAnswers[key.slice(4)] = value;
  }

  if (supabase) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (userId) {
        const { error: pErr } = await supabase.from("personalization").upsert({
          user_id: userId,
          variant,
          primary_goals: arrayOf("primary_goals"),
          obstacles: arrayOf("obstacles"),
          motivation_level: stringOf("motivation_level"),
          future_traits: arrayOf("future_traits"),
          quote_interests: arrayOf("quote_interests").length
            ? arrayOf("quote_interests")
            : // Areas imply quote interests when no explicit topic step ran.
              mapGoalsToQuoteInterests(arrayOf("primary_goals")),
          affirmation_interests: arrayOf("affirmation_interests"),
          gender: stringOf("gender"),
          life_goal: stringOf("life_goal"),
          raw_answers: rawAnswers,
          onboarding_completed_at: new Date().toISOString(),
        });
        if (pErr) throw pErr;

        if (name) {
          await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
        }

        const { error: nErr } = await supabase.from("notification_prefs").upsert({
          user_id: userId,
          quotes_per_day: notificationPrefs.quotesPerDay,
          affirmations_per_day: notificationPrefs.affirmationsPerDay,
          window_start_minutes: notificationPrefs.windowStartMinutes,
          window_end_minutes: notificationPrefs.windowEndMinutes,
        });
        if (nErr) throw nErr;

        await registerDevice();
        await supabase.rpc("recalc_my_notification_state");
      }
    } catch (error) {
      // Persistence failures must never trap the user in onboarding —
      // the local completion flag still flips and a later sync retries.
      monitoring.captureError(error, { area: "onboarding.complete" });
    }
  }

  await markOnboardingComplete(variant);
  useAppState.getState().setOnboardingComplete(true);
  if (name) useAppState.getState().setDisplayName(name);
  analytics.capture("onboarding_completed", { variant });
}

/** Founder variants collect "areas"; reuse them as quote interests. */
function mapGoalsToQuoteInterests(goals: string[]): string[] {
  const map: Record<string, string> = {
    body: "discipline",
    career: "ambition",
    money: "ambition",
    focus: "focus",
    peace: "stoic-calm",
    relationships: "kindness",
    discipline: "discipline",
    confidence: "courage",
    purpose: "ambition",
  };
  return [...new Set(goals.map((g) => map[g]).filter((v): v is string => Boolean(v)))];
}
