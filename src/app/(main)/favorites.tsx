import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { AppText, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import { useAppState } from "@/lib/appState";

import { useFeedStore } from "@/features/content/feedStore";
import { loadLibrary } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

/** Saved quotes & affirmations. Tap a row to open it full-screen. */
export default function FavoritesScreen() {
  const colors = useColors();
  const userId = useAppState((s) => s.userId);
  const { favoriteIds, toggleFavorite } = useFeedStore();
  const [items, setItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    loadLibrary().then((library) => {
      setItems(library.filter((i) => favoriteIds.includes(i.id)));
    });
  }, [favoriteIds]);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <AppText variant="h3" tone="ink3">
            ✕
          </AppText>
        </Pressable>
        <AppText variant="h3">Saved words</AppText>
        <View style={styles.spacer} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="h3" center tone="ink2">
            Nothing saved yet
          </AppText>
          <AppText variant="body" center tone="ink3" style={styles.emptySub}>
            Double-tap any card — or tap the heart — and it lives here.
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
              onPress={() => router.push(`/content/${item.id}`)}
              style={[styles.card, { backgroundColor: colors.card }, shadows.sm]}
            >
              <AppText variant="lead">{item.body}</AppText>
              <View style={styles.cardFooter}>
                <AppText variant="label" tone="ink3">
                  {item.author ? `— ${item.author}` : item.type === "quote" ? "Quote" : "Affirmation"}
                </AppText>
                <Pressable
                  onPress={() => userId && toggleFavorite(userId, item)}
                  hitSlop={10}
                  testID={`unfavorite-${item.id}`}
                >
                  <AppText variant="lead" tone="accent">
                    ♥
                  </AppText>
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
