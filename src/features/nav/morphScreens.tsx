import { lazy } from "react";

import type { MorphScreens } from "./MorphOverlay";

/**
 * Morph destinations, mapped to the same components that back their routes
 * (deep links keep working). Loaded lazily so the feed's import graph stays
 * light and the heavier screen modules (purchases UI etc.) evaluate off the
 * critical path; `preloadMorphScreens()` warms them once the feed is up.
 */
const loaders = {
  profile: () => import("@/app/(main)/settings/index"),
  favorites: () => import("@/app/(main)/favorites"),
  themes: () => import("@/app/(main)/themes"),
};

export const MORPH_SCREENS: MorphScreens = {
  profile: lazy(loaders.profile),
  favorites: lazy(loaders.favorites),
  themes: lazy(loaders.themes),
};

/**
 * Warm the destination modules in the background so the first morph never
 * shows an empty card while a lazily-bundled chunk loads (dev server).
 */
export function preloadMorphScreens() {
  for (const load of Object.values(loaders)) {
    try {
      load().catch(() => {});
    } catch {
      // Dynamic import unsupported in this environment (e.g. Jest); the
      // overlay still loads screens on demand.
    }
  }
}
