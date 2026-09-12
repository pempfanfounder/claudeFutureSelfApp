import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { AppText, Icon, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";

import { useFeedStore } from "@/features/content/feedStore";
import { loadLibrary } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

export interface FavoritesScreenProps {
  /** True when rendered inside the home-screen morph overlay. */
  embedded?: boolean;
  /** Header close; defaults to `router.back()` on the pushed route. */
  onClose?: () => void;
  onNavigate?: (href: string) => void;
}

/**
 * Saved quotes & affirmations. Tap a row to open it full-screen. Works both
 * as the `/favorites` route and embedded in the heart-button morph.
 */
export default function FavoritesScreen({
  onClose,
  onNavigate,
}: FavoritesScreenProps) {
  const colors = useColors();
  const userId = useAppState((s) => s.userId);
  const { favoriteIds, toggleFavorite } = useFeedStore();
  const focused = useIsFocused();
  const navigating = useRef(false);
  useEffect(() => {
    if (focused) navigating.current = false;
  }, [focused]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    let alive = true;
    const identity = captureIdentity();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
    setLoading(true);
    setFailure(false);
    void loadLibrary()
      .then((library) => {
        if (alive && isCurrentIdentity(identity)) {
          setItems(library.filter((item) => favoriteIds.includes(item.id)));
          if (favoriteIds.some((id) => !library.some((item) => item.id === id)))
            setFailure(true);
        }
      })
      .catch(() => {
        if (alive) setFailure(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [favoriteIds, retry]);
  const openItem = (id: string) => {
    if (!focused || navigating.current) return;
    navigating.current = true;
    if (onNavigate) onNavigate(`/content/${id}`);
    else router.push(`/content/${id}`);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={onClose ?? (() => router.back())}
          hitSlop={12}
          accessibilityLabel="Close"
          testID="favorites-close"
        >
          <Icon name="close" size={22} color={colors.ink3} />
        </Pressable>
        <AppText variant="h3">Saved Quotes</AppText>
        <View style={styles.spacer} />
      </View>

      {loading || failure ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRetry((v) => v + 1)}
          style={{ padding: 16 }}
        >
          <AppText accessibilityRole="alert">
            {loading
              ? "Loading saved messages…"
              : "Some saved messages could not be loaded. Tap Retry."}
          </AppText>
        </Pressable>
      ) : null}
      {items.length === 0 && !loading && !failure ? (
        <View style={styles.empty}>
          <AppText variant="h3" center tone="ink2">
            Nothing saved yet
          </AppText>
          <AppText variant="body" center tone="ink3" style={styles.emptySub}>
            Double-tap any card, or tap the heart, and it lives here.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openItem(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open saved message: ${item.body}`}
              style={[
                styles.card,
                { backgroundColor: colors.card },
                shadows.sm,
              ]}
            >
              <AppText variant="lead">{item.body}</AppText>
              <View style={styles.cardFooter}>
                <AppText variant="label" tone="ink3">
                  {item.author
                    ? `— ${item.author}`
                    : item.type === "quote"
                      ? "Quote"
                      : "Affirmation"}
                </AppText>
                <Pressable
                  onPress={() => userId && toggleFavorite(userId, item)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Remove saved message"
                  accessibilityState={{ selected: true }}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  testID={`unfavorite-${item.id}`}
                >
                  <Icon name="heartFill" size={18} color={colors.accent} />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  spacer: { width: 24 },
  empty: { flex: 1, justifyContent: "center", paddingBottom: 120 },
  emptySub: { marginTop: spacing.sm },
  list: { paddingBottom: spacing.xxxl, gap: spacing.md },
  card: {
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
});
