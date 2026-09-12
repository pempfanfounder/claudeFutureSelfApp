import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useMotionPreference } from "@/design-system/motion";
import { getLocalDate } from "@/features/content/dailySet";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

import { ContentCard } from "@/features/content/ContentCard";
import { useFeedStore } from "@/features/content/feedStore";
import type { ContentItem, ContentType } from "@/features/content/types";
import { STREAK_TARGET } from "@/features/content/types";
import {
  MorphProvider,
  useMorph,
  type MorphScreen,
} from "@/features/nav/MorphOverlay";
import {
  MORPH_SCREENS,
  preloadMorphScreens,
} from "@/features/nav/morphScreens";
import { StreakBanner } from "@/features/streaks/StreakBanner";
import { syncWidgets } from "@/features/widgets/widgetSync";

export type FeedRow = { kind: "item"; item: ContentItem } | { kind: "end" };

/**
 * Instant page change only. Animated `scrollTo` on this nested Fabric
 * pager crashes iOS 26 (`UIAnimator` / `CFRunLoopWakeUp`). Swipe still
 * uses native paging.
 */
export function programmaticPagerScroll(
  pageWidth: number,
  tab: ContentType,
) {
  return {
    x: tab === "quote" ? 0 : pageWidth,
    y: 0,
    animated: false as const,
  };
}

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
 * Home route. Hosts the container-morph overlay so the three floating
 * launchers (avatar → Profile, heart → Saved Quotes, palette → Themes)
 * expand out of their buttons instead of pushing a route.
 */
export default function FeedScreen() {
  return (
    <MorphProvider screens={MORPH_SCREENS}>
      <FeedContent />
    </MorphProvider>
  );
}

/**
 * The I Am-inspired core: a chrome-less, full-bleed vertical feed with
 * floating controls. Separate Quotes and Affirmations destinations via
 * the segmented pill; both draw from today's stable daily sets.
 */
function FeedContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const userId = useAppState((s) => s.userId);
  const reduced = useMotionPreference();
  const indicator = useSharedValue(0);
  const quoteX = useSharedValue(0);
  const quoteW = useSharedValue(0);
  const affirmationX = useSharedValue(0);
  const affirmationW = useSharedValue(0);
  const offsets = useRef({ quote: 0, affirmation: 0 });
  const tabRef = useRef<ContentType>("quote");
  const indicatorStyle = useAnimatedStyle(() => {
    const t = indicator.get();
    return {
      width: quoteW.get() + (affirmationW.get() - quoteW.get()) * t,
      transform: [
        {
          translateX:
            quoteX.get() + (affirmationX.get() - quoteX.get()) * t,
        },
      ],
    };
  });
  useEffect(() => {
    cancelAnimation(indicator);
    indicator.set(tabRef.current === "quote" ? 0 : 1);
  }, [reduced, indicator]);
  const [tab, setTab] = useState<ContentType>("quote");
  const [pageH, setPageH] = useState<number | null>(null);
  const [pageW, setPageW] = useState(0);
  const feed = useFeedStore();
  const pagerRef = useRef<ScrollView>(null);
  const quoteListRef = useRef<FlatList<FeedRow>>(null);
  const affirmationListRef = useRef<FlatList<FeedRow>>(null);
  const morph = useMorph();
  const avatarRef = useRef<View>(null);
  const heartRef = useRef<View>(null);
  const paletteRef = useRef<View>(null);

  // Capture the launcher's on-screen rect so the destination can grow out
  // of exactly that button.
  const launch = useCallback(
    (ref: RefObject<View | null>, screen: MorphScreen, radius: number) => {
      ref.current?.measureInWindow((x, y, width, height) => {
        morph.open(
          {
            x,
            y,
            width,
            height,
            radius,
            restoreFocus: () => {
              const target = findNodeHandle(ref.current);
              if (target) AccessibilityInfo.setAccessibilityFocus(target);
            },
          },
          screen,
        );
      });
    },
    [morph],
  );

  // Warm the morph destinations once the feed has settled.
  useEffect(() => {
    const t = setTimeout(preloadMorphScreens, 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const identity = captureIdentity();
    let alive = true;
    let running = false;
    let requested = false;
    let day = getLocalDate();
    const refresh = async () => {
      requested = true;
      if (running || !alive || !isCurrentIdentity(identity)) return;
      running = true;
      try {
        for (
          let pass = 0;
          requested && pass < 2 && alive && isCurrentIdentity(identity);
          pass++
        ) {
          requested = false;
          await useFeedStore.getState().load(userId);
          if (alive && isCurrentIdentity(identity) && !requested)
            await syncWidgets(identity);
        }
      } catch {
      } finally {
        running = false;
      }
    };

    void refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        day = getLocalDate();
        void refresh();
      }
    });
    const timer = setInterval(() => {
      const next = getLocalDate();
      if (next !== day || requested) {
        day = next;
        void refresh();
      }
    }, 30000);
    return () => {
      alive = false;
      sub.remove();
      clearInterval(timer);
    };
  }, [userId]);

  const quoteRows = useMemo<FeedRow[]>(
    () => [
      ...feed.quotes.map((item) => ({ kind: "item" as const, item })),
      { kind: "end" as const },
    ],
    [feed.quotes],
  );
  const affirmationRows = useMemo<FeedRow[]>(
    () => [
      ...feed.affirmations.map((item) => ({ kind: "item" as const, item })),
      { kind: "end" as const },
    ],
    [feed.affirmations],
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
    tabRef.current = next;
    setTab(next);
    pagerRef.current?.scrollTo(programmaticPagerScroll(pageW, next));
    indicator.set(next === "quote" ? 0 : 1);
  };

  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageW <= 0) return;
    indicator.set(e.nativeEvent.contentOffset.x / pageW);
  };

  const onPagerSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageW <= 0) return;
    const next: ContentType =
      Math.round(e.nativeEvent.contentOffset.x / pageW) === 0
        ? "quote"
        : "affirmation";
    tabRef.current = next;
    setTab(next);
  };

  const viewedCount = feed.viewedToday.length;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setPageW((prev) =>
            prev !== 0 && Math.abs(prev - width) < 0.5 ? prev : width,
          );
          setPageH((prev) =>
            prev !== null && Math.abs(prev - height) < 0.5 ? prev : height,
          );
        }}
      >
        {pageW > 0 ? (
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onPagerScroll}
            onMomentumScrollEnd={onPagerSettled}
            scrollEventThrottle={16}
            testID="feed-pager"
          >
            <View style={{ width: pageW }}>
              <FeedColumn
                listRef={quoteListRef}
                rows={quoteRows}
                kind="quote"
                active={tab === "quote"}
                pageH={pageH}
                userId={userId}
                feed={feed}
                offsets={offsets}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
              />
            </View>
            <View style={{ width: pageW }}>
              <FeedColumn
                listRef={affirmationListRef}
                rows={affirmationRows}
                kind="affirmation"
                active={tab === "affirmation"}
                pageH={pageH}
                userId={userId}
                feed={feed}
                offsets={offsets}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
              />
            </View>
          </ScrollView>
        ) : null}
      </View>
      {feed.loading || feed.error || feed.pendingCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry daily content and pending changes"
          onPress={() => {
            if (userId)
              void feed
                .load(userId)
                .then(() => syncWidgets())
                .catch(() => {});
          }}
          style={{
            position: "absolute",
            top: insets.top + 70,
            left: 24,
            right: 24,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.card,
          }}
        >
          <AppText accessibilityRole="alert" center variant="label">
            {feed.loading
              ? "Loading your daily words…"
              : (feed.error ??
                `${feed.pendingCount} changes waiting to sync. Tap Retry.`)}
          </AppText>
          {feed.localOnlyCount > 0 ? (
            <AppText center variant="label">
              {feed.localOnlyCount} older views are kept only on this device.
              They could not be synced to your account.
            </AppText>
          ) : null}
        </Pressable>
      ) : null}

      {!feed.loading &&
      !feed.error &&
      feed.pendingCount === 0 &&
      feed.localOnlyCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: insets.top + 70,
            left: 24,
            right: 24,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.card,
          }}
        >
          <AppText center variant="label">
            {feed.localOnlyCount} older views are kept only on this device. They
            could not be synced to your account.
          </AppText>
        </View>
      ) : null}

      {/* Top chrome */}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <Pressable
          ref={avatarRef}
          onPress={() =>
            launch(avatarRef, "profile", styles.avatar.borderRadius)
          }
          style={[styles.avatar, { backgroundColor: colors.card }, shadows.sm]}
          testID="open-settings"
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <AppText variant="label">fs</AppText>
        </Pressable>

        <View
          style={[styles.segment, { backgroundColor: colors.card }, shadows.sm]}
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 4,
                bottom: 4,
                left: 0,
                borderRadius: radii.pill,
                backgroundColor: colors.ctaBg,
              },
              indicatorStyle,
            ]}
          />
          {(["quote", "affirmation"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => switchTab(t)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                if (t === "quote") {
                  quoteX.set(x);
                  quoteW.set(width);
                } else {
                  affirmationX.set(x);
                  affirmationW.set(width);
                }
              }}
              style={styles.segmentBtn}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={t === "quote" ? "Quotes" : "Affirmations"}
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
          ref={heartRef}
          onPress={() => launch(heartRef, "favorites", styles.fab.borderRadius)}
          style={[styles.fab, { backgroundColor: colors.card }, shadows.md]}
          testID="open-favorites"
          accessibilityLabel="Saved Quotes"
        >
          <Icon name="heart" size={24} color={colors.ink} />
        </Pressable>
        <Pressable
          ref={paletteRef}
          onPress={() => launch(paletteRef, "themes", styles.fab.borderRadius)}
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

export function FeedColumn({
  listRef,
  rows,
  kind,
  active,
  pageH,
  userId,
  feed,
  offsets,
  onViewableItemsChanged,
  viewabilityConfig,
}: {
  listRef: RefObject<FlatList<FeedRow> | null>;
  rows: FeedRow[];
  kind: ContentType;
  active: boolean;
  pageH: number | null;
  userId: string | null;
  feed: ReturnType<typeof useFeedStore.getState>;
  offsets: { current: { quote: number; affirmation: number } };
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
}) {
  const items = kind === "quote" ? feed.quotes : feed.affirmations;
  const activeRef = useRef(active);
  activeRef.current = active;
  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      if (!activeRef.current) return;
      onViewableItemsChanged(info);
    },
    [onViewableItemsChanged],
  );
  return (
    <FlatList
      onScroll={(e) => {
        offsets.current[kind] = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={32}
      ref={listRef}
      data={pageH == null ? UNMEASURED_ROWS : rows}
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
            tab={kind}
            completed={feed.completedToday}
            empty={items.length === 0}
            loading={feed.loading}
            failed={Boolean(feed.error)}
            pending={feed.pendingCount > 0}
          />
        )
      }
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      accessibilityLabel={
        kind === "quote" ? "Daily quotes" : "Daily affirmations"
      }
      getItemLayout={(_, index) => pageLayout(pageH ?? 0, index)}
    />
  );
}

export function EndCard({
  height,
  tab,
  completed,
  empty = false,
  loading = false,
  failed = false,
  pending = false,
}: {
  height: number;
  tab: ContentType;
  completed: boolean;
  empty?: boolean;
  loading?: boolean;
  failed?: boolean;
  pending?: boolean;
}) {
  return (
    <View style={[styles.endCard, { height }]}>
      <AppText variant="h2" center>
        {loading && empty
          ? "Loading your daily words…"
          : empty
            ? "Your daily words aren’t available yet."
            : "That's the whole set for today."}
      </AppText>
      <AppText variant="lead" tone="ink2" center style={styles.endSub}>
        {empty
          ? failed
            ? "Tap Retry to reconnect and load your set."
            : "Tap Retry to check for your daily set."
          : pending
            ? "Your progress is saved on this device and waiting to sync."
            : completed
              ? "Streak's safe. Come back tomorrow: same rhythm, new words."
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
    alignItems: "center",
    borderRadius: radii.pill,
    padding: 4,
  },
  segmentBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.xl,
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
