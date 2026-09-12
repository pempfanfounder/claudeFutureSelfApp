import type { IconName } from "./components/Icon";

/**
 * Color emoji in RN Text become LastResort "?" once Inter is loaded.
 * Map the content glyphs to SF Symbol names instead.
 */
const OPTION_ICON: Record<string, IconName> = {
  "🔥": "flame",
  "📈": "chart",
  "🌫": "fog",
  "🤍": "heart",
  "💪": "strength",
  "🧠": "brain",
  "🩺": "health",
  "💼": "briefcase",
  "❤": "heartFill",
  "🕊": "peace",
  "🧭": "compass",
  "⏳": "hourglass",
  "📱": "phone",
  "🔁": "repeat",
  "🌀": "spiral",
  "🪞": "reflect",
  "🗺": "map",
  "💰": "money",
  "🎯": "target",
  "✨": "sparkle",
  "🔓": "lockOpen",
  "🔔": "bell",
  "💎": "diamond",
  "✓": "check",
};

function glyphKey(value: string): string {
  return Array.from(value.replace(/\uFE0F/g, "").trim()).join("");
}

export function resolveOptionIcon(emoji: string): IconName | null {
  return OPTION_ICON[glyphKey(emoji)] ?? null;
}
