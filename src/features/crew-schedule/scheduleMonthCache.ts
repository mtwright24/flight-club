import type { CrewScheduleTrip, ScheduleMonthMetrics } from './types';

export type ScheduleMonthCached = {
  trips: CrewScheduleTrip[];
  monthMetrics: ScheduleMonthMetrics | null;
};

const store = new Map<string, ScheduleMonthCached>();

/** `YYYY-MM` key for `(year, month)` (month 1–12). */
export function monthCalendarKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function readScheduleMonthCache(key: string): ScheduleMonthCached | undefined {
  return store.get(key);
}

export function writeScheduleMonthCache(key: string, data: ScheduleMonthCached): void {
  store.set(key, data);
}
