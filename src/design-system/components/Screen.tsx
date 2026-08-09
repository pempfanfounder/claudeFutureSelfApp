import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "../ThemeProvider";
import { spacing } from "../tokens";

interface ScreenProps {
  children: ReactNode;
  /** Horizontal padding on by default; disable for full-bleed feeds. */
  padded?: boolean;
  style?: ViewStyle;
  edges?: { top?: boolean; bottom?: boolean };
}

export function Screen({ children, padded = true, style, edges }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom =
    edges?.bottom === false ? 0 : Math.max(insets.bottom, spacing.md);
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg, paddingTop: top, paddingBottom: bottom },
        padded && { paddingHorizontal: spacing.xl },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
