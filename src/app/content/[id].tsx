import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, Icon, Screen } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";

import { ContentCard } from "@/features/content/ContentCard";
import { useFeedStore } from "@/features/content/feedStore";
import { getContentById } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

/**
 * Deep-link target for notifications and widgets:
 * futureself://content/{id}. Falls back to the delivery snapshot when
 * the item was edited or deactivated after sending.
 */
export default function ContentDeepLink() {
  const colors = useColors();
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const userId = useAppState((s) => s.userId);
  const { isPremium, onboardingComplete } = useAppState();
  const feed = useFeedStore();
  const [item, setItem] = useState<ContentItem | null>(null);
  const [missing, setMissing] = useState(false);
  // ContentCard is sized by its host, not the window (see feed.tsx).
  const [cardH, setCardH] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    analytics.capture("deep_link_opened", {
      content_id: id,
      kind: kind ?? "unknown",
    });
    getContentById(id).then((found) => {
      if (found) {
        setItem(found);
        if (userId) feed.markViewed(userId, found);
      } else {
        setMissing(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Deep links respect the same gates as everything else.
  useEffect(() => {
    if (!onboardingComplete || !isPremium) router.replace("/");
  }, [onboardingComplete, isPremium]);

  return (
    <Screen padded={false}>
      <View style={styles.close}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          hitSlop={12}
        >
          <Icon name="close" size={22} color={colors.ink3} />
        </Pressable>
      </View>
      {item ? (
        <View
          style={styles.cardHost}
          onLayout={(e) => setCardH(Math.round(e.nativeEvent.layout.height))}
        >
          {cardH != null ? (
            <ContentCard
              item={item}
              height={cardH}
              isFavorite={feed.favoriteIds.includes(item.id)}
              onToggleFavorite={() =>
                userId && feed.toggleFavorite(userId, item)
              }
            />
          ) : null}
        </View>
      ) : missing ? (
        <View style={styles.missing}>
          <AppText variant="h3" center>
            That one has moved on.
          </AppText>
          <AppText variant="body" tone="ink2" center style={styles.missingSub}>
            {
              "The line you tapped is no longer in the library. Today's words are waiting instead."
            }
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHost: { flex: 1 },
  close: {
    position: "absolute",
    top: 64,
    left: spacing.xl,
    zIndex: 10,
  },
  missing: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  missingSub: { marginTop: spacing.md },
});
