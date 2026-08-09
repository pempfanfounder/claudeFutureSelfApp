import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { analytics } from "@/lib/analytics";
import { useAppState } from "@/lib/appState";
import { config } from "@/lib/config";
import { monitoring } from "@/lib/monitoring";
import { logInPurchases, logOutPurchases } from "@/lib/purchases";
import { getSupabase } from "@/lib/supabase";

import {
  deactivateDevice,
  registerDevice,
} from "@/features/notifications/push";

/**
 * Anonymous-first auth.
 *
 * Every install gets an anonymous Supabase session at first launch, so
 * purchases, onboarding answers, and experiment assignment always have
 * a stable user UUID. "Signing in" later LINKS an identity to that
 * same user (same UUID — nothing to migrate):
 *  - Apple/Google: native ID token via supabase.auth.linkIdentity()
 *  - Email: updateUser({email}) + verifyOtp(type 'email_change')
 * "Already have an account" flows SWITCH accounts instead
 * (signInWithIdToken / verifyOtp type 'email'), after which RevenueCat
 * logIn + restore reattach purchases.
 */

export type AuthOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: "cancelled" | "unavailable" | "conflict" | "error";
      message?: string;
    };

interface AuthContextValue {
  session: Session | null;
  initializing: boolean;
  isAnonymous: boolean;
  /** Providers that are actually usable in this build/config. */
  availableProviders: { apple: boolean; google: boolean; email: boolean };
  linkWithApple: () => Promise<AuthOutcome>;
  linkWithGoogle: () => Promise<AuthOutcome>;
  startEmailLink: (email: string) => Promise<AuthOutcome>;
  verifyEmailLink: (email: string, code: string) => Promise<AuthOutcome>;
  signInExistingWithApple: () => Promise<AuthOutcome>;
  signInExistingWithGoogle: () => Promise<AuthOutcome>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthOutcome>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Nothing to initialize when Supabase isn't configured.
  const [initializing, setInitializing] = useState(() =>
    Boolean(getSupabase()),
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleReady = useRef(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync()
        .then(setAppleAvailable)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { data: anon, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          if (mounted) setSession(anon.session);
        } else if (mounted) {
          setSession(data.session);
        }
      } catch (error) {
        monitoring.captureError(error, { area: "auth.bootstrap" });
      } finally {
        if (mounted) setInitializing(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      const userId = next?.user.id ?? null;
      useAppState.getState().setUserId(userId);
      if (userId) {
        analytics.identify(userId, {
          is_anonymous: next?.user.is_anonymous ?? false,
        });
        monitoring.setUser(userId);
        logInPurchases(userId).catch(() => {});
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ensureGoogle = useCallback(async () => {
    if (!config.hasGoogleAuth) return null;
    try {
      const { GoogleSignin } =
        await import("@react-native-google-signin/google-signin");
      if (!googleReady.current) {
        GoogleSignin.configure({
          webClientId: config.googleWebClientId!,
          iosClientId: config.googleIosClientId,
        });
        googleReady.current = true;
      }
      return GoogleSignin;
    } catch (error) {
      monitoring.captureError(error, { area: "auth.googleInit" });
      return null;
    }
  }, []);

  const getAppleToken = useCallback(async (): Promise<
    { token: string } | { cancelled: true } | null
  > => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) return null;
      return { token: credential.identityToken };
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === "ERR_REQUEST_CANCELED") return { cancelled: true };
      monitoring.captureError(error, { area: "auth.apple" });
      return null;
    }
  }, []);

  const afterIdentityChange = useCallback(async () => {
    await registerDevice();
  }, []);

  const linkWithApple = useCallback(async (): Promise<AuthOutcome> => {
    const supabase = getSupabase();
    if (!supabase || !appleAvailable)
      return { ok: false, reason: "unavailable" };
    const apple = await getAppleToken();
    if (!apple) return { ok: false, reason: "error" };
    if ("cancelled" in apple) return { ok: false, reason: "cancelled" };
    const { error } = await supabase.auth.linkIdentity({
      provider: "apple",
      token: apple.token,
    });
    if (error) {
      if (
        error.code === "identity_already_exists" ||
        error.code === "email_exists"
      ) {
        return {
          ok: false,
          reason: "conflict",
          message:
            "That Apple ID already has an account. Use “Already have an account” instead.",
        };
      }
      monitoring.captureError(error, { area: "auth.linkApple" });
      return { ok: false, reason: "error", message: error.message };
    }
    analytics.capture("auth_linked", { provider: "apple" });
    await afterIdentityChange();
    return { ok: true };
  }, [appleAvailable, getAppleToken, afterIdentityChange]);

