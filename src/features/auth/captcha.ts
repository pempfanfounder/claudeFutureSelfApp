import { create } from "zustand";

import { config } from "@/lib/config";

/**
 * Bridge between the auth bootstrap (which needs a Turnstile token before
 * `signInAnonymously`) and the `TurnstileHost` that renders the widget.
 * Only one challenge is ever pending; a second request while one is open
 * fails fast rather than stacking modals.
 */
export interface CaptchaRequest {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

interface CaptchaState {
  request: CaptchaRequest | null;
}

export const useCaptchaStore = create<CaptchaState>(() => ({ request: null }));

/** Interactive challenges can take a while; the whole bootstrap is not deadlined. */
export const CAPTCHA_TIMEOUT_MS = 120_000;

/**
 * Resolves `undefined` when the captcha is off by config, otherwise waits for
 * the mounted `TurnstileHost` to produce a token (or fail).
 */
export function requestSignInCaptchaToken(): Promise<string | undefined> {
  if (!config.authCaptchaEnabled) return Promise.resolve(undefined);
  if (useCaptchaStore.getState().request)
    return Promise.reject(
      new Error("A verification is already in progress. Please retry."),
    );
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (useCaptchaStore.getState().request === request)
        useCaptchaStore.setState({ request: null });
    };
    const timer = setTimeout(() => {
      settle();
      reject(new Error("Verification timed out. Please retry."));
    }, CAPTCHA_TIMEOUT_MS);
    const request: CaptchaRequest = {
      resolve: (token) => {
        settle();
        resolve(token);
      },
      reject: (error) => {
        settle();
        reject(error);
      },
    };
    useCaptchaStore.setState({ request });
  });
}

/** Abandons a pending challenge (bootstrap effect torn down / retried). */
export function cancelSignInCaptcha(): void {
  useCaptchaStore
    .getState()
    .request?.reject(new Error("Verification was cancelled."));
}
