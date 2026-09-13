import { Platform } from "react-native";

/**
 * Platform-aware store wording for subscription disclosures and account
 * copy: "App Store" on iOS, "Google Play" on Android. Never hardcode the
 * store name in user-facing subscription text; call these instead.
 */
export type StoreName = "App Store" | "Google Play";

export function storeName(platform: string = Platform.OS): StoreName {
  return platform === "android" ? "Google Play" : "App Store";
}

/** "your App Store account" / "your Google Play account". */
export function storeAccountName(platform: string = Platform.OS): string {
  return `your ${storeName(platform)} account`;
}

/** Where the user manages or cancels: "App Store settings" / "Google Play → Subscriptions". */
export function storeSubscriptionsLocation(
  platform: string = Platform.OS,
): string {
  return platform === "android"
    ? "Google Play → Subscriptions"
    : "App Store settings";
}
