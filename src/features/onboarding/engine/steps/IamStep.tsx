import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOut } from "react-native-reanimated";

import { AppText, Button, SelectableRow } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";

interface IamStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onAnswer: (value: string | string[] | null) => void;
  onSkip: () => void;
}

/**
 * I Am-family generic step: serif headline + sans sub on cream.
 * single -> auto-advancing pill rows; multi -> checkmarks + Continue;
 * chips -> tag grid + Continue; text -> field + Continue; info/welcome
 * -> centered interstitial.
 */
export function IamStep({ step, ctx, onAnswer, onSkip }: IamStepProps) {
  const colors = useColors();
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const headline = resolveText(step.headline, ctx);
  const sub = resolveText(step.sub, ctx);
  const isInfo =
    step.type === "info" ||
    step.type === "welcome" ||
    step.type === "widget-promo";
  const isSingle = step.type === "single";
  const isMulti = step.type === "multi";
  const isChips = step.type === "chips";
  const isText = step.type === "text";

  const toggle = (slug: string) => {
    if (isSingle) {
      setSelected([slug]);
      // Auto-advance shortly after selection, like I Am.
      setTimeout(() => onAnswer(slug), 350);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (step.maxSelect && prev.length >= step.maxSelect) {
        if (step.maxSelect === 1) return [slug];
        return prev;
      }
      return [...prev, slug];
    });
  };

  const canContinue =
    (isMulti || isChips) && selected.length >= (step.minSelect ?? 1)
      ? true
      : isText
        ? text.trim().length > 0
        : isInfo;

  return (
    <Animated.View
      entering={FadeInRight.duration(280)}
      exiting={FadeOut.duration(150)}
      style={styles.root}
    >
      {step.skippable ? (
        <Pressable onPress={onSkip} style={styles.skip} hitSlop={12}>
          <AppText variant="label" tone="ink3">
            Skip
          </AppText>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isInfo && styles.contentCentered,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step.type === "welcome" ? (
            <Image
              source={require("../../../../../assets/images/splash-icon.png")}
              style={styles.logo}
            />
          ) : null}

          <AppText variant={isInfo ? "h1" : "h2"} center={isInfo}>
            {headline}
          </AppText>
          {sub ? (
            <AppText
              variant="lead"
              tone="ink2"
              center={isInfo}
              style={styles.sub}
            >
              {sub}
            </AppText>
          ) : null}

          {step.type === "widget-promo" && step.placeholder ? (
            <View
              style={[
                styles.widgetMock,
                { backgroundColor: colors.card },
                shadows.md,
              ]}
            >
              <AppText
                variant="body"
                style={{ fontFamily: type.serif, fontSize: 17 }}
              >
                {step.placeholder}
              </AppText>
              <AppText
                variant="label"
                tone="ink3"
                style={styles.widgetMockLabel}
              >
                Future Self
              </AppText>
            </View>
          ) : null}

          {isSingle || isMulti ? (
            <View style={styles.options}>
              {step.options?.map((option) => (
                <SelectableRow
                  key={option.slug}
                  label={option.label}
                  emoji={option.emoji}
                  selected={selected.includes(option.slug)}
                  onPress={() => toggle(option.slug)}
                  testID={`option-${option.slug}`}
                />
              ))}
            </View>
          ) : null}

          {isChips ? (
            <View style={styles.chips}>
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
                        backgroundColor: active ? colors.ctaBg : colors.card,
                        borderColor: active
                          ? colors.ctaBg
                          : colors.borderStrong,
                      },
                    ]}
                  >
                    <AppText variant="body" tone={active ? "ctaInk" : "ink"}>
                      {active ? "✓ " : "+ "}
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {isText ? (
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
          ) : null}
          {isText && step.maxLength && step.multiline ? (
            <AppText variant="label" tone="ink3" style={styles.counter}>
              {text.length}/{step.maxLength}
            </AppText>
          ) : null}
        </ScrollView>

        {!isSingle ? (
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
              onPress={() =>
                onAnswer(
                  isText ? text.trim() : isMulti || isChips ? selected : null,
                )
              }
              disabled={!canContinue}
              testID="continue"
            />
            {step.secondaryCta ? (
              <Pressable onPress={onSkip} style={styles.secondary} hitSlop={8}>
                <AppText variant="body" tone="ink3" center>
                  {step.secondaryCta}
                </AppText>
              </Pressable>
            ) : null}
            {step.type === "welcome" ? (
              <AppText variant="label" tone="ink3" center style={styles.terms}>
                By continuing you agree to our Terms and Privacy Policy
              </AppText>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  skip: { position: "absolute", top: spacing.sm, right: spacing.xl, zIndex: 5 },
  content: { paddingTop: 84, paddingBottom: spacing.xl },
  contentCentered: { flexGrow: 1, justifyContent: "center", paddingTop: 0 },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radii.xl,
    alignSelf: "center",
    marginBottom: spacing.xxl,
  },
  sub: { marginTop: spacing.md },
  options: { marginTop: spacing.xxl },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  input: {
    marginTop: spacing.xxl,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: type.sizes.lead,
    fontFamily: type.sans,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: "top" },
  counter: { marginTop: spacing.sm, textAlign: "right" },
  footer: { paddingBottom: spacing.sm },
  trialCaption: { marginBottom: spacing.sm },
  secondary: { marginTop: spacing.lg },
  terms: { marginTop: spacing.lg },
  widgetMock: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginTop: spacing.xxl,
    alignSelf: "center",
    width: "82%",
  },
  widgetMockLabel: { marginTop: spacing.md },
});
