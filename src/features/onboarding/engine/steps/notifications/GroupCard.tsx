import { Children, Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useColors } from "@/design-system/ThemeProvider";
import { radii, spacing } from "@/design-system/tokens";

interface GroupCardProps {
  children: ReactNode;
  testID?: string;
}

const ACCENT_RULE_WIDTH = 3;

/**
 * Shared chrome for the notification config rows: a soft rounded card
 * with a hairline edge and a short accent rule down the left side (the
 * same accent as the streak tracker's "today"). Rows are separated by
 * hairlines. This is what makes the counts and the time window read as
 * one family, and not as the reference app's pill-and-card pair.
 */
export function GroupCard({ children, testID }: GroupCardProps) {
  const colors = useColors();
  const rows = Children.toArray(children);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={testID}
    >
      <View
        style={[styles.rule, { backgroundColor: colors.accent }]}
        pointerEvents="none"
      />
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg + ACCENT_RULE_WIDTH,
    paddingRight: spacing.md,
    // The iOS compact time picker presents its popover above the row;
    // nothing here may clip it.
    overflow: "visible",
  },
  rule: {
    position: "absolute",
    left: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    width: ACCENT_RULE_WIDTH,
    borderRadius: ACCENT_RULE_WIDTH / 2,
  },
  divider: { height: StyleSheet.hairlineWidth },
});
