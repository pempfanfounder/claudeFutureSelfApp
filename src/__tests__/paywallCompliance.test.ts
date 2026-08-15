import type { PurchasesPackage } from "react-native-purchases";

import {
  ctaLabel,
  subscriptionDisclosure,
} from "@/features/paywall/useOffering";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", ERROR: "ERROR" },
  PACKAGE_TYPE: {
    ANNUAL: "ANNUAL",
    MONTHLY: "MONTHLY",
    WEEKLY: "WEEKLY",
    LIFETIME: "LIFETIME",
  },
}));

interface FakeIntroPrice {
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
}

function fakePackage(opts: {
  packageType: string;
  priceString: string;
  introPrice?: FakeIntroPrice | null;
}): PurchasesPackage {
  return {
    identifier: `$rc_${opts.packageType.toLowerCase()}`,
    packageType: opts.packageType,
    product: {
      identifier: `product_${opts.packageType.toLowerCase()}`,
      priceString: opts.priceString,
      introPrice: opts.introPrice ?? null,
    },
  } as unknown as PurchasesPackage;
}

describe("subscriptionDisclosure", () => {
  it("returns null without a package", () => {
    expect(subscriptionDisclosure(null)).toBeNull();
  });

  it("spells out auto-renewal for an annual package with a trial", () => {
    const pkg = fakePackage({
      packageType: "ANNUAL",
      priceString: "$59.99",
      introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
    });
    const text = subscriptionDisclosure(pkg);
    expect(text).not.toBeNull();
    expect(text).toContain("3 days free, then $59.99 per year.");
    expect(text).toContain("renews automatically");
    expect(text).toContain("cancelled at least 24 hours");
    expect(text).toContain("Manage or cancel anytime in App Store settings.");
  });

  it("omits the trial lead when there is no free intro", () => {
    const pkg = fakePackage({ packageType: "MONTHLY", priceString: "$9.99" });
    const text = subscriptionDisclosure(pkg);
    expect(text).toMatch(/^\$9\.99 per month\./);
    expect(text).toContain("renews automatically");
  });

  it("describes a lifetime package as a one-time purchase", () => {
    const pkg = fakePackage({
      packageType: "LIFETIME",
      priceString: "$99.99",
    });
    const text = subscriptionDisclosure(pkg);
    expect(text).toContain("One-time");
    expect(text).toContain("$99.99");
    expect(text).not.toContain("renews automatically");
  });
});

describe("ctaLabel", () => {
  it("names the trial length from the store", () => {
    expect(ctaLabel("3 days")).toBe("Start 3 days free trial");
  });

  it("falls back to a generic trial label when the length is unknown", () => {
    expect(ctaLabel(null)).toBe("Start free trial");
  });
});
