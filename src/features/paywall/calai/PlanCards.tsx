import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing, type } from "@/design-system/tokens";

import { trialInfo, type PaywallData } from "../useOffering";
import { billingLabel, perWeekLabel, planTitle, splitPlans } from "./pricing";

interface PlanCardsProps {
  data: PaywallData;
}

/**
 * Cal AI's two stacked plan cards in Future Self chrome: the yearly plan
 * wears a "3 days free" tab and a filled check; the weekly plan is a
 * plain outlined card with an empty radio. Both show a per-week price
 * on the right; yearly keeps `$35.99 billed yearly` under the title.
 */
export function PlanCards({ data }: PlanCardsProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const ordered = [plans.annual, plans.weekly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (ordered.length === 0) return null;

  return (
    <View style={styles.list}>
      {ordered.map((pkg) => {
        const isAnnual = pkg.packageType === "ANNUAL";
        const selected = data.pkg?.identifier === pkg.identifier;
        const trial = trialInfo(
          pkg,
          data.eligibility?.[pkg.product.identifier],
        );
        const perWeek = perWeekLabel(pkg);
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
              <View style={[styles.tab, { backgroundColor: colors.ctaBg }]}>
                <AppText variant="eyebrow" tone="ctaInk">
                  {trial ? "3 days free" : "Yearly"}
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
                <AppText variant="lead" style={styles.title}>
                  {planTitle(pkg)}
                </AppText>
                {isAnnual ? (
                  <AppText variant="body" tone="ink2" style={styles.billing}>
                    {billingLabel(pkg)}
                  </AppText>
                ) : null}
              </View>
              {perWeek ? (
                <AppText
                  variant="lead"
                  tone={selected ? "ink" : "ink3"}
                  style={styles.price}
                >
                  {perWeek}
                </AppText>
              ) : (
                <AppText variant="lead" tone={selected ? "ink" : "ink3"}>
                  {pkg.product.priceString}
                </AppText>
              )}
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
  cardWithTab: { paddingTop: spacing.lg + 22 },
  tab: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 24,
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
  title: { fontFamily: type.sansSemi },
  billing: { marginTop: 2, fontFamily: type.sansMed },
  price: { fontFamily: type.sansMed },
});
