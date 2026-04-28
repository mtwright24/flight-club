/**
 * FLICA / schedule UI only exposes three consecutive calendar months: prior, current, and next month
 * (anchored to "today"). This matches airline snapshot windows and keeps prefetch/cache bounded.
 *
 * Longer horizons for yearly recap maps / crew-frequency stats remain a separate aggregates concern
 * (e.g. server-side rollup over historic `schedule_entries` — not gated by this window).
 */

export type ScheduleYearMonth = { year: number; month: number };

function ord(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function shiftMonth(y: number, m: number, delta: number): ScheduleYearMonth {
  const d = new Date(y, m - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Sliding [prev month, anchor month, next month] for the given anchor (default: now). */
export function getThreeMonthScheduleWindowBounds(
  anchor: Date = new Date(),
): { min: ScheduleYearMonth; max: ScheduleYearMonth } {
  const cy = anchor.getFullYear();
  const cm = anchor.getMonth() + 1;
  return {
    min: shiftMonth(cy, cm, -1),
    max: shiftMonth(cy, cm, 1),
  };
}

export function clampYearMonthToScheduleWindow(
  year: number,
  month: number,
  anchor: Date = new Date(),
): ScheduleYearMonth {
  const { min, max } = getThreeMonthScheduleWindowBounds(anchor);
  const o = ord(year, month);
  const omin = ord(min.year, min.month);
  const omax = ord(max.year, max.month);
  if (o < omin) return min;
  if (o > omax) return max;
  return { year, month };
}

export function tryStepScheduleMonth(
  year: number,
  month: number,
  delta: -1 | 1,
  anchor: Date = new Date(),
): ScheduleYearMonth | null {
  const next = shiftMonth(year, month, delta);
  const clamped = clampYearMonthToScheduleWindow(next.year, next.month, anchor);
  if (next.year !== clamped.year || next.month !== clamped.month) return null;
  return next;
}

export function canGoToPreviousScheduleMonth(
  year: number,
  month: number,
  anchor: Date = new Date(),
): boolean {
  return tryStepScheduleMonth(year, month, -1, anchor) != null;
}

export function canGoToNextScheduleMonth(
  year: number,
  month: number,
  anchor: Date = new Date(),
): boolean {
  return tryStepScheduleMonth(year, month, 1, anchor) != null;
}
