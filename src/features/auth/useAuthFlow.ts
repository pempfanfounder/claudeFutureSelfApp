import { useCallback, useEffect, useRef, useState } from "react";

import { useAppState } from "@/lib/appState";

import { useAuth, type AuthOutcome } from "./AuthProvider";

export type EmailStage = "closed" | "enter-email" | "enter-code";

interface UseAuthFlowOptions {
  /** False while the surface is hidden: results arriving then are dropped. */
  active: boolean;
  /** link = convert anonymous user; switch = sign into existing. */
  mode: "link" | "switch";
  onDone: (authenticated: boolean) => void;
}

/**
 * UI state for one sign-in surface (sheet or full screen): which provider
 * is busy, the email OTP stage, and the visible error. Every result is
 * tagged with an operation token so a dismissed, remounted or superseded
 * attempt can neither finish the flow nor unlock a newer attempt. The
 * provider keeps the SDK mutation itself fenced.
 */
export function useAuthFlow({ active, mode, onDone }: UseAuthFlowOptions) {
  const auth = useAuth();
  const premium = useAppState((s) => s.isPremium);
  const saveGuestFirst = mode === "switch" && auth.isAnonymous && premium;
  const effectiveMode: "link" | "switch" = saveGuestFirst ? "link" : mode;
  const [busy, setBusy] = useState<string | null>(null);
  const [emailStage, setEmailStage] = useState<EmailStage>("closed");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new visibility/mode session discards prior form state.
    reset();
    return () => {
      operation.current = null;
    };
  }, [active, mode, reset]);

  const finish = (ok: boolean) => {
    reset();
    onDone(ok);
  };
  const begin = (key: string) => {
    if (!active || operation.current) return null;
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
  const run = async (key: string, fn: () => Promise<AuthOutcome>) => {
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

  const runApple = () =>
    run(
      "apple",
      effectiveMode === "link"
        ? auth.linkWithApple
        : auth.signInExistingWithApple,
    );
  const runGoogle = () =>
    run(
      "google",
      effectiveMode === "link"
        ? auth.linkWithGoogle
        : auth.signInExistingWithGoogle,
    );

  const openEmail = () => {
    if (!operation.current) setEmailStage("enter-email");
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

  return {
    auth,
    saveGuestFirst,
    effectiveMode,
    busy,
    emailStage,
    email,
    setEmail,
    code,
    setCode,
    error,
    setError,
    /** True while any attempt owns the surface (a tap must be ignored). */
    inFlight: () => operation.current !== null,
    runApple,
    runGoogle,
    openEmail,
    startEmail,
    verifyEmail,
    /** Leaves the email form for the provider list; drops a pending send. */
    backToProviders: reset,
    cancel: () => finish(false),
  };
}
