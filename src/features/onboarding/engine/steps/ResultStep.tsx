import { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";

import { captureIdentity, isCurrentIdentity } from "@/lib/appState";
import { config } from "@/lib/config";
import {
  getLocalDate,
  selectSharedDailySet,
} from "@/features/content/dailySet";
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
 * Height of every carousel page. Sized for a title plus three two-line
 * points (or a five-line preview quote) at the app's type scale, so the
 * tallest honest card still fits without the page scrolling.
 */
const CAROUSEL_HEIGHT = 250;

/**
 * Practice-mode slugs (iam-claude `practice-mode` step) → lowercase
 * phrases for "You'll practice by …". "unsure" is deliberately absent:
 * it is not a practice, so it is never echoed.
 */
const PRACTICE_LABELS: Record<string, string> = {
  phone: "reading them in the app",
  widget: "seeing them on your Home or Lock Screen",
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

/** One swipeable page: a titled list of ✦ points, or the live preview. */
interface Card {
  key: string;
  title: string;
  points?: string[];
  preview?: ContentItem;
}

/**
 * The honest "your daily quotes and affirmations are ready" screen:
 * everything shown is composed from answers the app actually uses (or
 * commitments the user made in the funnel, echoed back verbatim), plus
 * a real preview item drawn from the top-weighted category. It is paged
 * into a swipeable carousel so no single card gets tall enough to scroll.
 */
export function ResultStep({ step, ctx, onDone }: ResultStepProps) {
  const colors = useColors();
  const { answers, notificationPrefs, variant } = useOnboardingStore();
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const [page, setPage] = useState(0);
  // Seeded from the window so the carousel measures right on first paint
  // (and renders at all where onLayout never fires, e.g. under Jest).
  const [pageWidth, setPageWidth] = useState(
    () => Dimensions.get("window").width - spacing.xl * 2,
  );
  const isFounder = variant === "iam-founder";
  // With personalization off, the plan copy must not promise weighting
  // the selection doesn't do; interests are still collected for later.
  const personalized = config.contentPersonalizationEnabled;

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
    const identity = captureIdentity();
    loadLibrary(false, identity)
      .then((items) => {
        if (cancelled || !isCurrentIdentity(identity)) return;
        if (!personalized) {
          // Preview the first quote of today's shared rotation — the same
          // one every user sees — rather than an interest match.
          const [firstId] = selectSharedDailySet(
            items,
            "quote",
            getLocalDate(),
          );
          setPreview(items.find((i) => i.id === firstId) ?? null);
          return;
        }
        const targetCategories =
          quoteInterests.length > 0 ? quoteInterests : ["discipline"];
        const match =
          items.find(
            (i) =>
              i.type === "quote" &&
              i.categories.some((c) => targetCategories.includes(c)),
          ) ?? items.find((i) => i.type === "quote");
        setPreview(match ?? null);
      })
      .catch(() => {
        // The preview is optional; the collected plan remains available.
        if (!cancelled && isCurrentIdentity(identity)) setPreview(null);
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
        ? "Starting unsure is still starting. Your first days begin gently and build."
        : "Your plan is built to keep you moving, not just inspired."
    : motivation === "all-in"
      ? "You brought the drive. Your daily quotes bring the rhythm."
      : motivation === "unsure" || motivation === "empty"
        ? "Momentum beats motivation, so your first days start small on purpose."
        : "Everything here is tuned to help you stay consistent, not just inspired.";

  const headline = isFounder
    ? ctx.name
      ? `That's everything we needed, ${ctx.name}.`
      : "That's everything we needed."
    : ctx.name
      ? `Your daily quotes and affirmations are ready, ${ctx.name}.`
      : "Your daily quotes and affirmations are ready.";

  const quoteLine = !personalized
    ? "A fresh set of quotes every day."
    : quoteInterests.length > 0
      ? `Quotes weighted toward ${quoteInterests.slice(0, 2).map(label).join(" and ")}.`
      : goals.length > 0
        ? `Quotes weighted toward ${goals.slice(0, 2).map(label).join(" and ")}.`
        : "A balanced set of quotes to start. It sharpens as you save favorites.";

  const affirmationLine =
    personalized && affirmationInterests.length > 0
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

  const youLines: string[] = [
    traits.length > 0
      ? `Aimed at the ${traits.slice(0, 3).map(label).join(", ")} version of you.`
      : null,
    lifeGoal ? `Your line: “${lifeGoal}”` : null,
  ].filter((line): line is string => line !== null);

  // At most three ✦ points per card, so every page reads at a glance.
  const cards: Card[] = [
    {
      key: "plan",
      title: "Your daily plan",
      points: [quoteLine, affirmationLine, cadenceLine],
    },
  ];
  if (commitmentLines.length > 0) {
    cards.push({
      key: "commitment",
      title: "What you committed to",
      points: commitmentLines,
    });
  }
  if (youLines.length > 0) {
    cards.push({ key: "you", title: "Who you're building", points: youLines });
  }
  if (preview) {
    cards.push({ key: "preview", title: "First up", preview });
  }

  const onCarouselLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0) setPageWidth((prev) => (prev === width ? prev : width));
  };

  const onSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(cards.length - 1, index)));
  };

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <View style={styles.content}>
        <AppText variant="h2">{headline}</AppText>
        <AppText variant="lead" tone="ink2" style={styles.mirror}>
          {mirror}
        </AppText>

        <Animated.View
          entering={FadeIn.duration(400).delay(150)}
          onLayout={onCarouselLayout}
          style={styles.carousel}
        >
          <FlatList
            data={cards}
            keyExtractor={(card) => card.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSettled}
            testID="result-carousel"
            renderItem={({ item }) => (
              <View style={[styles.page, { width: pageWidth }]}>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.card },
                    shadows.sm,
                  ]}
                >
                  <AppText variant="eyebrow" tone="ink3">
                    {item.title}
                  </AppText>
                  {item.points?.map((point) => (
                    <View key={point} style={styles.row}>
                      <AppText variant="body" tone="accent">
                        ✦
                      </AppText>
                      <AppText
                        variant="body"
                        style={styles.rowText}
                        // A long life goal stays the user's own words;
                        // the card just refuses to grow past the page.
                        numberOfLines={4}
                      >
                        {point}
                      </AppText>
                    </View>
                  ))}
                  {item.preview ? (
                    <View style={styles.previewBody}>
                      <AppText
                        variant="quote"
                        center
                        style={styles.previewQuote}
                        numberOfLines={5}
                      >
                        {item.preview.body}
                      </AppText>
                      {item.preview.author ? (
                        <AppText
                          variant="label"
                          tone="ink2"
                          center
                          style={styles.author}
                        >
                          — {item.preview.author}
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          />
        </Animated.View>

        {cards.length > 1 ? (
          <View style={styles.dots} testID="result-dots">
            {cards.map((card, i) => (
              <View
                key={card.key}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === page ? colors.ink : colors.borderStrong,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: 72 },
  mirror: { marginTop: spacing.md },
  // Fixed so every page is the same size and the dots never shift.
  carousel: { marginTop: spacing.xl, height: CAROUSEL_HEIGHT },
  page: { height: CAROUSEL_HEIGHT },
  card: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    // Each page is exactly the viewport wide (so paging lands cleanly);
    // the gutter to the next card lives inside the page. No
    // overflow:hidden here: iOS drops the shadow on a clipping view, and
    // the numberOfLines caps above already keep every card in bounds.
    marginRight: spacing.md,
    gap: spacing.md,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  rowText: { flex: 1 },
  previewBody: { flex: 1, justifyContent: "center" },
  previewQuote: { fontSize: 22, lineHeight: 30 },
  author: { marginTop: spacing.md },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  footer: { paddingBottom: spacing.sm },
});
