import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

import type { ContentItem } from "./types";

interface ContentCardProps {
  item: ContentItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

/**
 * One full-screen card, I Am style: the whole screen is the card —
 * centered serif text, share + heart beneath, double-tap heart burst.
 */
export function ContentCard({
  item,
  isFavorite,
  onToggleFavorite,
}: ContentCardProps) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const burstScale = useSharedValue(0);
  const burstOpacity = useSharedValue(0);
  const lastTap = useRef(0);
  const [textSize] = useState(() =>
    item.body.length > 180
      ? type.sizes.h3
      : item.body.length > 90
        ? type.sizes.h2
        : type.sizes.h1,
  );

  const burst = useCallback(() => {
    burstScale.set(0.4);
    burstOpacity.set(0.9);
    burstScale.set(
      withTiming(1.6, { duration: 620, easing: Easing.out(Easing.quad) }),
    );
    burstOpacity.set(
      withSequence(
        withTiming(0.9, { duration: 120 }),
        withTiming(0, { duration: 480 }, (finished) => {
          if (finished) runOnJS(noop)();
        }),
      ),
    );
  }, [burstScale, burstOpacity]);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (!isFavorite) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        burst();
        onToggleFavorite();
      }
    } else {
      lastTap.current = now;
    }
  };

  const share = async () => {
    analytics.capture("content_shared", {
      content_id: item.id,
      content_type: item.type,
    });
    const suffix = item.author ? ` — ${item.author}` : "";
    await Share.share({
      message: `${item.body}${suffix}\n\nvia Future Self`,
    }).catch(() => {});
  };

  const burstStyle = useAnimatedStyle(() => ({
    transform: [{ scale: burstScale.get() }],
    opacity: burstOpacity.get(),
  }));

  return (
    <Pressable onPress={handleTap} style={[styles.card, { height }]}>
      <View style={styles.center}>
        <AppText
          variant="quote"
          center
          style={{ fontSize: textSize, lineHeight: textSize * 1.32 }}
        >
          {item.body}
        </AppText>
        {item.author ? (
          <AppText variant="label" tone="ink2" center style={styles.author}>
            — {item.author}
          </AppText>
        ) : null}

        <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
          <AppText style={styles.burstHeart}>♥</AppText>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={share} hitSlop={12} testID={`share-${item.id}`}>
          <AppText variant="h3" tone="ink2">
            ↗
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!isFavorite) burst();
            Haptics.selectionAsync().catch(() => {});
            onToggleFavorite();
          }}
          hitSlop={12}
          testID={`favorite-${item.id}`}
        >
          <AppText
            variant="h3"
            style={{ color: isFavorite ? colors.accent : colors.ink2 }}
          >
            {isFavorite ? "♥" : "♡"}
          </AppText>
        </Pressable>
      </View>
    </Pressable>
  );
}

function noop() {}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
  },
  center: { justifyContent: "center" },
  author: { marginTop: spacing.lg },
  burst: {
    position: "absolute",
    alignSelf: "center",
  },
  burstHeart: { fontSize: 96 },
  actions: {
    position: "absolute",
    bottom: 140,
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xxxl,
  },
});
