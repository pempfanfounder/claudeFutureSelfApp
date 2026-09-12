import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import type { PaywallData } from "../useOffering";
import {
  billingLabel,
  perMonthLabel,
  savingsPercent,
  splitPlans,
} from "./pricing";

interface PlanToggleProps {
  data: PaywallData;
}

/**
 * Yearly / Monthly as a segmented control with a single price line
 * underneath — the whole plan choice in two taps' worth of UI.
 */
export function PlanToggle({ data }: PlanToggleProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const savings = savingsPercent(plans);
  const ordered = [plans.annual, plans.monthly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (ordered.length === 0) return null;
  const selected = data.pkg;
  const perMonth = selected ? perMonthLabel(selected) : null;

  return (
    <View>
      <View
        style={[
          styles.track,
          { backgroundColor: colors.bgAlt, borderColor: colors.border },
        ]}
        accessibilityRole="radiogroup"
      >
        {ordered.map((pkg) => {
          const isAnnual = pkg.packageType === "ANNUAL";
          const on = selected?.identifier === pkg.identifier;
          return (
            <Pressable
              key={pkg.identifier}
              onPress={() => data.selectPackage(pkg)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              testID={`plan-${pkg.identifier}`}
              style={[
                styles.segment,
                on && { backgroundColor: colors.card },
                on && shadows.sm,
              ]}
            >
              <AppText
                variant="body"
                tone={on ? "ink" : "ink3"}
                style={styles.segmentLabel}
              >
                {isAnnual ? "Yearly" : "Monthly"}
              </AppText>
              {isAnnual && savings !== null ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: on ? colors.ctaBg : colors.borderStrong,
                    },
                  ]}
                >
                  <AppText variant="eyebrow" tone={on ? "ctaInk" : "ink2"}>
                    {`Save ${savings}%`}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <View style={styles.priceRow} testID="plan-price-line">
          <AppText variant="h3" style={styles.perMonth}>
            {perMonth ?? selected.product.priceString}
          </AppText>
          <AppText variant="label" tone="ink2">
            {billingLabel(selected)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: radii.pill,
    borderWidth: 1,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  segmentLabel: { fontFamily: type.sansSemi },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  perMonth: { fontFamily: type.sansSemi },
});
