import {
  getLocalDate,
  scoreItem,
  selectDailySet,
  selectSharedDailySet,
  sharedDayIndex,
} from "@/features/content/dailySet";
import type {
  ContentItem,
  PersonalizationWeights,
} from "@/features/content/types";
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

const PERSONALIZED = { personalized: true };

describe("selectDailySet (shared rotation, personalization off)", () => {
  const library = makeLibrary(40);

  it("is the default mode", () => {
    expect(
      selectDailySet(library, "quote", "user-1", "2026-08-09", weights),
    ).toEqual(selectSharedDailySet(library, "quote", "2026-08-09"));
  });

  it("is identical across users, weights and recent-history caches", () => {
    const a = selectDailySet(
      library,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      ["quote-3"],
      {},
    );
    const b = selectDailySet(
      library,
      "quote",
      "user-2",
      "2026-08-09",
      { ...weights, quoteInterests: ["gratitude"], primaryGoals: [] },
      [],
      { personalized: false },
    );
    expect(a).toEqual(b);
    expect(a.length).toBe(DAILY_LIMIT);
  });

  it("does not depend on the order the server returned rows in", () => {
    const shuffled = [...library].reverse();
    expect(selectSharedDailySet(shuffled, "quote", "2026-08-09")).toEqual(
      selectSharedDailySet(library, "quote", "2026-08-09"),
    );
  });

  it("rotates across days and keeps types apart", () => {
    const day1 = selectSharedDailySet(library, "quote", "2026-08-09");
    const day2 = selectSharedDailySet(library, "quote", "2026-08-10");
    const affirmations = selectSharedDailySet(
      library,
      "affirmation",
      "2026-08-09",
    );
    expect(day1).not.toEqual(day2);
    expect(day1.every((id) => id.startsWith("quote-"))).toBe(true);
    expect(affirmations.every((id) => id.startsWith("aff-"))).toBe(true);
  });

  it("never repeats yesterday and spreads exposure evenly over the owner-sized pool", () => {
    // 65 quotes (the owner list size), 20 a day: a deck lasts ~3 days.
    const owner = makeLibrary(65).filter((item) => item.type === "quote");
    const seen = new Map<string, number>();
    let previous = new Set<string>();
    const start = new Date(2026, 8, 1, 12);
    for (let day = 0; day < 60; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      const today = selectSharedDailySet(owner, "quote", getLocalDate(date));
      expect(today).toHaveLength(DAILY_LIMIT);
      expect(new Set(today).size).toBe(DAILY_LIMIT);
      expect(today.filter((id) => previous.has(id))).toEqual([]);
      for (const id of today) seen.set(id, (seen.get(id) ?? 0) + 1);
      previous = new Set(today);
    }
    // 60 days * 20 = 1200 showings over 65 items ≈ 18.5 each; a card
    // passed over at a deck boundary loses at most one showing per deck.
    expect(seen.size).toBe(65);
    for (const count of seen.values()) {
      expect(count).toBeGreaterThanOrEqual(13);
      expect(count).toBeLessThanOrEqual(24);
    }
  });

  it("shows a pool no bigger than a day whole, in a daily order", () => {
    const seven = makeLibrary(7);
    const orders = new Set<string>();
    for (let day = 1; day <= 10; day++) {
      const set = selectSharedDailySet(
        seven,
        "quote",
        `2026-08-${String(day).padStart(2, "0")}`,
      );
      expect(set).toHaveLength(7);
      expect(new Set(set).size).toBe(7);
      orders.add(set.join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("treats dates before the epoch as day zero", () => {
    expect(selectSharedDailySet(library, "quote", "2025-06-01")).toEqual(
      selectSharedDailySet(library, "quote", "2026-01-01"),
    );
  });

  it("ignores interest categories entirely", () => {
    let matching = 0;
    let total = 0;
    for (let day = 1; day <= 30; day++) {
      const set = selectSharedDailySet(
        library,
        "quote",
        `2026-09-${String(day).padStart(2, "0")}`,
      );
      for (const id of set) {
        total += 1;
        if (Number(id.split("-")[1]) % 3 === 0) matching += 1;
      }
    }
    // "discipline" items are 1/3 of the pool and should stay near that.
    expect(matching / total).toBeGreaterThan(0.25);
    expect(matching / total).toBeLessThan(0.42);
  });

  it("handles an empty library", () => {
    expect(selectSharedDailySet([], "quote", "2026-08-09")).toEqual([]);
  });
});

describe("sharedDayIndex", () => {
  it("counts whole days from the fixed epoch, independent of timezone", () => {
    expect(sharedDayIndex("2026-01-01")).toBe(0);
    expect(sharedDayIndex("2026-01-02")).toBe(1);
    expect(sharedDayIndex("2026-03-01")).toBe(59);
    expect(sharedDayIndex("2025-12-31")).toBe(-1);
  });
});

describe("selectDailySet (personalized)", () => {
  const library = makeLibrary(40);

  it("is deterministic for the same user, date and type", () => {
    const a = selectDailySet(
      library,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    const b = selectDailySet(
      library,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    expect(a).toEqual(b);
  });

  it("changes across days and users", () => {
    const day1 = selectDailySet(
      library,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    const day2 = selectDailySet(
      library,
      "quote",
      "user-1",
      "2026-08-10",
      weights,
      [],
      PERSONALIZED,
    );
    const other = selectDailySet(
      library,
      "quote",
      "user-2",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    expect(day1).not.toEqual(day2);
    expect(day1).not.toEqual(other);
  });

  it("returns a full 20-item set, unique, only of the requested type", () => {
    const set = selectDailySet(
      library,
      "affirmation",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    // Item 6: users can now receive up to 20 per type per day.
    expect(DAILY_LIMIT).toBe(20);
    // The 40-per-type fixture is large enough for a full set.
    expect(set.length).toBe(DAILY_LIMIT);
    expect(new Set(set).size).toBe(set.length);
    expect(set.every((id) => id.startsWith("aff-"))).toBe(true);
  });

  it("caps at the daily limit when the pool is larger", () => {
    const big = makeLibrary(60);
    const set = selectDailySet(
      big,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    expect(set.length).toBe(DAILY_LIMIT);
  });

  it("returns the whole pool when fewer than the limit exist", () => {
    const small = makeLibrary(7);
    const set = selectDailySet(
      small,
      "quote",
      "user-1",
      "2026-08-09",
      weights,
      [],
      PERSONALIZED,
    );
    expect(set.length).toBe(7);
    expect(new Set(set).size).toBe(7);
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
        [],
        PERSONALIZED,
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
    expect(
      selectDailySet([], "quote", "u", "2026-08-09", weights, [], PERSONALIZED),
    ).toEqual([]);
  });
});

describe("getLocalDate", () => {
  it("formats as YYYY-MM-DD in local time", () => {
    const date = new Date(2026, 0, 5, 23, 30);
    expect(getLocalDate(date)).toBe("2026-01-05");
  });
});
