import type { ContentItem, ContentType, PersonalizationWeights } from "./types";
import { DAILY_LIMIT } from "./types";

/**
 * Deterministic, personalized daily selection.
 *
 * The same (userId, localDate, type, library) always produces the same
 * items, so reopening the app never reshuffles the day. The stored
 * daily_sets row is still the source of truth — mid-day library edits
 * can't shift an already-generated day.
 */

/** xmur3 string hash -> 32-bit seed. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG. */
function createRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scoreItem(
  item: ContentItem,
  weights: PersonalizationWeights,
  excludeIds: Set<string>,
): number {
  if (excludeIds.has(item.id)) return 0.05;
  let score = 1;
  const interests =
    item.type === "quote"
      ? weights.quoteInterests
      : weights.affirmationInterests;
  for (const category of item.categories) {
    if (interests.includes(category)) score += 2;
  }
  for (const tag of item.tags) {
    const [kind, value] = tag.split(":");
    if (!kind || !value) continue;
    if (kind === "goal" && weights.primaryGoals.includes(value)) score += 1;
    if (kind === "obstacle" && weights.obstacles.includes(value)) score += 1;
    if (kind === "trait" && weights.futureTraits.includes(value)) score += 1;
  }
  score += item.priority * 0.25;
  return score;
}

/**
 * Weighted sampling without replacement, seeded. Returns up to
 * DAILY_LIMIT item ids.
 */
export function selectDailySet(
  library: ContentItem[],
  type: ContentType,
  userId: string,
  localDate: string,
  weights: PersonalizationWeights,
  recentIds: string[] = [],
): string[] {
  const pool = library.filter((item) => item.type === type);
  if (pool.length === 0) return [];

  const rng = createRng(hashSeed(`${userId}:${localDate}:${type}`));
  const exclude = new Set(recentIds);
  const scored = pool.map((item) => ({
    id: item.id,
    // Exponential-sort trick: taking the top-k keys of u^(1/w) is a
    // weighted sample without replacement.
    key: Math.pow(rng(), 1 / Math.max(scoreItem(item, weights, exclude), 0.01)),
  }));
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, DAILY_LIMIT).map((s) => s.id);
}

/** The user's local calendar date as YYYY-MM-DD. */
export function getLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
