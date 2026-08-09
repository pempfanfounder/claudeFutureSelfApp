import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { analytics } from "@/lib/analytics";
import { monitoring } from "@/lib/monitoring";
import { getSupabase } from "@/lib/supabase";

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

interface FeedState {
  loading: boolean;
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
  /** Set true for the few seconds the streak banner celebrates. */
  celebrating: boolean;
  load: (userId: string) => Promise<void>;
  markViewed: (userId: string, item: ContentItem) => Promise<void>;
  toggleFavorite: (userId: string, item: ContentItem) => Promise<void>;
  dismissCelebration: () => void;
}

const viewedKey = (userId: string) => `fs.viewed.${userId}.${getLocalDate()}`;

export const useFeedStore = create<FeedState>((set, get) => ({
  loading: true,
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

  load: async (userId) => {
    set({ loading: true });
    const supabase = getSupabase();
    let weights = EMPTY_WEIGHTS;
    let lifeGoal: string | null = null;
    let pinnedAffirmation: string | null = null;

    try {
      if (supabase) {
        const [
          { data: p },
          { data: favorites },
          { data: streak },
          { data: progress },
        ] = await Promise.all([
          supabase
            .from("personalization")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("favorites")
            .select("content_id")
            .eq("user_id", userId)
            .limit(500),
          supabase
            .from("streaks")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("daily_progress")
            .select("content_id")
            .eq("user_id", userId)
            .eq("local_date", getLocalDate()),
        ]);

        if (p) {
          weights = {
            quoteInterests: p.quote_interests ?? [],
            affirmationInterests: p.affirmation_interests ?? [],
            primaryGoals: p.primary_goals ?? [],
            obstacles: p.obstacles ?? [],
            futureTraits: p.future_traits ?? [],
          };
          lifeGoal = p.life_goal ?? null;
          const raw = (p.raw_answers ?? {}) as Record<string, unknown>;
          pinnedAffirmation =
            typeof raw["pinned_affirmation"] === "string"
              ? (raw["pinned_affirmation"] as string)
              : null;
        }

        const viewed = (progress ?? []).map((r) => r.content_id);
        set({
          favoriteIds: (favorites ?? []).map((f) => f.content_id),
          currentStreak: streak?.current_streak ?? 0,
          longestStreak: streak?.longest_streak ?? 0,
          completedToday: viewed.length >= STREAK_TARGET,
          viewedToday: viewed,
        });
      } else {
        const local = await AsyncStorage.getItem(viewedKey(userId));
        set({ viewedToday: local ? (JSON.parse(local) as string[]) : [] });
      }

      const [quotes, affirmations] = await Promise.all([
        getDailySet(userId, "quote", weights),
        getDailySet(userId, "affirmation", weights),
      ]);
      set({
        quotes,
        affirmations,
        weights,
        lifeGoal,
        pinnedAffirmation,
        loading: false,
      });
    } catch (error) {
      monitoring.captureError(error, { area: "feed.load" });
      set({ loading: false });
    }
  },

  markViewed: async (userId, item) => {
    const state = get();
    if (state.viewedToday.includes(item.id)) return;
    const viewedToday = [...state.viewedToday, item.id];
    set({ viewedToday });
    AsyncStorage.setItem(viewedKey(userId), JSON.stringify(viewedToday)).catch(
      () => {},
    );
    analytics.capture("content_viewed", {
      content_id: item.id,
      content_type: item.type,
      viewed_count: viewedToday.length,
    });

    const supabase = getSupabase();
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc("record_view", {
        p_content_id: item.id,
        p_local_date: getLocalDate(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const wasCompleted = get().completedToday;
        set({
          completedToday: row.completed_today,
          currentStreak: row.current_streak,
          longestStreak: row.longest_streak,
          celebrating: !wasCompleted && row.completed_today,
        });
        if (!wasCompleted && row.completed_today) {
          analytics.capture("streak_completed", { streak: row.current_streak });
        }
      }
    } catch (error) {
      monitoring.captureError(error, { area: "feed.markViewed" });
    }
  },

  toggleFavorite: async (userId, item) => {
    const { favoriteIds } = get();
    const isFavorite = favoriteIds.includes(item.id);
    set({
      favoriteIds: isFavorite
        ? favoriteIds.filter((id) => id !== item.id)
        : [...favoriteIds, item.id],
    });
    analytics.capture(isFavorite ? "favorite_removed" : "favorite_added", {
      content_id: item.id,
      content_type: item.type,
    });
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      if (isFavorite) {
        await supabase
          .from("favorites")
          .delete()
          .match({ user_id: userId, content_id: item.id });
      } else {
        await supabase
          .from("favorites")
          .upsert(
            { user_id: userId, content_id: item.id },
            { ignoreDuplicates: true },
          );
      }
    } catch (error) {
      monitoring.captureError(error, { area: "feed.toggleFavorite" });
    }
  },

  dismissCelebration: () => set({ celebrating: false }),
}));
