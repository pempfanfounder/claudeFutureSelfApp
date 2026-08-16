import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Icon } from "@/design-system/components";
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
 * `pagingEnabled` snaps by the FlatList's OWN layout height, so pages
 * must be sized from that same measurement — not the window height.
 * Any difference (status banners, insets, future chrome) would
 * otherwise accumulate: page i lands `i × (windowH − listH)` too low.
 */
export function pageLayout(pageHeight: number, index: number) {
  return { length: pageHeight, offset: pageHeight * index, index };
}

const UNMEASURED_ROWS: FeedRow[] = [];

/**
 * The I Am-inspired core: a chrome-less, full-bleed vertical feed with
 * floating controls. Separate Quotes and Affirmations destinations via
 * the segmented pill; both draw from today's stable daily sets.
 */
export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const userId = useAppState((s) => s.userId);
  const [tab, setTab] = useState<ContentType>("quote");
  // Measured list height drives page size; null until the first layout
  // pass so no mis-sized pages ever flash.
  const [pageH, setPageH] = useState<number | null>(null);
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
        // Render pages only once the list is measured; renderItem and
        // getItemLayout therefore never run with a null pageH.
        data={pageH == null ? UNMEASURED_ROWS : rows}
        onLayout={(e) => {
          // Keep the exact float: pagingEnabled snaps by the true bounds,
          // and rounding the per-page length accumulates ~0.5dp of drift
          // per page on fractional-density screens. Epsilon-dedupe only
          // to avoid re-render loops from layout jitter.
          const h = e.nativeEvent.layout.height;
          setPageH((prev) =>
            prev !== null && Math.abs(prev - h) < 0.5 ? prev : h,
          );
        }}
        keyExtractor={(row) => (row.kind === "item" ? row.item.id : "end")}
        renderItem={({ item: row }) =>
          row.kind === "item" ? (
            <ContentCard
              item={row.item}
              height={pageH ?? 0}
              isFavorite={feed.favoriteIds.includes(row.item.id)}
              onToggleFavorite={() =>
                userId && feed.toggleFavorite(userId, row.item)
              }
            />
          ) : (
            <EndCard
              height={pageH ?? 0}
              tab={tab}
              completed={feed.completedToday}
            />
          )
        }
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => pageLayout(pageH ?? 0, index)}
      />

      {/* Top chrome */}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.push("/(main)/settings")}
          style={[styles.avatar, { backgroundColor: colors.card }, shadows.sm]}
          testID="open-settings"
        >
          <AppText variant="label">fs</AppText>
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
          {feed.completedToday ? (
            <View style={styles.streakRow}>
              <Icon name="sparkle" size={12} color={colors.accent} />
              <AppText variant="label" tone="accent">
                {feed.currentStreak}
              </AppText>
            </View>
          ) : (
            <AppText variant="label" tone="ink2">
              {`${Math.min(viewedCount, STREAK_TARGET)}/${STREAK_TARGET}`}
            </AppText>
          )}
        </View>
      </View>

      {/* Bottom chrome */}
      <View style={[styles.bottom, { bottom: insets.bottom + spacing.lg }]}>
        <Pressable
          onPress={() => router.push("/(main)/favorites")}
          style={[styles.fab, { backgroundColor: colors.card }, shadows.md]}
          testID="open-favorites"
          accessibilityLabel="Saved Quotes"
        >
          <Icon name="heart" size={24} color={colors.ink} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(main)/themes")}
          style={[styles.fab, { backgroundColor: colors.card }, shadows.md]}
          testID="open-themes"
          accessibilityLabel="Themes"
        >
          <Icon name="palette" size={24} color={colors.ink} />
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
        {"That's the whole set for today."}
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  streakRow: { flexDirection: "row", alignItems: "center", gap: 4 },
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
