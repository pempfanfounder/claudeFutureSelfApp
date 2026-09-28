import { describePurchaseError, isPurchaseDiagnosticArea, purchaseErrorCode } from "../lib/purchaseErrors";
import { scrubCrashEvent } from "../lib/diagnosticPolicy";

// Deliberately arbitrary values: production passes the installed SDK enum.
const codes = { PURCHASE_CANCELLED_ERROR: "101", PAYMENT_PENDING_ERROR: "202", CONFIGURATION_ERROR: "303" };

it("resolves numeric and string SDK codes and the cancellation flag", () => {
  expect(describePurchaseError({ code: 101 }, codes)).toEqual({ status: "cancelled" });
  expect(describePurchaseError({ code: "101" }, codes)).toEqual({ status: "cancelled" });
  expect(describePurchaseError({ userCancelled: true })).toEqual({ status: "cancelled" });
});
it("does not describe pending approval as a failed payment", () => {
  expect(describePurchaseError({ code: "202" }, codes)).toMatchObject({ status: "pending", title: "Purchase pending" });
});
it("retains safe actionable codes, never SDK free text", () => {
  const result = describePurchaseError({ code: 303, message: "secret-receipt", userInfo: { token: "private-token" } }, codes);
  expect(result).toMatchObject({ status: "error", code: "CONFIGURATION_ERROR", title: "Subscriptions unavailable" });
  expect(JSON.stringify(result)).not.toMatch(/secret-receipt|private-token/);
  expect(purchaseErrorCode({ userInfo: { rc_code_name: "NETWORK_ERROR" } })).toBe("NETWORK_ERROR");
  expect(purchaseErrorCode({ userInfo: { readableErrorCode: "INVALID_RECEIPT" } })).toBe("INVALID_RECEIPT_ERROR");
});
it("allowlists purchase diagnostic areas through the privacy scrubber", () => {
  expect(isPurchaseDiagnosticArea("purchases.purchase.CONFIGURATION_ERROR")).toBe(true);
  expect(isPurchaseDiagnosticArea("purchases.purchase.secret-receipt")).toBe(false);
  const event = scrubCrashEvent({ tags: { area: "purchases.purchase.CONFIGURATION_ERROR" }, extra: { receipt: "secret-receipt" } });
  expect(event.tags.area).toBe("purchases.purchase.CONFIGURATION_ERROR");
  expect(JSON.stringify(event)).not.toContain("secret-receipt");
  expect(scrubCrashEvent({ tags: { area: "purchases.purchase.secret-receipt" } }).tags.area).toBe("app.unknown");
});
it("does not claim a store problem proves the user was not charged", () => {
  const result = describePurchaseError({ readableErrorCode: "STORE_PROBLEM" });
  expect(result).toMatchObject({ status: "error", code: "STORE_PROBLEM_ERROR" });
  if (result.status !== "cancelled") expect(result.message).toContain("Restore Purchases");
});
