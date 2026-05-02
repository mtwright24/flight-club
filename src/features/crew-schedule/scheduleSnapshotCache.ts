/**
 * Stale-while-refresh UI snapshot for crew schedule (classic Layer-7 + trips + metrics).
 * Presentation-only: does not replace Supabase or schedule_month_cache.
 */

import type { ClassicScheduleRow } from './buildClassicRows';
import { monthCalendarKey } from './scheduleMonthCache';
import type { CrewScheduleTrip, ScheduleMonthMetrics } from './types';

export type ScheduleMonthUISnapshot = {
  monthKey: string;
  generatedAt: number;
  trips: CrewScheduleTrip[];
  classicRows: ClassicScheduleRow[];
  monthMetrics: ScheduleMonthMetrics | null;
  scrollOffsetY?: number;
};

const monthUi = new Map<string, ScheduleMonthUISnapshot>();

export function readScheduleMonthUISnapshot(monthKey: string): ScheduleMonthUISnapshot | undefined {
  return monthUi.get(monthKey);
}

export function writeScheduleMonthUISnapshot(snap: ScheduleMonthUISnapshot): void {
  monthUi.set(snap.monthKey, {
    ...snap,
    trips: JSON.parse(JSON.stringify(snap.trips)) as CrewScheduleTrip[],
    classicRows: JSON.parse(JSON.stringify(snap.classicRows)) as ClassicScheduleRow[],
    monthMetrics: snap.monthMetrics ? JSON.parse(JSON.stringify(snap.monthMetrics)) : null,
  });
}

export function clearScheduleMonthUISnapshot(monthKey: string): void {
  monthUi.delete(monthKey);
}

function tripLooksPlausible(t: CrewScheduleTrip): boolean {
  return Boolean(t?.id && t.startDate && t.endDate);
}

/**
 * Month label / data consistency: snapshot key must match requested calendar month.
 * Trips may span adjacent months; require at least one trip overlapping view month or empty grid with metrics.
 */
export function isScheduleMonthUISnapshotCoherent(snap: ScheduleMonthUISnapshot, year: number, month: number): boolean {
  if (!snap?.monthKey || snap.monthKey !== monthCalendarKey(year, month)) return false;
  if (!Array.isArray(snap.trips) || !Array.isArray(snap.classicRows)) return false;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const last = viewMonthLastIsoSimple(year, month);
  for (const t of snap.trips) {
    if (!tripLooksPlausible(t)) return false;
  }
  if (snap.trips.length > 0) {
    const anyOverlap = snap.trips.some((t) => overlapMonth(t.startDate, t.endDate, ym, last));
    if (!anyOverlap) return false;
  }
  return true;
}

function viewMonthLastIsoSimple(year: number, month1to12: number): string {
  const lastDom = new Date(year, month1to12, 0).getDate();
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-${String(lastDom).padStart(2, '0')}`;
}

function overlapMonth(start: string, end: string, ymPrefix: string, monthLastIso: string): boolean {
  const s = String(start).slice(0, 10);
  const e = String(end).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return false;
  const monthStart = `${ymPrefix}-01`;
  return s <= monthLastIso && e >= monthStart;
}

/** Saves only when the classic grid has finished a coherent build (caller validates). */
export function canSaveScheduleMonthUISnapshot(params: {
  monthKey: string;
  trips: CrewScheduleTrip[];
  classicRows: ClassicScheduleRow[];
  monthMetrics: ScheduleMonthMetrics | null;
}): boolean {
  if (!params.monthKey || !Array.isArray(params.trips) || !Array.isArray(params.classicRows)) return false;
  for (const t of params.trips) {
    if (!tripLooksPlausible(t)) return false;
  }
  return true;
}
