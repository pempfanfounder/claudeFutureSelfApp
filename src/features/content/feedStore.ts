import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { analytics } from "@/lib/analytics";
import { ownedStorage } from "@/lib/accountStorage";
import {
  assertCurrentIdentity,
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  type Identity,
} from "@/lib/appState";
import { monitoring } from "@/lib/monitoring";
import { getIdentitySupabase } from "@/lib/supabase";
import { getLocalDate } from "./dailySet";
import { getDailySet } from "./repository";
import type { ContentItem, PersonalizationWeights } from "./types";
import { STREAK_TARGET } from "./types";

const EMPTY_WEIGHTS: PersonalizationWeights = {
  quoteInterests: [],
  affirmationInterests: [],
  primaryGoals: [],
  obstacles: [],
  futureTraits: [],
};
type Pending =
  | { kind: "favorite"; id: string; value: boolean; revision: number }
  | { kind: "view"; id: string; day: string; revision: number };
interface Saved {
  // Expired, unsynced history stays local and never uses active retry capacity.
  localOnlyViews?: Extract<Pending, { kind: "view" }>[];
  favoriteRevision?: number;
  progressRevision?: number;
  personalization?: {
    weights: PersonalizationWeights;
    lifeGoal: string | null;
    pinnedAffirmation: string | null;
  };
  day: string;
  favorites: string[];
  viewed: string[];
  pending: Pending[];
  currentStreak: number;
  longestStreak: number;
}
const savedKey = (id: string) => `fs.feed.state.v2.${id}`;
const emptySaved = (day: string): Saved => ({
  day,
  favorites: [],
  viewed: [],
  pending: [],
  currentStreak: 0,
  longestStreak: 0,
});
// Calendar days, independent of the 23/25-hour DST transition.
function dayDistance(value: string, today: string) {
  return (
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
    86400000
  );
}
const pendingMessage =
  "Saved on this device. Some changes are pending; tap Retry.";
const offlineMessage = "Saved on this device. Sync is pending; tap Retry.";
async function readSaved(id: string, day: string): Promise<Saved> {
  const raw = await AsyncStorage.getItem(savedKey(id));
  if (!raw) return emptySaved(day);
  const value = JSON.parse(raw) as Saved;
  if (
    !Array.isArray(value.pending) ||
    !Array.isArray(value.favorites) ||
    !Array.isArray(value.viewed)
  )
    throw new Error("Saved progress needs recovery.");
  const expired = value.pending.filter(
    (p): p is Extract<Pending, { kind: "view" }> =>
      p.kind === "view" && dayDistance(p.day, day) < -1,
  );
  return {
    ...value,
    day,
    viewed: value.day === day ? value.viewed : [],
    pending: value.pending.filter(
      (p) => !expired.includes(p as Extract<Pending, { kind: "view" }>),
    ),
    localOnlyViews: [...(value.localOnlyViews ?? []), ...expired],
  };
}
async function updateSaved(
  identity: Identity,
  day: string,
  update: (value: Saved) => Saved,
): Promise<Saved> {
  return ownedStorage(identity, async () => {
    if (day !== getLocalDate())
      throw new Error("Local date changed. Reload your daily feed.");
    const next = update(await readSaved(identity.userId!, day));
    await AsyncStorage.setItem(
      savedKey(identity.userId!),
      JSON.stringify(next),
    );
    return next;
  });
}
function current(identity: Identity, day: string) {
  return (
    isCurrentIdentity(identity) &&
    getLocalDate() === day &&
    useAppState.getState().isPremium
  );
}
function owner(userId: string) {
  const identity = captureIdentity();
  if (identity.userId !== userId || !useAppState.getState().isPremium)
    throw new Error("Reopen your account to continue.");
  return identity;
}
function project(value: Saved) {
  return {
    favoriteIds: value.favorites,
    viewedToday: value.viewed,
    pendingCount: value.pending.length,
    localOnlyCount: value.localOnlyViews?.length ?? 0,
    currentStreak: value.currentStreak,
    longestStreak: value.longestStreak,
  };
}
interface FeedState {
  ownerGeneration: number | null;
  contentDay: string | null;
  contentVersion: number;
  loading: boolean;
  error: string | null;
  pendingCount: number;
  localOnlyCount: number;
  day: string | null;
  quotes: ContentItem[];
  affirmations: ContentItem[];
  weights: PersonalizationWeights;
  lifeGoal: string | null;
  pinnedAffirmation: string | null;
  viewedToday: string[];
  completedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  favoriteIds: string[];
  celebrating: boolean;
  load: (userId: string) => Promise<void>;
  retryPending: (userId: string) => Promise<void>;
  markViewed: (userId: string, item: ContentItem) => Promise<void>;
  toggleFavorite: (userId: string, item: ContentItem) => Promise<void>;
  dismissCelebration: () => void;
}
const initial = {
  ownerGeneration: null,
  contentDay: null,
  contentVersion: 0,
  loading: true,
  error: null,
  pendingCount: 0,
  localOnlyCount: 0,
  day: null,
  quotes: [],
  affirmations: [],
  weights: EMPTY_WEIGHTS,
  lifeGoal: null,
  pinnedAffirmation: null,
  viewedToday: [],
  completedToday: false,
  currentStreak: 0,
  longestStreak: 0,
  favoriteIds: [],
  celebrating: false,
};
let loadSequence = 0;
let revision = 0;
const flushes = new Map<
  number,
  { promise: Promise<void>; followup: boolean }
