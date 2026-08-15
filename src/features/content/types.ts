export type ContentType = "quote" | "affirmation";

export interface ContentItem {
  id: string;
  type: ContentType;
  body: string;
  author: string | null;
  categories: string[];
  tags: string[];
  priority: number;
}

export interface PersonalizationWeights {
  quoteInterests: string[];
  affirmationInterests: string[];
  primaryGoals: string[];
  obstacles: string[];
  futureTraits: string[];
}

/**
 * Max items a user sees per content type per local day. Mirrors the DB
 * `notification_prefs` 0..20 check constraints (migration
 * 20260815120000) — the feed scrolls up to this many per type and the
 * frequency steppers cap at the same number.
 */
export const DAILY_LIMIT = 20;

/** Unique items (across both types) that complete the daily streak. */
export const STREAK_TARGET = 3;
