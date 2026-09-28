import { Pressable, StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText } from "@/design-system/components";
import { useColors } from "@/design-system/ThemeProvider";
import { radii, shadows, spacing } from "@/design-system/tokens";
import type { PaywallData } from "../useOffering";
import { BillingSummary } from "./BillingSummary";
import { planTitle, splitPlans } from "./pricing";

interface PlanToggleProps { data: PaywallData; disabled?: boolean }

export function PlanToggle({ data, disabled = false }: PlanToggleProps) {
  const colors = useColors();
  const plans = splitPlans(data.allPackages);
  const ordered = [plans.annual, plans.weekly].filter(
    (p): p is PurchasesPackage => p !== null,
  );
  if (data.loading || data.unavailable || ordered.length === 0) return null;
  return (
    <View>
      <View style={[styles.track, { backgroundColor: colors.bgAlt, borderColor: colors.border }]} accessibilityRole="radiogroup">
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
              style={[styles.segment, selected && { backgroundColor: colors.card }, selected && shadows.sm]}
            >
              <AppText variant="body">{planTitle(pkg)}</AppText>
            </Pressable>
          );
        })}
      </View>
      {data.pkg ? (
        <View style={styles.summary} testID="plan-price-line">
          <BillingSummary
            pkg={data.pkg}
            eligibility={data.eligibility?.[data.pkg.product.identifier]}
            center
            testID="toggle-billing"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radii.pill, borderWidth: 1, padding: 4 },
  segment: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, padding: spacing.md },
  summary: { marginTop: spacing.lg },
});
