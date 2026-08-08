// Static design tokens. The active palette is read reactively via
// `useColors()` / `useThemedStyles()` (see `@/design-system/useColors`),
// which subscribe to the active theme from `<ThemeProvider>`. The exports
// below are theme-independent constants (radii, spacing, shadows, type
// scale, motion).

export const radii = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const type = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  serifMed: "InstrumentSerif_400Regular",
  sans: "Inter_400Regular",
  sansMed: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
  sizes: {
    eyebrow: 10,
    label: 12,
    body: 15,
    lead: 17,
    h3: 22,
    h2: 28,
    h1: 32,
    display: 40,
  },
  lineHeights: {
    tight: 1.08,
    snug: 1.2,
    body: 1.45,
    relaxed: 1.55,
  },
} as const;

export const motion = {
  fast: 180,
  base: 280,
  slow: 420,
  slower: 800,
} as const;
