import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { useCallback, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { captureRef } from "react-native-view-shot";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";

import { QuoteShareCard, quoteFontSize } from "./QuoteShareCard";
import type { ContentItem } from "./types";

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
  const burstScale = useSharedValue(0);
  const burstOpacity = useSharedValue(0);
  const lastTap = useRef(0);
  const shareCardRef = useRef<View>(null);
  const sharingRef = useRef(false);
  const [renderShareCard, setRenderShareCard] = useState(false);
  const [textSize] = useState(() => quoteFontSize(item.body));

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

  const shareAsText = useCallback(async () => {
    const suffix = item.author ? ` — ${item.author}` : "";
    await Share.share({
      message: `${item.body}${suffix}\n\nvia Future Self`,
    }).catch(() => {});
  }, [item]);

  const share = () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    analytics.capture("content_shared", {
      content_id: item.id,
      content_type: item.type,
      share_format: "card",
    });
    // Mount the off-screen card; capture happens once it has laid out.
    setRenderShareCard(true);
  };

  const captureAndShare = useCallback(async () => {
    try {
      // Give the freshly mounted card one frame to paint before capture.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        width: 1080,
        height: 1350,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        await shareAsText();
      }
    } catch {
      await shareAsText();
    } finally {
      setRenderShareCard(false);
      sharingRef.current = false;
    }
  }, [shareAsText]);

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
          <Icon name="heartFill" size={96} color={colors.accent} />
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={share}
          hitSlop={12}
          style={styles.actionBtn}
          testID={`share-${item.id}`}
        >
          <Icon name="share" size={32} color={colors.ink2} />
        </Pressable>
        <Pressable
          onPress={() => {
            if (!isFavorite) burst();
            Haptics.selectionAsync().catch(() => {});
            onToggleFavorite();
          }}
          hitSlop={12}
          style={styles.actionBtn}
          testID={`favorite-${item.id}`}
        >
          <Icon
            name={isFavorite ? "heartFill" : "heart"}
            size={32}
            color={isFavorite ? colors.accent : colors.ink2}
          />
        </Pressable>
      </View>

      {renderShareCard ? (
        <View style={styles.shareCardHost} pointerEvents="none">
          <QuoteShareCard
            ref={shareCardRef}
            item={item}
            onReady={captureAndShare}
          />
        </View>
      ) : null}
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
  actions: {
    position: "absolute",
    bottom: 128,
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.xxxl,
  },
  actionBtn: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  shareCardHost: {
    position: "absolute",
    top: 0,
    left: -9999,
  },
});
