import { StyleSheet, View } from "react-native";

interface GoogleGlyphProps {
  size?: number;
  /** Button surface color; masks the ring's open segment. */
  background: string;
}

const RED = "#EA4335";
const BLUE = "#4285F4";
const GREEN = "#34A853";
const YELLOW = "#FBBC05";

/**
 * Google's four-color "G", drawn from a quad-colored ring plus a mask
 * and the horizontal bar, so the app needs no SVG runtime or bitmap
 * asset. Sized like an icon; keep at 18-24pt.
 */
export function GoogleGlyph({ size = 20, background }: GoogleGlyphProps) {
  const stroke = Math.round(size * 0.2);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="google-glyph"
    >
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderTopColor: RED,
            borderRightColor: BLUE,
            borderBottomColor: GREEN,
            borderLeftColor: YELLOW,
          },
        ]}
      />
      <View
        style={[
          styles.mask,
          {
            backgroundColor: background,
            left: size / 2,
            top: 0,
            width: size / 2,
            height: size / 2 - stroke / 2,
          },
        ]}
      />
      <View
        style={[
          styles.bar,
          {
            backgroundColor: BLUE,
            left: size / 2,
            top: size / 2 - stroke / 2,
            width: size / 2,
            height: stroke,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", left: 0, top: 0 },
  mask: { position: "absolute" },
  bar: { position: "absolute" },
});
