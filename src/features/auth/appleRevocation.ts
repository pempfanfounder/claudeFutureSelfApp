import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { monitoring } from "@/lib/monitoring";

/** Appended to the delete confirmations when the account uses Apple. */
export const APPLE_DELETION_NOTE =
  "Because you signed in with Apple, Apple will ask you to confirm so Future Self is also removed from your Apple ID.";

/** True when the account is linked to Sign in with Apple. */
export function hasAppleIdentity(session: Session | null): boolean {
  return (
    session?.user.identities?.some(
      (identity) => identity.provider === "apple",
    ) ?? false
  );
}

/**
 * Apple's revocation endpoint needs a token we never keep: the app signs
 * in with a one-shot identity token. So, right before deleting, the user
 * re-confirms with the native Apple sheet and the fresh authorization
 * code travels to `delete-account`, which exchanges and revokes it.
 *
 * Returns null when the sheet is unavailable, cancelled or fails; the
 * caller deletes the account regardless (revocation is best effort).
 */
export async function requestAppleRevocationCode(
  session: Session | null,
  appleAvailable: boolean,
): Promise<string | null> {
  if (Platform.OS !== "ios" || !appleAvailable || !hasAppleIdentity(session))
    return null;
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [],
    });
    return credential.authorizationCode ?? null;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code !== "ERR_REQUEST_CANCELED")
      monitoring.captureError(error, { area: "auth.appleRevoke" });
    return null;
  }
}
