import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, ProgressBar } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { spacing } from "@/design-system/tokens";
import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { getSupabase } from "@/lib/supabase";

import { useAuth } from "@/features/auth/AuthProvider";
import { AuthSheet } from "@/features/auth/AuthSheet";
import { NotePaywall } from "@/features/paywall/NotePaywall";
import { TimelinePaywall } from "@/features/paywall/TimelinePaywall";
import { useOffering } from "@/features/paywall/useOffering";

import { getVariantConfig } from "../variants";
import { completeOnboarding } from "./completeOnboarding";
import { resolveText } from "./resolve";
import { markOnboardingComplete, useOnboardingStore } from "./store";
import { AppIconStep } from "./steps/AppIconStep";
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
  const {
    variant,
    stepIndex,
    setStepIndex,
    answers,
    name,
    setAnswer,
    setName,
    setNotificationPrefs,
  } = useOnboardingStore();
  const setPremium = useAppState((s) => s.setPremium);
  const { isAnonymous } = useAuth();

  const config = variant ? getVariantConfig(variant) : null;
  const offering = useOffering(
    config?.paywallStyle === "note" ? "weekly" : "annual",
  );
  const [trialReminder, setTrialReminder] = useState(true);
  const [switchAuthVisible, setSwitchAuthVisible] = useState(false);

  const ctx = useMemo<OnboardingContext>(
    () => ({
      name,
      answers,
      trialLength: offering.trialLength,
      priceLine: offering.priceLine,
      isAnonymous,
    }),
    [name, answers, offering.trialLength, offering.priceLine, isAnonymous],
  );

  const steps = useMemo(
    () =>
      config
        ? config.steps.filter((s) => !s.condition || s.condition(ctx))
        : [],
    [config, ctx],
  );

  const step: OnboardingStep | undefined = steps[stepIndex];

  // completeOnboarding is idempotent at the database level, but it also
  // fires `onboarding_completed` — and this funnel IS the A/B test, so a
  // second call would inflate the completion rate for whichever variant
  // happened to run it twice. Every caller goes through this guard.
  const persistedRef = useRef(false);
  const persistCompletion = useCallback(async () => {
    if (!variant || persistedRef.current) return;
    persistedRef.current = true;
    await completeOnboarding(variant);
  }, [variant]);

  const finish = useCallback(async () => {
    if (!variant) return;
    await persistCompletion();
    router.replace("/");
  }, [variant, persistCompletion]);

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
    // The Stella welcome's secondary action is "Already have an
    // account? Sign in" — an account switch, not a skip.
    if (step.type === "welcome" && step.secondaryCta) {
      setSwitchAuthVisible(true);
      return;
    }
    analytics.capture("onboarding_skipped", { variant, step: step.id });
    advance();
  }, [step, variant, advance]);

  /**
   * After signing in to an EXISTING account from the welcome screen:
   * if that account already finished onboarding, skip the funnel — its
   * server-side personalization is the source of truth. Purchases
   * reattach via RevenueCat logIn (auth listener) + Restore.
   */
  const handleSwitchDone = useCallback(
    async (authenticated: boolean) => {
      setSwitchAuthVisible(false);
      if (!authenticated || !variant) return;
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) return;
      const { data } = await supabase
        .from("personalization")
        .select("variant, onboarding_completed_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.onboarding_completed_at) {
        await markOnboardingComplete(
          (data.variant as typeof variant | null) ?? variant,
        );
        useAppState.getState().setOnboardingComplete(true);
        router.replace("/");
      }
    },
    [variant],
  );

  if (!config || !step || !variant) return null;

  const isStella = config.family === "stella";
  const showBack =
    isStella && stepIndex > 0 && !["preparing", "paywall"].includes(step.type);
  const showProgress =
    isStella &&
    !step.hideProgress &&
    !["welcome", "preparing", "paywall", "auth-sheet"].includes(step.type);
  const progress = (stepIndex + 1) / steps.length;

  const renderStep = () => {
    switch (step.type) {
      case "notifications":
        return (
          <NotificationsStep
            step={step}
            ctx={ctx}
            family={config.family}
            onDone={advance}
          />
        );
      case "streak-commit":
        return (
          <StreakCommitStep step={step} ctx={ctx} onAnswer={handleAnswer} />
        );
      case "app-icon":
        // Records raw.app_icon only; completeOnboarding applies it once
        // (iOS alerts on every icon change).
        return <AppIconStep step={step} ctx={ctx} onAnswer={handleAnswer} />;
      case "theme":
        return <ThemeStep step={step} ctx={ctx} onDone={advance} />;
      case "result":
        return <ResultStep step={step} ctx={ctx} onDone={advance} />;
      case "preparing":
        return (
          <PreparingStep
            headline={resolveText(step.headline, ctx) ?? "Preparing…"}
            work={persistCompletion}
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
                // Persist now: the iam variants keep going through the
                // widget promos, so a user who pays and then kills the
                // app would otherwise relaunch into onboarding again.
                void persistCompletion();
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
              // The DB column defaults to true, so "off" only sticks if
              // completeOnboarding actually writes it.
              setNotificationPrefs({ trialReminder: v });
              setAnswer("raw.trial_reminder", v ? "yes" : "no");
            }}
            placement="onboarding"
            onPurchased={() => {
              setPremium(true);
              void persistCompletion();
              advance();
            }}
            onClose={() => {
              // Hard-gate product: closing skips the retention promos
              // but the gate route re-presents the paywall.
              analytics.capture("paywall_dismissed", {
                variant,
                placement: "onboarding",
              });
              void finish();
            }}
          />
        );
      default:
        return isStella ? (
          <StellaStep
            step={step}
            ctx={ctx}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
          />
        ) : (
          <IamStep
            step={step}
            ctx={ctx}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
          />
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
        // Key by step id so each step mounts fresh (streaming state,
        // selections, entering animations).
        key={step.id}
        style={[
          styles.body,
          !isFullBleed && { paddingHorizontal: spacing.xl },
          {
            paddingTop: isFullBleed ? 0 : insets.top,
            paddingBottom: isFullBleed ? 0 : insets.bottom,
          },
        ]}
      >
        {renderStep()}
      </View>

      <AuthSheet
        visible={switchAuthVisible}
        mode="switch"
        headline="Welcome back."
        sub="Sign in to the account that has your history."
        dismissLabel="Cancel"
        onDone={handleSwitchDone}
      />
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
