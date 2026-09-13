import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import { analytics } from "./analytics";
import {
  assertCurrentIdentity,
  captureIdentity,
  isCurrentIdentity,
  useAppState,
  type Identity,
} from "./appState";
import { config } from "./config";
import { monitoring } from "./monitoring";
import { getIdentitySupabase } from "./supabase";

export const PREMIUM_ENTITLEMENT_ID = config.rcEntitlementId;
let configured = false;
let sdkUserId: string | null = null;
let sdkQueue: Promise<unknown> = Promise.resolve();
let sdkStalled = false;
export function purchasesNeedRestart() {
  return sdkStalled;
}
const mockPremium = new Map<string, boolean>();
type PremiumListener = (premium: boolean, identity?: Identity) => void;
const listeners = new Set<PremiumListener>();
function serial<T>(work: () => Promise<T>, timeoutMs = 10_000): Promise<T> {
  if (sdkStalled)
    return Promise.reject(
      new Error(
        "The purchase service has not finished. Restart the app to reconnect safely.",
      ),
    );
  const result = sdkQueue.then(work, work);
  sdkQueue = result.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      sdkStalled = true;
      reject(
        new Error(
          "The purchase service has not finished. Restart the app to reconnect safely.",
        ),
      );
    }, timeoutMs);
  });
  void result
    .finally(() => {
      clearTimeout(timer);
      sdkStalled = false;
    })
    .catch(() => {});
  return Promise.race([result, timeout]);
}

export function isConfigured() {
  return configured || config.devMockPurchases;
}
export function rejectApiKey(
  apiKey: string,
  platform: string = Platform.OS,
  isDev: boolean = __DEV__,
): string | null {
  if (apiKey.startsWith("test_") && !isDev) {
    return "RevenueCat Test Store key in a non-development build; use the appl_/goog_ key for this platform.";
  }
  if (platform === "ios" && apiKey.startsWith("goog_")) {
    return "Android (goog_) RevenueCat key configured for iOS.";
  }
  if (platform === "android" && apiKey.startsWith("appl_")) {
    return "iOS (appl_) RevenueCat key configured for Android.";
  }
  return null;
}

export async function initPurchases(appUserId?: string) {
  if (config.devMockPurchases || configured || !appUserId) return;
  const apiKey =
    Platform.OS === "ios"
      ? config.revenueCatIosKey
      : config.revenueCatAndroidKey;
  if (!apiKey) return;
  const rejection = rejectApiKey(apiKey);
  if (rejection) {
    monitoring.captureError(new Error(rejection), {
      area: "purchases.configure",
    });
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
  sdkUserId = appUserId;
  // Untagged SDK callbacks are refresh signals; aliases make originalAppUserId
  // unsuitable as an identity proof. Read again after queued identity work.
  Purchases.addCustomerInfoUpdateListener(() => schedulePremiumRefresh());
}
let refreshQueued = false;
function schedulePremiumRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  const identity = captureIdentity();
  void getIsPremium()
    .then((premium) => notify(premium, identity))
    .catch((error) =>
      monitoring.captureError(error, { area: "purchases.refresh" }),
    )
    .finally(() => {
      refreshQueued = false;
    });
}
export async function logInPurchases(userId: string) {
  const identity = captureIdentity();
  if (identity.userId !== userId) return;
  return serial(async () => {
    if (!isCurrentIdentity(identity)) return;
    await initPurchases(userId);
    if (config.devMockPurchases) {
      notify(mockPremium.get(userId) ?? false, identity);
      return;
    }
    if (!configured) return;
    const { customerInfo } = await Purchases.logIn(userId);
    sdkUserId = userId;
    notify(hasPremium(customerInfo), identity);
  });
}
/** Detach is serialized with every transaction. Do not publish the SDK's
 * replacement anonymous customer's entitlement into any app account. */
export async function logOutPurchases(identity?: Identity) {
  return serial(async () => {
    if (identity) assertCurrentIdentity(identity);
    if (configured) await Purchases.logOut();
    sdkUserId = null;
  });
}
function hasPremium(info: CustomerInfo): boolean {
  if (info.entitlements.active[PREMIUM_ENTITLEMENT_ID]) return true;
  const anyActive = Object.keys(info.entitlements.active).length > 0;
  return anyActive;
}

export async function getIsPremium(): Promise<boolean> {
  const identity = captureIdentity();
  return serial(async () => {
    if (!identity.userId || !isCurrentIdentity(identity)) return false;
    if (config.devMockPurchases)
      return mockPremium.get(identity.userId) ?? false;
    if (!configured) return false;
    if (sdkUserId !== identity.userId)
      throw new Error("Purchases are still reconnecting to your account.");
    const info = await Purchases.getCustomerInfo();
    return isCurrentIdentity(identity) && hasPremium(info);
  });
}
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (config.devMockPurchases || !configured) return null;
  const identity = captureIdentity();
  return serial(async () => {
    assertCurrentIdentity(identity);
    if (sdkUserId !== identity.userId)
      throw new Error("Purchases are still reconnecting.");
    const offerings = await Purchases.getOfferings();
    assertCurrentIdentity(identity);
    return offerings.current ?? Object.values(offerings.all)[0] ?? null;
  });
}
export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "error"; message: string };
export const PURCHASE_ACCOUNT_REQUIRED =
  "Save this account with Apple, Google, or email before starting a subscription.";
