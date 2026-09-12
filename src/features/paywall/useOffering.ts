import { useCallback, useEffect, useState } from "react";
import Purchases, {
  PACKAGE_TYPE,
  type PurchasesPackage,
} from "react-native-purchases";

import { config } from "@/lib/config";
import {
  captureIdentity,
  isCurrentIdentity,
  withDeadline,
  useAppState,
} from "@/lib/appState";
import { getCurrentOffering, isAllowedPackage } from "@/lib/purchases";

export interface PaywallData {
  loading: boolean;
  eligibility?: Record<string, TrialEligibility>;
  retry?: () => void;
  /** Active selected package to purchase. Null when RevenueCat is unavailable. */
  pkg: PurchasesPackage | null;
  /** Only approved monthly and yearly packages from the active offering. */
  allPackages: PurchasesPackage[];
  /** Change the selected package */
  selectPackage: (pkg: PurchasesPackage) => void;
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

export function periodLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return "year";
    case PACKAGE_TYPE.SIX_MONTH:
      return "6 months";
    case PACKAGE_TYPE.THREE_MONTH:
      return "3 months";
    case PACKAGE_TYPE.TWO_MONTH:
      return "2 months";
    case PACKAGE_TYPE.MONTHLY:
      return "month";
    case PACKAGE_TYPE.WEEKLY:
      return "week";
    case PACKAGE_TYPE.LIFETIME:
      return "one-time";
    default:
      // Never let "per period" reach the 3.1.2 disclosure — fall back
      // to the store-provided subscription period when the enum is new.
      return "billing period";
  }
}

export function formatPriceLine(pkg: PurchasesPackage): string {
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `${pkg.product.priceString} lifetime access`;
  }
  return `${pkg.product.priceString}/${periodLabel(pkg)}`;
}

export type TrialEligibility = "eligible" | "ineligible" | "unknown";
export function trialInfo(
  pkg: PurchasesPackage,
  eligibility: TrialEligibility = "unknown",
): { label: string; days: number } | null {
  if (!isAllowedPackage(pkg) || eligibility !== "eligible") return null;
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  if (!Number.isInteger(units) || units < 1 || units > 365) return null;
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
    case "YEAR":
      return {
        label: units === 1 ? "1 year" : `${units} years`,
        days: units * 365,
      };
    default:
      return null;
  }
}

/** Guideline 3.1.2 disclosure for the selected package. */
export function subscriptionDisclosure(
  pkg: PurchasesPackage | null,
  eligibility: TrialEligibility = "unknown",
): string | null {
  if (!pkg) return null;
  if (pkg.packageType === PACKAGE_TYPE.LIFETIME) {
    return `One-time purchase of ${pkg.product.priceString}. Charged to your App Store account at confirmation.`;
  }
  const period = periodLabel(pkg); // "year" | "month" | "week"
  const trial = trialInfo(pkg, eligibility);
  const lead = trial
    ? `${trial.label} free, then ${pkg.product.priceString} per ${period}.`
    : `${pkg.product.priceString} per ${period}.`;
  return (
    `${lead} Payment is charged to your App Store account at confirmation. ` +
    `The subscription renews automatically unless cancelled at least 24 hours ` +
    `before the end of the current period. Manage or cancel anytime in App Store settings.`
  );
}

/**
 * Trial CTA label (Guideline 3.1.2: name the real trial length from the
 * store). Callers only use this when a trial exists; the null branch is
 * the defensive fallback.
 */
/** Local preview product when RevenueCat is mocked (staging Simulator). */
export function previewStorePackage(
  prefer: "annual" | "monthly",
): PurchasesPackage {
  const annual = prefer === "annual";
  return {
    identifier: annual ? "$rc_annual" : "$rc_monthly",
    packageType: annual ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY,
    offeringIdentifier: "default",
    product: {
      identifier: annual ? "yearly" : "monthly",
      description: "Future Self",
      title: annual ? "Yearly" : "Monthly",
      price: annual ? 59.99 : 9.99,
      priceString: annual ? "$59.99" : "$9.99",
      currencyCode: "USD",
      introPrice: {
        price: 0,
        priceString: "$0.00",
        period: "P3D",
        cycles: 1,
        periodUnit: "DAY",
        periodNumberOfUnits: 3,
      },
    },
  } as unknown as PurchasesPackage;
}

