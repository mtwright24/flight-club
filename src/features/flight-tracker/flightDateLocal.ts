/**
 * Calendar date YYYY-MM-DD in the device local timezone.
 * Aviationstack `flight_date` expects the user's "today", not UTC midnight from `toISOString()`.
 */
export function localCalendarDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Route/search param → YYYY-MM-DD, or today if missing/invalid. */
export function parseFlightTrackerDateParam(value: unknown): string {
  const raw =
    typeof value === 'string'
      ? value
      : Array.isArray(value) && value[0] != null
        ? String(value[0])
        : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return localCalendarDate();
}
