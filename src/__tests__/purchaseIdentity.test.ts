import Purchases from "react-native-purchases";
import { useAppState } from "@/lib/appState";
import {
  initPurchases,
  logInPurchases,
  purchasePackage,
  restorePurchases,
  subscribePremium,
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
  PACKAGE_TYPE: { MONTHLY: "MONTHLY", ANNUAL: "ANNUAL" },
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

test("a delayed A login cannot publish premium after switching to B", async () => {
  let finishA!: (value: unknown) => void;
  const a = new Promise((resolve) => {
    finishA = resolve;
  });
  (Purchases.logIn as jest.Mock).mockImplementation((id: string) =>
    id === "fs-local-a" ? a : Promise.resolve({ customerInfo: inactive }),
  );
  useAppState.getState().setUserId("fs-local-a");
  await initPurchases("fs-local-a");
  const events: boolean[] = [];
  const unsubscribe = subscribePremium((value) => events.push(value));
  const loginA = logInPurchases("fs-local-a");
  await Promise.resolve();
  useAppState.getState().setUserId("fs-local-b");
  const loginB = logInPurchases("fs-local-b");
  finishA({ customerInfo: active });
  await Promise.all([loginA, loginB]);
  unsubscribe();
  expect(events).not.toContain(true);
});

test("a stale weekly package cannot invoke the store purchase", async () => {
  const result = await purchasePackage({
    identifier: "weekly",
    packageType: "WEEKLY",
    product: { identifier: "synthetic-weekly" },
  } as never);
  expect(result.status).toBe("error");
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

const monthly = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: { identifier: "synthetic-monthly" },
} as never;

test("an anonymous identity cannot invoke the store purchase or restore", async () => {
  useAppState.getState().setUserId("fs-local-guest");
  (Purchases.purchasePackage as jest.Mock).mockClear();
  (Purchases.restorePurchases as jest.Mock).mockClear();
  const purchase = await purchasePackage(monthly);
  const restore = await restorePurchases();
  expect(purchase).toEqual({
    status: "error",
    message:
      "Save this account with Apple, Google, or email before starting a subscription.",
  });
  expect(restore).toEqual({
    status: "error",
    message:
      "Save this account with Apple, Google, or email before starting a subscription.",
  });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(Purchases.restorePurchases).not.toHaveBeenCalled();
});

test("a linked identity can still invoke the store purchase", async () => {
  useAppState.getState().setUserId("fs-local-linked");
  useAppState.getState().setAnonymous(false);
  await initPurchases("fs-local-linked");
  (Purchases.logIn as jest.Mock).mockResolvedValue({
    customerInfo: inactive,
  });
  await logInPurchases("fs-local-linked");
  (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
    customerInfo: active,
  });
  const result = await purchasePackage(monthly);
  expect(result.status).toBe("purchased");
  expect(Purchases.purchasePackage).toHaveBeenCalled();
});
