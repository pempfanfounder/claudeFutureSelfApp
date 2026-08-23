import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { useAppState } from "@/lib/appState";

import { ContentCard } from "@/features/content/ContentCard";
import { useFeedStore } from "@/features/content/feedStore";
import type { ContentItem, ContentType } from "@/features/content/types";
import { STREAK_TARGET } from "@/features/content/types";
import { StreakBanner } from "@/features/streaks/StreakBanner";
import { syncWidgets } from "@/features/widgets/widgetSync";

type FeedRow = { kind: "item"; item: ContentItem } | { kind: "end" };

/**
 * The I Am-inspired core: a chrome-less, full-bleed vertical feed with
 * floating controls. Separate Quotes and Affirmations destinations via
 * the segmented pill; both draw from today's stable 10-item sets.
 */
export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const userId = useAppState((s) => s.userId);
  const [tab, setTab] = useState<ContentType>("quote");
  const feed = useFeedStore();
  const listRef = useRef<FlatList<FeedRow>>(null);

  useEffect(() => {
    if (userId) {
      feed.load(userId).then(() => {
        syncWidgets().catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const items = tab === "quote" ? feed.quotes : feed.affirmations;
  const rows = useMemo<FeedRow[]>(
    () => [
      ...items.map((item) => ({ kind: "item" as const, item })),
      { kind: "end" as const },
    ],
    [items],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!userId) return;
      for (const v of viewableItems) {
        const row = v.item as FeedRow;
        if (v.isViewable && row.kind === "item") {
          feed.markViewed(userId, row.item);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 70 }),
    [],
  );

  const switchTab = (next: ContentType) => {
    if (next === tab) return;
    setTab(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const viewedCount = feed.viewedToday.length;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => (row.kind === "item" ? row.item.id : "end")}
        renderItem={({ item: row }) =>
          row.kind === "item" ? (
            <ContentCard
              item={row.item}
              isFavorite={feed.favoriteIds.includes(row.item.id)}
              onToggleFavorite={() =>
                userId && feed.toggleFavorite(userId, row.item)
              }
            />
          ) : (
            <EndCard
              height={height}
              tab={tab}
              completed={feed.completedToday}
            />
          )
        }
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
      />

      {/* Top chrome */}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.push("/(main)/settings")}
          style={[styles.avatar, { backgroundColor: colors.card }, shadows.md]}
          testID="open-settings"
        >
          <AppText variant="h3">fs</AppText>
        </Pressable>

        <View
          style={[styles.segment, { backgroundColor: colors.card }, shadows.sm]}
        >
          {(["quote", "affirmation"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => switchTab(t)}
              style={[
                styles.segmentBtn,
                tab === t && { backgroundColor: colors.ctaBg },
              ]}
              testID={`tab-${t}`}
            >
              <AppText variant="label" tone={tab === t ? "ctaInk" : "ink2"}>
                {t === "quote" ? "Quotes" : "Affirmations"}
              </AppText>
            </Pressable>
          ))}
        </View>

        <View
          style={[
            styles.streakChip,
            { backgroundColor: colors.card },
            shadows.sm,
          ]}
        >
          <AppText
            variant="label"
            tone={feed.completedToday ? "accent" : "ink2"}
          >
            {feed.completedToday
              ? `✦ ${feed.currentStreak}`
              : `${Math.min(viewedCount, STREAK_TARGET)}/${STREAK_TARGET}`}
          </AppText>
        </View>
      </View>

      {/* Bottom chrome */}
      <View style={[styles.bottom, { bottom: insets.bottom + spacing.lg }]}>
        <Pressable
          onPress={() => router.push("/(main)/favorites")}
          style={[styles.fab, { backgroundColor: colors.card }, shadows.md]}
          testID="open-favorites"
        >
          <AppText variant="h3">♡</AppText>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(main)/themes")}
          style={[styles.fab, { backgroundColor: colors.card }, shadows.md]}
          testID="open-themes"
        >
          <AppText variant="h3">◐</AppText>
        </Pressable>
      </View>

      {feed.celebrating ? (
        <StreakBanner
          streak={feed.currentStreak}
          onDismiss={feed.dismissCelebration}
        />
      ) : null}
    </View>
  );
}

function EndCard({
  height,
  tab,
  completed,
}: {
  height: number;
  tab: ContentType;
  completed: boolean;
}) {
  return (
    <View style={[styles.endCard, { height }]}>
      <AppText variant="h2" center>
        {"That's your ten for today."}
      </AppText>
      <AppText variant="lead" tone="ink2" center style={styles.endSub}>
        {completed
          ? "Streak's safe. Come back tomorrow — same rhythm, new words."
          : tab === "quote"
            ? "Read three in total and today counts. Your affirmations are waiting too."
            : "Read three in total and today counts. Your quotes are waiting too."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // Matches the bottom fab size so all three chrome buttons read equal.
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segment: {
    flexDirection: "row",
    borderRadius: radii.pill,
    padding: 3,
  },
  segmentBtn: {
    paddingVertical: 7,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  streakChip: {
    minWidth: 44,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  bottom: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  endCard: {
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  endSub: { marginTop: spacing.lg },
});
