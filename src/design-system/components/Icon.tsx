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
  | "check"
  | "flame"
  | "chart"
  | "fog"
  | "strength"
  | "brain"
  | "health"
  | "briefcase"
  | "peace"
  | "compass"
  | "hourglass"
  | "phone"
  | "repeat"
  | "spiral"
  | "reflect"
  | "map"
  | "money"
  | "target"
  | "lockOpen"
  | "diamond"
  | "apple"
  | "envelope";

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
  flame: "flame.fill",
  chart: "chart.line.uptrend.xyaxis",
  fog: "cloud.fog.fill",
  strength: "dumbbell.fill",
  brain: "brain.head.profile",
  health: "stethoscope",
  briefcase: "briefcase.fill",
  peace: "bird",
  compass: "safari",
  hourglass: "hourglass",
  phone: "iphone",
  repeat: "arrow.triangle.2.circlepath",
  spiral: "hurricane",
  reflect: "person.crop.circle",
  map: "map.fill",
  money: "dollarsign.circle.fill",
  target: "target",
  lockOpen: "lock.open.fill",
  diamond: "diamond.fill",
  apple: "apple.logo",
  envelope: "envelope",
};

// Monochrome text glyphs only (a color emoji would ignore `color`).
// `person`/`bell` are abstract placeholders until the vector-icons
// fallback lands; neither is used by a screen yet.
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
  person: "웃",
  widget: "▣",
  bell: "⍾",
  check: "✓",
  flame: "▲",
  chart: "↗",
  fog: "≈",
  strength: "▰",
  brain: "◉",
  health: "+",
  briefcase: "▣",
  peace: "○",
  compass: "◎",
  hourglass: "⧖",
  phone: "▭",
  repeat: "↻",
  spiral: "◌",
  reflect: "◑",
  map: "▢",
  money: "$",
  target: "◎",
  lockOpen: "○",
  diamond: "◇",
  // Sign in with Apple only renders on iOS, where the symbol path wins.
  apple: "",
  envelope: "✉",
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
