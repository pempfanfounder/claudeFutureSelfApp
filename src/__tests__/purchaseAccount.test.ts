import { useAppState } from "@/lib/appState";
import {
  getIsPremium,
  isAllowedPackage,
  purchasePackage,
  purchaseRequiresAccount,
  restorePurchases,
} from "@/lib/purchases";

jest.mock("@/lib/config", () => ({
  config: {
    revenueCatIosKey: "appl_synthetic_fixture",
    rcEntitlementId: "premium",
    devMockPurchases: true,
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
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

const weekly = {
  identifier: "$rc_weekly",
  packageType: "WEEKLY",
  product: { identifier: "weekly", priceString: "$6.99" },
} as never;
const monthly = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: { identifier: "monthly", priceString: "$9.99" },
} as never;

const ACCOUNT_GATE =
  "Save this account with Apple, Google, or email before starting a subscription.";

beforeEach(() => {
  useAppState.getState().setUserId(null);
  useAppState.getState().setUserId("fs-local-guest");
});

test("purchaseRequiresAccount is true only for anonymous identities", () => {
  expect(purchaseRequiresAccount(true)).toBe(true);
  expect(purchaseRequiresAccount(false)).toBe(false);
});

test("an anonymous identity cannot mock-purchase premium", async () => {
  const result = await purchasePackage(weekly);
  expect(result).toEqual({ status: "error", message: ACCOUNT_GATE });
  expect(await getIsPremium()).toBe(false);
});

test("an anonymous identity cannot restore a receipt onto a guest", async () => {
  const result = await restorePurchases();
  expect(result).toEqual({ status: "error", message: ACCOUNT_GATE });
  expect(await getIsPremium()).toBe(false);
});

test("a linked identity can still mock-purchase premium", async () => {
  useAppState.getState().setAnonymous(false);
  const result = await purchasePackage(weekly);
  expect(result.status).toBe("purchased");
  expect(await getIsPremium()).toBe(true);
});

test("only weekly and yearly packages can be bought (no monthly, no lifetime)", async () => {
  useAppState.getState().setUserId("fs-local-plan-guard");
  useAppState.getState().setAnonymous(false);
  expect(isAllowedPackage(weekly)).toBe(true);
  expect(isAllowedPackage(monthly)).toBe(false);
  expect(
    isAllowedPackage({ packageType: "LIFETIME", product: {} } as never),
  ).toBe(false);
  const result = await purchasePackage(monthly);
  expect(result).toEqual({
    status: "error",
    message: "Choose a weekly or yearly plan.",
  });
  expect(await getIsPremium()).toBe(false);
});

test("a linked identity can still mock-restore premium", async () => {
  useAppState.getState().setUserId("fs-local-linked");
  useAppState.getState().setAnonymous(false);
  const result = await restorePurchases();
  expect(result.status).toBe("purchased");
  expect(await getIsPremium()).toBe(true);
});
