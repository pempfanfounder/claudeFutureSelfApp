import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import Animated, {
  cancelAnimation,
  withSpring,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import {
  CONTROLLED_SPRING,
  MOTION,
  useMotionPreference,
} from "@/design-system/motion";
import { spacing, type } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_PIXEL_RATIO,
  SHARE_CARD_WIDTH,
  ShareCard,
} from "./ShareCard";
import { shareContentImage } from "./shareImage";
import type { ContentItem } from "./types";

/** Feed / deep-link card actions. Larger than 24pt chrome icons. */
export const CARD_ACTION_ICON_SIZE = 32;
/** Liked heart — a true red, not the dusty theme accent. */
export const FAVORITE_RED = "#FF3B30";

interface ContentCardProps {
  item: ContentItem;
  /**
   * Page height, measured from the feed list's own layout. Paging snaps
   * by the list's height, so cards must be exactly that tall — never
   * the window height, which drifts apart from it by any chrome/insets.
   */
  height: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

/**
 * One full-screen card, I Am style: the whole screen is the card —
 * centered serif text, share + heart beneath, double-tap heart burst.
 */
export function ContentCard({
  item,
  height,
  isFavorite,
  onToggleFavorite,
}: ContentCardProps) {
  const colors = useColors();
  const reduced = useMotionPreference();
  const iconScale = useSharedValue(1);
  const iconOpacity = useSharedValue(1);
  const lastTap = useRef(0);
  const shareRef = useRef<View>(null);
  const textSize =
    item.body.length > 180
      ? type.sizes.h3
      : item.body.length > 90
        ? type.sizes.h2
        : type.sizes.h1;
  useEffect(() => {
    cancelAnimation(iconScale);
    cancelAnimation(iconOpacity);
    iconScale.set(1);
    iconOpacity.set(1);
  }, [reduced, iconScale, iconOpacity]);
  const burst = useCallback(() => {
    cancelAnimation(iconScale);
    cancelAnimation(iconOpacity);
    if (reduced) {
      iconScale.set(1);
      iconOpacity.set(0.65);
      iconOpacity.set(withTiming(1, { duration: MOTION.reducedFade }));
    } else {
      iconScale.set(MOTION.favoriteScale);
      iconScale.set(withSpring(1, CONTROLLED_SPRING));
    }
  }, [reduced, iconScale, iconOpacity]);

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
    await shareContentImage({
      item,
      capture: () =>
        captureRef(shareRef, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: SHARE_CARD_WIDTH * SHARE_CARD_PIXEL_RATIO,
          height: SHARE_CARD_HEIGHT * SHARE_CARD_PIXEL_RATIO,
        }),
    });
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : iconScale.get() }],
    opacity: iconOpacity.get(),
  }));

  return (
    <Pressable onPress={handleTap} style={[styles.card, { height }]}>
      <View
        ref={shareRef}
        collapsable={false}
        pointerEvents="none"
        style={styles.shareShot}
      >
        <ShareCard item={item} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.center, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this message"
          style={styles.actionBtn}
          onPress={share}
          hitSlop={12}
          testID={`share-${item.id}`}
        >
          <Icon
            name="share"
            size={CARD_ACTION_ICON_SIZE}
            color={colors.ink2}
            weight="semibold"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? "Remove saved message" : "Save message"
          }
          accessibilityState={{ selected: isFavorite }}
          style={styles.actionBtn}
          onPress={() => {
            burst();
            Haptics.selectionAsync().catch(() => {});
            onToggleFavorite();
          }}
          hitSlop={12}
          testID={`favorite-${item.id}`}
        >
          <Animated.View style={iconStyle}>
            <Icon
              name={isFavorite ? "heartFill" : "heart"}
              size={CARD_ACTION_ICON_SIZE}
              color={isFavorite ? FAVORITE_RED : colors.ink2}
              weight="semibold"
            />
          </Animated.View>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 100,
    paddingBottom: 220,
    justifyContent: "center",
  },
  shareShot: {
    position: "absolute",
    left: -SHARE_CARD_WIDTH - 8,
    top: 0,
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
  },
  center: { justifyContent: "center" },
  author: { marginTop: spacing.lg },
  burst: {
    position: "absolute",
    alignSelf: "center",
  },
  actions: {
    position: "absolute",
    bottom: 140,
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xxxl,
  },
  actionBtn: {
    minWidth: 56,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
