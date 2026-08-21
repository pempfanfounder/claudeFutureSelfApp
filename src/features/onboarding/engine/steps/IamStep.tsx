import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOut } from "react-native-reanimated";

import {
  AppText,
  Button,
  Icon,
  SelectableRow,
} from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { KeyboardAvoider } from "../KeyboardAvoider";
import { resolveText } from "../resolve";
import type { OnboardingContext, OnboardingStep } from "../types";
import { LegalFooter } from "./LegalFooter";

interface IamStepProps {
  step: OnboardingStep;
  ctx: OnboardingContext;
  onAnswer: (value: string | string[] | null) => void;
  onSkip: () => void;
}

const LOGO_SIZE = 96;
const BULLET_ICON_SIZE = 18;

/**
 * From this many answer rows the list switches to compact rows (see
 * `SelectableRow`). Seven compact rows plus a two-line headline and a
 * sub still fit above the CTA on a 6.1" phone, so nothing is clipped and
 * nothing has to be scrolled to.
 */
const COMPACT_ROWS_FROM = 6;

/**
 * I Am-family generic step: serif headline + sans sub on cream.
 * single -> auto-advancing pill rows; multi -> checkmarks + Continue;
 * chips -> tag grid + Continue; text -> field + Continue; info/welcome
 * -> centered interstitial (optionally with `bullets` and a `footnote`).
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
  // Single-select steps auto-advance and have no footer; everything else
  // keeps the CTA below the list.
  const hasFooter = !isSingle;
  const compactRows = (step.options?.length ?? 0) >= COMPACT_ROWS_FROM;

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

  const submit = () => {
    if (isText) {
      onAnswer(text.trim());
    } else if (isMulti || isChips) {
      onAnswer(selected);
    } else {
      onAnswer(null);
    }
  };

  // Single-line fields submit from the return key (one-thumb flow); the
  // guard mirrors the disabled Continue so an empty return does nothing.
  const submitFromKeyboard = () => {
    if (canContinue) submit();
  };

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

      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            hasFooter ? styles.contentWithFooter : styles.contentNoFooter,
            isInfo && styles.contentCentered,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step.type === "welcome" ? (
            // Shadow lives on the wrapper (iOS clips shadows on a view that
            // clips its content); the Image rounds itself, so the wrapper
            // needs no overflow:hidden. Together they read as the app icon.
            <View
              style={[
                styles.logoTile,
                { backgroundColor: colors.card, borderColor: colors.border },
                shadows.sm,
              ]}
              testID="welcome-logo"
            >
              <Image
                source={require("../../../../../assets/images/splash-icon.png")}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>
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

          {step.bullets?.length ? (
            // Centered as a block, left-aligned within: the I Am benefits
            // list. `maxWidth` keeps long lines from hugging the edges.
            <View style={styles.bullets}>
              {step.bullets.map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <View style={styles.bulletIcon}>
                    <Icon
                      name="check"
                      size={BULLET_ICON_SIZE}
                      color={colors.ink}
                    />
                  </View>
                  <AppText variant="lead" style={styles.bulletText}>
                    {line}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {step.footnote ? (
            <AppText variant="label" tone="ink3" center style={styles.footnote}>
              {step.footnote}
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
                  compact={compactRows}
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
              // Enforced silently — no visible counter (feedback #8).
              maxLength={step.maxLength}
              keyboardType={
                step.keyboard === "number-pad" ? "number-pad" : "default"
              }
              // Multiline keeps return = newline; single-line submits.
              returnKeyType={step.multiline ? "default" : "done"}
              // Keep focus on an empty "Done" so the keyboard doesn't drop and
              // force a second tap; the input unmounts on advance anyway.
              submitBehavior={step.multiline ? "newline" : "submit"}
              onSubmitEditing={step.multiline ? undefined : submitFromKeyboard}
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
        </ScrollView>

        {/* Outside the ScrollView so the CTA is the element directly above
            the keyboard when the KeyboardAvoider pads the bottom. Being a
            sibling (not an overlay) it also reserves its own height, so
            the list above only needs breathing room, not clearance. */}
        {hasFooter ? (
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
              onPress={submit}
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
              <LegalFooter style={styles.terms} />
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  skip: { position: "absolute", top: spacing.sm, right: spacing.xl, zIndex: 5 },
  // 56 clears the Skip control (8 + ~17) with room to breathe and pulls
  // the question as high as the design allows, buying ~28 pt for options.
  content: { paddingTop: 56 },
  // Steps with a CTA: the footer is a sibling, so this is separation.
  contentWithFooter: { paddingBottom: spacing.xl },
  // Auto-advancing steps have no footer, so the last row needs its own
  // clearance above the home indicator (the body already pads the inset).
  contentNoFooter: { paddingBottom: spacing.xxl },
  contentCentered: { flexGrow: 1, justifyContent: "center", paddingTop: 0 },
  logoTile: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "center",
    marginBottom: spacing.xxl,
  },
  // Fills the tile's content box (inside the hairline border).
  logo: { width: "100%", height: "100%", borderRadius: radii.xl },
  sub: { marginTop: spacing.md },
  bullets: {
    alignSelf: "center",
    maxWidth: "88%",
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  // Sized to the lead line-height so the check centres on the first line.
  bulletIcon: {
    width: BULLET_ICON_SIZE + spacing.xs,
    height: type.sizes.lead * type.lineHeights.relaxed,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: { flexShrink: 1 },
  footnote: { marginTop: spacing.lg },
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
