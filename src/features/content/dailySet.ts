import type { ContentItem, ContentType, PersonalizationWeights } from "./types";
import { DAILY_LIMIT } from "./types";

/**
 * Deterministic daily selection, in one of two modes:
 *
 * - Shared (default, `personalized: false`): the same (localDate, type,
 *   library) produces the same items for EVERY user — a fixed rotation
 *   dealt from a seeded shuffle of the pool. Categories, tags and
 *   `priority` are ignored. Flag: `config.contentPersonalizationEnabled`.
 * - Personalized (`personalized: true`): seeded per user and weighted by
 *   the user's onboarding interests, goals, obstacles and traits.
 *
 * Either way, reopening the app never reshuffles the day. The stored
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

export interface SelectDailySetOptions {
  /** Mirrors `config.contentPersonalizationEnabled`; defaults to off. */
  personalized?: boolean;
}

function draw(
  pool: ContentItem[],
  seed: string,
  weights: PersonalizationWeights,
  exclude: Set<string>,
): string[] {
  const rng = createRng(hashSeed(seed));
  // The server returns rows in no guaranteed order; a fixed order is
  // required for the same seed to produce the same set on every device.
  const ordered = [...pool].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const scored = ordered.map((item) => ({
    id: item.id,
    // Exponential-sort trick: taking the top-k keys of u^(1/w) is a
    // weighted sample without replacement.
    key: Math.pow(rng(), 1 / Math.max(scoreItem(item, weights, exclude), 0.01)),
  }));
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, DAILY_LIMIT).map((s) => s.id);
}

/** Day 0 of the shared rotation. Never change: it would reshuffle every day. */
const SHARED_EPOCH_UTC = Date.UTC(2026, 0, 1);

/** Whole days between the epoch and a YYYY-MM-DD local date. */
export function sharedDayIndex(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - SHARED_EPOCH_UTC) / 86_400_000);
}

/** Seeded Fisher-Yates over ids sorted for a server-order-independent start. */
function shuffledDeck(ids: readonly string[], seed: string): string[] {
  const rng = createRng(hashSeed(seed));
  const deck = [...ids].sort();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * The shared rotation: a pure function of (library, type, localDate), so
 * every user on the same library sees the same set on the same local day.
 *
 * Starting at the epoch it deals DAILY_LIMIT cards a day from a deck (the
 * type's pool, shuffled with a seed derived from the deck number) and
 * reshuffles a new deck when one runs out. A card shown yesterday is
 * passed over (consumed, not shown) so consecutive days never overlap,
 * and every item gets near-equal exposure over a cycle. Interests, tags
 * and editorial priority play no part here.
 *
 * Replaying from the epoch costs O(days × DAILY_LIMIT) — a few tens of
 * thousands of steps after years — and runs once per type per day.
 */
export function selectSharedDailySet(
  library: ContentItem[],
  type: ContentType,
  localDate: string,
): string[] {
  const ids = library
    .filter((item) => item.type === type)
    .map((item) => item.id);
  const n = ids.length;
  if (n === 0) return [];
  const day = Math.max(0, sharedDayIndex(localDate));
  // A pool no bigger than a day's set is shown whole, in a daily order.
  if (n <= DAILY_LIMIT) return shuffledDeck(ids, `shared:${type}:day:${day}`);

  let cycle = 0;
  let deck = shuffledDeck(ids, `shared:${type}:${cycle}`);
  let position = 0;
  let previous = new Set<string>();
  let today: string[] = [];
  for (let d = 0; d <= day; d++) {
    today = [];
    const dealt = new Set<string>();
    let drawn = 0;
    while (today.length < DAILY_LIMIT) {
      if (position >= n) {
        cycle += 1;
        deck = shuffledDeck(ids, `shared:${type}:${cycle}`);
        position = 0;
      }
      const id = deck[position++];
      drawn += 1;
      if (dealt.has(id)) continue;
      // Once a whole deck's worth has been drawn today, stop avoiding
      // yesterday's cards so a small pool can still fill the day.
      if (previous.has(id) && drawn <= n) continue;
      today.push(id);
      dealt.add(id);
    }
    previous = dealt;
  }
  return today;
}

/**
 * Weighted sampling without replacement, seeded. Returns up to
 * DAILY_LIMIT item ids. `userId`, `weights` and `recentIds` only take
 * effect when `personalized` is on; otherwise the shared rotation is used.
 */
export function selectDailySet(
  library: ContentItem[],
  type: ContentType,
  userId: string,
  localDate: string,
  weights: PersonalizationWeights,
  recentIds: string[] = [],
  options: SelectDailySetOptions = {},
): string[] {
  if (!options.personalized)
    return selectSharedDailySet(library, type, localDate);
  const pool = library.filter((item) => item.type === type);
  if (pool.length === 0) return [];
  return draw(
    pool,
    `${userId}:${localDate}:${type}`,
    weights,
    new Set(recentIds),
  );
}

/** The user's local calendar date as YYYY-MM-DD. */
export function getLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