>();
async function flush(identity: Identity, requestedDay: string): Promise<void> {
  const existing = flushes.get(identity.generation);
  if (existing) {
    existing.followup = true;
    await existing.promise;
    return;
  }
  const entry = { promise: Promise.resolve(), followup: false };
  const run = (async () => {
    const attempted = new Set<number>();
    try {
      // Persist terminal reconciliation even while offline, before any request.
      const reconciled = await updateSaved(
        identity,
        getLocalDate(),
        (value) => value,
      );
      if (current(identity, reconciled.day))
        useFeedStore.setState(project(reconciled));
      const client = await getIdentitySupabase(identity);
      if (!client) throw new Error("Account connection is unavailable.");
      for (let pass = 0; pass < 2; pass++) {
        entry.followup = false;
        const day = pass === 0 ? requestedDay : getLocalDate();
        for (let n = 0; n < 40 && current(identity, day); n++) {
          let selected: Pending | undefined;
          await updateSaved(identity, day, (value) => {
            selected = value.pending.find(
              (p) =>
                !attempted.has(p.revision) &&
                (p.kind !== "view" || Math.abs(dayDistance(p.day, day)) <= 1),
            );
            if (!selected) return value;
            // Persist the next retry position before sending. Failed intent
            // stays intact at the tail so bounded retries (including after
            // relaunch) reach independent work without raising request limits.
            return {
              ...value,
              pending: [
                ...value.pending.filter((p) => p !== selected),
                selected,
              ],
            };
          });
          const op = selected;
          if (!op) break;
          attempted.add(op.revision);
          try {
            let progress:
              | {
                  completed_today: boolean;
                  current_streak: number;
                  longest_streak: number;
                }
              | undefined;
            if (op.kind === "view") {
              const { data, error } = await client.rpc("record_view", {
                p_content_id: op.id,
                p_local_date: op.day,
              });
              if (error) throw error;
              const row = Array.isArray(data) ? data[0] : data;
              if (
                !row ||
                typeof row.completed_today !== "boolean" ||
                !Number.isInteger(row.current_streak) ||
                !Number.isInteger(row.longest_streak)
              )
                throw new Error("View acknowledgement is incomplete.");
              progress = row;
            } else {
              const result = op.value
                ? await client
                    .from("favorites")
                    .upsert(
                      { user_id: identity.userId!, content_id: op.id },
                      { ignoreDuplicates: true },
                    )
                : await client
                    .from("favorites")
                    .delete()
                    .match({ user_id: identity.userId!, content_id: op.id });
              if (result.error) throw result.error;
            }
            assertCurrentIdentity(identity);
            const next = await updateSaved(
              identity,
              getLocalDate(),
              (value) => ({
                ...value,
                pending: value.pending.filter(
                  (p) => p.revision !== op.revision,
                ),
                localOnlyViews: (value.localOnlyViews ?? []).filter(
                  (p) => p.revision !== op.revision,
                ),
                // A SELECT issued before this acknowledgement can still
                // contain the old saved state after its pending overlay ends.
                favoriteRevision:
                  op.kind === "favorite"
                    ? (value.favoriteRevision ?? 0) + 1
                    : value.favoriteRevision,
                progressRevision:
                  (value.progressRevision ?? 0) + (progress ? 1 : 0),
                currentStreak: progress?.current_streak ?? value.currentStreak,
                longestStreak: progress?.longest_streak ?? value.longestStreak,
              }),
            );
            if (current(identity, day)) {
              const wasCompleted = useFeedStore.getState().completedToday;
              const completedToday =
                op.kind === "view" && op.day === day
                  ? (progress?.completed_today ?? wasCompleted)
                  : wasCompleted;
              useFeedStore.setState({
                ...project(next),
                completedToday,
                celebrating: !wasCompleted && completedToday,
              });
            }
          } catch (error) {
            assertCurrentIdentity(identity);
            // Retain the exact operation for recovery, but do not let one
            // rejected content item block independent favorites or views.
            monitoring.captureError(error, { area: "feed.sync" });
          }
        }
        if (!entry.followup) break;
      }
      const day = getLocalDate();
      const left = await ownedStorage(identity, () =>
        readSaved(identity.userId!, day),
      );
      if (current(identity, day))
        useFeedStore.setState({
          ...project(left),
          error: left.pending.length
            ? pendingMessage
            : [pendingMessage, offlineMessage].includes(
                  useFeedStore.getState().error ?? "",
                )
              ? null
              : useFeedStore.getState().error,
        });
    } catch {
      if (isCurrentIdentity(identity))
        useFeedStore.setState({
          error:
            useFeedStore.getState().pendingCount > 0
              ? offlineMessage
              : [pendingMessage, offlineMessage].includes(
                    useFeedStore.getState().error ?? "",
                  )
                ? null
                : useFeedStore.getState().error,
        });
    }
  })();
  entry.promise = run;
  flushes.set(identity.generation, entry);
  try {
    await run;
  } finally {
    if (flushes.get(identity.generation) === entry)
      flushes.delete(identity.generation);
  }
}
export const useFeedStore = create<FeedState>((set, get) => ({
  ...initial,
  load: async (userId) => {
    const identity = owner(userId),
      day = getLocalDate(),
      request = ++loadSequence;
    const accepted = () => current(identity, day) && request === loadSequence;
    set({ loading: true, error: null });
    try {
      const local = await updateSaved(identity, day, (value) => value);
      if (!accepted()) return;
      set({
        ...project(local),
        day,
        completedToday: local.viewed.length >= STREAK_TARGET,
      });
      let weights = local.personalization?.weights ?? EMPTY_WEIGHTS,
        lifeGoal: string | null = local.personalization?.lifeGoal ?? null,
        pinnedAffirmation: string | null =
          local.personalization?.pinnedAffirmation ?? null;
      let fetchError: unknown = null;
      try {
        const client = await getIdentitySupabase(identity);
        if (!client) throw new Error("Account connection is unavailable.");
        const [p, favorites, streak, progress] = await Promise.all([
          client
            .from("personalization")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          client
            .from("favorites")
            .select("content_id")
            .eq("user_id", userId)
            .limit(500),
          client
            .from("streaks")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          client
            .from("daily_progress")
            .select("content_id")
            .eq("user_id", userId)
            .eq("local_date", day),
        ]);
        for (const result of [p, favorites, streak, progress])
          if (result.error) throw result.error;
        if (!accepted()) return;
        if (p.data) {
          const row = p.data;
          weights = {
            quoteInterests: row.quote_interests ?? [],
            affirmationInterests: row.affirmation_interests ?? [],
            primaryGoals: row.primary_goals ?? [],
            obstacles: row.obstacles ?? [],
            futureTraits: row.future_traits ?? [],
          };
          lifeGoal = row.life_goal;
          const raw = row.raw_answers as Record<string, unknown>;
          pinnedAffirmation =
            typeof raw?.pinned_affirmation === "string"
              ? raw.pinned_affirmation
              : null;
        }
        const next = await updateSaved(identity, day, (value) => {
          const ids = new Set((favorites.data ?? []).map((f) => f.content_id));
          for (const op of value.pending)
            if (op.kind === "favorite") {
              if (op.value) ids.add(op.id);
              else ids.delete(op.id);
            }
          return {
            ...value,
            personalization: { weights, lifeGoal, pinnedAffirmation },
            favorites:
              value.favoriteRevision !== local.favoriteRevision
                ? value.favorites
                : [...ids],
            viewed: [
              ...new Set([
                ...value.viewed,
                ...(progress.data ?? []).map((p) => p.content_id),
              ]),
            ],
            currentStreak:
              value.progressRevision !== local.progressRevision
                ? value.currentStreak
                : (streak.data?.current_streak ?? value.currentStreak),
            longestStreak:
              value.progressRevision !== local.progressRevision
                ? value.longestStreak
                : (streak.data?.longest_streak ?? value.longestStreak),
          };
        });
        if (!accepted()) return;
        set({
          ...project(next),
          completedToday: next.viewed.length >= STREAK_TARGET,
        });
      } catch (error) {
        fetchError = error;
      }
      if (!accepted()) return;
      const [quotes, affirmations] = await Promise.all([
        getDailySet(userId, "quote", weights, day, () => {
          fetchError = true;
        }),
        getDailySet(userId, "affirmation", weights, day, () => {
          fetchError = true;
        }),
      ]);
      if (!accepted()) return;
      set({
        quotes,
        affirmations,
        weights,
        lifeGoal,
        pinnedAffirmation,
        ownerGeneration: identity.generation,
        contentDay: day,
        contentVersion: request,
        loading: false,
        error: fetchError
          ? "Showing saved content. Could not refresh; tap Retry."
          : null,
      });
      await flush(identity, day);
    } catch (error) {
      if (accepted()) {
        monitoring.captureError(error, { area: "feed.load" });
        set({
          loading: false,
          error: "Could not load your daily content. Tap Retry.",
        });
      }
    }
  },
  retryPending: async (userId) => {
    const identity = owner(userId);
    await flush(identity, getLocalDate());
  },
  markViewed: async (userId, item) => {
    const identity = owner(userId),
      day = getLocalDate();
    try {
      const next = await updateSaved(identity, day, (value) => {
        if (value.viewed.includes(item.id)) return value;
        if (value.pending.length >= 500)
          throw new Error("Pending changes are full. Sync before continuing.");
        return {
          ...value,
          viewed: [...value.viewed, item.id],
          pending: [
            ...value.pending,
            {
              kind: "view",
              id: item.id,
              day,
              revision: Date.now() * 1000 + (++revision % 1000),
            },
          ],
        };
      });
      if (current(identity, day)) set(project(next));
      await flush(identity, day);
    } catch {
      if (current(identity, day))
        set({ error: "Could not save this view. Tap Retry." });
    }
  },
  toggleFavorite: async (userId, item) => {
    const identity = owner(userId),
      day = getLocalDate();
    try {
      const next = await updateSaved(identity, day, (value) => {
        const desired = !value.favorites.includes(item.id);
        const pending = value.pending.filter(
          (p) => p.kind !== "favorite" || p.id !== item.id,
        );
        if (pending.length >= 500)
          throw new Error("Pending changes are full. Sync before continuing.");
        return {
          ...value,
          favoriteRevision: (value.favoriteRevision ?? 0) + 1,
          favorites: desired
            ? [...value.favorites, item.id]
            : value.favorites.filter((id) => id !== item.id),
          pending: [
            ...pending,
            {
              kind: "favorite",
              id: item.id,
              value: desired,
              revision: Date.now() * 1000 + (++revision % 1000),
            },
          ],
        };
      });
      if (current(identity, day)) {
        set(project(next));
        analytics.capture(
          next.favorites.includes(item.id)
            ? "favorite_added"
            : "favorite_removed",
          { content_id: item.id, content_type: item.type },
        );
      }
      await flush(identity, day);
    } catch {
      if (current(identity, day))
        set({ error: "Could not save this favorite. Please try again." });
    }
  },
  dismissCelebration: () => set({ celebrating: false }),
}));
export function resetFeed() {
  ++loadSequence;
  useFeedStore.setState(initial);
}
