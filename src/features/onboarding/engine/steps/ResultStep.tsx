import { useEffect, useState, type JSX, type ReactNode } from "react";
import {
  Dimensions,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeInDown,
  FadeInRight,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useMotionPreference } from "@/design-system/motion";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { captureIdentity, isCurrentIdentity } from "@/lib/appState";
import { loadLibrary } from "@/features/content/repository";
import type { ContentItem } from "@/features/content/types";
import { formatMinutes } from "@/features/notifications/time";

import { resolveText } from "../resolve";
import { useOnboardingStore } from "../store";
import type { OnboardingContext, OnboardingStep } from "../types";
import { MockNotification } from "./notifications/MockNotification";
import { DayBand } from "./result/DayBand";
import { useCountUp } from "./result/useCountUp";

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

const TRAIT_LABELS: Record<string, string> = {
  disciplined: "Disciplined",
  confident: "Confident",
  calm: "Calm",
  strong: "Strong",
  focused: "Focused",
  free: "Free",
  generous: "Generous",
  fulfilled: "Fulfilled",
  healthy: "Healthy",
  wealthy: "Wealthy",
  resilient: "Resilient",
  loved: "Loved",
};

const label = (slug: string) => LABELS[slug] ?? slug;
const traitLabel = (slug: string) => TRAIT_LABELS[slug] ?? slug;

/**
 * Practice-mode slugs (iam-claude `practice-mode` step) → lowercase
 * phrases. "unsure" is deliberately absent: it is not a practice.
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

/**
 * Card height: a title, three points (or the preview banner) and their
 * stagger fit at the app's type scale, and the whole screen (headline,
 * carousel, dots, CTA) still clears a 6.1" phone without scrolling.
 */
const CARD_HEIGHT = 280;
/** How much of the next card peeks in, Instagram-style. */
const PEEK = 28;
const GAP = spacing.md;
/** Stagger between a card's points when the card comes into view. */
const STAGGER_MS = 70;
const FIRST_POINT_DELAY_MS = 120;

interface Card {
  key: string;
  title: string;
  /** Up to three points; each renders with its own entrance. */
  points: ReactNode[];
}

/**
 * The answers-summary screen: one serif line, then what the user told
 * us as a swipeable, paged carousel of cards with about three points
 * each (Instagram/TikTok cards, not one long list). Everything on the
 * cards comes from answers the app actually uses or commitments made in
 * the funnel; skipped steps add nothing.
 *
 * Motion: the active card sits at full scale and opacity while its
 * neighbours peek in slightly smaller and dimmer (scroll-driven); a
 * card's points cascade in (fade + slide on a soft spring, 70 ms apart)
 * the first time it comes into view; numbers count up; the day band
 * grows from its start. Under the system reduce-motion setting the
 * scroll effects are flat and Reanimated skips the entrances.
 */
