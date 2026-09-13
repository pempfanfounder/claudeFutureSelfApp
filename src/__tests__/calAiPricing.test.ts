import type { PurchasesPackage } from "react-native-purchases";

import {
  billingLabel,
  formatLikePriceString,
  perWeekLabel,
  planTitle,
  savingsPercent,
  splitPlans,
} from "@/features/paywall/calai/pricing";
import { paywallPreviewNotifications } from "@/features/paywall/calai/previewQuotes";
import {
  PAYWALL_VARIANT,
  calAiVersion,
} from "@/features/paywall/paywallVariant";
import { LOCAL_CATALOG } from "@/features/content/localCatalog";

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
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
    LIFETIME: "LIFETIME",
  },
}));

function pkg(
  packageType: string,
  price: number,
  priceString: string,
): PurchasesPackage {
  return {
    identifier: `$rc_${packageType.toLowerCase()}`,
    packageType,
    product: {
      identifier: `product_${packageType.toLowerCase()}`,
      price,
      priceString,
      introPrice: null,
    },
  } as unknown as PurchasesPackage;
}

const annual = pkg("ANNUAL", 35.99, "$35.99");
const weekly = pkg("WEEKLY", 6.99, "$6.99");
const monthly = pkg("MONTHLY", 9.99, "$9.99");

describe("formatLikePriceString", () => {
  it("keeps the store's symbol, spacing and separators", () => {
    expect(formatLikePriceString("$59.99", 5)).toBe("$5.00");
    expect(formatLikePriceString("€ 34,99", 34.99 / 12)).toBe("€ 2,92");
    expect(formatLikePriceString("59,99 zł", 4.9992)).toBe("5,00 zł");
    expect(formatLikePriceString("¥6,000", 500)).toBe("¥500");
    expect(formatLikePriceString("¥1,200", 100)).toBe("¥100");
    expect(formatLikePriceString("$1,199.99", 1199.99 / 12)).toBe("$100.00");
    expect(formatLikePriceString("1.199,99 €", 1199.99 / 12)).toBe("100,00 €");
    expect(formatLikePriceString("$5", 5 / 12)).toBe("$0");
  });

  it("returns null when the string has no number", () => {
    expect(formatLikePriceString("Free", 1)).toBeNull();
  });
});

describe("plan maths from real prices", () => {
  it("splits the offering into the two sold plans and ignores the rest", () => {
    expect(splitPlans([monthly, weekly, annual])).toEqual({ annual, weekly });
    expect(splitPlans([monthly])).toEqual({ annual: null, weekly: null });
  });

  it("computes the saving of yearly against 52 weeks", () => {
    // 35.99 vs 52 × 6.99 = 363.48 → 90%
    expect(savingsPercent(splitPlans([annual, weekly]))).toBe(90);
    expect(
      savingsPercent(
        splitPlans([
          pkg("ANNUAL", 34.99, "€ 34,99"),
          pkg("WEEKLY", 1.99, "€ 1,99"),
        ]),
      ),
    ).toBe(66);
  });

  it("hides the saving when yearly is not cheaper or a plan is missing", () => {
    expect(savingsPercent(splitPlans([annual]))).toBeNull();
    expect(savingsPercent(splitPlans([weekly]))).toBeNull();
    expect(
      savingsPercent(splitPlans([pkg("ANNUAL", 400, "$400.00"), weekly])),
    ).toBeNull();
    // A monthly package is not sold, so it never feeds the saving.
    expect(savingsPercent(splitPlans([annual, monthly]))).toBeNull();
  });

  it("derives a per-week figure for both plans", () => {
    expect(perWeekLabel(annual)).toBe("$0.69/wk");
    expect(perWeekLabel(weekly)).toBe("$6.99/wk");
    expect(perWeekLabel(pkg("ANNUAL", 34.99, "€ 34,99"))).toBe("€ 0,67/wk");
    expect(perWeekLabel(monthly)).toBeNull();
    expect(perWeekLabel(pkg("LIFETIME", 99, "$99.00"))).toBeNull();
  });

  it("labels the billing cadence and the plan", () => {
    expect(billingLabel(annual)).toBe("$35.99 billed yearly");
    expect(billingLabel(weekly)).toBe("$6.99 billed weekly");
    expect(planTitle(annual)).toBe("Yearly");
    expect(planTitle(weekly)).toBe("Weekly");
  });
});

describe("preview notifications", () => {
  it("shows three real catalog lines, newest first", () => {
    const items = paywallPreviewNotifications();
    expect(items).toHaveLength(3);
    expect(items[0]!.time).toBe("Now");
    for (const item of items) {
      expect(LOCAL_CATALOG.some((c) => c.body === item.body)).toBe(true);
    }
  });
});

describe("PAYWALL_VARIANT switch", () => {
  it("defaults to the calai-1 layout", () => {
    expect(PAYWALL_VARIANT).toBe("calai-1");
    expect(calAiVersion()).toBe(1);
  });

  it("maps every variant to a layout or the legacy paywalls", () => {
    expect(calAiVersion("calai-1")).toBe(1);
    expect(calAiVersion("calai-2")).toBe(2);
    expect(calAiVersion("calai-3")).toBe(3);
    expect(calAiVersion("calai-4")).toBe(4);
    expect(calAiVersion("legacy")).toBeNull();
  });
});
