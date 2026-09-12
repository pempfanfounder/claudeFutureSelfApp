import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import {
  APP_ICON_IDS,
  APP_ICON_SOURCES,
  applyAppIcon,
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
/** Rapid taps across tiles collapse into one icon change. */
export const APPLY_DEBOUNCE_MS = 400;

/**
 * I Am-style app-icon picker (screen 33): 4-column grid of icon tiles,
 * first tile pre-selected, ring on the selection, Continue below.
 *
 * The icon is applied on tap (debounced, last tap wins) so the change is
 * visible right away; Continue flushes any pending apply and records the
 * choice, and onboarding completion re-applies as a no-op safety net.
 * When the change fails, a small hint says so instead of staying silent.
 */
export function AppIconStep({ step, ctx, onAnswer }: AppIconStepProps) {
  const colors = useColors();
  const { theme } = useTheme();
  const [selected, setSelected] = useState(() =>
    APP_ICON_IDS.includes(theme.id) ? theme.id : DEFAULT_APP_ICON_ID,
  );
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(selected);

  /**
   * Applies the most recent selection once, serialising behind any apply
   * still in flight so two native icon changes never overlap.
   */
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const run = async () => {
      const target = latest.current;
      if (applied.current === target) return;
      const ok = await applyAppIcon(target);
      applied.current = ok ? target : null;
      setFailed(!ok);
      // A newer tap landed while this one was in flight.
      if (latest.current !== target) await run();
    };
    if (inFlight.current) return;
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
  }, []);

  const select = (id: string) => {
    latest.current = id;
    setSelected(id);
    setFailed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, APPLY_DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
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
                  onPress={() => select(id)}
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

        {failed ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <AppText
              variant="label"
              tone="ink3"
              center
              style={styles.hint}
              testID="app-icon-failed"
            >
              {"Couldn't change the icon. You can try again from Themes later."}
            </AppText>
          </Animated.View>
        ) : null}
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
          onPress={() => {
            // Don't let a pending debounce die with the step: apply now.
            flush();
            onAnswer(selected);
          }}
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
  hint: { marginTop: spacing.lg },
  footer: { paddingBottom: spacing.sm },
  trialCaption: { marginBottom: spacing.sm },
});
