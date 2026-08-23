import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing, type } from "@/design-system/tokens";

import type { ContentItem } from "./types";

/** Logical card size; captured at 3x for a 1080×1350 (4:5) share image. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;

/** Same length→size ramp as the in-feed card so both read identically. */
export function quoteFontSize(body: string): number {
  return body.length > 180
    ? type.sizes.h3
    : body.length > 90
      ? type.sizes.h2
      : type.sizes.h1;
}

interface QuoteShareCardProps {
  item: ContentItem;
  onReady: () => void;
}

/**
 * The card rendered off-screen and captured as the share image: the
 * user's active theme, the app's serif voice, and a quiet wordmark.
 */
export const QuoteShareCard = forwardRef<View, QuoteShareCardProps>(
  function QuoteShareCard({ item, onReady }, ref) {
    const colors = useColors();
    const textSize = quoteFontSize(item.body);

    return (
      <View
        ref={ref}
        collapsable={false}
        onLayout={onReady}
        style={[styles.card, { backgroundColor: colors.bg }]}
        testID={`share-card-${item.id}`}
      >
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
        </View>

        <View style={styles.footer}>
          <View style={[styles.mark, { backgroundColor: colors.card }]}>
            <AppText variant="label">fs</AppText>
          </View>
          <AppText variant="label" tone="ink2">
            Future Self
          </AppText>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
  },
  center: { justifyContent: "center" },
  author: { marginTop: spacing.lg },
  footer: {
    position: "absolute",
    bottom: spacing.xl,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
