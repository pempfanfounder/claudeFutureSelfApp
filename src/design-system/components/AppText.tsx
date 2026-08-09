import { Text, type TextProps, type TextStyle } from "react-native";

import { useColors } from "../ThemeProvider";
import { type } from "../tokens";

type Variant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "lead"
  | "body"
  | "label"
  | "eyebrow"
  | "quote";

type Tone = "ink" | "ink2" | "ink3" | "accent" | "ctaInk" | "success";

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

const variantStyles: Record<Variant, TextStyle> = {
  display: {
    fontFamily: type.serif,
    fontSize: type.sizes.display,
    lineHeight: type.sizes.display * type.lineHeights.tight,
  },
  h1: {
    fontFamily: type.serif,
    fontSize: type.sizes.h1,
    lineHeight: type.sizes.h1 * type.lineHeights.snug,
  },
  h2: {
    fontFamily: type.serif,
    fontSize: type.sizes.h2,
    lineHeight: type.sizes.h2 * type.lineHeights.snug,
  },
  h3: {
    fontFamily: type.serif,
    fontSize: type.sizes.h3,
    lineHeight: type.sizes.h3 * type.lineHeights.snug,
  },
  lead: {
    fontFamily: type.sans,
    fontSize: type.sizes.lead,
    lineHeight: type.sizes.lead * type.lineHeights.relaxed,
  },
  body: {
    fontFamily: type.sans,
    fontSize: type.sizes.body,
    lineHeight: type.sizes.body * type.lineHeights.body,
  },
  label: {
    fontFamily: type.sansMed,
    fontSize: type.sizes.label,
    lineHeight: type.sizes.label * type.lineHeights.body,
  },
  eyebrow: {
    fontFamily: type.sansSemi,
    fontSize: type.sizes.eyebrow,
    lineHeight: type.sizes.eyebrow * type.lineHeights.body,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  quote: {
    fontFamily: type.serif,
    fontSize: type.sizes.h2,
    lineHeight: type.sizes.h2 * 1.35,
  },
};

export function AppText({
  variant = "body",
  tone = "ink",
  center,
  style,
  ...rest
}: AppTextProps) {
  const colors = useColors();
  const color =
    tone === "ink"
      ? colors.ink
      : tone === "ink2"
        ? colors.ink2
        : tone === "ink3"
          ? colors.ink3
          : tone === "accent"
            ? colors.accent
            : tone === "success"
              ? colors.success
              : colors.ctaInk;
  return (
    <Text
      {...rest}
      style={[
        variantStyles[variant],
        { color },
        center && { textAlign: "center" },
        style,
      ]}
    />
  );
}
