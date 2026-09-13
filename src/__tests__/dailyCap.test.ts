import { DAILY_LIMIT } from "@/features/content/types";
import {
  applyCountChange,
  clampDailyCounts,
  DAILY_NOTIFICATION_CAP,
  dailyCapHint,
  exceedsDailyCap,
} from "@/features/notifications/dailyCap";
import { assertWithinDailyCap } from "@/features/notifications/preferences";

jest.mock("@/lib/supabase", () => ({ getIdentitySupabase: jest.fn() }));

describe("combined daily notification cap", () => {
  it("is the promised 20 a day and matches the per-kind limit", () => {
    expect(DAILY_NOTIFICATION_CAP).toBe(20);
    expect(DAILY_NOTIFICATION_CAP).toBe(DAILY_LIMIT);
  });

  it("lowers the other count only as far as needed when one rises", () => {
    expect(
      applyCountChange(
        { quotesPerDay: 12, affirmationsPerDay: 8 },
        "quotesPerDay",
        13,
      ),
    ).toEqual({ quotesPerDay: 13, affirmationsPerDay: 7 });
    expect(
      applyCountChange(
        { quotesPerDay: 3, affirmationsPerDay: 3 },
        "affirmationsPerDay",
        20,
      ),
    ).toEqual({ quotesPerDay: 0, affirmationsPerDay: 20 });
    // Room left: nothing else moves.
    expect(
      applyCountChange(
        { quotesPerDay: 3, affirmationsPerDay: 3 },
        "quotesPerDay",
        4,
      ),
    ).toEqual({ quotesPerDay: 4, affirmationsPerDay: 3 });
    // Lowering never raises the other count back.
    expect(
      applyCountChange(
        { quotesPerDay: 20, affirmationsPerDay: 0 },
        "quotesPerDay",
        19,
      ),
    ).toEqual({ quotesPerDay: 19, affirmationsPerDay: 0 });
    // Out-of-range input is clamped per kind first.
    expect(
      applyCountChange(
        { quotesPerDay: 5, affirmationsPerDay: 5 },
        "quotesPerDay",
        99,
      ),
    ).toEqual({ quotesPerDay: 20, affirmationsPerDay: 0 });
  });

  it("clamps stored counts proportionally, like the server migration", () => {
    const cases: [number, number, number, number][] = [
      [20, 20, 10, 10],
      [20, 5, 16, 4],
      [20, 1, 19, 1],
      [5, 20, 4, 16],
      [1, 20, 0, 20],
      [15, 15, 10, 10],
    ];
    for (const [q, a, fq, fa] of cases) {
      expect(
        clampDailyCounts({ quotesPerDay: q, affirmationsPerDay: a }),
      ).toEqual({ quotesPerDay: fq, affirmationsPerDay: fa });
    }
    // Within the cap: untouched.
    expect(
      clampDailyCounts({ quotesPerDay: 12, affirmationsPerDay: 8 }),
    ).toEqual({ quotesPerDay: 12, affirmationsPerDay: 8 });
    expect(
      clampDailyCounts({ quotesPerDay: 0, affirmationsPerDay: 0 }),
    ).toEqual({ quotesPerDay: 0, affirmationsPerDay: 0 });
  });

  it("flags totals above the cap and phrases the hint", () => {
    expect(exceedsDailyCap({ quotesPerDay: 10, affirmationsPerDay: 10 })).toBe(
      false,
    );
    expect(exceedsDailyCap({ quotesPerDay: 10, affirmationsPerDay: 11 })).toBe(
      true,
    );
    expect(dailyCapHint({ quotesPerDay: 3, affirmationsPerDay: 3 })).toBe(
      "Up to 20 a day in total. You're at 6.",
    );
    expect(dailyCapHint({ quotesPerDay: 12, affirmationsPerDay: 8 })).toMatch(
      /^20 a day is the maximum/,
    );
  });
});

describe("assertWithinDailyCap (client-side prefs validation)", () => {
  it("accepts totals up to 20 and partial patches", () => {
    expect(() =>
      assertWithinDailyCap({ quotes_per_day: 12, affirmations_per_day: 8 }),
    ).not.toThrow();
    expect(() => assertWithinDailyCap({ quotes_per_day: 20 })).not.toThrow();
    expect(() =>
      assertWithinDailyCap({
        window_start_minutes: 540,
        window_end_minutes: 1260,
      }),
    ).not.toThrow();
  });

  it("rejects a total above 20 or a count outside 0..20 before the RPC", () => {
    expect(() =>
      assertWithinDailyCap({ quotes_per_day: 12, affirmations_per_day: 9 }),
    ).toThrow("at most 20 a day");
    expect(() => assertWithinDailyCap({ quotes_per_day: 21 })).toThrow(
      "0 to 20",
    );
    expect(() => assertWithinDailyCap({ affirmations_per_day: -1 })).toThrow(
      "0 to 20",
    );
    expect(() => assertWithinDailyCap({ quotes_per_day: 2.5 })).toThrow(
      "0 to 20",
    );
  });
});
