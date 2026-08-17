import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";

import {
  APP_ICON_IDS,
  APP_ICON_SOURCES,
  DEFAULT_APP_ICON_ID,
} from "@/design-system/appIcons";
import { AppText, Button } from "@/design-system/components";
import { useColors, useTheme } from "@/design-system/ThemeProvider";
import { themeById } from "@/design-system/themes";
import { spacing } from "@/design-system/tokens";

import { resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";

interface AppIconStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  /** Receives the chosen icon id when the user taps Continue. */
  onAnswer: (value: string) => void;
}

const TILE_SIZE = 64;
const TILE_RADIUS = 16;
const RING_WIDTH = 2;
const RING_GAP = 2;

/**
 * I Am-style app-icon picker (screen 33): 4-column grid of icon tiles,
 * first tile pre-selected, ring on the selection, Continue below.
 *
 * Only *records* the choice — iOS shows a system alert whenever the icon
 * changes, so the icon is applied once, at onboarding completion.
 */
export function AppIconStep({ step, ctx, onAnswer }: AppIconStepProps) {
  const colors = useColors();
  const { theme } = useTheme();
  const [selected, setSelected] = useState(() =>
    APP_ICON_IDS.includes(theme.id) ? theme.id : DEFAULT_APP_ICON_ID,
  );

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="h2">{resolveText(step.headline, ctx)}</AppText>
        <AppText variant="lead" tone="ink2" style={styles.sub}>
          {resolveText(step.sub, ctx)}
        </AppText>

        <View style={styles.grid}>
          {APP_ICON_IDS.map((id) => {
            const active = selected === id;
            return (
              <View key={id} style={styles.cell}>
                <Pressable
                  testID={`app-icon-${id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={themeById(id)?.name ?? id}
                  onPress={() => setSelected(id)}
                  style={[
                    styles.ring,
                    { borderColor: active ? colors.ink : "transparent" },
                  ]}
                >
                  <Image
                    source={APP_ICON_SOURCES[id]}
                    style={styles.tile}
                    resizeMode="cover"
                  />
                </Pressable>
                <AppText
                  variant="label"
                  tone={active ? "ink" : "ink3"}
                  center
                  numberOfLines={2}
                  style={styles.tileName}
                >
                  {themeById(id)?.name ?? id}
                </AppText>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {step.trialCaption ? (
          <AppText
            variant="label"
            tone="ink2"
            center
            style={styles.trialCaption}
          >
            Try everything free
          </AppText>
        ) : null}
        <Button
          label={resolveText(step.cta, ctx) ?? "Continue"}
          onPress={() => onAnswer(selected)}
          testID="continue"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 72, paddingBottom: spacing.xl },
  sub: { marginTop: spacing.md },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.lg,
    marginTop: spacing.xl,
  },
  cell: { width: "25%", alignItems: "center" },
  ring: {
    borderWidth: RING_WIDTH,
    padding: RING_GAP,
    borderRadius: TILE_RADIUS + RING_GAP + RING_WIDTH,
  },
  tile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: TILE_RADIUS },
  tileName: { marginTop: spacing.sm, fontSize: 11, lineHeight: 14 },
  footer: { paddingBottom: spacing.sm },
  trialCaption: { marginBottom: spacing.sm },
});
