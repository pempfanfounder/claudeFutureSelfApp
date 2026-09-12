/**
 * Weekday strip for the streak-commit screen.
 *
 * The strip always STARTS at the device's current day, so the first dot
 * (the one drawn as checked, "day 1") is genuinely today and the six dots
 * after it are the days still to come. A fixed Mon-Sun strip would put
 * unchecked dots before today, which reads as "you already missed those".
 *
 * Pure and date-injected so the labels are unit-testable without freezing
 * the clock inside the component.
 */

/** Fallback when Intl is unavailable, indexed by `Date.getDay()`. */
const FALLBACK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** Days per week, and the length of the strip. */
export const WEEK_LENGTH = 7;

/**
 * Trims a locale short weekday ("Sat", "za", "Sa.", "土") down to the
 * two-character form the tracker is designed around. Trailing punctuation
 * (German "Sa.", Czech "so") is dropped first so it never eats a letter.
 */
function shorten(name: string): string {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  const trimmed = (letters || name).slice(0, 2);
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Seven short weekday labels starting at `now`'s weekday, in the device
 * locale. `locale` is for tests (deterministic output); production
 * callers leave it undefined so Intl picks up the device setting.
 */
export function weekStrip(now: Date, locale?: string): string[] {
  const start = now.getDay();
  let format: (date: Date) => string;
  try {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    format = (date) => shorten(formatter.format(date));
  } catch {
    format = (date) => FALLBACK[date.getDay()]!;
  }
  return Array.from({ length: WEEK_LENGTH }, (_, i) => {
    // 4 Jan 1970 was a Sunday, so this anchor day's weekday is exactly
    // `(start + i) % 7` regardless of what `now` is.
    const day = new Date(1970, 0, 4 + ((start + i) % WEEK_LENGTH));
    return format(day);
  });
}
