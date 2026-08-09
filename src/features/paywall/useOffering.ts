import { useEffect, useState } from "react";
import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";

import { config } from "@/lib/config";
import { getCurrentOffering, isConfigured } from "@/lib/purchases";

export interface PaywallData {
  loading: boolean;
  /** Real package to purchase. Null when RevenueCat is unavailable. */
  pkg: PurchasesPackage | null;
  /** e.g. "$59.99/year" — always from the store, never hardcoded. */
  priceLine: string | null;
  /** e.g. "3 days", "1 week" — only when the store reports a free intro. */
  trialLength: string | null;
  /** Days until trial converts (for the timeline dates). */
  trialDays: number | null;
  /** Explicitly enabled development mock (never in production). */
  devMock: boolean;
  /** RevenueCat not configured/reachable: keep the gate, show a wait state. */
  unavailable: boolean;
}

function periodLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return "year";
    case PACKAGE_TYPE.MONTHLY:
      return "month";
    case PACKAGE_TYPE.WEEKLY:
      return "week";
    case PACKAGE_TYPE.LIFETIME:
      return "one-time";
    default:
      return "period";
  }
}

function formatPriceLine(pkg: PurchasesPackage): string {
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `${pkg.product.priceString} once`;
  }
  return `${pkg.product.priceString}/${periodLabel(pkg)}`;
}

function trialInfo(
  pkg: PurchasesPackage,
): { label: string; days: number } | null {
  // A one-time purchase never has a trial.
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) return null;
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case "DAY":
      return { label: units === 1 ? "1 day" : `${units} days`, days: units };
    case "WEEK":
      return {
        label: units === 1 ? "1 week" : `${units} weeks`,
        days: units * 7,
      };
    case "MONTH":
      return {
        label: units === 1 ? "1 month" : `${units} months`,
        days: units * 30,
      };
    default:
      return null;
  }
}

/**
 * Loads the current RevenueCat offering and picks the package for a
 * paywall family. The real product set is Lifetime/Yearly/Monthly (no
 * weekly product exists yet):
 * - iam: annual -> monthly -> first available package.
 * - stella: weekly (kept first for future flexibility) -> monthly ->
 *   first available package.
 */
export function useOffering(prefer: "annual" | "weekly"): PaywallData {
  const [data, setData] = useState<PaywallData>({
    loading: true,
    pkg: null,
    priceLine: null,
    trialLength: null,
    trialDays: null,
    devMock: config.devMockPurchases,
    unavailable: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (config.devMockPurchases) {
        setData({
          loading: false,
          pkg: null,
          priceLine:
            prefer === "annual"
              ? "$59.99/year (dev mock)"
              : "$4.99/week (dev mock)",
          trialLength: prefer === "annual" ? "3 days" : "1 week",
          trialDays: prefer === "annual" ? 3 : 7,
          devMock: true,
          unavailable: false,
        });
        return;
      }
      if (!isConfigured()) {
        setData((d) => ({ ...d, loading: false, unavailable: true }));
        return;
      }
      const offering = await getCurrentOffering();
      if (cancelled) return;
      if (!offering || offering.availablePackages.length === 0) {
        setData((d) => ({ ...d, loading: false, unavailable: true }));
        return;
      }
      const preferred =
        prefer === "annual"
          ? (offering.annual ??
            offering.monthly ??
            offering.availablePackages[0]!)
          : (offering.weekly ??
            offering.monthly ??
            offering.availablePackages[0]!);
      const trial = trialInfo(preferred);
      setData({
        loading: false,
        pkg: preferred,
        priceLine: formatPriceLine(preferred),
        trialLength: trial?.label ?? null,
        trialDays: trial?.days ?? null,
        devMock: false,
        unavailable: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [prefer]);

  return data;
}

/** Formats a date `days` from now like "Aug 12". */
export function shortDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
