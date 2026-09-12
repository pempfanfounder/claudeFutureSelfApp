import AsyncStorage from "@react-native-async-storage/async-storage";
import { ownedStorage } from "@/lib/accountStorage";
import {
  assertCurrentIdentity,
  captureIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import { config } from "@/lib/config";
import { getIdentitySupabase } from "@/lib/supabase";
import { getLocalDate, selectDailySet } from "./dailySet";
import {
  isLocalCatalogId,
  resolveContentLibrary,
} from "./localCatalog";
import type { ContentItem, ContentType, PersonalizationWeights } from "./types";

const libraryKey = (id: string) => `fs.content-library.v2.${id}`;
const dailyKey = (id: string, day: string, type: ContentType) =>
  `fs.daily.${id}.${day}.${type}`;
interface LibraryCache {
  fetchedAt: number;
  items: ContentItem[];
}
interface DailyCache {
  items: ContentItem[];
  confirmed: boolean;
}
function allowed(identity: Identity) {
  assertCurrentIdentity(identity);
  if (!useAppState.getState().isPremium)
    throw new Error("Subscription access needs to be restored.");
}
function parseCache<T>(raw: string | null, tolerateCorrupt = false): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    if (tolerateCorrupt && error instanceof SyntaxError) return null;
    throw error;
  }
}
async function read<T>(
  identity: Identity,
  key: string,
  tolerateCorrupt = false,
): Promise<T | null> {
  return ownedStorage(identity, async () => {
    const raw = await AsyncStorage.getItem(key);
    return parseCache<T>(raw, tolerateCorrupt);
  });
}
async function write(identity: Identity, key: string, value: unknown) {
  await ownedStorage(identity, async () => {
    allowed(identity);
    await AsyncStorage.setItem(key, JSON.stringify(value));
  });
}
export async function loadLibrary(
  force = false,
  identity = captureIdentity(),
  onDegraded?: () => void,
): Promise<ContentItem[]> {
  allowed(identity);
  const key = libraryKey(identity.userId!);
  const cache = await read<LibraryCache>(identity, key);
  allowed(identity);
  if (
    !force &&
    cache &&
    cache.items.length > 0 &&
    Date.now() - cache.fetchedAt < 12 * 60 * 60 * 1000
  )
    return cache.items;
  try {
    const client = await getIdentitySupabase(identity);
    if (!client) throw new Error("Account connection is unavailable.");
    const { data, error } = await client
      .from("content_items")
      .select("id, type, body, author, categories, tags, priority")
      .eq("active", true)
      .limit(1000);
    if (error) throw error;
    allowed(identity);
    const items = resolveContentLibrary((data as ContentItem[]) ?? [], {
      mockPurchases: config.devMockPurchases,
    });
    if (items.length)
      await write(identity, key, { fetchedAt: Date.now(), items });
    return items;
  } catch (error) {
    allowed(identity);
    if (cache?.items.length) {
      onDegraded?.();
      return cache.items;
    }
    const fallback = resolveContentLibrary([], {
      mockPurchases: config.devMockPurchases,
    });
    if (fallback.length) return fallback;
    throw error;
  }
}
/** Full owned snapshots preserve both selection and original text while offline.
 * A confirmed local day never reselects itself. An offline proposal is reconciled
 * with the server winner on the next explicit load/foreground. */
const dailyFlights = new Map<
  string,
  { promise: Promise<ContentItem[]>; degraded: boolean }
