import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { themeById } from "@/design-system/themes";
import { ownedStorage } from "@/lib/accountStorage";
import {
  captureIdentity,
  assertCurrentIdentity,
  type Identity,
} from "@/lib/appState";

// Module cycle with ./widgetSync is safe: each side only dereferences
// the other at call time, never during module initialization.
import { syncWidgets } from "./widgetSync";

const prefsKey = (userId: string) => `fs.widget.prefs.v2.${userId}`;

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
  ownerGeneration: number | null;
  error: string | null;
}

export const useWidgetPrefs = create<WidgetPrefsState>(() => ({
  prefs: DEFAULT_WIDGET_PREFS,
  hydrated: false,
  ownerGeneration: null,
  error: null,
}));

function merge(base: WidgetPrefs, partial: WidgetPrefsPartial): WidgetPrefs {
  return {
    home: { ...base.home, ...partial.home },
    lock: { ...base.lock, ...partial.lock },
  };
}

/** All hydration and edits share account persistence ordering. */
export async function loadWidgetPrefs(
  identity = captureIdentity(),
): Promise<void> {
  assertCurrentIdentity(identity);
  if (
    useWidgetPrefs.getState().hydrated &&
    useWidgetPrefs.getState().ownerGeneration === identity.generation
  )
    return;
  await ownedStorage(identity, async () => {
    if (
      useWidgetPrefs.getState().hydrated &&
      useWidgetPrefs.getState().ownerGeneration === identity.generation
    )
      return;
    const raw = await AsyncStorage.getItem(prefsKey(identity.userId!));
    assertCurrentIdentity(identity);
    const prefs = raw
      ? merge(DEFAULT_WIDGET_PREFS, JSON.parse(raw) as WidgetPrefsPartial)
      : DEFAULT_WIDGET_PREFS;
    useWidgetPrefs.setState({
      prefs,
      hydrated: true,
      ownerGeneration: identity.generation,
      error: null,
    });
  });
}
export async function setWidgetPrefs(
  partial: WidgetPrefsPartial,
): Promise<void> {
  const identity = captureIdentity();
  await ownedStorage(identity, async () => {
    // Read inside the queue so rapid partial updates never lose a sibling edit.
    const raw = await AsyncStorage.getItem(prefsKey(identity.userId!));
    const next = merge(
      raw ? merge(DEFAULT_WIDGET_PREFS, JSON.parse(raw)) : DEFAULT_WIDGET_PREFS,
      partial,
    );
    await AsyncStorage.setItem(
      prefsKey(identity.userId!),
      JSON.stringify(next),
    );
    assertCurrentIdentity(identity);
    useWidgetPrefs.setState({
      prefs: next,
      hydrated: true,
      ownerGeneration: identity.generation,
      error: null,
    });
  });
  void syncWidgets(identity).catch(() => {});
}
export function setWidgetSyncError(identity: Identity, error: string | null) {
  try {
    assertCurrentIdentity(identity);
    useWidgetPrefs.setState({ error });
  } catch {
    /* departed account */
  }
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

export function resetWidgetPrefs() {
  useWidgetPrefs.setState({
    prefs: DEFAULT_WIDGET_PREFS,
    hydrated: false,
    ownerGeneration: null,
    error: null,
  });
}
