import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { useAppState } from "@/lib/appState";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { useAuth } from "./AuthProvider";

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

type EmailStage = "closed" | "enter-email" | "enter-code";

/**
 * Skippable auth bottom sheet (Stella placement) reused by Settings.
 * Configured providers render their buttons. If none are available,
 * the sheet explains that sign-in isn't available on this build.
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
  const auth = useAuth();
  const premium = useAppState((s) => s.isPremium);
  const saveGuestFirst = mode === "switch" && auth.isAnonymous && premium;
  const effectiveMode = saveGuestFirst ? "link" : mode;
  const [busy, setBusy] = useState<string | null>(null);
  const [emailStage, setEmailStage] = useState<EmailStage>("closed");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // This owns UI results only. The provider keeps the actual SDK mutation
  // fenced through timeout, dismissal and remount until it settles.
  const operation = useRef<symbol | null>(null);
  const reset = useCallback(() => {
    operation.current = null;
    setBusy(null);
    setEmailStage("closed");
    setEmail("");
    setCode("");
    setError(null);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new modal visibility/mode session discards prior form state.
    reset();
    return () => {
      operation.current = null;
    };
  }, [visible, mode, reset]);

  const finish = (ok: boolean) => {
    reset();
    onDone(ok);
  };
  const begin = (key: string) => {
    if (!visible || operation.current) return null;
    const token = Symbol();
    operation.current = token;
    setBusy(key);
    setError(null);
    return token;
  };
  const end = (token: symbol) => {
    if (operation.current !== token) return;
    operation.current = null;
    setBusy(null);
  };
  const run = async (
    key: string,
    fn: () => Promise<{ ok: boolean; message?: string; reason?: string }>,
  ) => {
    const token = begin(key);
    if (!token) return;
    try {
      const result = await fn();
      if (operation.current !== token) return;
      if (result.ok) finish(true);
      else if (result.reason !== "cancelled")
        setError(
          result.message || "Could not finish signing in. Please retry.",
        );
    } catch (cause) {
      if (operation.current === token)
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Could not finish signing in. Please retry.",
        );
    } finally {
      end(token);
    }
  };

  const startEmail = async () => {
    if (operation.current) return;
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    const token = begin("email");
    if (!token) return;
    try {
      const result = await auth.startEmailLink(email.trim().toLowerCase());
      if (operation.current !== token) return;
      if (result.ok) setEmailStage("enter-code");
      else setError(result.message || "Could not send the code. Try again.");
    } catch (cause) {
      if (operation.current === token)
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Could not send the code. Try again.",
        );
    } finally {
      end(token);
    }
  };

  const verifyEmail = () =>
    run("email", () =>
      auth.verifyEmailLink(email.trim().toLowerCase(), code.trim()),
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!required) finish(false);
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
                  Sign-in isn't available on this build.
                </AppText>
              ) : null}
              {auth.availableProviders.apple ? (
                <Button
                  label=" Sign in with Apple"
                  onPress={() =>
                    run(
                      "apple",
                      effectiveMode === "link"
                        ? auth.linkWithApple
                        : auth.signInExistingWithApple,
                    )
                  }
                  loading={busy === "apple"}
                  disabled={Boolean(busy)}
                  testID="auth-apple"
                />
              ) : null}
              {auth.availableProviders.google ? (
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  onPress={() =>
                    run(
                      "google",
                      effectiveMode === "link"
                        ? auth.linkWithGoogle
                        : auth.signInExistingWithGoogle,
                    )
                  }
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
                  onPress={() => {
                    if (!operation.current) setEmailStage("enter-email");
                  }}
                  disabled={Boolean(busy)}
                  testID="auth-email"
                />
              ) : null}
            </View>
          ) : null}

          {emailStage === "enter-email" ? (
            <View style={styles.buttons}>
              <TextInput
                value={email}
                editable={!busy}
                onChangeText={setEmail}
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
                onPress={startEmail}
                loading={busy === "email"}
                testID="auth-email-send"
              />
            </View>
          ) : null}

          {emailStage === "enter-code" ? (
            <View style={styles.buttons}>
              <AppText variant="body" tone="ink2" center>
                We sent a 6-digit code to {email}.
              </AppText>
              <TextInput
                value={code}
                onChangeText={setCode}
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
                onPress={verifyEmail}
                loading={busy === "email"}
                disabled={code.length !== 6}
                testID="auth-code-verify"
              />
            </View>
          ) : null}

          {required ? null : (
            <Pressable
              onPress={() => finish(false)}
              style={styles.dismiss}
              hitSlop={8}
            >
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
