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
import { AppState, Platform } from "react-native";

import {
  runSharedAuthOperation,
  sharedAuthPending,
} from "./sharedAuthOperation";
import { storageNeedsRestart } from "@/lib/accountStorage";
import { analytics } from "@/lib/analytics";
import {
  assertCurrentIdentity,
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  withDeadline,
} from "@/lib/appState";
import { config } from "@/lib/config";
import { monitoring } from "@/lib/monitoring";
import {
  purchasesNeedRestart,
  getIsPremium,
  logInPurchases,
  logOutPurchases,
  syncEntitlementToServer,
} from "@/lib/purchases";
import { getSupabase } from "@/lib/supabase";
import { resetFeed } from "@/features/content/feedStore";
import { resetWidgetPrefs } from "@/features/widgets/widgetPrefs";

import {
  deactivateDevice,
  pauseDeviceRegistration,
  resumeDeviceRegistration,
  registerDevice,
} from "@/features/notifications/push";
import { reconcileOnboardingState } from "@/features/onboarding/engine/completeOnboarding";
import {
  useOnboardingStore,
  clearLocalUserData,
  clearOnboardingState,
} from "@/features/onboarding/engine/store";
import { clearWidgets } from "@/features/widgets/widgetSync";
import {
  requestAccountDeletion,
  getPendingDeletion,
  checkPendingDeletion as verifyPendingDeletion,
  clearDeletionReceipt,
} from "./deletion";

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
  initializationError: string | null;
  retryInitialization: () => void;
  recoverPendingDeletion: () => Promise<AuthOutcome>;
  isAnonymous: boolean;
  /** Providers that are actually usable in this build/config. */
  availableProviders: { apple: boolean; google: boolean; email: boolean };
  linkWithApple: () => Promise<AuthOutcome>;
  linkWithGoogle: () => Promise<AuthOutcome>;
  startEmailLink: (email: string) => Promise<AuthOutcome>;
  verifyEmailLink: (email: string, code: string) => Promise<AuthOutcome>;
  signInExistingWithApple: () => Promise<AuthOutcome>;
  signInExistingWithGoogle: () => Promise<AuthOutcome>;
  /**
   * Stores the save-account consent on the signed-in user's metadata:
   * when the Terms were accepted and whether marketing mail is opted in.
   */
  recordConsent: (consent: { marketingOptIn: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthOutcome>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const generation = useAppState((s) => s.identityGeneration);
  const ready = useAppState((s) => s.identityReady);
  const [session, setSession] = useState<Session | null>(null);
  // Nothing to initialize when Supabase isn't configured.
  const [initializing, setInitializing] = useState(() =>
    Boolean(getSupabase()),
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const retryInitialization = useCallback(() => setRetry((n) => n + 1), []);
  const googleReady = useRef(false);
  const mutationRunning = useRef(false);
  const runMutation = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      if (sharedAuthPending())
        throw new Error(
          "The account service has not finished. Wait or restart the app before reconnecting.",
        );
      if (mutationRunning.current)
        throw new Error("An account action is already in progress.");
      mutationRunning.current = true;
      try {
        return await work();
      } finally {
        mutationRunning.current = false;
      }
    },
    [],
  );
  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync()
        .then(setAppleAvailable)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
      setInitializing(false);
      setInitializationError("Account services are unavailable in this build.");
      return;
    }
    let mounted = true;
    let authEvents = 0;
    let receivedNewAuthEvent = false;
    let activeTask = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    setInitializing(true);
    setInitializationError(null);
    const fail = (error: unknown) => {
      if (!mounted) return;
      setInitializing(false);
      setInitializationError(
        sharedAuthPending()
          ? "The account service has not finished. Wait or restart the app before reconnecting."
          : storageNeedsRestart()
            ? "Device storage has not finished. Restart the app to recover your saved account."
            : purchasesNeedRestart()
              ? "The purchase service has not finished. Restart the app to reconnect your saved account safely."
              : "Could not reconnect your account. Your saved account has been kept. Please retry.",
      );
      useAppState.setState({
        identityReady: false,
        identityError: "Account recovery needs a retry.",
      });
      monitoring.captureError(error, { area: "auth.bootstrap" });
    };
    const adopt = (next: Session | null) => {
      if (!mounted) return;
      const previous = useAppState.getState().userId;
      const userId = next?.user.id ?? null;
      setSession(next);
      useAppState.getState().setUserId(userId);
      if (next)
        useAppState.getState().setAnonymous(next.user.is_anonymous === true);
      if (previous !== userId) {
        resetFeed();
        resetWidgetPrefs();
        if (previous) useOnboardingStore.getState().reset();
        analytics.reset();
        monitoring.setUser(null);
        void clearWidgets().catch(() => {});
      }
      if (!userId) {
        activeTask++;
        fail(new Error("The session ended. Reconnect to continue."));
        return;
      }
      if (previous === userId && useAppState.getState().identityReady) {
        setInitializing(false);
        setInitializationError(null);
        return;
      }
      const identity = captureIdentity();
      const task = ++activeTask;
      setInitializing(true);
      const timer = setTimeout(() => {
        timers.delete(timer);
        void withDeadline(
          (async () => {
            const deletion = await getPendingDeletion();
            if (deletion?.userId === userId)
              throw new Error(
                "A deletion outcome is pending. Check its status before continuing.",
              );
            await logInPurchases(userId);
            if (!isCurrentIdentity(identity)) return;
            const [complete, premium] = await Promise.all([
              reconcileOnboardingState(userId),
              getIsPremium(),
            ]);
            if (!mounted || task !== activeTask || !isCurrentIdentity(identity))
              return;
            useAppState.setState({
              onboardingComplete: complete,
              isPremium: premium,
              identityReady: true,
              identityError: null,
            });
            analytics.identify(userId, {
              is_anonymous: next?.user.is_anonymous ?? false,
            });
            monitoring.setUser(userId);
            setInitializing(false);
            setInitializationError(null);
            if (premium) void syncEntitlementToServer(identity).catch(() => {});
          })(),
        ).catch((error) => {
          if (task === activeTask && isCurrentIdentity(identity)) fail(error);
        });
      }, 0);
      timers.add(timer);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "INITIAL_SESSION") {
        if (receivedNewAuthEvent || !next) return;
      } else receivedNewAuthEvent = true;
      authEvents++;
      adopt(next);
    });
    const before = authEvents;
    void withDeadline(
      (async () => {
        if (sharedAuthPending())
          throw new Error("Account action still in progress.");
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted || authEvents !== before) return;
        if (data.session) {
          adopt(data.session);
          return;
        }
        // Only a successful lookup proving absence may create a new guest.
        const { data: anon, error: anonError } = await runSharedAuthOperation(
          () => supabase.auth.signInAnonymously(),
        );
        if (anonError || !anon.session)
          throw anonError ?? new Error("No account session returned.");
        if (mounted && authEvents === before) adopt(anon.session);
      })(),
    ).catch((error) => {
      if (authEvents === before) fail(error);
    });
    return () => {
      mounted = false;
      activeTask++;
      timers.forEach(clearTimeout);
      sub.subscription.unsubscribe();
    };
  }, [retry]);

  useEffect(() => {
    if (!ready) return;
    const identity = captureIdentity();
    let refreshing = false;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || refreshing || sharedAuthPending()) return;
      refreshing = true;
      void (async () => {
        const premium = await getIsPremium();
        if (!isCurrentIdentity(identity)) return;
        useAppState.getState().setPremium(premium);
        if (!premium) {
          resetFeed();
          await clearWidgets();
        }
        if (isCurrentIdentity(identity)) await registerDevice(identity);
      })()
        .catch((error) =>
          monitoring.captureError(error, { area: "auth.bootstrap" }),
        )
        .finally(() => {
          refreshing = false;
        });
    });
    return () => sub.remove();
  }, [generation, ready]);

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
    const identity = captureIdentity();
    const supabase = getSupabase();
    if (!supabase || !appleAvailable)
      return { ok: false, reason: "unavailable" };
    const apple = await getAppleToken();
    if (!apple) return { ok: false, reason: "error" };
    if ("cancelled" in apple) return { ok: false, reason: "cancelled" };
    if (!isCurrentIdentity(identity))
      return {
        ok: false,
        reason: "error",
        message: "Account changed. Please try again.",
      };
    const { error } = await runSharedAuthOperation(() =>
      supabase.auth.linkIdentity({
        provider: "apple",
        token: apple.token,
      }),
    );
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
    const identity = captureIdentity();
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
      assertCurrentIdentity(identity);
      const { error } = await runSharedAuthOperation(() =>
        supabase.auth.linkIdentity({
          provider: "google",
          token: idToken,
        }),
      );
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
      if (!supabase || !config.emailAuthEnabled)
        return { ok: false, reason: "unavailable" };
      let error;
      try {
        ({ error } = await runSharedAuthOperation(() =>
          supabase.auth.updateUser({ email }),
        ));
      } catch (cause) {
        return {
          ok: false,
          reason: "error",
          message: (cause as Error).message,
        };
      }
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
      if (!supabase || !config.emailAuthEnabled)
        return { ok: false, reason: "unavailable" };
      let error;
      try {
        ({ error } = await runSharedAuthOperation(() =>
          supabase.auth.verifyOtp({
            email,
            token: code,
            type: "email_change",
          }),
        ));
      } catch (cause) {
        return {
          ok: false,
          reason: "error",
          message: (cause as Error).message,
        };
      }
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
      const identity = captureIdentity();
      const supabase = getSupabase();
      if (!supabase || !appleAvailable)
        return { ok: false, reason: "unavailable" };
      const apple = await getAppleToken();
      if (!apple) return { ok: false, reason: "error" };
      if ("cancelled" in apple) return { ok: false, reason: "cancelled" };
      if (!isCurrentIdentity(identity))
        throw new Error("Account changed. Please retry.");
      const { data, error } = await runSharedAuthOperation(() =>
        supabase.auth.signInWithIdToken({
          provider: "apple",
          token: apple.token,
        }),
      );
      if (error) {
        monitoring.captureError(error, { area: "auth.signInApple" });
        return { ok: false, reason: "error", message: error.message };
      }
      analytics.capture("auth_signed_in", { provider: "apple" });
      // Switched accounts: this device's onboarding flag now belongs
      // to the signed-in user, not whoever held it before.
      const newUserId = data.session?.user.id ?? data.user?.id;
      if (newUserId && useAppState.getState().userId === newUserId)
        await reconcileOnboardingState(newUserId);
      await afterIdentityChange();
      return { ok: true };
    }, [appleAvailable, getAppleToken, afterIdentityChange]);

  const signInExistingWithGoogle =
    useCallback(async (): Promise<AuthOutcome> => {
      const identity = captureIdentity();
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
        if (!isCurrentIdentity(identity))
          throw new Error("Account changed. Please retry.");
        const { data, error } = await runSharedAuthOperation(() =>
          supabase.auth.signInWithIdToken({
            provider: "google",
            token: idToken,
          }),
        );
        if (error) {
          monitoring.captureError(error, { area: "auth.signInGoogle" });
          return { ok: false, reason: "error", message: error.message };
        }
        analytics.capture("auth_signed_in", { provider: "google" });
        // Switched accounts: reconcile the local onboarding flag with
        // the signed-in user's server state.
        const newUserId = data.session?.user.id ?? data.user?.id;
        if (newUserId && useAppState.getState().userId === newUserId)
          await reconcileOnboardingState(newUserId);
        await afterIdentityChange();
        return { ok: true };
      } catch {
        return { ok: false, reason: "error" };
      }
    }, [ensureGoogle, afterIdentityChange]);

  const recordConsent = useCallback(
    async (consent: { marketingOptIn: boolean }) => {
      const identity = captureIdentity();
      const supabase = getSupabase();
      if (!supabase || !identity.userId) return;
      const now = new Date().toISOString();
      const { error } = await runSharedAuthOperation(() =>
        supabase.auth.updateUser({
          data: {
            terms_accepted_at: now,
            marketing_opt_in: consent.marketingOptIn,
            marketing_opt_in_at: consent.marketingOptIn ? now : null,
          },
        }),
      );
      if (error) throw error;
      analytics.capture("consent_recorded", {
        marketing_opt_in: consent.marketingOptIn,
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase(),
      identity = captureIdentity();
    if (!supabase || !identity.userId) throw new Error("No signed-in account.");
    let localEnded = false;
    pauseDeviceRegistration(identity);
    try {
      await withDeadline(deactivateDevice(identity));
      assertCurrentIdentity(identity);
      await withDeadline(logOutPurchases(identity));
      assertCurrentIdentity(identity);
      const { error } = await runSharedAuthOperation(() =>
        supabase.auth.signOut({ scope: "local" }),
      );
      if (error) {
        const after = await withDeadline(supabase.auth.getSession());
        if (after.error || after.data.session) throw error;
        localEnded = true;
      }
      const current = useAppState.getState().userId;
      if (current !== identity.userId && current !== null)
        throw new Error("Account changed during sign-out.");
      useAppState.getState().setUserId(null);
      localEnded = true;
      resetFeed();
      resetWidgetPrefs();
      analytics.reset();
      monitoring.setUser(null);
      const cleanup = await Promise.allSettled([
        withDeadline(clearOnboardingState(identity.userId)),
        withDeadline(clearLocalUserData(identity.userId)),
        withDeadline(clearWidgets()),
      ]);
      setSession(null);
      if (error || cleanup.some((result) => result.status === "rejected")) {
        setInitializing(false);
        setInitializationError(
          "This device is signed out. Some server confirmation or device cleanup did not finish. Restart or retry, or sign in to your existing account.",
        );
        throw new Error(
          "This device is signed out, but some confirmation or cleanup did not finish. Your server account has not been deleted.",
        );
      }
      retryInitialization();
    } catch (error) {
      monitoring.captureError(error, { area: "auth.signOut" });
      if (localEnded) throw error;
      resumeDeviceRegistration(identity);
      if (isCurrentIdentity(identity))
        void logInPurchases(identity.userId).catch(() => {});
      throw new Error(
        isCurrentIdentity(identity)
          ? "Sign-out did not finish. Please retry."
          : "The account session changed during sign-out. Reopen the current account to continue.",
      );
    }
  }, [retryInitialization]);

  const deleteAccount = useCallback(async (): Promise<AuthOutcome> => {
    const identity = captureIdentity();
    const shared = getSupabase();
    if (!shared || !identity.userId)
      return { ok: false, reason: "unavailable" };
    try {
      await requestAccountDeletion(identity);
    } catch (error) {
      monitoring.captureError(error, { area: "auth.deleteAccount" });
      return {
        ok: false,
        reason: "error",
        message:
          "Deletion was not confirmed. Your saved sign-in has been kept. Retry or sign in again.",
      };
    }
    if (!isCurrentIdentity(identity)) {
      const ownCleanup = await Promise.allSettled([
        clearOnboardingState(identity.userId),
        clearLocalUserData(identity.userId),
      ]);
      if (ownCleanup.some((result) => result.status === "rejected"))
        return {
          ok: false,
          reason: "error",
          message:
            "Account deleted. Restart or retry to finish clearing its saved data from this device.",
        };
      await clearDeletionReceipt(identity.userId);
      return { ok: true };
    }
    useAppState.getState().setUserId(null);
    resetFeed();
    resetWidgetPrefs();
    useOnboardingStore.getState().reset();
    analytics.reset();
    monitoring.setUser(null);
    // Each cleanup runs even if a neighboring operation fails. Server deletion
    // is already confirmed; local cleanup failure is a separate recovery state.
    const results = await Promise.allSettled([
      withDeadline(logOutPurchases()),
      withDeadline(clearOnboardingState(identity.userId)),
      withDeadline(clearLocalUserData(identity.userId)),
      withDeadline(clearWidgets()),
      runSharedAuthOperation(() =>
        shared.auth.signOut({ scope: "local" }).then(({ error }) => {
          if (error) throw error;
        }),
      ),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setInitializationError(
        "Account deleted. Restart or retry to finish clearing this device.",
      );
      setInitializing(false);
      return { ok: true };
    }
    await clearDeletionReceipt(identity.userId);
    setSession(null);
    retryInitialization();
    return { ok: true };
  }, [retryInitialization]);

  const recoverPendingDeletion = useCallback(async (): Promise<AuthOutcome> => {
    try {
      const deletedId = await verifyPendingDeletion();
      const current = useAppState.getState().userId;
      const ownCleanup = [
        withDeadline(clearOnboardingState(deletedId)),
        withDeadline(clearLocalUserData(deletedId)),
      ];
      if (current === deletedId || current === null) {
        useAppState.getState().setUserId(null);
        resetFeed();
        resetWidgetPrefs();
        const shared = getSupabase();
        const results = await Promise.allSettled([
          ...ownCleanup,
          withDeadline(logOutPurchases()),
          withDeadline(clearWidgets()),
          runSharedAuthOperation(
            () =>
              shared?.auth.signOut({ scope: "local" }).then(({ error }) => {
                if (error) throw error;
              }) ?? Promise.resolve(),
          ),
        ]);
        if (results.some((r) => r.status === "rejected"))
          throw new Error(
            "Deletion confirmed, but device cleanup needs a restart.",
          );
        analytics.reset();
        monitoring.setUser(null);
        setSession(null);
      } else {
        const results = await Promise.allSettled(ownCleanup);
        if (results.some((r) => r.status === "rejected"))
          throw new Error(
            "Could not finish clearing the deleted account from this device.",
          );
      }
      await clearDeletionReceipt(deletedId);
      retryInitialization();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "error", message: (error as Error).message };
    }
  }, [retryInitialization]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      initializationError,
      retryInitialization,
      recoverPendingDeletion: () => runMutation(recoverPendingDeletion),
      isAnonymous: session?.user.is_anonymous ?? true,
      availableProviders: {
        apple: Platform.OS === "ios" && appleAvailable,
        google: config.hasGoogleAuth,
        email: config.hasSupabase && config.emailAuthEnabled,
      },
      linkWithApple: () => runMutation(linkWithApple),
      linkWithGoogle: () => runMutation(linkWithGoogle),
      startEmailLink: (email) => runMutation(() => startEmailLink(email)),
      verifyEmailLink: (email, code) =>
        runMutation(() => verifyEmailLink(email, code)),
      signInExistingWithApple: () => runMutation(signInExistingWithApple),
      signInExistingWithGoogle: () => runMutation(signInExistingWithGoogle),
      recordConsent: (consent) => runMutation(() => recordConsent(consent)),
      signOut: () => runMutation(signOut),
      deleteAccount: () => runMutation(deleteAccount),
    }),
    [
      session,
      initializing,
      initializationError,
      retryInitialization,
      recoverPendingDeletion,
      runMutation,
      appleAvailable,
      linkWithApple,
      linkWithGoogle,
      startEmailLink,
      verifyEmailLink,
      signInExistingWithApple,
      signInExistingWithGoogle,
      recordConsent,
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
