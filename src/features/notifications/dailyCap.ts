import { DAILY_LIMIT } from "@/features/content/types";

/**
 * Combined daily cap: quotes + affirmations may never exceed this many
 * notifications per day. Onboarding promises "a maximum of 20 a day" in
 * total, and the push pipeline is sized for it (capacity analysis,
 * 2026-09-13). Mirrors the DB check `notification_prefs_daily_total_check`
 * and the guard in `save_notification_prefs` (migration
 * 20260913090000_daily_notification_cap). Each kind alone still caps at
 * `DAILY_LIMIT`, so the two limits are the same number today.
 */
export const DAILY_NOTIFICATION_CAP = DAILY_LIMIT;

export interface DailyCounts {
  quotesPerDay: number;
  affirmationsPerDay: number;
}
export type DailyCountKey = keyof DailyCounts;

const clampOne = (value: number) =>
  Math.min(DAILY_LIMIT, Math.max(0, Math.trunc(value)));

export function dailyTotal(counts: DailyCounts): number {
  return counts.quotesPerDay + counts.affirmationsPerDay;
}

export function exceedsDailyCap(counts: DailyCounts): boolean {
  return dailyTotal(counts) > DAILY_NOTIFICATION_CAP;
}

/**
 * The user raised (or lowered) one count in a stepper. The changed count
 * wins; the other is lowered only as far as needed to stay within the
 * combined cap, never raised.
 */
export function applyCountChange(
  counts: DailyCounts,
  key: DailyCountKey,
  value: number,
): DailyCounts {
  const changed = clampOne(value);
  const otherKey: DailyCountKey =
    key === "quotesPerDay" ? "affirmationsPerDay" : "quotesPerDay";
  const other = Math.min(
    clampOne(counts[otherKey]),
    DAILY_NOTIFICATION_CAP - changed,
  );
  return { [key]: changed, [otherKey]: other } as unknown as DailyCounts;
}

/**
 * Brings stored counts (older builds allowed 20 + 20) inside the cap the
 * same way the server migration does: the split is kept proportional,
 * quotes rounded down, affirmations take the remainder. Counts already
 * within the cap are returned unchanged.
 */
export function clampDailyCounts(counts: DailyCounts): DailyCounts {
  const quotes = clampOne(counts.quotesPerDay);
  const affirmations = clampOne(counts.affirmationsPerDay);
  const total = quotes + affirmations;
  if (total <= DAILY_NOTIFICATION_CAP)
    return { quotesPerDay: quotes, affirmationsPerDay: affirmations };
  const scaledQuotes = Math.floor((quotes * DAILY_NOTIFICATION_CAP) / total);
  return {
    quotesPerDay: scaledQuotes,
    affirmationsPerDay: DAILY_NOTIFICATION_CAP - scaledQuotes,
  };
}

/** Small caption under the count rows. */
export function dailyCapHint(counts: DailyCounts): string {
  const total = dailyTotal(counts);
  if (total >= DAILY_NOTIFICATION_CAP)
    return `${DAILY_NOTIFICATION_CAP} a day is the maximum. Raising one lowers the other.`;
  return `Up to ${DAILY_NOTIFICATION_CAP} a day in total. You're at ${total}.`;
}
