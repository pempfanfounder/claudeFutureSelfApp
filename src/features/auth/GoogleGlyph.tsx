import { Image } from "react-native";

interface GoogleGlyphProps {
  size?: number;
  /** Unused; kept so existing ProviderButton callers can pass the surface. */
  background?: string;
}

/**
 * Official-style four-color Google "G" (complete mark, not a cropped
 * CSS ring). Decorative; sized like an icon at 18–24pt.
 */
export function GoogleGlyph({ size = 20 }: GoogleGlyphProps) {
  return (
    <Image
      source={require("../../../assets/images/google-g.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="google-glyph"
    />
  );
}
