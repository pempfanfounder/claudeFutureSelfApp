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
 *
 * Every way this can fail reports a distinct {@link PurchasesFailure}
 * rather than a bare null. A paywall that can only say "the store can't
 * be reached" is undiagnosable from a TestFlight device — the reason and
 * detail here are what actually tell you whether the key is missing, the
 * key is the wrong kind, or the dashboard catalogue is empty.
 */
export const PREMIUM_ENTITLEMENT_ID = config.rcEntitlementId;

/** Distinct, individually actionable ways purchases can be unavailable. */
export type PurchasesFailureReason =
  /** No EXPO_PUBLIC_REVENUECAT_*_KEY reached the build for this platform. */
  | "missing-api-key"
  /** A Test Store key (`test_…`) in a release build, without the opt-in. */
  | "test-key-in-release"
  /** An `appl_` key on Android, or a `goog_` key on iOS. */
  | "key-platform-mismatch"
  /** `Purchases.configure` itself threw. */
  | "configure-failed"
  /** The offerings request failed (network, bad key, unreachable). */
  | "offerings-error"
  /** The RevenueCat project has no offerings at all. */
  | "no-offerings"
  /** Offerings exist but none is marked Current in the dashboard. */
  | "no-current-offering"
  /**
   * An offering exists but carries no packages. Almost always means the
   * store could not resolve the products — the classic cause is a bundle
   * id that differs between the app, RevenueCat, and App Store Connect.
   */
  | "empty-offering";

export interface PurchasesFailure {
  reason: PurchasesFailureReason;
  /** Operator-facing explanation, surfaced on-device outside production. */
  detail: string;
}

/**
 * Customer-safe rendering of a failure.
 *
 * The `detail` strings are written for whoever is configuring the build
 * ("set EXPO_PUBLIC_… in the eas.json profile"), so they are appended only
 * when diagnostics are enabled. A paying customer in production sees the
 * plain fallback and never internal configuration language.
 */
export function describeFailure(
  failure: PurchasesFailure | null,
  fallback: string,
): string {
  if (!failure) return fallback;
  if (!__DEV__ && !config.rcDebugLogs) return fallback;
  return `${fallback}\n\n[${failure.reason}] ${failure.detail}`;
}

export type OfferingResult =
  | { ok: true; offering: PurchasesOffering }
  | { ok: false; failure: PurchasesFailure };

type KeyKind = "none" | "test" | "apple" | "google" | "unknown";

let configured = false;
let mockPremium = false;
let lastFailure: PurchasesFailure | null = null;

type PremiumListener = (isPremium: boolean) => void;
const listeners = new Set<PremiumListener>();

export function isConfigured() {
  return configured || config.devMockPurchases;
}

function fail(
  reason: PurchasesFailureReason,
  detail: string,
): PurchasesFailure {
  lastFailure = { reason, detail };
  // Release builds keep RevenueCat's own logging quiet, so this console
  // line is the one breadcrumb an operator gets from a preview build.
  console.warn(`[purchases] unavailable (${reason}): ${detail}`);
  return lastFailure;
}

function keyKind(apiKey: string | undefined): KeyKind {
  if (!apiKey) return "none";
  if (apiKey.startsWith("test_")) return "test";
  if (apiKey.startsWith("appl_")) return "apple";
  if (apiKey.startsWith("goog_")) return "google";
  return "unknown";
}

/**
 * Snapshot for on-device diagnosis and for tests. Deliberately reports
 * the *kind* of key in play, never the key itself.
 */
export function getPurchasesDiagnostics() {
  const apiKey =
    Platform.OS === "ios"
      ? config.revenueCatIosKey
      : config.revenueCatAndroidKey;
  return {
    configured,
    failure: lastFailure,
    platform: Platform.OS,
    keyKind: keyKind(apiKey),
    entitlementId: PREMIUM_ENTITLEMENT_ID,
    devMock: config.devMockPurchases,
  };
}

