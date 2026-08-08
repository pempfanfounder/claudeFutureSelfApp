import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

import { loadLibrary } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

import { useOnboardingStore } from "../store";
import type { OnboardingContext, OnboardingStep } from "../types";

interface ResultStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onDone: () => void;
}

const LABELS: Record<string, string> = {
  discipline: "discipline",
  ambition: "ambition",
  courage: "courage",
  "stoic-calm": "stoic calm",
  gratitude: "gratitude",
  resilience: "resilience",
  focus: "focus",
  kindness: "kindness",
  "self-belief": "self-belief",
  calm: "calm",
  "health-body": "health",
  abundance: "abundance",
  "letting-go": "letting go",
  "morning-energy": "morning energy",
  boundaries: "boundaries",
  "self-respect": "self-respect",
  confidence: "confidence",
  body: "your body",
  career: "your career",
  money: "financial security",
  peace: "peace of mind",
  relationships: "your relationships",
  purpose: "purpose",
};

const label = (slug: string) => LABELS[slug] ?? slug;

/**
 * The honest "your mix is ready" screen: everything shown is composed
 * from answers the app actually uses, plus a real preview item drawn
 * from the top-weighted category.
 */
export function ResultStep({ step, ctx, onDone }: ResultStepProps) {
  const colors = useColors();
  const { answers, notificationPrefs } = useOnboardingStore();
  const [preview, setPreview] = useState<ContentItem | null>(null);

  const goals = (answers["primary_goals"] as string[] | undefined) ?? [];
  const quoteInterests = (answers["quote_interests"] as string[] | undefined) ?? [];
  const affirmationInterests = (answers["affirmation_interests"] as string[] | undefined) ?? [];
  const traits = (answers["future_traits"] as string[] | undefined) ?? [];
  const lifeGoal = answers["life_goal"] as string | undefined;
  const motivation = answers["motivation_level"] as string | undefined;

  useEffect(() => {
    let cancelled = false;
    loadLibrary().then((items) => {
      if (cancelled) return;
      const targetCategories = quoteInterests.length > 0 ? quoteInterests : ["discipline"];
      const match =
        items.find(
          (i) => i.type === "quote" && i.categories.some((c) => targetCategories.includes(c)),
        ) ?? items.find((i) => i.type === "quote");
      setPreview(match ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mirror =
    motivation === "everything" || motivation === "all-in"
      ? "Your ambition is exactly what Future Self's daily words are built around."
      : motivation === "stuck" || motivation === "unsure" || motivation === "figuring-out"
        ? "Starting unsure is still starting — your mix begins gently and builds."
        : "Your mix is tuned to help you stay consistent, not just inspired.";

  const quoteLine =
    quoteInterests.length > 0
      ? `Quotes weighted toward ${quoteInterests.slice(0, 2).map(label).join(" and ")}.`
      : goals.length > 0
        ? `Quotes weighted toward ${goals.slice(0, 2).map(label).join(" and ")}.`
        : "A balanced mix of quotes to start — it sharpens as you save favorites.";

  const affirmationLine =
    affirmationInterests.length > 0
      ? `Affirmations centered on ${affirmationInterests.slice(0, 2).map(label).join(" and ")}.`
      : "Affirmations that build steadiness, day by day.";

  const cadenceLine = `${notificationPrefs.quotesPerDay} quotes and ${notificationPrefs.affirmationsPerDay} affirmations a day, spread across your window.`;

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="h2">
          {ctx.name ? `Your daily mix is ready, ${ctx.name}.` : "Your daily mix is ready."}
        </AppText>
        <AppText variant="lead" tone="ink2" style={styles.mirror}>
          {mirror}
        </AppText>

        <View style={[styles.card, { backgroundColor: colors.card }, shadows.sm]}>
          <Row text={quoteLine} />
          <Row text={affirmationLine} />
          <Row text={cadenceLine} />
          {traits.length > 0 ? (
            <Row text={`Aimed at the ${traits.slice(0, 3).map(label).join(", ")} version of you.`} />
          ) : null}
          {lifeGoal ? <Row text={`Your line: “${lifeGoal}”`} /> : null}
        </View>

        {preview ? (
          <Animated.View
            entering={FadeIn.duration(400).delay(250)}
            style={[styles.preview, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}
          >
            <AppText variant="quote" center>
              {preview.body}
            </AppText>
            {preview.author ? (
              <AppText variant="label" tone="ink2" center style={styles.author}>
                — {preview.author}
              </AppText>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={step.cta ?? "Sounds right"} onPress={onDone} testID="continue" />
      </View>
    </Animated.View>
  );
}

function Row({ text }: { text: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" tone="accent">
        ✦
      </AppText>
      <AppText variant="body" style={styles.rowText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 72, paddingBottom: spacing.xl },
  mirror: { marginTop: spacing.md },
  card: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  rowText: { flex: 1 },
  preview: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  author: { marginTop: spacing.md },
  footer: { paddingBottom: spacing.sm },
});
