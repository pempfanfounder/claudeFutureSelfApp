import { StyleSheet, View } from "react-native";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing, type } from "@/design-system/tokens";

import type { ContentItem } from "./types";

export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;
export const SHARE_CARD_PIXEL_RATIO = 3;

/**
 * Square-ish 4:5 quote card painted in the active app theme. Hidden in
 * the feed and captured as a PNG when the user taps Share.
 */
export function ShareCard({ item }: { item: ContentItem }) {
  const colors = useColors();
  const textSize =
    item.body.length > 180
      ? type.sizes.h3
      : item.body.length > 90
        ? type.sizes.h2
        : type.sizes.h1;
  return (
    <View
      testID="share-card"
      collapsable={false}
      style={[styles.card, { backgroundColor: colors.bg }]}
    >
      <View style={styles.body}>
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
      <AppText variant="eyebrow" tone="ink3" center style={styles.mark}>
        Future Self
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    paddingBottom: 56,
    justifyContent: "center",
  },
  body: { flex: 1, justifyContent: "center" },
  author: { marginTop: spacing.lg },
  mark: { letterSpacing: 2 },
});
