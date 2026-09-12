import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Button,
  Checkbox,
  Icon,
  ProgressBar,
} from "@/design-system/components";
import { useMotionPreference } from "@/design-system/motion";
import { useColors } from "@/design-system/ThemeProvider";
import { motion, radii, spacing, type } from "@/design-system/tokens";
import { LEGAL_URLS } from "@/lib/legal";
import { monitoring } from "@/lib/monitoring";
import { KeyboardAvoider } from "@/features/onboarding/engine/KeyboardAvoider";

import { useAuth } from "./AuthProvider";
import { GoogleGlyph } from "./GoogleGlyph";
import { ProviderButton } from "./ProviderButton";
import { useAuthFlow } from "./useAuthFlow";

interface SaveAccountScreenProps {
  /** Small supporting line under the title; omit for the bare layout. */
  sub?: string;
  /** 0..1 for the thin progress line beside the back button. */
  progress: number;
  /** Renders the back button when provided. */
  onBack?: () => void;
  onDone: (authenticated: boolean) => void;
  testID?: string;
}

const APP_NAME = "Future Self";
export const TERMS_WARNING =
  "You must accept the Terms and Conditions and Privacy Policy to continue";
const ICON_SIZE = 20;
/** The app's warm warning/error tone (also used by the auth sheets). */
const WARNING_COLOR = "#B4553C";
const SHAKE_STEP = 45;

/**
 * Required "save your progress" screen shown before the paywall: back +
 * progress line, a large title, and three stacked provider pills over
 * two consent checkboxes. The provider pills always render at full
 * strength; tapping one before the Terms box is checked starts nothing
 * and instead shakes an inline warning under the checkbox. The marketing
 * checkbox is optional and recorded on the account once the identity is
 * linked. Links the anonymous user (never switches accounts).
 */
