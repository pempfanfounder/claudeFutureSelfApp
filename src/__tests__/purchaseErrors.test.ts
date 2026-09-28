import Purchases from "react-native-purchases";
import { useAppState } from "@/lib/appState";
import { monitoring } from "@/lib/monitoring";
import {
  PURCHASE_PENDING_MESSAGE,
  initPurchases,
  logInPurchases,
  purchaseErrorMessage,
  purchasePackage,
  restorePurchases,
} from "@/lib/purchases";

jest.mock("@/lib/config", () => ({
  config: {
    revenueCatIosKey: "appl_synthetic_fixture",
    rcEntitlementId: "premium",
    devMockPurchases: false,
  },
}));
jest.mock("@/lib/analytics", () => ({ analytics: { capture: jest.fn() } }));
jest.mock("@/lib/monitoring", () => ({
  monitoring: { captureError: jest.fn() },
}));
jest.mock("@/lib/supabase", () => ({
  getSupabase: jest.fn(() => null),
  getIdentitySupabase: jest.fn(async () => null),
}));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: { WEEKLY: "WEEKLY", ANNUAL: "ANNUAL" },
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    logIn: jest.fn(),
    getCustomerInfo: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

const active = { entitlements: { active: { premium: {} } } };
const inactive = { entitlements: { active: {} } };
const annual = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: { identifier: "yearly" },
} as never;

function storeError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error("store"), {
    code,
    userCancelled: false,
    ...extra,
  });
}

beforeAll(async () => {
  useAppState.getState().setUserId("fs-local-errors");
  useAppState.getState().setAnonymous(false);
  await initPurchases("fs-local-errors");
  (Purchases.logIn as jest.Mock).mockResolvedValue({ customerInfo: inactive });
  await logInPurchases("fs-local-errors");
});

beforeEach(() => {
  jest.mocked(Purchases.purchasePackage).mockReset();
  jest.mocked(Purchases.restorePurchases).mockReset();
  jest.mocked(Purchases.getCustomerInfo).mockReset();
  jest.mocked(monitoring.captureError).mockClear();
  jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(inactive as never);
});

test("a store error after StoreKit already charged still unlocks premium", async () => {
  jest.mocked(Purchases.purchasePackage).mockRejectedValue(storeError("16"));
  jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(active as never);
  expect(await purchasePackage(annual)).toEqual({ status: "purchased" });
});

test("an Apple Account that already owns the plan is restored, not rejected", async () => {
  jest.mocked(Purchases.purchasePackage).mockRejectedValue(storeError("6"));
  jest.mocked(Purchases.restorePurchases).mockResolvedValue(active as never);
  expect(await purchasePackage(annual)).toEqual({ status: "purchased" });
  expect(Purchases.restorePurchases).toHaveBeenCalledTimes(1);
});

test("Ask to Buy is reported as pending, not as a failure", async () => {
  jest.mocked(Purchases.purchasePackage).mockRejectedValue(storeError("20"));
  expect(await purchasePackage(annual)).toEqual({
    status: "pending",
    message: PURCHASE_PENDING_MESSAGE,
  });
  expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  expect(monitoring.captureError).not.toHaveBeenCalled();
});

test("a cancelled sheet stays silent", async () => {
  jest
    .mocked(Purchases.purchasePackage)
    .mockRejectedValue(storeError("1", { userCancelled: true }));
  expect(await purchasePackage(annual)).toEqual({ status: "cancelled" });
  expect(monitoring.captureError).not.toHaveBeenCalled();
});

test("a real failure explains itself and reports only the store code", async () => {
  jest.mocked(Purchases.purchasePackage).mockRejectedValue(storeError("2"));
  const result = await purchasePackage(annual);
  expect(result).toEqual({
    status: "error",
    message:
      "The App Store couldn't finish this purchase. Please try again, or use Restore Purchases if you were charged. (code 2)",
  });
  expect(monitoring.captureError).toHaveBeenCalledWith(expect.anything(), {
    area: "purchases.transaction",
    store_code: "2",
  });
});

test("restore failures use restore wording", async () => {
  jest.mocked(Purchases.restorePurchases).mockRejectedValue(storeError("10"));
  const result = await restorePurchases();
  expect(result.status).toBe("error");
  expect(result).toHaveProperty(
    "message",
    "The App Store couldn't be reached. Check your connection and try again. (code 10)",
  );
});

test("error messages cover the common store codes and unknown errors", () => {
  expect(purchaseErrorMessage(storeError("3"))).toMatch(/Screen Time/);
  expect(purchaseErrorMessage(storeError("5"))).toMatch(/isn't available/);
  expect(purchaseErrorMessage(storeError("7"))).toMatch(
    /different Future Self account/,
  );
  expect(purchaseErrorMessage(new Error("boom"))).toBe(
    "Could not complete this purchase or restore. Please try again.",
  );
  expect(purchaseErrorMessage(null)).toBe(
    "Could not complete this purchase or restore. Please try again.",
  );
});
