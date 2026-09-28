import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import { analytics } from "./analytics";
import { assertCurrentIdentity, captureIdentity, isCurrentIdentity, useAppState, type Identity } from "./appState";
import { config } from "./config";
import { monitoring } from "./monitoring";
import { getIdentitySupabase } from "./supabase";
import { createPurchaseQueue } from "./purchaseQueue";
import { describePurchaseError, purchaseDiagnosticArea, type PurchaseIssue } from "./purchaseErrors";

export const PREMIUM_ENTITLEMENT_ID = config.rcEntitlementId;
let configured = false;
let sdkUserId: string | null = null;
const sdkQueue = createPurchaseQueue();
const serial = sdkQueue.run;
export function purchasesNeedRestart() { return sdkQueue.isStalled(); }
const mockPremium = new Map<string, boolean>();
type PremiumListener = (premium: boolean, identity?: Identity) => void;
const listeners = new Set<PremiumListener>();

export function isConfigured() { return configured || config.devMockPurchases; }
export function rejectApiKey(apiKey: string, platform: string = Platform.OS, isDev: boolean = __DEV__): string | null {
  if (apiKey.startsWith("test_") && !isDev) return "RevenueCat Test Store key in a non-development build; use the appl_/goog_ key for this platform.";
  if (platform === "ios" && apiKey.startsWith("goog_")) return "Android (goog_) RevenueCat key configured for iOS.";
  if (platform === "android" && apiKey.startsWith("appl_")) return "iOS (appl_) RevenueCat key configured for Android.";
  return null;
}

export async function initPurchases(appUserId?: string) {
  if (config.devMockPurchases || configured || !appUserId) return;
  const apiKey = Platform.OS === "ios" ? config.revenueCatIosKey : config.revenueCatAndroidKey;
  if (!apiKey) return;
  const rejection = rejectApiKey(apiKey);
  if (rejection) {
    monitoring.captureError(new Error(rejection), { area: "purchases.configure" });
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
  sdkUserId = appUserId;
  // Callbacks are refresh signals, not identity proofs: aliases can share originalAppUserId.
  Purchases.addCustomerInfoUpdateListener(() => schedulePremiumRefresh());
}
let refreshQueued = false;
function schedulePremiumRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  const identity = captureIdentity();
  void getIsPremium()
    .then((premium) => notify(premium, identity))
    .catch((error) => monitoring.captureError(error, { area: "purchases.refresh" }))
    .finally(() => { refreshQueued = false; });
}
export async function logInPurchases(userId: string) {
  const identity = captureIdentity();
  if (identity.userId !== userId) return;
  return serial(async () => {
    if (!isCurrentIdentity(identity)) return;
    await initPurchases(userId);
    if (config.devMockPurchases) { notify(mockPremium.get(userId) ?? false, identity); return; }
    if (!configured) return;
    const { customerInfo } = await Purchases.logIn(userId);
    sdkUserId = userId;
    notify(hasPremium(customerInfo), identity);
  });
}
/** Detach remains serialized with transactions; never publish anonymous replacement entitlements. */
export async function logOutPurchases(identity?: Identity) {
  return serial(async () => {
    if (identity) assertCurrentIdentity(identity);
    if (configured) await Purchases.logOut();
    sdkUserId = null;
  });
}
function hasPremium(info: CustomerInfo): boolean {
  if (info.entitlements.active[PREMIUM_ENTITLEMENT_ID]) return true;
  return Object.keys(info.entitlements.active).length > 0;
}
export async function getIsPremium(): Promise<boolean> {
  const identity = captureIdentity();
  return serial(async () => {
    if (!identity.userId || !isCurrentIdentity(identity)) return false;
    if (config.devMockPurchases) return mockPremium.get(identity.userId) ?? false;
    if (!configured) return false;
    if (sdkUserId !== identity.userId) throw new Error("Purchases are still reconnecting to your account.");
    const info = await Purchases.getCustomerInfo();
    return isCurrentIdentity(identity) && hasPremium(info);
  });
}
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (config.devMockPurchases || !configured) return null;
  const identity = captureIdentity();
  try {
    return await serial(async () => {
      assertCurrentIdentity(identity);
      if (sdkUserId !== identity.userId) throw new Error("Purchases are still reconnecting.");
      const offerings = await Purchases.getOfferings();
      assertCurrentIdentity(identity);
      return offerings.current ?? Object.values(offerings.all)[0] ?? null;
    });
  } catch (error) {
    const issue = describePurchaseError(error, PURCHASES_ERROR_CODE);
    if (issue.status !== "cancelled") monitoring.captureError(error, { area: purchaseDiagnosticArea("offerings", issue.code) });
    throw error;
  }
}
export type PurchaseOutcome =
  | { status: "purchased" }
  | PurchaseIssue
  | { status: "error"; message: string; title?: string };