export function SaveAccountScreen({
  sub,
  progress,
  onBack,
  onDone,
  testID = "save-account",
}: SaveAccountScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const reduced = useMotionPreference();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [warning, setWarning] = useState(false);
  const warningOpacity = useSharedValue(0);
  const warningShake = useSharedValue(0);
  const warningStyle = useAnimatedStyle(() => ({
    opacity: warningOpacity.get(),
    transform: [{ translateX: warningShake.get() }],
  }));
  // The provider sheet may be open while the user toggles the checkbox;
  // record whatever is checked when the link actually succeeds.
  const marketingRef = useRef(false);
  const setMarketing = (checked: boolean) => {
    marketingRef.current = checked;
    setMarketingOptIn(checked);
  };

  const flow = useAuthFlow({
    active: true,
    mode: "link",
    onDone: (ok) => {
      if (ok)
        void auth
          .recordConsent({ marketingOptIn: marketingRef.current })
          .catch((error) =>
            monitoring.captureError(error, { area: "auth.consent" }),
          );
      onDone(ok);
    },
  });
  const { busy, emailStage, error } = flow;
  const providers = auth.availableProviders;
  const noProviders = !providers.apple && !providers.google && !providers.email;

  const showWarning = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setWarning(true);
    cancelAnimation(warningOpacity);
    cancelAnimation(warningShake);
    warningOpacity.set(withTiming(1, { duration: motion.fast }));
    if (reduced) {
      warningShake.set(0);
      return;
    }
    // Repeat taps re-shake so the user sees the same warning respond.
    warningShake.set(
      withSequence(
        withTiming(-6, { duration: SHAKE_STEP }),
        withTiming(6, { duration: SHAKE_STEP }),
        withTiming(-4, { duration: SHAKE_STEP }),
        withTiming(0, { duration: SHAKE_STEP }),
      ),
    );
  };
  const gated = (action: () => void) => () => {
    if (flow.inFlight()) return;
    if (!termsAccepted) {
      showWarning();
      return;
    }
    action();
  };
  const acceptTerms = (checked: boolean) => {
    setTermsAccepted(checked);
    if (checked) {
      cancelAnimation(warningOpacity);
      cancelAnimation(warningShake);
      warningOpacity.set(0);
      warningShake.set(0);
      setWarning(false);
    }
  };
  const openLink = (url: string) => () => Linking.openURL(url).catch(() => {});

  const inputStyle = [
    styles.input,
    {
      borderColor: colors.borderStrong,
      color: colors.ink,
      backgroundColor: colors.card,
    },
  ];

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg, paddingTop: insets.top },
      ]}
      testID={testID}
    >
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={8}
            style={styles.back}
            testID={`${testID}-back`}
          >
            <Icon name="back" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={styles.progress}>
          <ProgressBar progress={progress} height={3} />
        </View>
      </View>

      <KeyboardAvoider style={styles.fill}>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <AppText variant="h1" style={styles.title}>
            Save your progress
          </AppText>
          {sub ? (
            <AppText variant="body" tone="ink2" style={styles.sub}>
              {sub}
            </AppText>
          ) : null}

          <View style={styles.spacer} />

          {error ? (
            <AppText
              variant="body"
              accessibilityRole="alert"
              style={[styles.error, { color: WARNING_COLOR }]}
            >
              {error}
            </AppText>
          ) : null}

          {emailStage === "closed" ? (
            <View style={styles.buttons}>
              {noProviders ? (
                <AppText variant="body" tone="ink2" center>
                  Sign-in isn&apos;t available on this build.
                </AppText>
              ) : null}
              {providers.apple ? (
                <ProviderButton
                  label="Sign in with Apple"
                  variant="solid"
                  icon={(color) => (
                    <Icon name="apple" size={ICON_SIZE} color={color} />
                  )}
                  onPress={gated(flow.runApple)}
                  loading={busy === "apple"}
                  disabled={Boolean(busy)}
                  testID="auth-apple"
                />
              ) : null}
              {providers.google ? (
                <ProviderButton
                  label="Sign in with Google"
                  icon={(_color, background) => (
                    <GoogleGlyph size={ICON_SIZE} background={background} />
                  )}
                  onPress={gated(flow.runGoogle)}
                  loading={busy === "google"}
                  disabled={Boolean(busy)}
                  testID="auth-google"
                />
              ) : null}
              {providers.email ? (
                <ProviderButton
                  label="Continue with email"
                  icon={(color) => (
                    <Icon name="envelope" size={ICON_SIZE} color={color} />
                  )}
                  onPress={gated(flow.openEmail)}
                  disabled={Boolean(busy)}
                  testID="auth-email"
                />
              ) : null}
            </View>
          ) : null}

          {emailStage === "enter-email" ? (
            <View style={styles.buttons}>
              <TextInput
                value={flow.email}
                editable={!busy}
                onChangeText={flow.setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.ink3}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                autoFocus
                style={inputStyle}
                testID="auth-email-input"
              />
              <Button
                label="Send code"
                onPress={flow.startEmail}
                loading={busy === "email"}
                testID="auth-email-send"
              />
            </View>
          ) : null}

          {emailStage === "enter-code" ? (
            <View style={styles.buttons}>
              <AppText variant="body" tone="ink2" center>
                We sent a 6-digit code to {flow.email}.
              </AppText>
              <TextInput
                value={flow.code}
                onChangeText={flow.setCode}
                placeholder="123456"
                placeholderTextColor={colors.ink3}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                style={inputStyle}
                testID="auth-code-input"
              />
              <Button
                label="Verify"
                onPress={flow.verifyEmail}
                loading={busy === "email"}
                disabled={flow.code.length !== 6}
                testID="auth-code-verify"
              />
            </View>
          ) : null}

          {emailStage !== "closed" ? (
            <Button
              label="Other sign-in options"
              variant="ghost"
              size="md"
              onPress={flow.backToProviders}
              disabled={Boolean(busy)}
              style={styles.otherOptions}
              testID="auth-email-back"
            />
          ) : null}

          {noProviders ? null : (
            <View style={styles.consent}>
              <Checkbox
                checked={termsAccepted}
                onChange={acceptTerms}
                accessibilityLabel={`I agree to ${APP_NAME}'s Terms and Conditions and Privacy Policy`}
                testID="consent-terms"
              >
                I agree to {APP_NAME}&apos;s{" "}
                <AppText
                  variant="label"
                  tone="ink"
                  style={styles.link}
                  accessibilityRole="link"
                  onPress={openLink(LEGAL_URLS.terms)}
                  testID="consent-terms-link"
                >
                  Terms and Conditions
                </AppText>{" "}
                and{" "}
                <AppText
                  variant="label"
                  tone="ink"
                  style={styles.link}
                  accessibilityRole="link"
                  onPress={openLink(LEGAL_URLS.privacy)}
                  testID="consent-privacy-link"
                >
                  Privacy Policy
                </AppText>
              </Checkbox>
              {warning ? (
                <Animated.View
                  style={[styles.warning, warningStyle]}
                  accessibilityRole="alert"
                  testID="consent-warning"
                >
                  <Icon name="warning" size={14} color={WARNING_COLOR} />
                  <AppText
                    variant="label"
                    style={[styles.warningText, { color: WARNING_COLOR }]}
                  >
                    {TERMS_WARNING}
                  </AppText>
                </Animated.View>
              ) : null}
              <Checkbox
                checked={marketingOptIn}
                onChange={setMarketing}
                accessibilityLabel={`Send me tips, new features, and personalized offers from ${APP_NAME}`}
                testID="consent-marketing"
              >
                Send me tips, new features, and personalized offers from{" "}
                {APP_NAME}
              </Checkbox>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
  },
  back: { minWidth: 32, minHeight: 44, justifyContent: "center" },
  progress: { flex: 1 },
  body: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  title: { fontSize: type.sizes.h1 + 4, lineHeight: (type.sizes.h1 + 4) * 1.1 },
  sub: { marginTop: spacing.md, maxWidth: 320 },
  spacer: { flexGrow: 1, minHeight: spacing.xxxl },
  error: { marginBottom: spacing.md },
  buttons: { gap: spacing.md },
  otherOptions: { marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: type.sizes.lead,
    fontFamily: type.sans,
    textAlign: "center",
  },
  consent: { marginTop: spacing.xl, gap: spacing.sm },
  link: { textDecorationLine: "underline" },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs + 2,
    paddingLeft: 20 + spacing.md,
  },
  warningText: { flex: 1 },
});
