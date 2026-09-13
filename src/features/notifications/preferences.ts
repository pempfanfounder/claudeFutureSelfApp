import { DAILY_LIMIT } from "@/features/content/types";
import { assertCurrentIdentity, type Identity } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";

import { DAILY_NOTIFICATION_CAP, exceedsDailyCap } from "./dailyCap";
export const PREFERENCE_KEYS = [
  "quotes_per_day",
  "affirmations_per_day",
  "streak_reminder",
  "trial_reminder",
  "window_start_minutes",
  "window_end_minutes",
  "quiet_start_minutes",
  "quiet_end_minutes",
] as const;
type Row = Database["public"]["Tables"]["notification_prefs"]["Row"];
export type PreferenceChanges = Partial<
  Pick<
    Row,
    | "quotes_per_day"
    | "affirmations_per_day"
    | "streak_reminder"
    | "trial_reminder"
    | "window_start_minutes"
    | "window_end_minutes"
    | "quiet_start_minutes"
    | "quiet_end_minutes"
  >
>;
/**
 * Client-side mirror of the server's daily-cap guard: rejects a change
 * whose counts (the ones being sent) exceed the combined cap, so a bad
 * write is caught before the RPC round-trip. Partial changes (only one
 * count) are checked against that count alone; the server checks the
 * merged row.
 */
export function assertWithinDailyCap(changes: PreferenceChanges): void {
  const quotes = changes.quotes_per_day ?? 0;
  const affirmations = changes.affirmations_per_day ?? 0;
  for (const value of [quotes, affirmations]) {
    if (!Number.isInteger(value) || value < 0 || value > DAILY_LIMIT)
      throw new Error(`Each kind allows 0 to ${DAILY_LIMIT} a day.`);
  }
  if (
    exceedsDailyCap({ quotesPerDay: quotes, affirmationsPerDay: affirmations })
  )
    throw new Error(
      `Quotes and affirmations together allow at most ${DAILY_NOTIFICATION_CAP} a day.`,
    );
}

export async function saveNotificationPreferences(
  identity: Identity,
  changes: PreferenceChanges,
  initial = false,
): Promise<Row> {
  assertWithinDailyCap(changes);
  const client = await getIdentitySupabase(identity);
  assertCurrentIdentity(identity);
  if (!client) throw new Error("Account service unavailable.");
  const { data, error } = await client.rpc("save_notification_prefs", {
    p_changes: changes as Json,
    p_initial: initial,
  });
  if (error) throw error;
  assertCurrentIdentity(identity);
  const result = data as { applied?: boolean; prefs?: Row } | null;
  if (
    typeof result?.applied !== "boolean" ||
    result.prefs?.user_id !== identity.userId ||
    typeof result.prefs.trial_reminder !== "boolean"
  )
    throw new Error("Preference acknowledgement is incomplete.");
  return result.prefs;
}
