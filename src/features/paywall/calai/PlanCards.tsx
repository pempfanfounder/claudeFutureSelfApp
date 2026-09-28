import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText, Icon } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import type { PaywallData } from "../useOffering";
import { BillingSummary } from "./BillingSummary";
import { planTitle, splitPlans } from "./pricing";

interface PlanCardsProps { data: PaywallData; disabled?: boolean }

/** Full bills, not calculated weekly equivalents or unconditional trial banners. */
export function PlanCards({ data, disabled = false }: PlanCardsProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const ordered = [plans.annual, plans.weekly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (data.loading || data.unavailable || ordered.length === 0) return null;
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {ordered.map((pkg) => {
        const selected = data.pkg?.identifier === pkg.identifier;
        return (
          <Pressable
            key={pkg.identifier}
            onPress={() => data.selectPackage(pkg)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            testID={`plan-${pkg.identifier}`}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: selected ? colors.ctaBg : colors.borderStrong },
              selected && shadows.sm,
            ]}
          >
            <View style={[styles.radio, { borderColor: colors.ctaBg }, selected && { backgroundColor: colors.ctaBg }]}>
              {selected ? <Icon name="check" size={13} color={colors.ctaInk} weight="bold" /> : null}
            </View>
            <View style={styles.copy}>
              <AppText variant="body" style={styles.title}>{planTitle(pkg)}</AppText>
              <BillingSummary
                pkg={pkg}
                eligibility={data.eligibility?.[pkg.product.identifier]}
                testID={`billing-${pkg.identifier}`}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.lg, borderWidth: 2, padding: spacing.lg },
  radio: { width: 24, height: 24, flexShrink: 0, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  title: { marginBottom: 4 },
});
