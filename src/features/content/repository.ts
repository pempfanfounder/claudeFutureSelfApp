import AsyncStorage from "@react-native-async-storage/async-storage";

import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

import { getLocalDate, selectDailySet } from "./dailySet";
import type { ContentItem, ContentType, PersonalizationWeights } from "./types";

const LIBRARY_CACHE_KEY = "fs.content-library.v1";
const LIBRARY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface LibraryCache {
  fetchedAt: number;
  items: ContentItem[];
}

/**
 * Loads the active content library (bounded, few hundred rows) with a
 * 12h local cache so daily browsing works offline after first load.
 */
export async function loadLibrary(force = false): Promise<ContentItem[]> {
  if (!force) {
    try {
      const raw = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw) as LibraryCache;
        if (
          Date.now() - cache.fetchedAt < LIBRARY_CACHE_TTL_MS &&
          cache.items.length > 0
        ) {
          return cache.items;
        }
      }
    } catch {
      // fall through to network
    }
  }

  const supabase = getSupabase();
  if (!supabase) return readStaleCache();

  const { data, error } = await supabase
    .from("content_items")
    .select("id, type, body, author, categories, tags, priority")
    .eq("active", true)
    .limit(1000);

  if (error || !data) {
    monitoring.captureError(error ?? new Error("library fetch failed"), {
      area: "content.loadLibrary",
    });
    return readStaleCache();
  }

  const items = data as ContentItem[];
  await AsyncStorage.setItem(
    LIBRARY_CACHE_KEY,
    JSON.stringify({ fetchedAt: Date.now(), items } satisfies LibraryCache),
  ).catch(() => {});
  return items;
}

async function readStaleCache(): Promise<ContentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as LibraryCache).items;
  } catch {
    return [];
  }
}

/**
 * Returns today's stable set for a content type: reads the persisted
 * daily_sets row first; generates + persists it if absent. The stored
 * row wins so the set never changes mid-day.
 */
export async function getDailySet(
  userId: string,
  type: ContentType,
  weights: PersonalizationWeights,
): Promise<ContentItem[]> {
  const localDate = getLocalDate();
  const library = await loadLibrary();
  if (library.length === 0) return [];
  const byId = new Map(library.map((i) => [i.id, i]));

  const supabase = getSupabase();
  let ids: string[] | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("daily_sets")
      .select("content_ids")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("type", type)
      .maybeSingle();
    if (data?.content_ids?.length) {
      ids = data.content_ids;
    }
  }

  if (!ids) {
    const recentIds = await getYesterdayIds(userId, type);
    ids = selectDailySet(library, type, userId, localDate, weights, recentIds);
    if (supabase && ids.length > 0) {
      // Insert-if-absent: a concurrent device may have won the race;
      // re-read so both devices agree on the same set.
      const { error } = await supabase
        .from("daily_sets")
        .insert({
          user_id: userId,
          local_date: localDate,
          type,
          content_ids: ids,
        });
      if (error) {
        const { data } = await supabase
          .from("daily_sets")
          .select("content_ids")
          .eq("user_id", userId)
          .eq("local_date", localDate)
          .eq("type", type)
          .maybeSingle();
        if (data?.content_ids?.length) ids = data.content_ids;
      }
    }
  }

  return ids
    .map((id) => byId.get(id))
    .filter((i): i is ContentItem => Boolean(i));
}

async function getYesterdayIds(
  userId: string,
  type: ContentType,
): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { data } = await supabase
    .from("daily_sets")
    .select("content_ids")
    .eq("user_id", userId)
    .eq("local_date", getLocalDate(yesterday))
    .eq("type", type)
    .maybeSingle();
  return data?.content_ids ?? [];
}

/** Fetch a single item (deep links), falling back to delivery snapshots. */
export async function getContentById(id: string): Promise<ContentItem | null> {
  const library = await loadLibrary();
  const hit = library.find((i) => i.id === id);
  if (hit) return hit;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("content_items")
    .select("id, type, body, author, categories, tags, priority")
    .eq("id", id)
    .maybeSingle();
  if (data) return data as ContentItem;

  // Content was edited/deactivated after the notification was sent:
  // use the delivery snapshot so the deep link still resolves.
  const { data: delivery } = await supabase
    .from("notification_deliveries")
    .select("content_snapshot")
    .eq("content_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snapshot = delivery?.content_snapshot as {
    body?: string;
    author?: string | null;
    type?: string;
  } | null;
  if (snapshot?.body) {
    return {
      id,
      type: (snapshot.type as ContentType) ?? "quote",
      body: snapshot.body,
      author: snapshot.author ?? null,
      categories: [],
      tags: [],
      priority: 0,
    };
  }
  return null;
}
