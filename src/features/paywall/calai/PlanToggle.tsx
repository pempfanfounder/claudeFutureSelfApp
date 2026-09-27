import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { trialInfo, type PaywallData } from "../useOffering";
import {
  planTitle,
  primaryPriceLabel,
  savingsPercent,
  splitPlans,
} from "./pricing";

interface PlanToggleProps {
  data: PaywallData;
}

/**
 * Yearly / Weekly as a segmented control with a single price line
 * underneath — the whole plan choice in two taps' worth of UI.
 */
export function PlanToggle({ data }: PlanToggleProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const savings = savingsPercent(plans);
  const ordered = [plans.annual, plans.weekly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (ordered.length === 0) return null;
  const selected = data.pkg;
  const trial = selected
    ? trialInfo(selected, data.eligibility?.[selected.product.identifier])
    : null;

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
                {planTitle(pkg)}
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
          <AppText variant="h3" style={styles.price}>
            {primaryPriceLabel(selected)}
          </AppText>
          {trial ? (
            <AppText variant="label" tone="ink2" style={styles.trial}>
              {`${trial.label} free`}
            </AppText>
          ) : null}
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
    alignItems: "center",
    marginTop: spacing.lg,
  },
  price: { fontFamily: type.sansSemi },
  trial: { marginTop: spacing.xs },
});
