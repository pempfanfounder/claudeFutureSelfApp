import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { useAuthFlow } from "./useAuthFlow";

interface AuthSheetProps {
  visible: boolean;
  headline: string;
  sub?: string;
  dismissLabel?: string;
  /** link = convert anonymous user; switch = sign into existing. */
  mode?: "link" | "switch";
  /** Required save-account: no Not now. Back cannot dismiss. */
  required?: boolean;
  onDone: (authenticated: boolean) => void;
}

/**
 * Skippable auth bottom sheet (Stella placement) reused by Settings.
 * Configured providers render their buttons. If none are available,
 * the sheet explains that sign-in isn't available on this build.
 * The required pre-paywall placement uses `SaveAccountScreen` instead.
 */
export function AuthSheet({
  visible,
  headline,
  sub,
  dismissLabel = "Not now",
  mode = "link",
  required = false,
  onDone,
}: AuthSheetProps) {
  const colors = useColors();
  const flow = useAuthFlow({ active: visible, mode, onDone });
  const { auth, busy, emailStage, error, effectiveMode, saveGuestFirst } = flow;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!required) flow.cancel();
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, { backgroundColor: colors.card }, shadows.lg]}
        >
          <AppText variant="h3" center>
            {saveGuestFirst ? "Save this account first." : headline}
          </AppText>
          {saveGuestFirst ? (
            <AppText variant="body" center>
              Your current guest account has a purchase. Link a sign-in to keep
              its history before switching accounts.
            </AppText>
          ) : null}
          {sub && !saveGuestFirst ? (
            <AppText variant="body" tone="ink2" center style={styles.sub}>
              {sub}
            </AppText>
          ) : null}

          {error ? (
            <AppText
              variant="body"
              center
              style={[styles.error, { color: "#B4553C" }]}
            >
              {error}
            </AppText>
          ) : null}

          {emailStage === "closed" ? (
            <View style={styles.buttons}>
              {!auth.availableProviders.apple &&
              !auth.availableProviders.google &&
              !auth.availableProviders.email ? (
                <AppText variant="body" tone="ink2" center>
                  Sign-in isn&apos;t available on this build.
                </AppText>
              ) : null}
              {auth.availableProviders.apple ? (
                <Button
                  label=" Sign in with Apple"
                  onPress={flow.runApple}
                  loading={busy === "apple"}
                  disabled={Boolean(busy)}
                  testID="auth-apple"
                />
              ) : null}
              {auth.availableProviders.google ? (
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  onPress={flow.runGoogle}
                  loading={busy === "google"}
                  disabled={Boolean(busy)}
                  testID="auth-google"
                />
              ) : null}
              {auth.availableProviders.email && effectiveMode === "link" ? (
                <Button
                  label="Use email instead"
                  variant="ghost"
                  size="md"
                  onPress={flow.openEmail}
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
                style={[
                  styles.input,
                  { borderColor: colors.borderStrong, color: colors.ink },
                ]}
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
                style={[
                  styles.input,
                  { borderColor: colors.borderStrong, color: colors.ink },
                ]}
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

          {required ? null : (
            <Pressable onPress={flow.cancel} style={styles.dismiss} hitSlop={8}>
              <AppText variant="body" tone="ink3" center>
                {dismissLabel}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(42,30,22,0.45)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  sub: { marginTop: spacing.sm },
  error: { marginTop: spacing.md },
  buttons: { marginTop: spacing.xl, gap: spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: type.sizes.lead,
    fontFamily: type.sans,
    textAlign: "center",
  },
  dismiss: { marginTop: spacing.xl },
});
