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

/** Max items a user sees per content type per local day. */
export const DAILY_LIMIT = 10;

/** Unique items (across both types) that complete the daily streak. */
export const STREAK_TARGET = 3;