>();
export async function getDailySet(
  userId: string,
  type: ContentType,
  weights: PersonalizationWeights,
  day = getLocalDate(),
  onDegraded?: () => void,
): Promise<ContentItem[]> {
  const identity = captureIdentity();
  allowed(identity);
  if (identity.userId !== userId) throw new Error("Account changed.");
  const flightKey = `${identity.generation}:${userId}:${day}:${type}`;
  const previous = dailyFlights.get(flightKey);
  if (previous) {
    const items = await previous.promise;
    allowed(identity);
    if (previous.degraded) onDegraded?.();
    return items;
  }
  const flight = {
    promise: Promise.resolve([] as ContentItem[]),
    degraded: false,
  };
  flight.promise = resolveDailySet(userId, type, weights, day, () => {
    flight.degraded = true;
  });
  dailyFlights.set(flightKey, flight);
  try {
    const items = await flight.promise;
    allowed(identity);
    if (flight.degraded) onDegraded?.();
    return items;
  } finally {
    if (dailyFlights.get(flightKey) === flight) dailyFlights.delete(flightKey);
  }
}
async function resolveDailySet(
  userId: string,
  type: ContentType,
  weights: PersonalizationWeights,
  day = getLocalDate(),
  onDegraded?: () => void,
): Promise<ContentItem[]> {
  const identity = captureIdentity();
  allowed(identity);
  if (identity.userId !== userId) throw new Error("Account changed.");
  const key = dailyKey(userId, day, type);
  const cache = await read<DailyCache>(identity, key);
  allowed(identity);
  if (cache?.confirmed) return cache.items;
  const library = await loadLibrary(false, identity, onDegraded);
  const byId = new Map(library.map((item) => [item.id, item]));
  for (const item of cache?.items ?? []) byId.set(item.id, item);
  let proposal = cache?.items.length ? cache.items : undefined;
  if (!proposal) {
    const yesterday = new Date(`${day}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const prior = await read<DailyCache>(
      identity,
      dailyKey(userId, getLocalDate(yesterday), type),
    );
    const ids = selectDailySet(
      library,
      type,
      userId,
      day,
      weights,
      prior?.items.map((item) => item.id) ?? [],
    );
    proposal = ids
      .map((id) => byId.get(id))
      .filter((item): item is ContentItem => Boolean(item));
    if (proposal.length)
      await write(identity, key, { items: proposal, confirmed: false });
  }
  if (proposal.length === 0) return [];
  if (proposal.every((item) => isLocalCatalogId(item.id))) {
    await write(identity, key, { items: proposal, confirmed: true });
    return proposal;
  }
  try {
    const client = await getIdentitySupabase(identity);
    if (!client) throw new Error("Account connection is unavailable.");
    const { data, error } = await client.rpc("save_daily_set", {
      p_local_date: day,
      p_type: type,
      p_content_ids: proposal.map((item) => item.id),
    });
    if (error || !data)
      throw error ?? new Error("Daily selection was not acknowledged.");
    allowed(identity);
    let winner = data.map((id) => byId.get(id));
    if (winner.some((item) => !item)) {
      const refreshed = await loadLibrary(true, identity);
      for (const item of refreshed) byId.set(item.id, item);
      for (const item of proposal) byId.set(item.id, item);
      winner = data.map((id) => byId.get(id));
    }
    // A missing server winner is an error, not a smaller silently changing set.
    if (winner.some((item) => !item))
      throw new Error("Some daily content is unavailable. Please retry.");
    const items = winner as ContentItem[];
    await write(identity, key, { items, confirmed: true });
    return items;
  } catch (error) {
    allowed(identity);
    if (proposal.length) {
      onDegraded?.();
      return proposal;
    }
    throw error;
  }
}
export type ContentContext =
  | { source: "current"; kind?: ContentType }
  | { source: "delivery"; owner: string; delivery: string; kind?: ContentType }
  | { source: "daily"; owner: string; day: string; kind: ContentType };
export const isContentUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
};
/** Direct links bypass push parsing, so validate the complete route again. */
export function parseContentContext(
  params: Record<string, unknown>,
): ContentContext | null {
  if (
    Object.keys(params).some(
      (k) => !["id", "source", "kind", "owner", "delivery", "day"].includes(k),
    )
  )
    return null;
  if (params.id !== undefined && !isContentUuid(params.id)) return null;
  const { source, kind, owner, delivery, day } = params;
  if (kind !== undefined && kind !== "quote" && kind !== "affirmation")
    return null;
  if (source === undefined || source === "current") {
    if (owner !== undefined || delivery !== undefined || day !== undefined)
      return null;
    return { source: "current", ...(kind ? { kind } : {}) };
  }
  if (!isContentUuid(owner)) return null;
  if (source === "delivery" && isContentUuid(delivery) && day === undefined)
    return {
      source,
      owner: owner.toLowerCase(),
      delivery: delivery.toLowerCase(),
      ...(kind ? { kind } : {}),
    };
  if (source === "daily" && isDay(day) && kind && delivery === undefined)
    return { source, owner: owner.toLowerCase(), day, kind };
  return null;
}
function snapshotItem(
  value: unknown,
  id: string,
  kind?: ContentType,
): ContentItem | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (
    typeof s.body !== "string" ||
    !s.body.length ||
    s.body.length > 20000 ||
    (s.type !== "quote" && s.type !== "affirmation") ||
    (kind && s.type !== kind) ||
    (s.id !== undefined && s.id !== id) ||
    (s.author !== undefined &&
      s.author !== null &&
      typeof s.author !== "string")
  )
    return null;
  return {
    id,
    type: s.type,
    body: s.body,
    author: typeof s.author === "string" ? s.author : null,
    categories: [],
    tags: [],
    priority: 0,
  };
}
interface DeliverySnapshot {
  id: string;
  user_id: string;
  content_id: string | null;
  content_snapshot: unknown;
}
const deliveryKey = (owner: string) => `fs.delivery.v1.${owner}`;
/** Explicit contexts never substitute another version. Legacy links show current content. */
export async function getContentById(
  id: string,
  context: ContentContext = { source: "current" },
): Promise<ContentItem | null> {
  const identity = captureIdentity();
  allowed(identity);
  if (isContentUuid(id)) id = id.toLowerCase();
  const parsed = parseContentContext(
    context as unknown as Record<string, unknown>,
  );
  if (!parsed) return null;
  if (parsed.source !== "current") {
    if (parsed.owner !== identity.userId || !isContentUuid(id)) return null;
    if (parsed.source === "daily") {
      const cached = await read<DailyCache>(
        identity,
        dailyKey(parsed.owner, parsed.day, parsed.kind),
        true,
      );
      allowed(identity);
      return snapshotItem(
        Array.isArray(cached?.items)
          ? cached.items.find((item) => item?.id === id)
          : null,
        id,
        parsed.kind,
      );
    }
    const key = deliveryKey(parsed.owner);
    const matches = (row: DeliverySnapshot) =>
      row.id === parsed.delivery &&
      row.user_id === parsed.owner &&
      row.content_id === id;
    const cache = await read<DeliverySnapshot[]>(identity, key, true);
    allowed(identity);
    const stored = Array.isArray(cache)
      ? cache.find((row) => row && matches(row))
      : undefined;
    if (stored) {
      const item = snapshotItem(stored.content_snapshot, id, parsed.kind);
      if (item) return item;
    }
    const client = await getIdentitySupabase(identity);
    if (!client) throw new Error("Account connection is unavailable.");
    const { data, error } = await client
      .from("notification_deliveries")
      .select("id,user_id,content_id,content_snapshot")
      .eq("id", parsed.delivery)
      .eq("content_id", id)
      .eq("user_id", parsed.owner)
      .maybeSingle();
    if (error) throw error;
    allowed(identity);
    if (!data || !matches(data)) return null;
    const item = snapshotItem(data.content_snapshot, id, parsed.kind);
    if (!item) return null;
    await ownedStorage(identity, async () => {
      allowed(identity);
      const raw = await AsyncStorage.getItem(key);
      const latest = parseCache<DeliverySnapshot[]>(raw, true);
      const rows = Array.isArray(latest)
        ? latest.filter((row) => row && row.id !== data.id)
        : [];
      // At most 100 verified deliveries per account; old uncached links need a connection.
      await AsyncStorage.setItem(
        key,
        JSON.stringify([...rows.slice(-99), data]),
      );
    });
    allowed(identity);
    return item;
  }
  const library = await loadLibrary(false, identity);
  allowed(identity);
  const hit = library.find(
    (item) => item.id === id && (!parsed.kind || item.type === parsed.kind),
  );
  if (hit) return hit;
  const client = await getIdentitySupabase(identity);
  if (!client) throw new Error("Account connection is unavailable.");
  const { data, error } = await client
    .from("content_items")
    .select("id, type, body, author, categories, tags, priority")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  allowed(identity);
  return data && (!parsed.kind || data.type === parsed.kind)
    ? (data as ContentItem)
    : null;
}
