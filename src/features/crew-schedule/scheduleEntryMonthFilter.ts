import type { ScheduleEntryRow } from './scheduleApi';

function calendarMonthIsoBounds(year: number, month1to12: number): { mStart: string; mEnd: string } {
  const mStart = `${year}-${String(month1to12).padStart(2, '0')}-01`;
  const lastD = new Date(year, month1to12, 0).getDate();
  const mEnd = `${year}-${String(month1to12).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  return { mStart, mEnd };
}

/** Keep schedule_entries rows dated in [view month] ∪ [prior calendar month] only — drops mis-keyed May dates under April month_key */
export function filterScheduleEntriesToViewMonthAndAdjacentPrior(
  rows: ScheduleEntryRow[],
  viewYear: number,
  viewMonth: number,
): ScheduleEntryRow[] {
  const v = calendarMonthIsoBounds(viewYear, viewMonth);
  const py = viewMonth === 1 ? viewYear - 1 : viewYear;
  const pm = viewMonth === 1 ? 12 : viewMonth - 1;
  const p = calendarMonthIsoBounds(py, pm);
  return rows.filter((r) => {
    const d = String(r.date ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return (d >= v.mStart && d <= v.mEnd) || (d >= p.mStart && d <= p.mEnd);
  });
}