export function purchaseRequiresAccount(isAnonymous: boolean): boolean {
  return isAnonymous === true;
}
/**
 * The app sells exactly two plans: WEEKLY and ANNUAL (owner decision,
 * 2026-09-13; no monthly, no lifetime). Matching is by RevenueCat package
 * type, so the App Store Connect / Play product identifiers behind
 * `$rc_weekly` and `$rc_annual` stay configurable in the RevenueCat
 * dashboard (see docs/SETUP_REQUIRED.md § 2).
 */
export const ALLOWED_PACKAGE_TYPES = ["WEEKLY", "ANNUAL"] as const;
export type AllowedPackageType = (typeof ALLOWED_PACKAGE_TYPES)[number];
export function isAllowedPackage(pkg: PurchasesPackage): boolean {
  return (ALLOWED_PACKAGE_TYPES as readonly string[]).includes(pkg.packageType);
}
const syncPending = new Map<string, Promise<void>>();
export async function syncEntitlementToServer(
  identity = captureIdentity(),
): Promise<void> {
  if (!identity.userId) return;
  const previous = syncPending.get(identity.userId);
  if (previous) return previous;
  const request = (async () => {
    const client = await getIdentitySupabase(identity);
    assertCurrentIdentity(identity);
    if (!client) return;
    const { error } = await client.functions.invoke("sync-entitlement", {
      body: {},
    });
    if (error) throw error;
  })();
  syncPending.set(identity.userId, request);
  try {
    await request;
  } finally {
    syncPending.delete(identity.userId);
  }
}
let transactionRunning = false;
async function transaction(pkg?: PurchasesPackage): Promise<PurchaseOutcome> {
  const identity = captureIdentity();
  if (purchaseRequiresAccount(useAppState.getState().isAnonymous))
    return { status: "error", message: PURCHASE_ACCOUNT_REQUIRED };
  if (pkg && !isAllowedPackage(pkg))
    return { status: "error", message: "Choose a weekly or yearly plan." };
  if (transactionRunning)
    return {
      status: "error",
      message: "A purchase or restore is already in progress.",
    };
  transactionRunning = true;
  try {
    return await serial(async () => {
      assertCurrentIdentity(identity);
      if (config.devMockPurchases) {
        mockPremium.set(identity.userId!, true);
        notify(true, identity);
        return { status: "purchased" };
      }
      if (!configured || sdkUserId !== identity.userId)
        return {
          status: "error",
          message: "Purchases are not available right now. Please retry.",
        };
      const info = pkg
        ? (await Purchases.purchasePackage(pkg)).customerInfo
        : await Purchases.restorePurchases();
      assertCurrentIdentity(identity);
      const premium = hasPremium(info);
      notify(premium, identity);
      if (premium) {
        void syncEntitlementToServer(identity).catch((error) =>
          monitoring.captureError(error, { area: "purchases.sync" }),
        );
        analytics.capture(pkg ? "purchase_completed" : "restore_completed", {
          premium,
        });
        return { status: "purchased" };
      }
      return {
        status: "error",
        message: pkg
          ? "Purchase did not unlock premium. Try Restore Purchases."
          : "No previous purchase was found for this account.",
      };
    }, 180_000);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled)
      return { status: "cancelled" };
    monitoring.captureError(error, { area: "purchases.transaction" });
    return {
      status: "error",
      message: sdkStalled
        ? "The purchase service has not finished. Restart the app, then use Restore Purchases to check the outcome."
        : isCurrentIdentity(identity)
          ? "Could not complete this purchase or restore. Please try again."
          : "Account changed. Return to your account to check the purchase.",
    };
  } finally {
    transactionRunning = false;
  }
}
export async function purchasePackage(pkg: PurchasesPackage) {
  return transaction(pkg);
}
export async function restorePurchases() {
  return transaction();
}
export function subscribePremium(listener: PremiumListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify(premium: boolean, identity: Identity) {
  if (!identity.userId || !isCurrentIdentity(identity)) return;
  useAppState.getState().setPremium(premium);
  for (const listener of listeners) listener(premium, identity);
}
export function devResetMockPremium() {
  const identity = captureIdentity();
  if (!config.devMockPurchases || !identity.userId) return;
  mockPremium.delete(identity.userId);
  notify(false, identity);
}
