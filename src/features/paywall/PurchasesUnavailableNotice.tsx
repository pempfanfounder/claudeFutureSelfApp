import { StyleSheet, View } from "react-native";

import { AppText, Button } from "@/design-system/components";
import { radii, spacing } from "@/design-system/tokens";
import { config } from "@/lib/config";
import {
  getPurchasesDiagnostics,
  type PurchasesFailure,
} from "@/lib/purchases";

/**
 * Shown when the gate stays closed because purchases are unavailable.
 *
 * Customers see the same reassuring copy as before. Operators additionally
 * get the concrete reason on-device, because a preview/TestFlight build
 * has no console attached — "the store can't be reached" is unactionable
 * when the real cause is a missing key, a Test Store key, or a product
 * catalogue the store could not resolve.
 *
 * The diagnostic block is opt-in via EXPO_PUBLIC_RC_DEBUG_LOGS and is
 * always on in development, so production customers never see it.
 */
export function PurchasesUnavailableNotice({
  failure,
  onRetry,
  message,
}: {
  failure: PurchasesFailure | null;
  onRetry?: () => void;
  message: string;
}) {
  const showDiagnostics = __DEV__ || config.rcDebugLogs;
  const diag = showDiagnostics ? getPurchasesDiagnostics() : null;

  return (
    <View style={styles.container}>
      <AppText variant="body" tone="ink2" center>
        {message}
      </AppText>

      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          size="md"
          onPress={onRetry}
          style={styles.retry}
          testID="purchases-retry"
        />
      ) : null}

      {diag ? (
        <View style={styles.diagnostics} testID="purchases-diagnostics">
          <AppText variant="label" tone="ink3">
            {`Diagnostics — ${diag.platform} · key: ${diag.keyKind} · entitlement: "${diag.entitlementId}"`}
          </AppText>
          {failure ? (
            <AppText variant="label" tone="ink3">
              {`${failure.reason}: ${failure.detail}`}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  retry: {
    alignSelf: "center",
  },
  diagnostics: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
  },
});
