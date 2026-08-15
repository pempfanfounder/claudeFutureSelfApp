import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

import { analytics } from "./analytics";
import { config } from "./config";
import { monitoring } from "./monitoring";

/**
 * Purchases abstraction over RevenueCat.
 *
 * RevenueCat is the source of truth for premium access via the
 * configured entitlement (EXPO_PUBLIC_RC_ENTITLEMENT_ID, default
 * "premium"). In production a missing RevenueCat key NEVER unlocks the
 * app: `isPremium` stays false and the paywall stays up. In development
 * an explicitly enabled mock (EXPO_PUBLIC_DEV_MOCK_PURCHASES) lets the
 * four onboarding funnels be tested end-to-end without a store account;
 * the mock is compiled out of production behavior by the `__DEV__` guard
 * in config.
 */
export const PREMIUM_ENTITLEMENT_ID = config.rcEntitlementId;

let configured = false;
let mockPremium = false;

type PremiumListener = (isPremium: boolean) => void;
const listeners = new Set<PremiumListener>();

export function isConfigured() {
  return configured || config.devMockPurchases;
}

export async function initPurchases(appUserId?: string) {
  if (config.devMockPurchases) return;
  const apiKey =
    Platform.OS === "ios"
      ? config.revenueCatIosKey
      : config.revenueCatAndroidKey;
  if (!apiKey) {
    console.warn(
      `[purchases] No RevenueCat API key found for platform "${Platform.OS}". Check environment configuration.`,
    );
    return;
  }
  if (configured) return;

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  try {
    Purchases.configure({ apiKey, appUserID: appUserId ?? null });
    configured = true;
    Purchases.addCustomerInfoUpdateListener((info) => {
      notify(hasPremium(info));
    });
  } catch (error) {
    console.error("[purchases] Purchases.configure failed:", error);
    monitoring.captureError(error, { area: "purchases.configure" });
  }
}

/**
 * Ties the RevenueCat identity to the Supabase user so purchases
 * survive anonymous-to-authenticated transitions and account switches.
 */
export async function logInPurchases(supabaseUserId: string) {
  if (!configured) return;
  try {
    const { customerInfo } = await Purchases.logIn(supabaseUserId);
    notify(hasPremium(customerInfo));
  } catch (error) {
    monitoring.captureError(error, { area: "purchases.logIn" });
  }
}

export async function logOutPurchases() {
  if (!configured) return;
  try {
    // logOut generates a fresh anonymous RevenueCat id.
    const info = await Purchases.logOut();
    notify(hasPremium(info));
  } catch (error) {
    monitoring.captureError(error, { area: "purchases.logOut" });
  }
}

/**
 * This is a single-tier app: any genuinely active RevenueCat entitlement
 * means premium. The configured entitlement id is checked first; if it
 * isn't the one that's active (e.g. a dashboard rename/typo) we still
 * honor whatever entitlement IS active rather than falsely locking out a
 * paying customer — but we warn loudly in dev so the misconfiguration
 * gets fixed. This still requires a real, active store entitlement; it
 * is not a bypass.
 */
function hasPremium(info: CustomerInfo): boolean {
  if (info.entitlements.active[PREMIUM_ENTITLEMENT_ID]) return true;
  const anyActive = Object.keys(info.entitlements.active).length > 0;
  if (anyActive && __DEV__) {
    console.warn(
      `[purchases] Active entitlement found, but not under the configured id "${PREMIUM_ENTITLEMENT_ID}". ` +
        `Falling back to treating the user as premium. Active entitlements: ${Object.keys(info.entitlements.active).join(", ")}. ` +
        "Check EXPO_PUBLIC_RC_ENTITLEMENT_ID against the RevenueCat dashboard.",
    );
  }
  return anyActive;
}

export async function getIsPremium(): Promise<boolean> {
  if (config.devMockPurchases) return mockPremium;
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasPremium(info);
  } catch (error) {
    monitoring.captureError(error, { area: "purchases.getCustomerInfo" });
    return false;
  }
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (config.devMockPurchases) return null;
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    // Fall back to first available offering if current is not explicitly set as default
    return offerings.current ?? Object.values(offerings.all)[0] ?? null;
  } catch (error) {
    console.error("[purchases] getOfferings error:", error);
    monitoring.captureError(error, { area: "purchases.getOfferings" });
    return null;
  }
}


export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseOutcome> {
  if (config.devMockPurchases) {
    mockPremium = true;
    notify(true);
    return { status: "purchased" };
  }
  if (!configured) {
    return {
      status: "error",
      message: "Purchases are not available right now.",
    };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const premium = hasPremium(customerInfo);
    analytics.capture("purchase_completed", {
      package_id: pkg.identifier,
      product_id: pkg.product.identifier,
    });
    notify(premium);
    return premium
      ? { status: "purchased" }
      : {
          status: "error",
          message: "Purchase did not unlock premium. Try Restore Purchases.",
        };
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) {
      analytics.capture("purchase_cancelled", { package_id: pkg.identifier });
      return { status: "cancelled" };
    }
    monitoring.captureError(error, { area: "purchases.purchasePackage" });
    return {
      status: "error",
      message: err.message ?? "Purchase failed. Please try again.",
    };
  }
}

export async function restorePurchases(): Promise<PurchaseOutcome> {
  if (config.devMockPurchases) {
    mockPremium = true;
    notify(true);
    return { status: "purchased" };
  }
  if (!configured) {
    return {
      status: "error",
      message: "Purchases are not available right now.",
    };
  }
  try {
    const info = await Purchases.restorePurchases();
    const premium = hasPremium(info);
    analytics.capture("restore_completed", { premium });
    notify(premium);
    return premium
      ? { status: "purchased" }
      : {
          status: "error",
          message: "No previous purchase was found for this account.",
        };
  } catch (error: unknown) {
    monitoring.captureError(error, { area: "purchases.restore" });
    return { status: "error", message: "Restore failed. Please try again." };
  }
}

export function subscribePremium(listener: PremiumListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(isPremium: boolean) {
  for (const listener of listeners) listener(isPremium);
}

/** Development helper for the dev-only mock. No-op in production. */
export function devResetMockPremium() {
  if (!config.devMockPurchases) return;
  mockPremium = false;
  notify(false);
}
