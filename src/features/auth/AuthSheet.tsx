import { useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, Button } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { useAuth } from "./AuthProvider";

interface AuthSheetProps {
  visible: boolean;
  headline: string;
  sub?: string;
  dismissLabel?: string;
  /** link = convert anonymous user; switch = sign into existing. */
  mode?: "link" | "switch";
  onDone: (authenticated: boolean) => void;
}

type EmailStage = "closed" | "enter-email" | "enter-code";

/**
 * Skippable auth bottom sheet (Stella placement) reused by Settings.
 * Providers that aren't configured for this build simply don't render.
 */
export function AuthSheet({
  visible,
  headline,
  sub,
  dismissLabel = "Not now",
  mode = "link",
  onDone,
}: AuthSheetProps) {
  const colors = useColors();
  const auth = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [emailStage, setEmailStage] = useState<EmailStage>("closed");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = (ok: boolean) => {
    setBusy(null);
    setEmailStage("closed");
    setEmail("");
    setCode("");
    setError(null);
    onDone(ok);
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (result.ok) {
      finish(true);
    } else if (result.message) {
      setError(result.message);
    }
  };

  const startEmail = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy("email");
    setError(null);
    const result = await auth.startEmailLink(email.trim().toLowerCase());
    setBusy(null);
    if (result.ok) {
      setEmailStage("enter-code");
    } else if ("message" in result && result.message) {
      setError(result.message);
    } else {
      setError("Could not send the code. Try again.");
    }
  };

  const verifyEmail = () =>
    run("email", () => auth.verifyEmailLink(email.trim().toLowerCase(), code.trim()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }, shadows.lg]}>
          <AppText variant="h3" center>
            {headline}
          </AppText>
          {sub ? (
            <AppText variant="body" tone="ink2" center style={styles.sub}>
              {sub}
            </AppText>
          ) : null}

          {error ? (
            <AppText variant="body" center style={[styles.error, { color: "#B4553C" }]}>
              {error}
            </AppText>
          ) : null}

          {emailStage === "closed" ? (
            <View style={styles.buttons}>
              {auth.availableProviders.apple ? (
                <Button
                  label=" Sign in with Apple"
                  onPress={() =>
                    run("apple", mode === "link" ? auth.linkWithApple : auth.signInExistingWithApple)
                  }
                  loading={busy === "apple"}
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
                      mode === "link" ? auth.linkWithGoogle : auth.signInExistingWithGoogle,
                    )
                  }
                  loading={busy === "google"}
                  testID="auth-google"
                />
              ) : null}
              {auth.availableProviders.email ? (
                <Button
                  label="Use email instead"
                  variant="ghost"
                  size="md"
                  onPress={() => setEmailStage("enter-email")}
                  testID="auth-email"
                />
              ) : null}
            </View>
          ) : null}

          {emailStage === "enter-email" ? (
            <View style={styles.buttons}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.ink3}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                autoFocus
                style={[styles.input, { borderColor: colors.borderStrong, color: colors.ink }]}
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
                style={[styles.input, { borderColor: colors.borderStrong, color: colors.ink }]}
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

          <Pressable onPress={() => finish(false)} style={styles.dismiss} hitSlop={8}>
            <AppText variant="body" tone="ink3" center>
              {dismissLabel}
            </AppText>
          </Pressable>
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
