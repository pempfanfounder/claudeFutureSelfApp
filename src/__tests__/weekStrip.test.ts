import {
  WEEK_LENGTH,
  weekStrip,
} from "@/features/onboarding/engine/steps/weekStrip";

/** Local noon, so no timezone can shift the weekday. */
const on = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0, 0);

describe("weekStrip", () => {
  it("starts on the device's current day, whatever day that is", () => {
    // 18 Aug 2026 is a Tuesday; 21 Aug 2026 is a Friday.
    expect(weekStrip(on(2026, 8, 18), "en-US")).toEqual([
      "Tu",
      "We",
      "Th",
      "Fr",
      "Sa",
      "Su",
      "Mo",
    ]);
    expect(weekStrip(on(2026, 8, 21), "en-US")).toEqual([
      "Fr",
      "Sa",
      "Su",
      "Mo",
      "Tu",
      "We",
      "Th",
    ]);
  });

  it("never hardcodes Saturday as today", () => {
    // The old strip was a fixed ["Sa", …] with index 0 checked.
    const notSaturday = on(2026, 8, 19); // Wednesday
    expect(weekStrip(notSaturday, "en-US")[0]).not.toBe("Sa");
    expect(weekStrip(notSaturday, "en-US")[0]).toBe("We");
  });

  it("covers every weekday exactly once, in order, for any start day", () => {
    for (let day = 17; day <= 23; day++) {
      const strip = weekStrip(on(2026, 8, day), "en-US");
      expect(strip).toHaveLength(WEEK_LENGTH);
      expect(new Set(strip).size).toBe(WEEK_LENGTH);
    }
  });

  it("uses the device locale and trims to two characters", () => {
    // Dutch short weekdays are already two letters ("wo"), German carries
    // a trailing dot ("Mi.") that must not eat a letter.
    expect(weekStrip(on(2026, 8, 19), "nl-NL")[0]).toBe("Wo");
    expect(weekStrip(on(2026, 8, 19), "de-DE")[0]).toBe("Mi");
    for (const label of weekStrip(on(2026, 8, 19), "de-DE")) {
      expect(label).toMatch(/^[\p{L}\p{N}]{1,2}$/u);
    }
  });

  it("falls back to English initials when Intl is unavailable", () => {
    const real = Intl.DateTimeFormat;
    // @ts-expect-error deliberately breaking Intl for the fallback path
    Intl.DateTimeFormat = function BrokenIntl() {
      throw new Error("no Intl");
    };
    try {
      expect(weekStrip(on(2026, 8, 19))).toEqual([
        "We",
        "Th",
        "Fr",
        "Sa",
        "Su",
        "Mo",
        "Tu",
      ]);
    } finally {
      Intl.DateTimeFormat = real;
    }
  });
});