  const linkWithGoogle = useCallback(async (): Promise<AuthOutcome> => {
    const supabase = getSupabase();
    const GoogleSignin = await ensureGoogle();
    if (!supabase || !GoogleSignin) return { ok: false, reason: "unavailable" };
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) return { ok: false, reason: "cancelled" };
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        token: idToken,
      });
      if (error) {
        if (
          error.code === "identity_already_exists" ||
          error.code === "email_exists"
        ) {
          return {
            ok: false,
            reason: "conflict",
            message:
              "That Google account already has an account here. Use “Already have an account” instead.",
          };
        }
        monitoring.captureError(error, { area: "auth.linkGoogle" });
        return { ok: false, reason: "error", message: error.message };
      }
      analytics.capture("auth_linked", { provider: "google" });
      await afterIdentityChange();
      return { ok: true };
    } catch (error: unknown) {
      const err = error as { code?: string | number };
      if (String(err.code) === "-5" || String(err.code) === "12501") {
        return { ok: false, reason: "cancelled" };
      }
      monitoring.captureError(error, { area: "auth.google" });
      return { ok: false, reason: "error" };
    }
  }, [ensureGoogle, afterIdentityChange]);

  const startEmailLink = useCallback(
    async (email: string): Promise<AuthOutcome> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, reason: "unavailable" };
      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        if (error.code === "email_exists") {
          return {
            ok: false,
            reason: "conflict",
            message: "That email already has an account.",
          };
        }
        monitoring.captureError(error, { area: "auth.emailStart" });
        return { ok: false, reason: "error", message: error.message };
      }
      return { ok: true };
    },
    [],
  );

  const verifyEmailLink = useCallback(
    async (email: string, code: string): Promise<AuthOutcome> => {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, reason: "unavailable" };
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email_change",
      });
      if (error) {
        return {
          ok: false,
          reason: "error",
          message: "That code didn't match. Try again.",
        };
      }
      analytics.capture("auth_linked", { provider: "email" });
      await afterIdentityChange();
      return { ok: true };
    },
    [afterIdentityChange],
  );

  const signInExistingWithApple =
    useCallback(async (): Promise<AuthOutcome> => {
      const supabase = getSupabase();
      if (!supabase || !appleAvailable)
        return { ok: false, reason: "unavailable" };
      const apple = await getAppleToken();
      if (!apple) return { ok: false, reason: "error" };
      if ("cancelled" in apple) return { ok: false, reason: "cancelled" };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: apple.token,
      });
      if (error) {
        monitoring.captureError(error, { area: "auth.signInApple" });
        return { ok: false, reason: "error", message: error.message };
      }
      analytics.capture("auth_signed_in", { provider: "apple" });
      await afterIdentityChange();
      return { ok: true };
    }, [appleAvailable, getAppleToken, afterIdentityChange]);

  const signInExistingWithGoogle =
    useCallback(async (): Promise<AuthOutcome> => {
      const supabase = getSupabase();
      const GoogleSignin = await ensureGoogle();
      if (!supabase || !GoogleSignin)
        return { ok: false, reason: "unavailable" };
      try {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
        const result = await GoogleSignin.signIn();
        const idToken = result.data?.idToken;
        if (!idToken) return { ok: false, reason: "cancelled" };
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) {
          monitoring.captureError(error, { area: "auth.signInGoogle" });
          return { ok: false, reason: "error", message: error.message };
        }
        analytics.capture("auth_signed_in", { provider: "google" });
        await afterIdentityChange();
        return { ok: true };
      } catch {
        return { ok: false, reason: "error" };
      }
    }, [ensureGoogle, afterIdentityChange]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      await deactivateDevice();
      await logOutPurchases();
      analytics.reset();
      await supabase.auth.signOut();
      // Immediately start a fresh anonymous session so the app keeps a
      // stable identity for the gate/paywall.
      const { data } = await supabase.auth.signInAnonymously();
      setSession(data.session);
    } catch (error) {
      monitoring.captureError(error, { area: "auth.signOut" });
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<AuthOutcome> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, reason: "unavailable" };
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: {},
      });
      if (error) throw error;
      analytics.capture("account_deleted");
      analytics.reset();
      await supabase.auth.signOut();
      const { data } = await supabase.auth.signInAnonymously();
      setSession(data.session);
      return { ok: true };
    } catch (error) {
      monitoring.captureError(error, { area: "auth.deleteAccount" });
      return {
        ok: false,
        reason: "error",
        message: "Could not delete the account. Try again.",
      };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      isAnonymous: session?.user.is_anonymous ?? true,
      availableProviders: {
        apple: Platform.OS === "ios" && appleAvailable,
        google: config.hasGoogleAuth,
        email: config.hasSupabase,
      },
      linkWithApple,
      linkWithGoogle,
      startEmailLink,
      verifyEmailLink,
      signInExistingWithApple,
      signInExistingWithGoogle,
      signOut,
      deleteAccount,
    }),
    [
      session,
      initializing,
      appleAvailable,
      linkWithApple,
      linkWithGoogle,
      startEmailLink,
      verifyEmailLink,
      signInExistingWithApple,
      signInExistingWithGoogle,
      signOut,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
