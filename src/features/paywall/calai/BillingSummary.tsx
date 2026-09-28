import { StyleSheet, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { AppText } from "@/design-system/components";
import { type } from "@/design-system/tokens";
import { formatPriceLine, trialInfo, type TrialEligibility } from "../useOffering";

interface BillingSummaryProps {
  pkg: PurchasesPackage;
  eligibility?: TrialEligibility;
  center?: boolean;
  testID: string;
}

/** The actual store bill is always larger than trial or promotional copy. */
export function BillingSummary({ pkg, eligibility, center, testID }: BillingSummaryProps) {
  const trial = trialInfo(pkg, eligibility);
  return (
    <View testID={testID}>
      <AppText center={center} style={styles.amount} testID={`${testID}-amount`}>
        {formatPriceLine(pkg)}
      </AppText>
      <AppText variant="label" tone="ink2" center={center}>
        {pkg.packageType === "ANNUAL" ? "Billed yearly" : "Billed weekly"}
      </AppText>
      {trial ? (
        <AppText
          variant="label"
          tone="ink2"
          center={center}
          style={styles.trial}
          testID={`${testID}-trial`}
        >
          {`${trial.label} free before the first payment`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { fontFamily: type.sansSemi, fontWeight: "600", fontSize: 28, lineHeight: 36 },
  trial: { marginTop: 4, fontSize: 14, lineHeight: 20 },
});
