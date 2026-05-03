/**
 * Warm full month UI snapshot (trips + classic duties grid) for post-import navigation and background refresh.
 * Uses same duty fetch + classic row builder as ClassicListView — no import/parser changes.
 */

import { buildClassicRowsFromDuties, fetchScheduleDutiesAndPairingsForMonth } from './buildClassicRows';
import { prefetchScheduleMonthSnapshot } from './hooks/useScheduleTripsForMonth';
import { monthCalendarKey } from './scheduleMonthCache';
import { canSaveScheduleMonthUISnapshot, writeScheduleMonthUISnapshot } from './scheduleSnapshotCache';

export async function warmScheduleMonthUISnapshot(year: number, month: number): Promise<boolean> {
  const key = monthCalendarKey(year, month);
  try {
    const data = await prefetchScheduleMonthSnapshot(year, month);
    const { duties, pairings, pairingLegs } = await fetchScheduleDutiesAndPairingsForMonth(year, month);
    const classicRows = buildClassicRowsFromDuties(duties, pairings, pairingLegs);
    if (
      !canSaveScheduleMonthUISnapshot({
        monthKey: key,
        trips: data.trips,
        classicRows,
        monthMetrics: data.monthMetrics,
      })
    ) {
      return false;
    }
    writeScheduleMonthUISnapshot({
      monthKey: key,
      generatedAt: Date.now(),
      trips: data.trips,
      classicRows,
      monthMetrics: data.monthMetrics,
    });
    return true;
  } catch {
    return false;
  }
}
