import {
  trialInfo,
  subscriptionDisclosure,
  ctaLabel,
} from "@/features/paywall/useOffering";
const pkg = {
  identifier: "annual",
  packageType: "ANNUAL",
  product: {
    identifier: "synthetic-annual",
    priceString: "$60",
    introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
  },
} as never;
test("unknown eligibility cannot promise free access", () => {
  expect(trialInfo(pkg)).toBeNull();
  expect(subscriptionDisclosure(pkg)).not.toContain("free");
  expect(ctaLabel(null)).toBe("Continue");
});

test("confirmed eligibility shows the store-provided trial; ineligible stays neutral", () => {
  expect(trialInfo(pkg, "eligible")).toEqual({ label: "3 days", days: 3 });
  expect(trialInfo(pkg, "ineligible")).toBeNull();
});

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {},
  PACKAGE_TYPE: {
    ANNUAL: "ANNUAL",
    MONTHLY: "MONTHLY",
    LIFETIME: "LIFETIME",
    WEEKLY: "WEEKLY",
  },
}));
jest.mock("@/lib/purchases", () => ({
  isAllowedPackage: (p: { packageType: string }) =>
    ["MONTHLY", "ANNUAL"].includes(p.packageType),
  getCurrentOffering: jest.fn(),
}));