export function ResultStep({ step, ctx, onDone }: ResultStepProps) {
  const colors = useColors();
  const reduced = useMotionPreference();
  const { answers, notificationPrefs, variant } = useOnboardingStore();
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  // Seeded from the window so the carousel measures right on first paint
  // (and renders at all where onLayout never fires, e.g. under Jest).
  const [viewport, setViewport] = useState(
    () => Dimensions.get("window").width - spacing.xl * 2,
  );
  const scrollX = useSharedValue(0);
  const isFounder = variant === "iam-founder";

  const goals = arrayAnswer(answers, "primary_goals");
  const quoteInterests = arrayAnswer(answers, "quote_interests");
  const affirmationInterests = arrayAnswer(answers, "affirmation_interests");
  const traits = arrayAnswer(answers, "future_traits");
  const lifeGoal = stringAnswer(answers, "life_goal");
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
        // The preview is optional; the plan stands without it.
        if (!cancelled && isCurrentIdentity(identity)) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline = isFounder
    ? ctx.name
      ? `That's everything we needed, ${ctx.name}.`
      : "That's everything we needed."
    : ctx.name
      ? `We listened, ${ctx.name}. Here's the plan.`
      : "We listened. Here's the plan.";

  const leanSource = quoteInterests.length > 0 ? quoteInterests : goals;
  const quoteLine =
    leanSource.length > 0
      ? `Quotes lean toward ${leanSource.slice(0, 2).map(label).join(" and ")}`
      : "A balanced set of quotes to start";
  const affirmationLine =
    affirmationInterests.length > 0
      ? `Affirmations centered on ${affirmationInterests.slice(0, 2).map(label).join(" and ")}`
      : "Affirmations that build steadiness";

  const cardWidth = viewport - PEEK;
  const snap = cardWidth + GAP;

  const cards: Card[] = [
    {
      key: "everyday",
      title: "Every day",
      points: [
        <View key="counts" style={styles.counts}>
          <Stat
            id="quotes"
            value={notificationPrefs.quotesPerDay}
            unit="quotes"
          />
          <View
            style={[styles.countDivider, { backgroundColor: colors.border }]}
          />
          <Stat
            id="affirmations"
            value={notificationPrefs.affirmationsPerDay}
            unit="affirmations"
          />
          {streakGoal ? (
            <>
              <View
                style={[
                  styles.countDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <Stat id="streak" value={Number(streakGoal)} unit="day goal" />
            </>
          ) : null}
        </View>,
        <View key="window">
          <AppText variant="label" tone="ink3" style={styles.windowLabel}>
            {`${formatMinutes(notificationPrefs.windowStartMinutes)} to ${formatMinutes(notificationPrefs.windowEndMinutes)}`}
          </AppText>
          <DayBand
            startMinutes={notificationPrefs.windowStartMinutes}
            endMinutes={notificationPrefs.windowEndMinutes}
            delayMs={FIRST_POINT_DELAY_MS + STAGGER_MS}
            showLabels={false}
          />
        </View>,
        <Point key="quotes" text={quoteLine} />,
      ],
    },
  ];

  // iam-claude commitments, echoed only when they were actually made.
  const commitments: ReactNode[] = isFounder
    ? []
    : [
        streakGoal ? (
          <Point key="streak" text={`${streakGoal} days in a row to start`} />
        ) : null,
        dailyMinutes ? (
          <Point
            key="minutes"
            text={`About ${dailyMinutes} ${dailyMinutes === "1" ? "minute" : "minutes"} a day`}
          />
        ) : null,
        practiceModes.length > 0 ? (
          <Point key="practice" text={capitalize(joinNatural(practiceModes))} />
        ) : null,
      ].filter((node): node is JSX.Element => node !== null);
  if (commitments.length > 0) {
    cards.push({
      key: "commitments",
      title: "You committed to",
      points: commitments,
    });
  }

  const you: ReactNode[] = [
    <Point key="affirmations" text={affirmationLine} />,
    traits.length > 0 ? (
      <View key="traits" style={styles.chips} testID="result-traits">
        {traits.slice(0, 4).map((slug) => (
          <View
            key={slug}
            style={[styles.chip, { borderColor: colors.borderStrong }]}
          >
            <AppText variant="label" tone="ink2">
              {traitLabel(slug)}
            </AppText>
          </View>
        ))}
      </View>
    ) : null,
    lifeGoal ? (
      <AppText
        key="goal"
        variant="lead"
        tone="ink2"
        numberOfLines={2}
        style={styles.lifeGoal}
        testID="result-life-goal"
      >
        {`“${lifeGoal}”`}
      </AppText>
    ) : null,
  ].filter((node): node is JSX.Element => node !== null);
  cards.push({ key: "you", title: "Who you're building", points: you });

  if (preview) {
    cards.push({
      key: "preview",
      title: "First up",
      points: [
        <MockNotification
          key="banner"
          body={preview.body}
          time={formatMinutes(notificationPrefs.windowStartMinutes)}
        />,
        preview.author ? (
          <AppText key="author" variant="label" tone="ink3" center>
            {preview.author}
          </AppText>
        ) : null,
      ].filter((node): node is JSX.Element => node !== null),
    });
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0) setViewport((prev) => (prev === width ? prev : width));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollX.set(x);
    const index = Math.max(0, Math.min(cards.length - 1, Math.round(x / snap)));
    if (index !== page) {
      setPage(index);
      setSeen((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    }
  };

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <View style={styles.content}>
        <AppText variant="h2">{headline}</AppText>

        <View style={styles.carousel} onLayout={onLayout}>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={snap}
            decelerationRate="fast"
            disableIntervalMomentum
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ gap: GAP }}
            testID="result-carousel"
          >
            {cards.map((card, i) => (
              <CarouselCard
                key={card.key}
                card={card}
                index={i}
                width={cardWidth}
                snap={snap}
                scrollX={scrollX}
                active={seen.has(i)}
                flat={reduced}
              />
            ))}
          </Animated.ScrollView>
        </View>

        <View style={styles.dots} testID="result-dots">
          {cards.map((card, i) => (
            <Animated.View
              key={card.key}
              layout={LinearTransition.duration(220)}
              style={[
                styles.dot,
                i === page && styles.dotActive,
                {
                  backgroundColor:
                    i === page ? colors.ink : colors.borderStrong,
                },
              ]}
              testID={i === page ? "result-dot-active" : undefined}
            />
          ))}
        </View>
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

interface CarouselCardProps {
  card: Card;
  index: number;
  width: number;
  snap: number;
  scrollX: { get(): number };
  /** Once true, the points render (and cascade in). */
  active: boolean;
  /** Reduce motion: no scale/dim on scroll. */
  flat: boolean;
}

function CarouselCard({
  card,
  index,
  width,
  snap,
  scrollX,
  active,
  flat,
}: CarouselCardProps) {
  const colors = useColors();
  const motionStyle = useAnimatedStyle(() => {
    if (flat) return { transform: [{ scale: 1 }], opacity: 1 };
    const range = [(index - 1) * snap, index * snap, (index + 1) * snap];
    return {
      transform: [
        {
          scale: interpolate(
            scrollX.get(),
            range,
            [0.94, 1, 0.94],
            Extrapolation.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        scrollX.get(),
        range,
        [0.6, 1, 0.6],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { width, backgroundColor: colors.card },
        shadows.sm,
        motionStyle,
      ]}
      testID={`result-card-${card.key}`}
    >
      <AppText variant="eyebrow" tone="ink3">
        {card.title}
      </AppText>
      {active
        ? card.points.map((point, i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.springify()
                .damping(18)
                .stiffness(150)
                .delay(FIRST_POINT_DELAY_MS + i * STAGGER_MS)}
            >
              {point}
            </Animated.View>
          ))
        : null}
    </Animated.View>
  );
}

/** One ✦ line on a card. */
function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <AppText variant="body" tone="accent">
        ✦
      </AppText>
      <AppText variant="body" style={styles.pointText} numberOfLines={2}>
        {text}
      </AppText>
    </View>
  );
}

/** A number that counts up, with its unit underneath. */
function Stat({
  id,
  value,
  unit,
}: {
  id: string;
  value: number;
  unit: string;
}) {
  const shown = useCountUp(value, FIRST_POINT_DELAY_MS);
  return (
    <View
      style={styles.stat}
      testID={`stat-${id}`}
      accessibilityLabel={`${value} ${unit}`}
    >
      <AppText
        variant="h2"
        center
        style={styles.statValue}
        testID={`stat-${id}-value`}
      >
        {shown}
      </AppText>
      <AppText variant="label" tone="ink3" center numberOfLines={1}>
        {unit}
      </AppText>
    </View>
  );
}

function capitalize(text: string): string {
  return text.length ? text[0]!.toUpperCase() + text.slice(1) : text;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: 72 },
  // Fixed so every page is the same size and the dots never shift.
  carousel: { marginTop: spacing.xl, height: CARD_HEIGHT },
  card: {
    height: CARD_HEIGHT,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  point: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  pointText: { flex: 1 },
  counts: { flexDirection: "row", alignItems: "stretch" },
  countDivider: { width: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontVariant: ["tabular-nums"] },
  windowLabel: { marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
  },
  lifeGoal: { fontFamily: type.serifItalic },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  footer: { paddingBottom: spacing.sm },
});
