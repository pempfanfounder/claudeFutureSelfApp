import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

import { loadLibrary } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";

import { resolveText } from "../resolve";
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
 * Practice-mode slugs (iam-claude `practice-mode` step) → lowercase
 * phrases for "You'll practice by …". "unsure" is deliberately absent:
 * it is not a practice, so it is never echoed.
 */
const PRACTICE_LABELS: Record<string, string> = {
  phone: "reading them on your phone",
  widget: "seeing them on your Home Screen",
  aloud: "saying them out loud",
  journal: "writing them in a journal",
  "post-it": "writing them on a post-it",
};

/** "a" · "a and b" · "a, b and c" */
function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const stringAnswer = (
  answers: Record<string, string | string[]>,
  key: string,
): string | undefined => {
  const v = answers[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
};

const arrayAnswer = (
  answers: Record<string, string | string[]>,
  key: string,
): string[] => {
  const v = answers[key];
  return Array.isArray(v) ? v : [];
};

/**
 * The honest "your daily quotes and affirmations are ready" screen:
 * everything shown is composed from answers the app actually uses (or
 * commitments the user made in the funnel, echoed back verbatim), plus
 * a real preview item drawn from the top-weighted category.
 */
export function ResultStep({ step, ctx, onDone }: ResultStepProps) {
  const colors = useColors();
  const { answers, notificationPrefs, variant } = useOnboardingStore();
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const isFounder = variant === "iam-founder";

  const goals = arrayAnswer(answers, "primary_goals");
  const quoteInterests = arrayAnswer(answers, "quote_interests");
  const affirmationInterests = arrayAnswer(answers, "affirmation_interests");
  const traits = arrayAnswer(answers, "future_traits");
  const lifeGoal = stringAnswer(answers, "life_goal");
  const motivation = stringAnswer(answers, "motivation_level");
  // iam-claude commitments (raw.* keys are stored under their full key).
  const streakGoal = stringAnswer(answers, "raw.streak_goal");
  const dailyMinutes = stringAnswer(answers, "raw.daily_minutes");
  const practiceModes = arrayAnswer(answers, "raw.practice_modes")
    .map((slug) => PRACTICE_LABELS[slug])
    .filter((phrase): phrase is string => Boolean(phrase));

  useEffect(() => {
    let cancelled = false;
    loadLibrary().then((items) => {
      if (cancelled) return;
      const targetCategories =
        quoteInterests.length > 0 ? quoteInterests : ["discipline"];
      const match =
        items.find(
          (i) =>
            i.type === "quote" &&
            i.categories.some((c) => targetCategories.includes(c)),
        ) ?? items.find((i) => i.type === "quote");
      setPreview(match ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each variant keeps its own voice: founder copy mirrors the founder
  // doc's honest rewrite; iam-claude uses its own lines (no "mix").
  const mirror = isFounder
    ? motivation === "everything"
      ? "Your ambition is exactly what Future Self's daily quotes are built around."
      : motivation === "stuck" ||
          motivation === "figuring-out" ||
          motivation === "exploring"
        ? "Starting unsure is still starting — your mix begins gently and builds."
        : "Your plan is built to keep you moving, not just inspired."
    : motivation === "all-in"
      ? "You brought the drive. Your daily quotes bring the rhythm."
      : motivation === "unsure" || motivation === "empty"
        ? "Momentum beats motivation — your first days start small on purpose."
        : "Everything here is tuned to help you stay consistent, not just inspired.";

  const headline = isFounder
    ? ctx.name
      ? `That's everything we needed, ${ctx.name}.`
      : "That's everything we needed."
    : ctx.name
      ? `Your daily quotes and affirmations are ready, ${ctx.name}.`
      : "Your daily quotes and affirmations are ready.";

  const quoteLine =
    quoteInterests.length > 0
      ? `Quotes weighted toward ${quoteInterests.slice(0, 2).map(label).join(" and ")}.`
      : goals.length > 0
        ? `Quotes weighted toward ${goals.slice(0, 2).map(label).join(" and ")}.`
        : isFounder
          ? "A balanced mix of quotes to start — it sharpens as you save favorites."
          : "A balanced set of quotes to start — it sharpens as you save favorites.";

  const affirmationLine =
    affirmationInterests.length > 0
      ? `Affirmations centered on ${affirmationInterests.slice(0, 2).map(label).join(" and ")}.`
      : "Affirmations that build steadiness, day by day.";

  const cadenceLine = `${notificationPrefs.quotesPerDay} quotes and ${notificationPrefs.affirmationsPerDay} affirmations a day, spread across your window.`;

  // iam-claude only: echo the funnel's commitments, and only when they
  // were actually made (skipped steps add nothing — no invented promises).
  const commitmentLines: string[] = isFounder
    ? []
    : [
        dailyMinutes
          ? `About ${dailyMinutes} ${dailyMinutes === "1" ? "minute" : "minutes"} a day.`
          : null,
        streakGoal ? `First goal: ${streakGoal} days in a row.` : null,
        practiceModes.length > 0
          ? `You'll practice by ${joinNatural(practiceModes)}.`
          : null,
      ].filter((line): line is string => line !== null);

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="h2">{headline}</AppText>
        <AppText variant="lead" tone="ink2" style={styles.mirror}>
          {mirror}
        </AppText>

        <View
          style={[styles.card, { backgroundColor: colors.card }, shadows.sm]}
        >
          <Row text={quoteLine} />
          <Row text={affirmationLine} />
          <Row text={cadenceLine} />
          {commitmentLines.map((line) => (
            <Row key={line} text={line} />
          ))}
          {traits.length > 0 ? (
            <Row
              text={`Aimed at the ${traits.slice(0, 3).map(label).join(", ")} version of you.`}
            />
          ) : null}
          {lifeGoal ? <Row text={`Your line: “${lifeGoal}”`} /> : null}
        </View>

        {preview ? (
          <Animated.View
            entering={FadeIn.duration(400).delay(250)}
            style={[
              styles.preview,
              { backgroundColor: colors.bgAlt, borderColor: colors.border },
            ]}
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
        <Button
          label={resolveText(step.cta, ctx) ?? "Sounds right"}
          onPress={onDone}
          testID="continue"
        />
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
