import { Text, type TextProps } from "react-native";

import { type } from "../tokens";

/**
 * Color emoji must not set Inter, Instrument Serif, or even
 * "Apple Color Emoji" by name. A named family that iOS fails to resolve
 * becomes LastResort — the "?" box. Leaving fontFamily unset lets iOS
 * pick Apple Color Emoji for these code points on Simulator and device.
 */
export function EmojiText({
  children,
  style,
  size = type.sizes.lead,
  ...rest
}: TextProps & { size?: number }) {
  return (
    <Text
      allowFontScaling={false}
      {...rest}
      style={[{ fontSize: size, lineHeight: size * 1.2 }, style]}
    >
      {children}
    </Text>
  );
}
