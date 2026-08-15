import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { themeById } from "@/design-system/themes";
import { monitoring } from "@/lib/monitoring";

// Module cycle with ./widgetSync is safe: each side only dereferences
// the other at call time, never during module initialization.
import { syncWidgets } from "./widgetSync";

const PREFS_KEY = "fs.widget.prefs.v1";

/** User-tweakable widget appearance + content preferences (local-first). */
export interface WidgetPrefs {
  home: {
    themeId: string;
    source: "daily" | "pinned";
    showAuthor: boolean;
  };
  lock: {
    source: "daily" | "pinned";
  };
}

export interface WidgetPrefsPartial {
  home?: Partial<WidgetPrefs["home"]>;
  lock?: Partial<WidgetPrefs["lock"]>;
}

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  home: { themeId: "minimal_sand", source: "daily", showAuthor: true },
  lock: { source: "daily" },
};

interface WidgetPrefsState {
  prefs: WidgetPrefs;
  /** True once storage has been read (or a change made) this session. */
  hydrated: boolean;
}

export const useWidgetPrefs = create<WidgetPrefsState>(() => ({
  prefs: DEFAULT_WIDGET_PREFS,
  hydrated: false,
}));

function merge(base: WidgetPrefs, partial: WidgetPrefsPartial): WidgetPrefs {
  return {
    home: { ...base.home, ...partial.home },
    lock: { ...base.lock, ...partial.lock },
  };
}

/** Hydrate prefs from storage. Idempotent — only the first call reads. */
export async function loadWidgetPrefs(): Promise<void> {
  if (useWidgetPrefs.getState().hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as WidgetPrefsPartial;
      useWidgetPrefs.setState({
        prefs: merge(DEFAULT_WIDGET_PREFS, stored),
        hydrated: true,
      });
      return;
    }
  } catch (error) {
    monitoring.captureError(error, { area: "widgets.prefs.load" });
  }
  useWidgetPrefs.setState({ hydrated: true });
}

/**
 * Deep-merge a partial update, persist it, then refresh the widgets.
 * The widget sync runs fire-and-forget: prefs must save even when the
 * native widget modules are unavailable (Expo Go, Jest).
 */
export async function setWidgetPrefs(
  partial: WidgetPrefsPartial,
): Promise<void> {
  const next = merge(useWidgetPrefs.getState().prefs, partial);
  useWidgetPrefs.setState({ prefs: next, hydrated: true });
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch (error) {
    monitoring.captureError(error, { area: "widgets.prefs.save" });
  }
  void syncWidgets().catch(() => {});
}

/**
 * Widget-facing palette for a theme id. Widgets render outside the
 * app's theme context, so they get a flat { bg, ink, ink2 } slice:
 * explicit theme palettes win, otherwise derive the secondary ink by
 * adding a hex alpha to the primary. Unknown ids fall back to the
 * brand's minimal_sand.
 */
export function paletteForWidget(themeId: string): {
  bg: string;
  ink: string;
  ink2: string;
} {
  const theme = themeById(themeId) ?? themeById("minimal_sand")!;
  if (theme.palette) {
    return {
      bg: theme.palette.bg,
      ink: theme.palette.ink,
      ink2: theme.palette.ink2,
    };
  }
  return { bg: theme.bg, ink: theme.ink, ink2: `${theme.ink}99` };
}
