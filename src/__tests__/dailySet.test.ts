import { getLocalDate, scoreItem, selectDailySet } from "@/features/content/dailySet";
import type { ContentItem, PersonalizationWeights } from "@/features/content/types";
import { DAILY_LIMIT } from "@/features/content/types";

const weights: PersonalizationWeights = {
  quoteInterests: ["discipline"],
  affirmationInterests: ["calm"],
  primaryGoals: ["career"],
  obstacles: ["procrastination"],
  futureTraits: ["focused"],
};

function makeLibrary(count: number): ContentItem[] {
  const items: ContentItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `quote-${i}`,
      type: "quote",
      body: `Quote number ${i}.`,
      author: null,
      categories: i % 3 === 0 ? ["discipline"] : ["gratitude"],
      tags: i % 4 === 0 ? ["goal:career"] : [],
      priority: i === 5 ? 10 : 0,
    });
    items.push({
      id: `aff-${i}`,
      type: "affirmation",
      body: `I am item ${i}.`,
      author: null,
      categories: i % 3 === 0 ? ["calm"] : ["self-belief"],
      tags: [],
      priority: 0,
    });
  }
  return items;
}

describe("selectDailySet", () => {
  const library = makeLibrary(40);

  it("is deterministic for the same user, date and type", () => {
    const a = selectDailySet(library, "quote", "user-1", "2026-08-09", weights);
    const b = selectDailySet(library, "quote", "user-1", "2026-08-09", weights);
    expect(a).toEqual(b);
  });

  it("changes across days and users", () => {
    const day1 = selectDailySet(library, "quote", "user-1", "2026-08-09", weights);
    const day2 = selectDailySet(library, "quote", "user-1", "2026-08-10", weights);
    const other = selectDailySet(library, "quote", "user-2", "2026-08-09", weights);
    expect(day1).not.toEqual(day2);
    expect(day1).not.toEqual(other);
  });

  it("returns at most the daily limit, only of the requested type", () => {
    const set = selectDailySet(library, "affirmation", "user-1", "2026-08-09", weights);
    expect(set.length).toBeLessThanOrEqual(DAILY_LIMIT);
    expect(set.every((id) => id.startsWith("aff-"))).toBe(true);
  });

  it("weights matching categories above non-matching over many draws", () => {
    let matching = 0;
    let total = 0;
    for (let day = 1; day <= 30; day++) {
      const set = selectDailySet(
        library,
        "quote",
        "user-1",
        `2026-09-${String(day).padStart(2, "0")}`,
        weights,
      );
      for (const id of set) {
        total += 1;
        const idx = Number(id.split("-")[1]);
        if (idx % 3 === 0) matching += 1;
      }
    }
    // Matching items are 1/3 of the pool but score 3x; they should
    // clearly exceed their base rate.
    expect(matching / total).toBeGreaterThan(0.45);
  });

  it("penalizes recently shown items", () => {
    const item: ContentItem = {
      id: "quote-0",
      type: "quote",
      body: "x",
      author: null,
      categories: ["discipline"],
      tags: ["goal:career"],
      priority: 0,
    };
    const fresh = scoreItem(item, weights, new Set());
    const recent = scoreItem(item, weights, new Set(["quote-0"]));
    expect(recent).toBeLessThan(fresh);
    expect(recent).toBeLessThanOrEqual(0.05);
  });

  it("handles an empty library", () => {
    expect(selectDailySet([], "quote", "u", "2026-08-09", weights)).toEqual([]);
  });
});

describe("getLocalDate", () => {
  it("formats as YYYY-MM-DD in local time", () => {
    const date = new Date(2026, 0, 5, 23, 30);
    expect(getLocalDate(date)).toBe("2026-01-05");
  });
});
