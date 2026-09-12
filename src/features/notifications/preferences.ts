import { assertCurrentIdentity, type Identity } from "@/lib/appState";
import { getIdentitySupabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
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
export async function saveNotificationPreferences(
  identity: Identity,
  changes: PreferenceChanges,
  initial = false,
): Promise<Row> {
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
