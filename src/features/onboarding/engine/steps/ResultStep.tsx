import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
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
  discipline: "Discipline",
  ambition: "Ambition",
  courage: "Courage",
  "stoic-calm": "Stoic calm",
  gratitude: "Gratitude",
  resilience: "Resilience",
  focus: "Focus",
  kindness: "Kindness",
  "self-belief": "Self-belief",
  calm: "Calm",
  "health-body": "Health",
  abundance: "Abundance",
  "letting-go": "Letting go",
  "morning-energy": "Morning energy",
  boundaries: "Boundaries",
  "self-respect": "Self-respect",
  confidence: "Confidence",
  body: "Body",
  career: "Career",
  money: "Money",
  peace: "Peace of mind",
  relationships: "Relationships",
  purpose: "Purpose",
  disciplined: "Disciplined",
  confident: "Confident",
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

/** Shown in the preview banner when no library item is available yet. */
const FALLBACK_PREVIEW = "Discipline is remembering what you want.";
/** Focus chips stay to one line on a 6.1" phone. */
const MAX_CHIPS = 5;
/** Stagger between plan items; each one fades and slides in with a spring. */
const STAGGER_MS = 70;
const FIRST_ITEM_DELAY_MS = 160;

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
 * The plan screen: one serif line, then the plan as things to look at
 * rather than read. A notification banner previews the first quote at
 * the chosen start time, a day band shows the reminder window, count-up
 * tiles show the numbers the user picked, and chips show what the quotes
 * lean toward. Everything is composed from answers the app actually uses
 * or commitments the user made; skipped steps add nothing.
 *
 * Motion: items enter staggered (fade + slide up on a soft spring, 70 ms
 * apart), the band grows out from its start, the numbers count up.
 * Reanimated skips its animations under the system reduce-motion
 * setting and the count-up checks the same preference.
 */
export function ResultStep({ step, ctx, onDone }: ResultStepProps) {
  const colors = useColors();
  const { answers, notificationPrefs } = useOnboardingStore();
  const [preview, setPreview] = useState<ContentItem | null>(null);

  const quoteInterests = arrayAnswer(answers, "quote_interests");
  const affirmationInterests = arrayAnswer(answers, "affirmation_interests");
  const goals = arrayAnswer(answers, "primary_goals");
  const traits = arrayAnswer(answers, "future_traits");
  const lifeGoal = stringAnswer(answers, "life_goal");
  const streakGoal = stringAnswer(answers, "raw.streak_goal");
  const dailyMinutes = stringAnswer(answers, "raw.daily_minutes");

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

  const headline = ctx.name
    ? `Here's how your days will go, ${ctx.name}.`
    : "Here's how your days will go.";

  // What the quotes lean toward, then who they are aimed at.
  const chips = [
    ...(quoteInterests.length > 0 ? quoteInterests : goals).slice(0, 2),
    ...affirmationInterests.slice(0, 2),
    ...traits.slice(0, 2),
  ]
    .map(label)
    .filter((name, i, all) => all.indexOf(name) === i)
    .slice(0, MAX_CHIPS);

  const items: { key: string; node: ReactNode }[] = [
    {
      key: "preview",
      node: (
        <MockNotification
          body={preview?.body ?? FALLBACK_PREVIEW}
          time={formatMinutes(notificationPrefs.windowStartMinutes)}
        />
      ),
    },
    {
      key: "window",
      node: (
        <View
          style={[styles.card, { backgroundColor: colors.card }, shadows.sm]}
        >
          <AppText variant="eyebrow" tone="ink3" style={styles.eyebrow}>
            Your window
          </AppText>
          <DayBand
            startMinutes={notificationPrefs.windowStartMinutes}
            endMinutes={notificationPrefs.windowEndMinutes}
            delayMs={FIRST_ITEM_DELAY_MS + STAGGER_MS * 2}
          />
        </View>
      ),
    },
    {
      key: "stats",
      node: (
        <View style={styles.stats}>
          <StatTile
            id="quotes"
            value={notificationPrefs.quotesPerDay}
            unit="quotes a day"
            delayMs={FIRST_ITEM_DELAY_MS + STAGGER_MS * 3}
          />
          <StatTile
            id="affirmations"
            value={notificationPrefs.affirmationsPerDay}
            unit="affirmations a day"
            delayMs={FIRST_ITEM_DELAY_MS + STAGGER_MS * 3}
          />
          {streakGoal ? (
            <StatTile
              id="streak"
              value={Number(streakGoal)}
              unit="day goal"
              delayMs={FIRST_ITEM_DELAY_MS + STAGGER_MS * 3}
            />
          ) : dailyMinutes ? (
            <StatTile
              id="minutes"
              value={Number(dailyMinutes)}
              unit={Number(dailyMinutes) === 1 ? "minute a day" : "min a day"}
              delayMs={FIRST_ITEM_DELAY_MS + STAGGER_MS * 3}
            />
          ) : null}
        </View>
      ),
    },
  ];
  if (chips.length > 0) {
    items.push({
      key: "chips",
      node: (
        <View style={styles.chips} testID="result-chips">
          {chips.map((name) => (
            <View
              key={name}
              style={[styles.chip, { borderColor: colors.borderStrong }]}
            >
              <AppText variant="label" tone="ink2">
                {name}
              </AppText>
            </View>
          ))}
        </View>
      ),
    });
  }

  return (
    <Animated.View entering={FadeInRight.duration(280)} style={styles.root}>
      <View style={styles.content}>
        <AppText variant="h2">{headline}</AppText>
        {lifeGoal ? (
          <AppText
            variant="lead"
            tone="ink2"
            numberOfLines={2}
            style={styles.lifeGoal}
            testID="result-life-goal"
          >
            {`“${lifeGoal}”`}
          </AppText>
        ) : null}

        <View style={styles.items}>
          {items.map((item, i) => (
            <Animated.View
              key={item.key}
              testID={`result-item-${item.key}`}
              entering={FadeInDown.springify()
                .damping(18)
                .stiffness(150)
                .delay(FIRST_ITEM_DELAY_MS + i * STAGGER_MS)}
            >
              {item.node}
            </Animated.View>
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

interface StatTileProps {
  id: string;
  value: number;
  unit: string;
  delayMs: number;
}

/** A number that counts up, with its unit underneath. */
function StatTile({ id, value, unit, delayMs }: StatTileProps) {
  const colors = useColors();
  const shown = useCountUp(value, delayMs);
  return (
    <View
      style={[styles.stat, { backgroundColor: colors.card }, shadows.sm]}
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
      <AppText variant="label" tone="ink3" center>
        {unit}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: 72 },
  lifeGoal: { marginTop: spacing.md, fontFamily: type.serifItalic },
  items: { marginTop: spacing.xl, gap: spacing.md },
  card: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  eyebrow: { marginBottom: spacing.md },
  stats: { flexDirection: "row", gap: spacing.md },
  stat: {
    flex: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontVariant: ["tabular-nums"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
  },
  footer: { paddingBottom: spacing.sm },
});
