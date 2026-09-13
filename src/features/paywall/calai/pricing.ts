import { Platform } from "react-native";
import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";

import { storeName } from "@/lib/storeName";

import { periodLabel, trialInfo, type TrialEligibility } from "../useOffering";

/** Annual and weekly packages picked out of the approved offering. */
export interface PlanPair {
  annual: PurchasesPackage | null;
  weekly: PurchasesPackage | null;
}

/** Weeks in a year for the per-week comparison (Apple uses the same). */
export const WEEKS_PER_YEAR = 52;

export function splitPlans(packages: PurchasesPackage[]): PlanPair {
  return {
    annual: packages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null,
    weekly: packages.find((p) => p.packageType === PACKAGE_TYPE.WEEKLY) ?? null,
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

/** "$0.69/wk" for a yearly plan; "$6.99/wk" for a weekly one. */
export function perWeekLabel(pkg: PurchasesPackage): string | null {
  const price = pkg.product.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    return null;
  const weeks =
    pkg.packageType === PACKAGE_TYPE.ANNUAL
      ? WEEKS_PER_YEAR
      : pkg.packageType === PACKAGE_TYPE.WEEKLY
        ? 1
        : null;
  if (weeks === null) return null;
  const weekly = formatLikePriceString(pkg.product.priceString, price / weeks);
  return weekly ? `${weekly}/wk` : null;
}

/**
 * Whole-percent saving of the yearly plan against 52 weekly payments,
 * from the store's own prices. Null when either price is missing or the
 * yearly plan is not actually cheaper.
 */
export function savingsPercent(plans: PlanPair): number | null {
  const annual = plans.annual?.product.price;
  const weekly = plans.weekly?.product.price;
  if (
    typeof annual !== "number" ||
    typeof weekly !== "number" ||
    !(annual > 0) ||
    !(weekly > 0)
  )
    return null;
  const percent = Math.round((1 - annual / (weekly * WEEKS_PER_YEAR)) * 100);
  return percent > 0 ? percent : null;
}

/** "billed yearly" / "billed weekly" tail for a plan card. */
export function billingLabel(pkg: PurchasesPackage): string {
  return pkg.packageType === PACKAGE_TYPE.ANNUAL
    ? `${pkg.product.priceString} billed yearly`
    : `${pkg.product.priceString} billed weekly`;
}

/** Plan card / toggle title for an allowed package. */
export function planTitle(pkg: PurchasesPackage): string {
  return pkg.packageType === PACKAGE_TYPE.ANNUAL ? "Yearly" : "Weekly";
}

/**
 * The one-line small print under the Cal AI CTA: price + period, the
 * real trial when the store grants one, and the renewal terms. The
 * legacy paywalls keep the long `subscriptionDisclosure` paragraph.
 */
export function compactDisclosure(
  pkg: PurchasesPackage | null,
  eligibility: TrialEligibility = "unknown",
  platform: string = Platform.OS,
): string | null {
  if (!pkg) return null;
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `One-time purchase of ${pkg.product.priceString}.`;
  }
  const trial = trialInfo(pkg, eligibility);
  const lead = trial
    ? `${trial.label} free, then ${pkg.product.priceString} per ${periodLabel(pkg)}.`
    : `${pkg.product.priceString} per ${periodLabel(pkg)}.`;
  const store = storeName(platform);
  return `${lead} Renews automatically unless cancelled in ${store === "App Store" ? "the App Store" : store}.`;
}
