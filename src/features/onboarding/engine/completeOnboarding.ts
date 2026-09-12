import { applyAppIcon } from "@/design-system/appIcons";
import { analytics } from "@/lib/analytics";
import {
  assertCurrentIdentity,
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import type { Database } from "@/lib/database.types";
import type { OnboardingVariant } from "@/lib/experiments";
import { monitoring } from "@/lib/monitoring";
import { getIdentitySupabase } from "@/lib/supabase";
import { saveNotificationPreferences } from "@/features/notifications/preferences";
import { registerDevice } from "@/features/notifications/push";
import {
  clearOnboardingState,
  clearPendingServerSync,
  getCompletedOnboardingVariant,
  getPendingServerSync,
  markOnboardingComplete,
  setPendingServerSync,
  useOnboardingStore,
  type PendingServerSync,
  type OnboardingPayload,
} from "./store";

/** Full immutable payload is durable before any remote write. A retry repeats
 * idempotent stages without losing collected text or the original timestamp. */
export async function completeOnboarding(
  variant: OnboardingVariant,
): Promise<void> {
  const identity = captureIdentity();
  assertCurrentIdentity(identity);
  const { answers, name, notificationPrefs } = useOnboardingStore.getState();
  const arrayOf = (key: string): string[] =>
    Array.isArray(answers[key]) ? [...(answers[key] as string[])] : [];
  const stringOf = (key: string): string | null =>
    typeof answers[key] === "string" && answers[key].length
      ? (answers[key] as string)
      : null;
  const rawAnswers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(answers))
    if (key.startsWith("raw."))
      rawAnswers[key.slice(4)] = Array.isArray(value) ? [...value] : value;
  const payload: OnboardingPayload = {
    personalization: {
      user_id: identity.userId!,
      variant,
      primary_goals: arrayOf("primary_goals"),
      obstacles: arrayOf("obstacles"),
      motivation_level: stringOf("motivation_level"),
      future_traits: arrayOf("future_traits"),
      quote_interests: arrayOf("quote_interests").length
        ? arrayOf("quote_interests")
        : mapGoalsToQuoteInterests(arrayOf("primary_goals")),
      affirmation_interests: arrayOf("affirmation_interests"),
      gender: stringOf("gender"),
      life_goal: stringOf("life_goal"),
      raw_answers: rawAnswers,
      onboarding_completed_at: new Date().toISOString(),
    },
    name,
    notificationPrefs: { ...notificationPrefs },
    trialReminder: answers["raw.trial_reminder"] !== "no",
  };
  const pending = await setPendingServerSync(identity.userId, variant, payload);
  assertCurrentIdentity(identity);
  await markOnboardingComplete(variant, identity.userId);
  assertCurrentIdentity(identity);
  useAppState.getState().setOnboardingComplete(true);
  useAppState.getState().setDisplayName(name);
  analytics.capture("onboarding_completed", { variant });
  void queueOnboarding(identity, pending).catch((error) =>
    monitoring.captureError(error, { area: "onboarding.complete" }),
  );
  // Safety net for the icon the user picked: the AppIconStep already
  // applied it on tap, so this is a no-op unless that failed or the app
  // was killed before the step's apply landed. Deferred so the native
  // icon change never races the notification permission alert or the
  // route replace that follow completion (NSPOSIXErrorDomain 35).
  const chosenIcon = stringOf("raw.app_icon");
  setTimeout(() => {
    if (isCurrentIdentity(identity)) void applyAppIcon(chosenIcon);
  }, APP_ICON_SAFETY_NET_DELAY_MS);
}

/** Long enough for the OS permission alert and the route change to settle. */
export const APP_ICON_SAFETY_NET_DELAY_MS = 1500;

const flushes = new Map<string, Promise<void>>();
function queueOnboarding(
  identity: Identity,
  pending: PendingServerSync,
): Promise<void> {
  const previous = flushes.get(identity.userId!) ?? Promise.resolve();
  const work = previous
    .catch(() => {})
    .then(async () => {
      assertCurrentIdentity(identity);
      const latest = await getPendingServerSync(identity.userId);
      if (latest?.revision !== pending.revision) return;
      await flushOnboarding(identity, pending);
    });
  flushes.set(identity.userId!, work);
  void work
    .finally(() => {
      if (flushes.get(identity.userId!) === work)
        flushes.delete(identity.userId!);
    })
    .catch(() => {});
  return work;
}
async function flushOnboarding(
  identity: Identity,
  pending: PendingServerSync,
): Promise<void> {
  assertCurrentIdentity(identity);
  if (pending.userId !== identity.userId || !pending.payload) return;
  const supabase = await getIdentitySupabase(identity);
  if (!supabase) return;
  const { personalization, name, notificationPrefs } = pending.payload;
  const checked = async (request: PromiseLike<{ error: unknown }>) => {
    const { error } = await request;
    if (error) throw error;
    assertCurrentIdentity(identity);
  };
  await checked(
    supabase
      .from("personalization")
      .upsert(
        personalization as Database["public"]["Tables"]["personalization"]["Insert"],
      ),
  );
  if (name !== null)
    await checked(
      supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("id", identity.userId!),
    );
  await saveNotificationPreferences(
    identity,
    {
      quotes_per_day: notificationPrefs.quotesPerDay,
      affirmations_per_day: notificationPrefs.affirmationsPerDay,
      window_start_minutes: notificationPrefs.windowStartMinutes,
      window_end_minutes: notificationPrefs.windowEndMinutes,
      trial_reminder: pending.payload.trialReminder,
    },
    true,
  );
  await registerDevice(identity);
  assertCurrentIdentity(identity);
  await checked(supabase.rpc("recalc_my_notification_state"));
  await clearPendingServerSync(identity.userId, pending.revision);
}

export async function reconcileOnboardingState(
  userId: string,
): Promise<boolean> {
  const identity = captureIdentity();
  if (identity.userId !== userId) return false;
  const localComplete = async () => {
    const pending = await getPendingServerSync(userId);
    const durable =
      typeof pending?.payload?.personalization.onboarding_completed_at ===
      "string";
    const complete =
      durable || Boolean(await getCompletedOnboardingVariant(userId));
    if (isCurrentIdentity(identity))
      useAppState.getState().setOnboardingComplete(complete);
    return isCurrentIdentity(identity) && complete;
  };
  try {
    const pending = await getPendingServerSync(userId);
    assertCurrentIdentity(identity);
    // Resume every stage even if the personalization row already exists.
    if (pending?.payload) await queueOnboarding(identity, pending);
    const supabase = await getIdentitySupabase(identity);
    if (!supabase) return localComplete();
    const { data, error } = await supabase
      .from("personalization")
      .select("variant, onboarding_completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    assertCurrentIdentity(identity);
    if (error) return localComplete();
    if (data?.onboarding_completed_at) {
      const allowed = [
        "iam-claude",
        "iam-founder",
        "stella-claude",
        "stella-founder",
      ];
      const variant = (
        allowed.includes(data.variant ?? "") ? data.variant : "iam-claude"
      ) as OnboardingVariant;
      await markOnboardingComplete(variant, userId);
      assertCurrentIdentity(identity);
      useAppState.getState().setOnboardingComplete(true);
      return true;
    }
    if (pending) return localComplete();
    if (await getCompletedOnboardingVariant(userId))
      await clearOnboardingState(userId);
    assertCurrentIdentity(identity);
    useAppState.getState().setOnboardingComplete(false);
    return false;
  } catch (error) {
    if (!isCurrentIdentity(identity)) return false;
    monitoring.captureError(error, { area: "onboarding.reconcile" });
    return localComplete();
  }
}

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
