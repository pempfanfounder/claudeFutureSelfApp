import { OWNER_QUOTES } from "./ownerQuotes";
import type { ContentItem } from "./types";

const LOCAL_PREFIX = "local:";

export function isLocalCatalogId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

function item(
  id: string,
  type: ContentItem["type"],
  body: string,
  author: string | null = null,
): ContentItem {
  return {
    id: `${LOCAL_PREFIX}${id}`,
    type,
    body,
    author,
    categories: [],
    tags: [],
    priority: 1,
  };
}

/** Built-in pack for mock/staging builds when the server library is blocked.
 * Quotes are the owner's official list (same set the DB seed ships). */
export const LOCAL_CATALOG: ContentItem[] = [
  ...OWNER_QUOTES.map((quote) => ({
    ...item(`q${String(quote.n).padStart(2, "0")}`, "quote", quote.body),
    categories: [...quote.categories],
  })),
  item("a01", "affirmation", "I keep the promises I make to myself."),
  item("a02", "affirmation", "I can start again from this hour."),
  item(
    "a03",
    "affirmation",
    "I choose the next right action, not the perfect one.",
  ),
  item(
    "a04",
    "affirmation",
    "I am allowed to be a beginner at the life I want.",
  ),
  item("a05", "affirmation", "I show up even when motivation is quiet."),
  item(
    "a06",
    "affirmation",
    "I treat my future self as someone I refuse to abandon.",
  ),
  item("a07", "affirmation", "I can do hard things in small pieces."),
  item("a08", "affirmation", "I am becoming steadier, not suddenly finished."),
  item(
    "a09",
    "affirmation",
    "I put my phone down and return to what matters.",
  ),
  item(
    "a10",
    "affirmation",
    "I speak to myself the way I would speak to someone I love.",
  ),
  item("a11", "affirmation", "I do not need to feel ready to begin."),
  item("a12", "affirmation", "Today's ordinary work is enough."),
];

export function resolveContentLibrary(
  remote: ContentItem[] | null,
  options: { mockPurchases: boolean },
): ContentItem[] {
  if (remote && remote.length > 0) return remote;
  if (options.mockPurchases) return LOCAL_CATALOG;
  return remote ?? [];
}

export function huggingIndicator(
  layouts: { x: number; width: number }[],
  progress: number,
): { translateX: number; width: number } {
  const from = layouts[0] ?? { x: 0, width: 0 };
  const to = layouts[1] ?? from;
  const t = Math.min(1, Math.max(0, progress));
  return {
    translateX: from.x + (to.x - from.x) * t,
    width: from.width + (to.width - from.width) * t,
  };
}
