import { Platform, Text } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

/**
 * Semantic icon set for every interactive control (no emoji-as-buttons).
 *
 * iOS renders SF Symbols via expo-symbols. Other platforms (and Jest)
 * fall back to the previous unicode glyphs so nothing regresses on
 * Android; swap the fallback for @expo/vector-icons when that package
 * is added (tracked in the customization wave).
 */
export type IconName =
  | "share"
  | "heart"
  | "heartFill"
  | "close"
  | "back"
  | "chevronRight"
  | "settings"
  | "palette"
  | "sparkle"
  | "plus"
  | "minus"
  | "grid"
  | "person"
  | "widget"
  | "bell"
  | "check";

const SF: Record<IconName, SymbolViewProps["name"]> = {
  share: "square.and.arrow.up",
  heart: "heart",
  heartFill: "heart.fill",
  close: "xmark",
  back: "chevron.left",
  chevronRight: "chevron.right",
  settings: "gearshape",
  palette: "circle.lefthalf.filled",
  sparkle: "sparkles",
  plus: "plus",
  minus: "minus",
  grid: "square.grid.2x2",
  person: "person",
  widget: "widget.small",
  bell: "bell",
  check: "checkmark",
};

const FALLBACK: Record<IconName, string> = {
  share: "↗",
  heart: "♡",
  heartFill: "♥",
  close: "✕",
  back: "‹",
  chevronRight: "›",
  settings: "⚙",
  palette: "◐",
  sparkle: "✦",
  plus: "+",
  minus: "−",
  grid: "⊞",
  person: "◯",
  widget: "▣",
  bell: "🔔",
  check: "✓",
};

export interface IconProps {
  name: IconName;
  /** Point size of the symbol (and fallback font size). */
  size?: number;
  color: string;
  /** SF Symbols weight; ignored by the fallback. */
  weight?: SymbolViewProps["weight"];
}

export function Icon({ name, size = 20, color, weight = "medium" }: IconProps) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={SF[name]}
        size={size}
        tintColor={color}
        weight={weight}
        resizeMode="scaleAspectFit"
      />
    );
  }
  return (
    <Text style={{ fontSize: size, color, lineHeight: size * 1.15 }}>
      {FALLBACK[name]}
    </Text>
  );
}
