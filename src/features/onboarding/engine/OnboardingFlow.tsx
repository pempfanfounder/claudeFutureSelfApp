import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, ProgressBar } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";

import { AuthSheet } from "@/features/auth/AuthSheet";
import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import { useOffering } from "@/features/paywall/useOffering";

import { getVariantConfig } from "../variants";
import { completeOnboarding } from "./completeOnboarding";
import { resolveText } from "./resolve";
import { useOnboardingStore } from "./store";
import { IamStep } from "./steps/IamStep";
import { NotificationsStep } from "./steps/NotificationsStep";
import { PreparingStep } from "./steps/PreparingStep";
import { ResultStep } from "./steps/ResultStep";
import { StellaStep } from "./steps/StellaStep";
import { StreakCommitStep } from "./steps/StreakCommitStep";
import { ThemeStep } from "./steps/ThemeStep";
import type { OnboardingContext, OnboardingStep } from "./types";

/**
 * Renders the assigned variant's step sequence. Variant-specific
 * content lives entirely in `../variants/*`; this engine is shared.
 */
export function OnboardingFlow() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { variant, stepIndex, setStepIndex, answers, name, setAnswer, setName } =
    useOnboardingStore();
  const setPremium = useAppState((s) => s.setPremium);

  const config = variant ? getVariantConfig(variant) : null;
  const offering = useOffering(config?.paywallStyle === "note" ? "weekly" : "annual");
  const [trialReminder, setTrialReminder] = useState(true);

  const ctx = useMemo<OnboardingContext>(
    () => ({
      name,
      answers,
      trialLength: offering.trialLength,
      priceLine: offering.priceLine,
    }),
    [name, answers, offering.trialLength, offering.priceLine],
  );

  const steps = useMemo(
    () => (config ? config.steps.filter((s) => !s.condition || s.condition(ctx)) : []),
    [config, ctx],
  );

  const step: OnboardingStep | undefined = steps[stepIndex];

  const finish = useCallback(async () => {
    if (!variant) return;
    await completeOnboarding(variant);
    router.replace("/");
  }, [variant]);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      void finish();
    } else {
      setStepIndex(stepIndex + 1);
    }
  }, [stepIndex, steps.length, setStepIndex, finish]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [stepIndex, setStepIndex]);

  const handleAnswer = useCallback(
    (value: string | string[] | null) => {
      if (!step || !variant) return;
      if (step.modelKey && value !== null) {
        if (step.modelKey === "name" && typeof value === "string") {
          setName(value);
        } else {
          setAnswer(step.modelKey, value);
        }
      }
      analytics.capture("onboarding_answered", {
        variant,
        step: step.id,
        // Free text never leaves the device via analytics.
        answer:
          step.type === "text"
            ? undefined
            : Array.isArray(value)
              ? value.join(",")
              : (value ?? undefined),
        answered: true,
      });
      advance();
    },
    [step, variant, setAnswer, setName, advance],
  );

  const handleSkip = useCallback(() => {
    if (!step || !variant) return;
    analytics.capture("onboarding_skipped", { variant, step: step.id });
    advance();
  }, [step, variant, advance]);

  if (!config || !step || !variant) return null;

  const isStella = config.family === "stella";
  const showBack = isStella && stepIndex > 0 && !["preparing", "paywall"].includes(step.type);
  const showProgress =
    isStella &&
    !step.hideProgress &&
    !["welcome", "preparing", "paywall", "auth-sheet"].includes(step.type);
  const progress = (stepIndex + 1) / steps.length;

  const renderStep = () => {
    switch (step.type) {
      case "notifications":
        return (
          <NotificationsStep step={step} ctx={ctx} family={config.family} onDone={advance} />
        );
      case "streak-commit":
        return <StreakCommitStep step={step} ctx={ctx} onAnswer={handleAnswer} />;
      case "theme":
        return <ThemeStep step={step} ctx={ctx} onDone={advance} />;
      case "result":
        return <ResultStep step={step} ctx={ctx} onDone={advance} />;
      case "preparing":
        return (
          <PreparingStep
            headline={resolveText(step.headline, ctx) ?? "Preparing…"}
            work={() => completeOnboarding(variant)}
            onDone={advance}
          />
        );
      case "auth-sheet":
        return (
          <AuthSheet
            visible
            headline={resolveText(step.headline, ctx) ?? "Keep it safe."}
            sub={resolveText(step.sub, ctx)}
            dismissLabel={step.secondaryCta ?? "Not now"}
            mode="link"
            onDone={() => advance()}
          />
        );
      case "paywall":
        if (config.paywallStyle === "note") {
          return (
            <NotePaywall
              data={offering}
              voice={variant === "stella-founder" ? "future-self" : "team"}
              userName={name}
              placement="onboarding"
              onPurchased={() => {
                setPremium(true);
                advance();
              }}
            />
          );
        }
        return (
          <TimelinePaywall
            data={offering}
            closeDelayMs={config.paywallCloseDelayMs}
            trialReminder={trialReminder}
            onTrialReminderChange={(v) => {
              setTrialReminder(v);
              setAnswer("raw.trial_reminder", v ? "yes" : "no");
            }}
            placement="onboarding"
            onPurchased={() => {
              setPremium(true);
              advance();
            }}
            onClose={() => {
              // Hard-gate product: closing skips the retention promos
              // but the gate route re-presents the paywall.
              analytics.capture("paywall_dismissed", { variant, placement: "onboarding" });
              void finish();
            }}
          />
        );
      default:
        return isStella ? (
          <StellaStep step={step} ctx={ctx} onAnswer={handleAnswer} onSkip={handleSkip} />
        ) : (
          <IamStep step={step} ctx={ctx} onAnswer={handleAnswer} onSkip={handleSkip} />
        );
    }
  };

  const isFullBleed = step.type === "paywall" && config.paywallStyle === "note";

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {isStella ? (
        <LinearGradient
          colors={[colors.bg, colors.bgAlt, colors.bg]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {showProgress ? (
        <View style={[styles.progress, { top: insets.top + spacing.sm }]}>
          <ProgressBar progress={progress} height={3} />
        </View>
      ) : null}

      {showBack ? (
        <Pressable
          onPress={goBack}
          style={[styles.back, { top: insets.top + spacing.lg }]}
          hitSlop={12}
        >
          <AppText variant="h3" tone="ink3">
            ←
          </AppText>
        </Pressable>
      ) : null}

      <View
        style={[
          styles.body,
          !isFullBleed && { paddingHorizontal: spacing.xl },
          { paddingTop: isFullBleed ? 0 : insets.top, paddingBottom: isFullBleed ? 0 : insets.bottom },
        ]}
      >
        {renderStep()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 5,
  },
  back: { position: "absolute", left: spacing.xl, zIndex: 5 },
  body: { flex: 1 },
});
