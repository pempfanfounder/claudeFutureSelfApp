import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";

import { periodLabel, trialInfo, type TrialEligibility } from "../useOffering";

/** Annual and monthly packages picked out of the approved offering. */
export interface PlanPair {
  annual: PurchasesPackage | null;
  monthly: PurchasesPackage | null;
}

export function splitPlans(packages: PurchasesPackage[]): PlanPair {
  return {
    annual: packages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null,
    monthly:
      packages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ?? null,
  };
}

/**
 * Rewrites the numeric part of a store price string with a new amount so
 * the derived figure keeps the store's own currency symbol, spacing and
 * decimal separator ("€ 34,99" → "€ 2,91", "$59.99" → "$5.00").
 * Returns null when the string has no recognisable number.
 */
export function formatLikePriceString(
  priceString: string,
  amount: number,
): string | null {
  const match = /(\d[\d.,\s]*\d|\d)/.exec(priceString);
  if (!match || !Number.isFinite(amount)) return null;
  const numeric = match[0];
  const separators = [...numeric.matchAll(/[.,]/g)];
  const last = separators[separators.length - 1];
  // The final separator is a decimal mark unless it is followed by a
  // three-digit group in a run of identical separators ("¥6,000").
  const tail = last ? numeric.slice(last.index + 1).replace(/\s/g, "") : "";
  const isDecimal =
    last !== undefined &&
    (tail.length !== 3 || separators.some((s) => s[0] !== last[0]));
  const decimal = isDecimal ? last[0] : null;
  const decimals = decimal ? tail.length : 0;
  const grouping = decimal ? (decimal === "," ? "." : ",") : (last?.[0] ?? ",");
  const [whole, fraction] = amount.toFixed(decimals).split(".");
  const groupedWhole = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  return (
    priceString.slice(0, match.index) +
    (fraction !== undefined
      ? `${groupedWhole}${decimal}${fraction}`
      : groupedWhole) +
    priceString.slice(match.index + numeric.length)
  );
}

/** "$5.00/mo" for a yearly plan; "$9.99/mo" for a monthly one. */
export function perMonthLabel(pkg: PurchasesPackage): string | null {
  const price = pkg.product.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    return null;
  const months =
    pkg.packageType === PACKAGE_TYPE.ANNUAL
      ? 12
      : pkg.packageType === PACKAGE_TYPE.MONTHLY
        ? 1
        : null;
  if (months === null) return null;
  const monthly = formatLikePriceString(
    pkg.product.priceString,
    price / months,
  );
  return monthly ? `${monthly}/mo` : null;
}

/**
 * Whole-percent saving of the yearly plan against twelve monthly
 * payments, from the store's own prices. Null when either price is
 * missing or the yearly plan is not actually cheaper.
 */
export function savingsPercent(plans: PlanPair): number | null {
  const annual = plans.annual?.product.price;
  const monthly = plans.monthly?.product.price;
  if (
    typeof annual !== "number" ||
    typeof monthly !== "number" ||
    !(annual > 0) ||
    !(monthly > 0)
  )
    return null;
  const percent = Math.round((1 - annual / (monthly * 12)) * 100);
  return percent > 0 ? percent : null;
}

/** "billed yearly" / "billed monthly" tail for a plan card. */
export function billingLabel(pkg: PurchasesPackage): string {
  return pkg.packageType === PACKAGE_TYPE.ANNUAL
    ? `${pkg.product.priceString} billed yearly`
    : `${pkg.product.priceString} billed monthly`;
}

/**
 * The one-line small print under the Cal AI CTA: price + period, the
 * real trial when the store grants one, and the renewal terms. The
 * legacy paywalls keep the long `subscriptionDisclosure` paragraph.
 */
export function compactDisclosure(
  pkg: PurchasesPackage | null,
  eligibility: TrialEligibility = "unknown",
): string | null {
  if (!pkg) return null;
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `One-time purchase of ${pkg.product.priceString}.`;
  }
  const trial = trialInfo(pkg, eligibility);
  const lead = trial
    ? `${trial.label} free, then ${pkg.product.priceString} per ${periodLabel(pkg)}.`
    : `${pkg.product.priceString} per ${periodLabel(pkg)}.`;
  return `${lead} Renews automatically unless cancelled in the App Store.`;
}
