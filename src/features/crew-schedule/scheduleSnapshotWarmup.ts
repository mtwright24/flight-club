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
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[SCHEDULE_BACKGROUND_REFRESH_START]', { key, source: 'warmup' });
    }
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
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[SCHEDULE_BACKGROUND_REFRESH_REJECTED]', { key, reason: 'sanity' });
      }
      return false;
    }
    writeScheduleMonthUISnapshot({
      monthKey: key,
      generatedAt: Date.now(),
      trips: data.trips,
      classicRows,
      monthMetrics: data.monthMetrics,
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[SCHEDULE_BACKGROUND_REFRESH_COMMIT]', {
        key,
        source: 'warmup',
        trips: data.trips.length,
        classicRows: classicRows.length,
      });
    }
    return true;
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[SCHEDULE_BACKGROUND_REFRESH_REJECTED]', { key, error: String(e) });
    }
    return false;
  }
}