export async function initPurchases(appUserId?: string) {
  if (config.devMockPurchases) return;
  if (configured) return;

  const apiKey =
    Platform.OS === "ios"
      ? config.revenueCatIosKey
      : config.revenueCatAndroidKey;
  const kind = keyKind(apiKey);

  if (!apiKey) {
    fail(
      "missing-api-key",
      `No RevenueCat key reached this build for ${Platform.OS}. Set EXPO_PUBLIC_REVENUECAT_${
        Platform.OS === "ios" ? "IOS" : "ANDROID"
      }_KEY in the eas.json build profile you are building.`,
    );
    return;
  }

  // A Test Store key is RevenueCat's own virtual store: it never touches
  // StoreKit, so it cannot transact against a sandbox Apple Account, and
  // RevenueCat forbids shipping one. Refusing here keeps `configured`
  // false and the paywall closed — it never falls back to unlocking.
  if (kind === "test" && !__DEV__ && !config.allowTestStore) {
    fail(
      "test-key-in-release",
      "This build carries a RevenueCat Test Store key (test_…). The Test Store is virtual — it cannot process a sandbox Apple Account purchase. Use the platform key (appl_… / goog_…), or set EXPO_PUBLIC_ALLOW_TEST_STORE=true to test against the Test Store deliberately.",
    );
    return;
  }
  if (kind === "test" && !__DEV__) {
    console.error(
      "[purchases] Running a release build against the RevenueCat Test Store (EXPO_PUBLIC_ALLOW_TEST_STORE=true). Purchases are simulated and have no billing power. Never ship this build.",
    );
  }

  // A key for the wrong platform authenticates against the wrong app and
  // yields a confusingly empty catalogue rather than an auth error.
  const expected = Platform.OS === "ios" ? "apple" : "google";
  if ((kind === "apple" || kind === "google") && kind !== expected) {
    fail(
      "key-platform-mismatch",
      `This ${Platform.OS} build was given a ${
        kind === "apple" ? "appl_" : "goog_"
      } key. iOS needs the appl_ key and Android needs the goog_ key from the same RevenueCat project.`,
    );
    return;
  }

  Purchases.setLogLevel(
    __DEV__ || config.rcDebugLogs ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR,
  );
  try {
    Purchases.configure({ apiKey, appUserID: appUserId ?? null });
    configured = true;
    lastFailure = null;
    Purchases.addCustomerInfoUpdateListener((info) => {
      notify(hasPremium(info));
    });
  } catch (error) {
    fail(
      "configure-failed",
      error instanceof Error ? error.message : String(error),
    );
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

/**
 * Resolves the offering to sell.
 *
 * Deliberately does NOT fall back to an arbitrary offering when none is
 * marked Current: `offerings.all` is an unordered map, so picking from
 * it can quietly sell a stale or experimental price. A dashboard with no
 * Current offering is a misconfiguration and is reported as one.
 */
export async function getCurrentOffering(): Promise<OfferingResult> {
  if (!configured) {
    return {
      ok: false,
      failure: lastFailure ?? {
        reason: "missing-api-key",
        detail: "RevenueCat was never configured.",
      },
    };
  }
  try {
    const offerings = await Purchases.getOfferings();
    const all = offerings.all ?? {};
    const current = offerings.current ?? null;

    if (!current) {
      const ids = Object.keys(all);
      if (ids.length === 0) {
        return {
          ok: false,
          failure: fail(
            "no-offerings",
            "RevenueCat returned no offerings for this app. Create an Offering in the dashboard and attach your products to it.",
          ),
        };
      }
      return {
        ok: false,
        failure: fail(
          "no-current-offering",
          `RevenueCat has offerings (${ids.join(", ")}) but none is marked Current. Set one as Current in the dashboard.`,
        ),
      };
    }

    if (current.availablePackages.length === 0) {
      return {
        ok: false,
        failure: fail(
          "empty-offering",
          `Offering "${current.identifier}" has no available packages. The store could not resolve its products — check that the bundle id matches across the app, RevenueCat, and App Store Connect, that the products are Ready to Submit, and that the Paid Applications agreement is active.`,
        ),
      };
    }

    lastFailure = null;
    return { ok: true, offering: current };
  } catch (error) {
    monitoring.captureError(error, { area: "purchases.getOfferings" });
    return {
      ok: false,
      failure: fail(
        "offerings-error",
        error instanceof Error ? error.message : String(error),
      ),
    };
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
      message: describeFailure(
        lastFailure,
        "Purchases are not available right now.",
      ),
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
      message: describeFailure(
        lastFailure,
        "Purchases are not available right now.",
      ),
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
