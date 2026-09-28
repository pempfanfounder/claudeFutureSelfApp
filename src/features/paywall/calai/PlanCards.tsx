import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { trialInfo, type PaywallData } from "../useOffering";
import {
  billedPriceLabel,
  planDetailLabel,
  planTitle,
  savingsPercent,
  splitPlans,
} from "./pricing";

interface PlanCardsProps {
  data: PaywallData;
}

/**
 * Cal AI's two stacked plan cards. Guideline 3.1.2(c): the billed amount
 * ("$35.99/year") is the largest, darkest price on each card; the
 * per-week figure, the saving and the free trial sit underneath in
 * smaller secondary text and never outrank it.
 */
export function PlanCards({ data }: PlanCardsProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const savings = savingsPercent(plans);
  const ordered = [plans.annual, plans.weekly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (ordered.length === 0) return null;

  return (
    <View style={styles.list}>
      {ordered.map((pkg) => {
        const isAnnual = pkg.packageType === "ANNUAL";
        const selected = data.pkg?.identifier === pkg.identifier;
        const detail = planDetailLabel(pkg, savings);
        const trial = trialInfo(
          pkg,
          data.eligibility?.[pkg.product.identifier],
        );
        return (
          <Pressable
            key={pkg.identifier}
            onPress={() => data.selectPackage(pkg)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={`plan-${pkg.identifier}`}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: selected ? colors.ctaBg : colors.borderStrong,
                borderWidth: selected ? 2 : 1,
              },
              selected && shadows.sm,
              isAnnual && styles.cardWithTab,
            ]}
          >
            {isAnnual ? (
              <View
                style={[styles.tab, { backgroundColor: colors.ctaBg }]}
                testID="plan-yearly-tag"
              >
                <AppText variant="eyebrow" tone="ctaInk">
                  Most popular
                </AppText>
              </View>
            ) : null}
            <View style={styles.row}>
              <View
                style={[
                  styles.radio,
                  {
                    borderColor: selected ? colors.ctaBg : colors.borderStrong,
                  },
                  selected && { backgroundColor: colors.ctaBg },
                ]}
              >
                {selected ? (
                  <Icon
                    name="check"
                    size={13}
                    color={colors.ctaInk}
                    weight="bold"
                  />
                ) : null}
              </View>
              <View style={styles.copy}>
                <View style={styles.headline}>
                  <AppText variant="lead" style={styles.title}>
                    {planTitle(pkg)}
                  </AppText>
                  <AppText
                    variant="lead"
                    style={styles.price}
                    testID={`plan-${pkg.identifier}-billed`}
                  >
                    {billedPriceLabel(pkg)}
                  </AppText>
                </View>
                {detail ? (
                  <AppText
                    variant="label"
                    tone="ink2"
                    style={styles.detail}
                    testID={`plan-${pkg.identifier}-detail`}
                  >
                    {detail}
                  </AppText>
                ) : null}
                {trial ? (
                  <AppText
                    variant="label"
                    tone="ink2"
                    style={styles.detail}
                    testID={`plan-${pkg.identifier}-trial`}
                  >
                    {`${trial.label} free, then ${billedPriceLabel(pkg)}`}
                  </AppText>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    overflow: "hidden",
  },
  cardWithTab: { paddingTop: spacing.lg + 26 },
  tab: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  headline: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { fontFamily: type.sansSemi },
  price: { fontFamily: type.sansSemi },
  detail: { marginTop: 2 },
});
