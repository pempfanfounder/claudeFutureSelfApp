// A finite vocabulary: never put SDK messages, receipts, account IDs or tokens in logs.
export const PURCHASE_ERROR_CODES = [
  "UNKNOWN_ERROR", "PURCHASE_CANCELLED_ERROR", "STORE_PROBLEM_ERROR",
  "PURCHASE_NOT_ALLOWED_ERROR", "PURCHASE_INVALID_ERROR",
  "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR", "PRODUCT_ALREADY_PURCHASED_ERROR",
  "RECEIPT_ALREADY_IN_USE_ERROR", "INVALID_RECEIPT_ERROR", "MISSING_RECEIPT_FILE_ERROR",
  "NETWORK_ERROR", "INVALID_CREDENTIALS_ERROR", "OPERATION_ALREADY_IN_PROGRESS_ERROR",
  "CONFIGURATION_ERROR", "INSUFFICIENT_PERMISSIONS_ERROR", "PAYMENT_PENDING_ERROR",
  "INVALID_APPLE_SUBSCRIPTION_KEY_ERROR", "OFFLINE_CONNECTION_ERROR",
  "ENTITLEMENT_NOT_ACTIVE", "NATIVE_REQUEST_TIMED_OUT",
] as const;
export type PurchaseErrorCode = (typeof PURCHASE_ERROR_CODES)[number];
export type PurchaseOperation = "purchase" | "restore" | "offerings";
export type PurchaseIssue =
  | { status: "cancelled" }
  | { status: "pending" | "error"; code: PurchaseErrorCode; title: string; message: string };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
function knownCode(value: unknown): PurchaseErrorCode | null {
  return typeof value === "string" && (PURCHASE_ERROR_CODES as readonly string[]).includes(value)
    ? value as PurchaseErrorCode : null;
}

/** Resolve numeric/string bridge codes using the INSTALLED SDK enum, not guessed numbers. */
export function purchaseErrorCode(
  error: unknown,
  sdkCodes: Readonly<Record<string, string | number>> = {},
): PurchaseErrorCode {
  const input = record(error);
  if (input.userCancelled === true) return "PURCHASE_CANCELLED_ERROR";
  if (input.name === "PurchaseQueueTimeoutError") return "NATIVE_REQUEST_TIMED_OUT";
  if (typeof input.code === "string" || typeof input.code === "number") {
    const entry = Object.entries(sdkCodes).find(([name, value]) =>
      knownCode(name) !== null && String(value) === String(input.code));
    if (entry) return entry[0] as PurchaseErrorCode;
    const direct = knownCode(input.code);
    if (direct) return direct;
  }
  const info = record(input.userInfo);
  for (const value of [input.readableErrorCode, info.readableErrorCode, info.rc_code_name]) {
    const code = knownCode(value) ?? (typeof value === "string" ? knownCode(`${value}_ERROR`) : null);
    if (code) return code;
  }
  return "UNKNOWN_ERROR";
}

export function describePurchaseError(error: unknown, sdkCodes?: Readonly<Record<string, string | number>>): PurchaseIssue {
  const code = purchaseErrorCode(error, sdkCodes);
  if (code === "PURCHASE_CANCELLED_ERROR") return { status: "cancelled" };
  if (code === "PAYMENT_PENDING_ERROR") {
    return { status: "pending", code, title: "Purchase pending", message: "Your purchase is awaiting approval or payment confirmation. Follow the store's instructions. Access will unlock after the store confirms the purchase." };
  }
  let title = "Purchase could not be completed";
  let message = "The store could not confirm the result. Check your subscriptions and use Restore Purchases before trying to buy again.";
  switch (code) {
    case "INVALID_CREDENTIALS_ERROR":
    case "CONFIGURATION_ERROR":
    case "INVALID_APPLE_SUBSCRIPTION_KEY_ERROR":
      title = "Subscriptions unavailable";
      message = "The subscription service is not configured correctly. Please contact support with the reference below.";
      break;
    case "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR":
      title = "Plan unavailable";
      message = "This plan is not available from the store for your account or region. Please contact support with the reference below.";
      break;
    case "PURCHASE_NOT_ALLOWED_ERROR":
    case "INSUFFICIENT_PERMISSIONS_ERROR":
      title = "Purchases not allowed";
      message = "Check that in-app purchases are permitted on this device and that you are signed in to your store account.";
      break;
    case "PURCHASE_INVALID_ERROR":
      message = "The store could not accept this purchase. Check your store account and payment settings.";
      break;
    case "NETWORK_ERROR":
    case "OFFLINE_CONNECTION_ERROR":
      title = "Connection problem";
      message = "Check your internet connection. If you already approved a purchase, use Restore Purchases before attempting another payment.";
      break;
    case "STORE_PROBLEM_ERROR":
      title = "Store confirmation unavailable";
      break;
    case "PRODUCT_ALREADY_PURCHASED_ERROR":
      title = "Subscription already purchased";
      message = "Use Restore Purchases to restore access to your existing subscription.";
      break;
    case "RECEIPT_ALREADY_IN_USE_ERROR":
      title = "Subscription linked to another account";
      message = "Sign in to the Future Self account previously used for this subscription, then use Restore Purchases.";
      break;
    case "INVALID_RECEIPT_ERROR":
    case "MISSING_RECEIPT_FILE_ERROR":
    case "ENTITLEMENT_NOT_ACTIVE":
      title = "Subscription could not be verified";
      message = "Use Restore Purchases to check your subscription. If access is still missing, contact support with the reference below. Do not purchase again to resolve this.";
      break;
    case "OPERATION_ALREADY_IN_PROGRESS_ERROR":
      title = "Purchase in progress";
      message = "Please wait for the current purchase or restore to finish.";
      break;
    case "NATIVE_REQUEST_TIMED_OUT":
      title = "Store still responding";
      message = "The previous store request has not finished. Restart the app, then use Restore Purchases to check the outcome.";
      break;
  }
  return { status: "error", code, title, message: `${message}\n\nReference: ${code}` };
}

export function purchaseDiagnosticArea(operation: PurchaseOperation, code: PurchaseErrorCode): string {
  return `purchases.${operation}.${code}`;
}
export function isPurchaseDiagnosticArea(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^purchases\.(purchase|restore|offerings)\.([A-Z_]+)$/.exec(value);
  return !!match && knownCode(match[2]) !== null;
}
