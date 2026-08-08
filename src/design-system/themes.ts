export type ThemeCategory = "light" | "dark" | "seasonal";

export interface Theme {
  id: string;
  name: string;
  category: ThemeCategory;
  bg: string;
  ink: string;
  accent: string;
  preview: string;
  palette?: Palette;
}

export interface Palette {
  bg: string;
  bgAlt: string;
  card: string;
  ink: string;
  ink2: string;
  ink3: string;
  ctaBg: string;
  ctaInk: string;
  accent: string;
  border: string;
  borderStrong: string;
  overlay: string;
  success: string;
}

export const THEMES: Theme[] = [
  {
    id: "minimal_sand",
    name: "Minimal Sand",
    category: "light",
      bg: "#EDE0D6",
    ink: "#4B3A35",
    accent: "#E4B5A4",
    preview: "The default. Warm, quiet.",
    palette: {
      bg: "#EDE0D6",
      bgAlt: "#F1E5DC",
      card: "#FBF4EC",
      ink: "#4B3A35",
      ink2: "#6B5750",
      ink3: "#8A7770",
      ctaBg: "#2A1E16",
      ctaInk: "#F6EDE1",
      accent: "#E4B5A4",
      border: "rgba(42,30,22,0.08)",
      borderStrong: "rgba(42,30,22,0.18)",
      overlay: "rgba(42,30,22,0.4)",
      success: "#6E8F5E",
    },
  },
  {
    id: "soft_bloom",
    name: "Soft Bloom",
    category: "light",
      bg: "#F1E5DC",
    ink: "#3B2419",
    accent: "#E4B5A4",
    preview: "Dusty rose warmth.",
  },
  {
    id: "ocean_clarity",
    name: "Ocean Clarity",
    category: "light",
      bg: "#DFE8EC",
    ink: "#24363E",
    accent: "#7BA3AE",
    preview: "Cool, uncluttered.",
  },
  {
    id: "midnight_focus",
    name: "Midnight Focus",
    category: "dark",
      bg: "#12161A",
    ink: "#E8DDD1",
    accent: "#C9A97A",
    preview: "Deep. Quiet. Clear.",
  },
  {
    id: "ink_well",
    name: "Ink Well",
    category: "dark",
      bg: "#1C140D",
    ink: "#F6EDE1",
    accent: "#E4B5A4",
    preview: "Paper against dusk.",
  },
  {
    id: "sunrise_momentum",
    name: "Sunrise Momentum",
    category: "seasonal",
      bg: "#F6D9B8",
    ink: "#3A1E15",
    accent: "#B4553C",
    preview: "The rise. The returning light.",
  },
  {
    id: "golden_success",
    name: "Golden Success",
    category: "seasonal",
      bg: "#F0DFB3",
    ink: "#3A2A10",
    accent: "#8D6A2E",
    preview: "For the days you're building.",
  },
  {
    id: "evergreen",
    name: "Evergreen",
    category: "seasonal",
      bg: "#D7E3D2",
    ink: "#24362A",
    accent: "#6E8F5E",
    preview: "Steadiness. Growth.",
  },
  {
    id: "terracotta",
    name: "Terracotta",
    category: "light",
      bg: "#E8C6B2",
    ink: "#4A2418",
    accent: "#B4553C",
    preview: "Warm clay. Forward motion.",
  },
  {
    id: "arctic",
    name: "Arctic",
    category: "dark",
      bg: "#0F1920",
    ink: "#D8E6EE",
    accent: "#7BA3AE",
    preview: "Minimal. Cold light.",
  },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t,
  );
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function toPalette(theme: Theme): Palette {
  if (theme.palette) return theme.palette;
  const isDark = theme.category === "dark";
  const cardMixTarget = isDark ? "#FFFFFF" : "#FFFFFF";
  const cardMixAmount = isDark ? 0.08 : 0.4;
  return {
    bg: theme.bg,
    bgAlt: mix(theme.bg, theme.ink, 0.05),
    card: mix(theme.bg, cardMixTarget, cardMixAmount),
    ink: theme.ink,
    ink2: mix(theme.ink, theme.bg, 0.3),
    ink3: mix(theme.ink, theme.bg, 0.5),
    ctaBg: theme.ink,
    ctaInk: theme.bg,
    accent: theme.accent,
    border: alpha(theme.ink, 0.08),
    borderStrong: alpha(theme.ink, 0.18),
    overlay: alpha(theme.ink, 0.4),
    success: "#6E8F5E",
  };
}

export const DEFAULT_PALETTE: Palette = toPalette(THEMES[0]!);
