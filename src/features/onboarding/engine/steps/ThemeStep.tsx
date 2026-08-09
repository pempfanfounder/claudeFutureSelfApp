import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useTheme } from "@/design-system/ThemeProvider";
import { THEMES } from "@/design-system/themes";
import { radii, spacing, type } from "@/design-system/tokens";

import { resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";

interface ThemeStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onDone: () => void;
  previewText?: string;
}

/** I Am-style theme picker: grid of live previews, applies immediately. */
export function ThemeStep({
  step,
  ctx,
  onDone,
  previewText = "I will not waste today.",
}: ThemeStepProps) {
  const { theme, setThemeId } = useTheme();
  const [selected, setSelected] = useState(theme.id);

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
          {THEMES.map((t) => {
            const active = selected === t.id;
            return (
              <Pressable
                key={t.id}
                testID={`theme-${t.id}`}
                onPress={() => {
                  setSelected(t.id);
                  setThemeId(t.id);
                }}
                style={[
                  styles.tile,
                  {
                    backgroundColor: t.bg,
                    borderColor: active ? t.ink : "transparent",
                  },
                ]}
              >
                <AppText
                  variant="body"
                  style={{ color: t.ink, fontFamily: type.serif, fontSize: 15 }}
                >
                  {previewText}
                </AppText>
                <AppText
                  variant="label"
                  style={[styles.tileName, { color: t.ink }]}
                >
                  {t.name}
                </AppText>
              </Pressable>
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
          label={step.cta ?? "Continue"}
          onPress={onDone}
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
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  tile: {
    width: "47%",
    aspectRatio: 0.78,
    borderRadius: radii.lg,
    borderWidth: 2,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  tileName: { opacity: 0.7 },
  footer: { paddingBottom: spacing.sm },
  trialCaption: { marginBottom: spacing.sm },
});
