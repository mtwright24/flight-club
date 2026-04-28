import { parseScheduleTimeMinutes } from './scheduleTime';

/** Local clock: arrival "before" departure ⇒ lands the next calendar morning (overnight / dash day). */
export function isOvernightArrivalInRow(dep?: string, arr?: string): boolean {
  const d = dep ? parseScheduleTimeMinutes(dep) : null;
  const a = arr ? parseScheduleTimeMinutes(arr) : null;
  if (d == null || a == null) return false;
  return a < d;
}
