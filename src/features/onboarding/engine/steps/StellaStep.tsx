import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing, type } from "@/design-system/tokens";

import { resolveLines } from "../resolve";
import { StreamedLines } from "../StreamedLines";
import type { OnboardingContext, OnboardingStep } from "../types";

interface StellaStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onAnswer: (value: string | string[] | null) => void;
  onSkip: () => void;
}

/**
 * Stella-family conversational step: the voice streams in word by
 * word on the gradient; the input (text field, chips, or CTA) fades in
 * only after streaming completes. Auto-advance steps run a timer.
 */
export function StellaStep({ step, ctx, onAnswer, onSkip }: StellaStepProps) {
  const colors = useColors();
  const [streamed, setStreamed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const lines = resolveLines(step, ctx);
  const isText = step.type === "text";
  const isChips = step.type === "chips";
  const isInfo = step.type === "info" || step.type === "welcome";

  useEffect(() => {
    if (!streamed || !step.autoAdvanceMs) return;
    const t = setTimeout(() => onAnswer(null), step.autoAdvanceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamed, step.id]);

  const toggle = (slug: string) => {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (step.maxSelect === 1) return [slug];
      if (step.maxSelect && prev.length >= step.maxSelect) return prev;
      return [...prev, slug];
    });
  };

  const canContinue = isChips
    ? selected.length >= (step.minSelect ?? 1)
    : isText
      ? text.trim().length > 0
      : true;

  const submit = () => {
    if (isText) {
      onAnswer(text.trim());
    } else if (isChips) {
      onAnswer(step.maxSelect === 1 ? (selected[0] ?? "") : selected);
    } else {
      onAnswer(null);
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      exiting={FadeOut.duration(180)}
      style={styles.root}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StreamedLines lines={lines} onDone={() => setStreamed(true)} />

          {streamed && isChips ? (
            <Animated.View entering={FadeIn.duration(320)} style={styles.chips}>
              {step.options?.map((option) => {
                const active = selected.includes(option.slug);
                return (
                  <Pressable
                    key={option.slug}
                    testID={`chip-${option.slug}`}
                    onPress={() => toggle(option.slug)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.ctaBg : "transparent",
                        borderColor: active
                          ? colors.ctaBg
                          : colors.borderStrong,
                      },
                    ]}
                  >
                    <AppText variant="body" tone={active ? "ctaInk" : "ink"}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </Animated.View>
          ) : null}

          {streamed && isText ? (
            <Animated.View entering={FadeIn.duration(320)}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={step.placeholder}
                placeholderTextColor={colors.ink3}
                multiline={step.multiline}
                maxLength={step.maxLength}
                keyboardType={
                  step.keyboard === "number-pad" ? "number-pad" : "default"
                }
                autoFocus
                testID="text-input"
                onSubmitEditing={step.multiline ? undefined : submit}
                returnKeyType={step.multiline ? "default" : "go"}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.ink,
                  },
                  step.multiline && styles.inputMultiline,
                ]}
              />
            </Animated.View>
          ) : null}
        </ScrollView>

        {streamed && !step.autoAdvanceMs ? (
          <Animated.View
            entering={FadeIn.duration(320).delay(120)}
            style={styles.footer}
          >
            <Button
              label={step.cta ?? "Continue"}
              onPress={submit}
              disabled={!canContinue && !isInfo}
              testID="continue"
            />
            {step.skippable || step.secondaryCta ? (
              <Pressable onPress={onSkip} style={styles.secondary} hitSlop={8}>
                <AppText variant="body" tone="ink3" center>
                  {step.secondaryCta ?? "Skip"}
                </AppText>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  input: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: type.sizes.lead,
    fontFamily: type.sans,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  footer: { paddingBottom: spacing.sm },
  secondary: { marginTop: spacing.lg },
});