export const PURCHASE_ACCOUNT_REQUIRED = "Save this account with Apple, Google, or email before starting a subscription.";
export function purchaseRequiresAccount(isAnonymous: boolean): boolean { return isAnonymous === true; }
/** Only weekly and annual plans; store product IDs remain configured in RevenueCat. */
export const ALLOWED_PACKAGE_TYPES = ["WEEKLY", "ANNUAL"] as const;
export type AllowedPackageType = (typeof ALLOWED_PACKAGE_TYPES)[number];
export function isAllowedPackage(pkg: PurchasesPackage): boolean {
  return (ALLOWED_PACKAGE_TYPES as readonly string[]).includes(pkg.packageType);
}
const syncPending = new Map<string, Promise<void>>();
export async function syncEntitlementToServer(identity = captureIdentity()): Promise<void> {
  if (!identity.userId) return;
  const previous = syncPending.get(identity.userId);
  if (previous) return previous;
  const request = (async () => {
    const client = await getIdentitySupabase(identity);
    assertCurrentIdentity(identity);
    if (!client) return;
    const { error } = await client.functions.invoke("sync-entitlement", { body: {} });
    if (error) throw error;
  })();
  syncPending.set(identity.userId, request);
  try { await request; } finally { syncPending.delete(identity.userId); }
}
let transactionRunning = false;
async function transaction(pkg?: PurchasesPackage): Promise<PurchaseOutcome> {
  const identity = captureIdentity();
  if (purchaseRequiresAccount(useAppState.getState().isAnonymous)) return { status: "error", message: PURCHASE_ACCOUNT_REQUIRED };
  if (pkg && !isAllowedPackage(pkg)) return { status: "error", message: "Choose a weekly or yearly plan." };
  if (transactionRunning) return describePurchaseError({ code: "OPERATION_ALREADY_IN_PROGRESS_ERROR" });
  transactionRunning = true;
  const operation = pkg ? "purchase" : "restore";
  try {
    return await serial<PurchaseOutcome>(async () => {
      assertCurrentIdentity(identity);
      if (config.devMockPurchases) {
        mockPremium.set(identity.userId!, true);
        notify(true, identity);
        return { status: "purchased" };
      }
      if (!configured || sdkUserId !== identity.userId) return { status: "error", message: "Purchases are not available right now. Please retry." };
      const info = pkg ? (await Purchases.purchasePackage(pkg)).customerInfo : await Purchases.restorePurchases();
      assertCurrentIdentity(identity);
      const premium = hasPremium(info);
      notify(premium, identity);
      if (premium) {
        void syncEntitlementToServer(identity).catch((error) => monitoring.captureError(error, { area: "purchases.sync" }));
        analytics.capture(pkg ? "purchase_completed" : "restore_completed", { premium });
        return { status: "purchased" };
      }
      if (!pkg) return { status: "error", title: "Restore Purchases", message: "No previous purchase was found for this account." };
      const issue = describePurchaseError({ code: "ENTITLEMENT_NOT_ACTIVE" });
      monitoring.captureError(new Error("Entitlement not active"), { area: purchaseDiagnosticArea(operation, "ENTITLEMENT_NOT_ACTIVE") });
      return issue;
      // No JS deadline for user-mediated StoreKit sheets. Keep the transaction lock
      // until the real native result; never start a second charge on a JS timeout.
    }, null);
  } catch (error) {
    const issue = describePurchaseError(error, PURCHASES_ERROR_CODE);
    if (issue.status === "cancelled") return issue;
    if (issue.status === "error") monitoring.captureError(error, { area: purchaseDiagnosticArea(operation, issue.code) });
    if (!isCurrentIdentity(identity)) return { status: "error", message: "Account changed. Return to your account to check the purchase." };
    return issue;
  } finally { transactionRunning = false; }
}
export async function purchasePackage(pkg: PurchasesPackage) { return transaction(pkg); }
export async function restorePurchases() { return transaction(); }
export function subscribePremium(listener: PremiumListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
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
