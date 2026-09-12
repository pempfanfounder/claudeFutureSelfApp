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

/** Built-in pack for mock/staging builds when the server library is blocked. */
export const LOCAL_CATALOG: ContentItem[] = [
  item("q01", "quote", "Confine yourself to the present.", "Marcus Aurelius"),
  item(
    "q02",
    "quote",
    "We suffer more often in imagination than in reality.",
    "Seneca",
  ),
  item(
    "q03",
    "quote",
    "It is not that we have a short time to live, but that we waste a lot of it.",
    "Seneca",
  ),
  item(
    "q04",
    "quote",
    "The impediment to action advances action. What stands in the way becomes the way.",
    "Marcus Aurelius",
  ),
  item(
    "q05",
    "quote",
    "No man is free who is not master of himself.",
    "Epictetus",
  ),
  item(
    "q06",
    "quote",
    "First say to yourself what you would be; and then do what you have to do.",
    "Epictetus",
  ),
  item(
    "q07",
    "quote",
    "Luck is what happens when preparation meets opportunity.",
    "Seneca",
  ),
  item(
    "q08",
    "quote",
    "Waste no more time arguing about what a good man should be. Be one.",
    "Marcus Aurelius",
  ),
  item(
    "q09",
    "quote",
    "You have power over your mind — not outside events. Realize this, and you will find strength.",
    "Marcus Aurelius",
  ),
  item("q10", "quote", "He who is brave is free.", "Seneca"),
  item(
    "q11",
    "quote",
    "Make yourself the kind of person you promised you would become.",
  ),
  item(
    "q12",
    "quote",
    "The person you will be in five years is built in the ordinary hours of today.",
  ),
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
