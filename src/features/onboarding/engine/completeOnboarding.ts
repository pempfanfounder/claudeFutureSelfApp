import { applyAppIcon } from "@/design-system/appIcons";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import type { OnboardingVariant } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

import { registerDevice } from "@/features/notifications/push";

import {
  clearOnboardingState,
  clearPendingServerSync,
  getCompletedOnboardingVariant,
  getPendingServerSync,
  markOnboardingComplete,
  setPendingServerSync,
  useOnboardingStore,
} from "./store";

/**
 * Persists everything the funnel collected, in one pass:
 * personalization model -> Supabase, notification prefs -> Supabase,
 * device registration + dispatch state recalc, local completion flag.
 *
 * Runs during the "preparing" step (stella) or right after the paywall
 * (iam). Idempotent: upserts throughout.
 */
export async function completeOnboarding(
  variant: OnboardingVariant,
): Promise<void> {
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
    let userId: string | undefined;
    // Tracks whether the personalization row provably reached the
    // server — the one write reconcileOnboardingState treats as the
    // source of truth for "finished onboarding".
    let personalizationSynced = false;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      userId = sessionData.session?.user.id;
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
        personalizationSynced = true;
        // The row is on the server: any earlier failure marker is
        // obsolete.
        await clearPendingServerSync();

        if (name) {
          await supabase
            .from("profiles")
            .update({ display_name: name })
            .eq("id", userId);
        }

        const { error: nErr } = await supabase
          .from("notification_prefs")
          .upsert({
            user_id: userId,
            quotes_per_day: notificationPrefs.quotesPerDay,
            affirmations_per_day: notificationPrefs.affirmationsPerDay,
            window_start_minutes: notificationPrefs.windowStartMinutes,
            window_end_minutes: notificationPrefs.windowEndMinutes,
            trial_reminder: notificationPrefs.trialReminder,
          });
        if (nErr) throw nErr;

        await registerDevice();
        await supabase.rpc("recalc_my_notification_state");
      } else {
        // No session to write under: remember the completion so the
        // next boot's reconcile retries instead of clearing the flag.
        await setPendingServerSync(null, variant);
      }
    } catch (error) {
      // Persistence failures must never trap the user in onboarding —
      // the local completion flag still flips, and the pending-sync
      // marker makes reconcileOnboardingState retry the write.
      monitoring.captureError(error, { area: "onboarding.complete" });
      if (!personalizationSynced) {
        await setPendingServerSync(userId ?? null, variant).catch(() => {});
      }
    }
  }

  await markOnboardingComplete(variant);
  useAppState.getState().setOnboardingComplete(true);
  if (name) useAppState.getState().setDisplayName(name);
  analytics.capture("onboarding_completed", { variant });

  // The app-icon step only records the choice; apply it once here so
  // the iOS "You have changed the icon" alert never interrupts the
  // funnel. Fire-and-forget: the icon must never block completion.
  applyAppIcon(stringOf("raw.app_icon")).catch(() => {});
}

/**
 * Reconciles the device's onboarding-complete flag with the server
 * after the authenticated user changes (boot, account switch, account
 * deletion). The server's `personalization` row is the source of
 * truth when it can be read:
 *  - row exists  -> adopt completion (and the row's variant) locally
 *  - row absent  -> this user never finished onboarding; clear local
 *  - query fails -> could not verify; keep local state (offline grace)
 * Returns whether onboarding is complete afterwards.
 */
export async function reconcileOnboardingState(
  userId: string,
): Promise<boolean> {
  const localComplete = async () =>
    Boolean(await getCompletedOnboardingVariant());

  const supabase = getSupabase();
  if (!supabase) return localComplete();

  try {
    const { data, error } = await supabase
      .from("personalization")
      .select("variant")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // A PostgrestError (RLS hiccup, transient server fault) is a
      // failure to verify, not proof of absence: keep local state.
      return localComplete();
    }

    if (data) {
      const variant = (data.variant ?? "iam-claude") as OnboardingVariant;
      await markOnboardingComplete(variant);
      useAppState.getState().setOnboardingComplete(true);
      return true;
    }

    // Definitive answer: no personalization row. Before treating that
    // as "this user never completed onboarding", honor a completion
    // that never reached the server (failed upsert, or no session at
    // completion time): retry the write instead of bouncing a finished
    // — possibly paying — user back into the funnel.
    const pending = await getPendingServerSync();
    if (pending && (pending.userId === userId || pending.userId === null)) {
      const { error: retryError } = await supabase
        .from("personalization")
        .upsert({
          user_id: userId,
          variant: pending.variant,
          onboarding_completed_at: new Date().toISOString(),
        });
      if (!retryError) {
        await clearPendingServerSync();
        await markOnboardingComplete(pending.variant);
        useAppState.getState().setOnboardingComplete(true);
        return true;
      }
      // Still can't reach the server: keep local state and leave the
      // marker in place for the next reconcile.
      return localComplete();
    }

    // No row and no matching pending write, so this user never
    // completed onboarding. Only clear when there is a stale flag —
    // fresh installs reconcile mid-funnel and must keep their
    // in-memory progress.
    if (await localComplete()) {
      await clearOnboardingState();
    }
    useAppState.getState().setOnboardingComplete(false);
    return false;
  } catch (error) {
    // Network failure: offline relaunches must never bounce a
    // finished user back into onboarding.
    monitoring.captureError(error, { area: "onboarding.reconcile" });
    return localComplete();
  }
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
  return [
    ...new Set(goals.map((g) => map[g]).filter((v): v is string => Boolean(v))),
  ];
}