export function ctaLabel(trialLength: string | null): string {
  if (!trialLength) return "Continue";
  // "3 days" → "3-day", "1 week" → "1-week": reads as natural English
  // in "Start your 3-day free trial".
  const hyphenated = trialLength.replace(
    /^(\d+) (day|week|month|year)s?$/,
    "$1-$2",
  );
  return `Start your ${hyphenated} free trial`;
}

/** Loaded only after AuthProvider has settled the store identity. */
export function useOffering(prefer: "annual" | "monthly"): PaywallData {
  const generation = useAppState((s) => s.identityGeneration);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [data, setData] = useState<PaywallData>({
    loading: true,
    pkg: null,
    allPackages: [],
    selectPackage: () => {},
    priceLine: null,
    trialLength: null,
    trialDays: null,
    devMock: config.devMockPurchases,
    unavailable: false,
  });
  useEffect(() => {
    let cancelled = false;
    const identity = captureIdentity();
    const current = () => !cancelled && isCurrentIdentity(identity);
    const selectPackage = (pkg: PurchasesPackage) => {
      if (!current()) return;
      setData((previous) => {
        if (
          !previous.allPackages.some((p) => p.identifier === pkg.identifier) ||
          !isAllowedPackage(pkg)
        )
          return previous;
        const trial = trialInfo(
          pkg,
          previous.eligibility?.[pkg.product.identifier],
        );
        return {
          ...previous,
          pkg,
          priceLine: formatPriceLine(pkg),
          trialLength: trial?.label ?? null,
          trialDays: trial?.days ?? null,
        };
      });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset external request state when its identity or retry key changes.
    setData((d) => ({
      ...d,
      loading: true,
      unavailable: false,
      selectPackage,
      retry,
    }));
    if (config.devMockPurchases) {
      const pkg = previewStorePackage(prefer);
      const trial = trialInfo(pkg, "eligible");
      setData({
        loading: false,
        pkg,
        allPackages: [pkg],
        selectPackage,
        retry,
        eligibility: { [pkg.product.identifier]: "eligible" },
        priceLine: formatPriceLine(pkg),
        trialLength: trial?.label ?? null,
        trialDays: trial?.days ?? null,
        devMock: true,
        unavailable: false,
      });
      return;
    }
    void withDeadline(
      (async () => {
        const offering = await getCurrentOffering();
        if (!current()) return;
        const packages = (offering?.availablePackages ?? []).filter(
          isAllowedPackage,
        );
        if (!packages.length)
          throw new Error("No monthly or yearly store package is available.");
        const eligibility: Record<string, TrialEligibility> = {};
        try {
          const statuses = await withDeadline(
            Purchases.checkTrialOrIntroductoryPriceEligibility(
              packages.map((p) => p.product.identifier),
            ),
            6_000,
          );
          for (const pkg of packages) {
            // Values verified against installed RevenueCat 10.7 declarations.
            const status = statuses[pkg.product.identifier]?.status;
            eligibility[pkg.product.identifier] =
              status === 2
                ? "eligible"
                : status === 1
                  ? "ineligible"
                  : "unknown";
          }
        } catch {
          for (const pkg of packages)
            eligibility[pkg.product.identifier] = "unknown";
        }
        if (!current()) return;
        const pkg =
          packages.find(
            (p) =>
              p.packageType === (prefer === "annual" ? "ANNUAL" : "MONTHLY"),
          ) ?? packages[0]!;
        const trial = trialInfo(pkg, eligibility[pkg.product.identifier]);
        setData({
          loading: false,
          pkg,
          allPackages: packages,
          selectPackage,
          retry,
          eligibility,
          priceLine: formatPriceLine(pkg),
          trialLength: trial?.label ?? null,
          trialDays: trial?.days ?? null,
          devMock: false,
          unavailable: false,
        });
      })(),
    ).catch(() => {
      if (current())
        setData((d) => ({
          ...d,
          loading: false,
          pkg: null,
          allPackages: [],
          trialLength: null,
          trialDays: null,
          priceLine: null,
          unavailable: true,
        }));
    });
    return () => {
      cancelled = true;
    };
  }, [prefer, generation, attempt, retry]);
  return data;
}

/** Formats a date `days` from now like "Aug 12". */
export function shortDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
