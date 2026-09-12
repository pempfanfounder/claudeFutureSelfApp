/**
 * Minutes-since-midnight helpers shared by the notification window UI
 * (onboarding config screen, settings). Pure and platform-free so the
 * window rules are unit-testable without rendering a picker.
 *
 * Contract: a window is `{ windowStartMinutes, windowEndMinutes }`, both
 * in local minutes since midnight, `start < end`, and windows never cross
 * midnight (the server schedules inside `[start, end]` of one calendar
 * day). The picker offers 30-minute slots, so the last selectable slot of
 * a day is 23:30 (1410) — a bound is never pushed past it.
 */

export const MINUTES_PER_DAY = 24 * 60;
/** Last valid minute of a day (23:59). */
export const MAX_MINUTES = MINUTES_PER_DAY - 1;
/** Granularity of the time pickers (both platforms). */
export const WINDOW_INTERVAL_MINUTES = 30;
/** A window must span at least this long — start ≤ end − gap. */
export const MIN_WINDOW_GAP_MINUTES = 60;

export interface NotificationWindow {
  windowStartMinutes: number;
  windowEndMinutes: number;
}

export type WindowKey = keyof NotificationWindow;

/**
 * Anchor day for picker values: `mode="time"` pickers ignore the date, and
 * 1 Jan 2001 has no DST transition anywhere, so h:m survives the
 * Date round-trip on every day of the year (today's date would shift a
 * time inside a spring-forward gap).
 */
const ANCHOR = { year: 2001, month: 0, day: 1 } as const;

const normalizeMinutes = (minutes: number): number =>
  ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/**
 * Wall-clock label in the device's own hour cycle — "9:00 AM" on a
 * 12-hour device, "21:00" on a 24-hour one — so it matches what the
 * native time picker shows in the same row. `locale` is for tests
 * (deterministic output); production callers leave it undefined.
 * Falls back to a 12-hour string if Intl is unavailable.
 */
export function formatMinutes(minutes: number, locale?: string): string {
  const total = normalizeMinutes(minutes);
  const h24 = Math.floor(total / 60);
  const mm = total % 60;
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ANCHOR.year, ANCHOR.month, ANCHOR.day, h24, mm));
  } catch {
    const suffix = h24 < 12 ? "AM" : "PM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
  }
}

/** The anchor day at h:m local — the value the native pickers expect. */
export function minutesToDate(minutes: number): Date {
  const clamped = clamp(Math.round(minutes), 0, MAX_MINUTES);
  return new Date(
    ANCHOR.year,
    ANCHOR.month,
    ANCHOR.day,
    Math.floor(clamped / 60),
    clamped % 60,
    0,
    0,
  );
}

/** Local minutes since midnight of `date` (seconds dropped). */
export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Snaps to the nearest multiple of `interval` and keeps the result inside
 * the day: the largest slot is the last multiple of `interval` ≤ 23:59
 * (23:30 for 30-minute slots), so a value near midnight never becomes
 * 24:00 or an off-grid 23:59.
 */
export function roundToInterval(
  minutes: number,
  interval: number = WINDOW_INTERVAL_MINUTES,
): number {
  const lastSlot = Math.floor(MAX_MINUTES / interval) * interval;
  const snapped = Math.round(minutes / interval) * interval;
  return clamp(snapped, 0, lastSlot);
}

/**
 * Applies a new value for one bound and keeps `start ≤ end − gap` by
 * moving the OTHER bound out of the way:
 * - new start too close to end → end = start + gap; if that would leave
 *   the day, end stops at the last slot and start is pulled back to
 *   end − gap;
 * - new end too close to start → start = end − gap; if that goes below
 *   midnight, start stops at 0 and end is pushed up to gap.
 * The changed value is snapped to the picker grid first; the untouched
 * bound is only ever moved by the gap rule, never re-snapped.
 */
export function applyWindowChange(
  prefs: NotificationWindow,
  key: WindowKey,
  minutes: number,
): NotificationWindow {
  const gap = MIN_WINDOW_GAP_MINUTES;
  const lastSlot =
    Math.floor(MAX_MINUTES / WINDOW_INTERVAL_MINUTES) * WINDOW_INTERVAL_MINUTES;
  const value = roundToInterval(minutes);

  if (key === "windowStartMinutes") {
    let start = value;
    let end = prefs.windowEndMinutes;
    if (start > end - gap) {
      end = start + gap;
      if (end > lastSlot) {
        end = lastSlot;
        start = end - gap;
      }
    }
    return { windowStartMinutes: start, windowEndMinutes: end };
  }

  let end = value;
  let start = prefs.windowStartMinutes;
  if (end < start + gap) {
    start = end - gap;
    if (start < 0) {
      start = 0;
      end = gap;
    }
  }
  return { windowStartMinutes: start, windowEndMinutes: end };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
