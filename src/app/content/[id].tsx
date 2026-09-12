import { SecondaryMotion } from "@/features/nav/SecondaryMotion";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, Screen } from "@/design-system/components";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import {
  captureIdentity,
  isCurrentIdentity,
  useAppState,
} from "@/lib/appState";

import { BackButton } from "@/design-system/components/BackButton";
import { ContentCard } from "@/features/content/ContentCard";
import { useFeedStore } from "@/features/content/feedStore";
import {
  getContentById,
  parseContentContext,
} from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

/**
 * Deep-link target for notifications and widgets:
 * Explicit delivery/daily links preserve their owned snapshot. Unversioned
 * legacy links resolve current content; absent snapshots never substitute text.
 */
export default function ContentDeepLink() {
  const params = useLocalSearchParams();
  const requestKey = JSON.stringify(params);
  const { id } = params;
  const userId = useAppState((s) => s.userId);
  const { isPremium, onboardingComplete, identityGeneration } = useAppState();
  const feed = useFeedStore();
  const [loaded, setLoaded] = useState<{
    item: ContentItem;
    request: string;
    generation: number;
  } | null>(null);
  const item =
    loaded?.request === requestKey &&
    loaded.generation === identityGeneration &&
    isPremium
      ? loaded.item
      : null;
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const [missing, setMissing] = useState(false);
  // ContentCard is sized by its host, not the window (see feed.tsx).
  const [cardH, setCardH] = useState<number | null>(null);

  useEffect(() => {
    if (!onboardingComplete || !isPremium) return;
    const identity = captureIdentity();
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
    setLoaded(null);
    setMissing(false);
    setFailure(false);
    const parsed = parseContentContext(JSON.parse(requestKey));
    if (!parsed || typeof id !== "string") {
      setMissing(true);
      return;
    }
    analytics.capture("deep_link_opened", { kind: parsed.kind ?? "unknown" });
    void getContentById(id, parsed)
      .then((found) => {
        if (!alive || !isCurrentIdentity(identity)) return;
        if (found) {
          setLoaded({
            item: found,
            request: requestKey,
            generation: identity.generation,
          });
          if (userId) void useFeedStore.getState().markViewed(userId, found);
        } else setMissing(true);
      })
      .catch(() => {
        if (alive && isCurrentIdentity(identity)) setFailure(true);
      });
    return () => {
      alive = false;
    };
  }, [
    id,
    requestKey,
    userId,
    identityGeneration,
    isPremium,
    onboardingComplete,
    retry,
  ]);

  // Deep links respect the same gates as everything else.
  useEffect(() => {
    if (!onboardingComplete || !isPremium) router.replace("/");
  }, [onboardingComplete, isPremium]);

  return (
    <SecondaryMotion>
      <Screen padded={false}>
        <View style={styles.close}>
          <BackButton />
        </View>
        {item ? (
          <View
            style={styles.cardHost}
            onLayout={(e) => {
              // Exact float height, epsilon-deduped (see feed.tsx pageH).
              const h = e.nativeEvent.layout.height;
              setCardH((prev) =>
                prev !== null && Math.abs(prev - h) < 0.5 ? prev : h,
              );
            }}
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
            <AppText
              variant="body"
              tone="ink2"
              center
              style={styles.missingSub}
            >
              {
                "This version of the message is unavailable on this device. Your daily words are waiting in the feed."
              }
            </AppText>
          </View>
        ) : (
          <View style={styles.missing}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetry((v) => v + 1)}
            >
              <AppText accessibilityRole="alert" center>
                {failure
                  ? "Could not load this message. Tap Retry."
                  : "Loading message…"}
              </AppText>
            </Pressable>
          </View>
        )}
      </Screen>
    </SecondaryMotion>
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
