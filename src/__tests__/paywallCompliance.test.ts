import type { PurchasesPackage } from "react-native-purchases";

import { compactDisclosure } from "@/features/paywall/calai/pricing";
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
    const text = subscriptionDisclosure(pkg, "eligible");
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

describe("compactDisclosure (Cal AI paywalls)", () => {
  it("returns null without a package", () => {
    expect(compactDisclosure(null)).toBeNull();
  });

  it("states the trial, price and period plus renewal terms in one line", () => {
    const pkg = fakePackage({
      packageType: "ANNUAL",
      priceString: "$59.99",
      introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
    });
    expect(compactDisclosure(pkg, "eligible")).toBe(
      "3 days free, then $59.99 per year. Renews automatically unless cancelled in the App Store.",
    );
  });

  it("never promises a trial the store has not granted", () => {
    const withIntro = fakePackage({
      packageType: "ANNUAL",
      priceString: "$59.99",
      introPrice: { price: 0, periodUnit: "DAY", periodNumberOfUnits: 3 },
    });
    expect(compactDisclosure(withIntro, "ineligible")).toBe(
      "$59.99 per year. Renews automatically unless cancelled in the App Store.",
    );
    expect(compactDisclosure(withIntro, "unknown")).toMatch(
      /^\$59\.99 per year\./,
    );
    const monthly = fakePackage({
      packageType: "MONTHLY",
      priceString: "$9.99",
    });
    expect(compactDisclosure(monthly)).toBe(
      "$9.99 per month. Renews automatically unless cancelled in the App Store.",
    );
  });

  it("keeps the price and period visible for every allowed plan", () => {
    for (const [packageType, period] of [
      ["ANNUAL", "year"],
      ["MONTHLY", "month"],
    ] as const) {
      const text = compactDisclosure(
        fakePackage({ packageType, priceString: "€ 4,99" }),
      );
      expect(text).toContain(`€ 4,99 per ${period}`);
      expect(text).toContain("Renews automatically");
    }
  });
});

describe("ctaLabel", () => {
  it("names the trial length from the store, hyphenated", () => {
    expect(ctaLabel("3 days")).toBe("Start your 3-day free trial");
    expect(ctaLabel("1 week")).toBe("Start your 1-week free trial");
    expect(ctaLabel("2 months")).toBe("Start your 2-month free trial");
  });

  it("keeps unrecognized trial labels verbatim", () => {
    expect(ctaLabel("a while")).toBe("Start your a while free trial");
  });

  it("does not promise a trial when the length is unknown", () => {
    expect(ctaLabel(null)).toBe("Continue");
  });
});
