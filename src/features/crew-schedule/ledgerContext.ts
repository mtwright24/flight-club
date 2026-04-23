/**
 * Cross-month **display** context for the monthly schedule ledger. Does not change import/DB
 * `trip_group_id` wiring — only helps the native UI connect trips that break across month boundaries
 * (same `pairing_code` + calendar-adjacent dates in adjacent month queries).
 */
import type { ScheduleEntryRow } from './scheduleApi';
import type { CrewScheduleTrip } from './types';

export function addIsoDays(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, m - 1, d, 12, 0, 0, 0);
  t.setDate(t.getDate() + deltaDays);
  return t.toISOString().slice(0, 10);
}

function maxDateForPairing(rows: ScheduleEntryRow[], pred: (p: string) => boolean): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const p = (r.pairing_code ?? '').trim();
    if (!p || !pred(p)) continue;
    const d = (r.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const cur = m.get(p);
    if (!cur || d > cur) m.set(p, d);
  }
  return m;
}

function minDateForPairing(rows: ScheduleEntryRow[], pred: (p: string) => boolean): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const p = (r.pairing_code ?? '').trim();
    if (!p || !pred(p)) continue;
    const d = (r.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const cur = m.get(p);
    if (!cur || d < cur) m.set(p, d);
  }
  return m;
}

function isRealPairingCode(p: string): boolean {
  const u = p.toUpperCase();
  return u.length > 0 && u !== 'CONT' && u !== '—' && u !== 'RDO';
}

export type EnrichTripsWithLedgerContextOpts = {
  /** Required for merged trips: if `t.startDate` is before the viewed month, mark carry-in. */
  currentMonthRows?: ScheduleEntryRow[];
  viewYear?: number;
  viewMonth?: number;
};

/**
 * Mark trips whose first/last in-month day continues from / into the adjacent month
 * (same pairing code, date ±1 day across the boundary). Pure client-side; no new tables.
 * With `currentMonthRows` + view month/year: if the same `trip_group_id` exists in both prev+current
 * rows and `t.startDate` is before the first day of the viewed month, set carry-in (J1016 Mar→Apr).
 */
export function enrichTripsWithLedgerContext(
  trips: CrewScheduleTrip[],
  prevMonthRows: ScheduleEntryRow[],
  nextMonthRows: ScheduleEntryRow[],
  opts?: EnrichTripsWithLedgerContextOpts,
): CrewScheduleTrip[] {
  if (!trips.length) return trips;
  const lastPrev = maxDateForPairing(prevMonthRows, isRealPairingCode);
  const firstNext = minDateForPairing(nextMonthRows, isRealPairingCode);

  const monthStart =
    opts?.viewYear != null && opts?.viewMonth != null
      ? `${opts.viewYear}-${String(opts.viewMonth).padStart(2, '0')}-01`
      : null;
  const currentRows = opts?.currentMonthRows;

  return trips.map((t) => {
    const p = (t.pairingCode ?? '').trim();
    if (!isRealPairingCode(p)) return t;
    const lp = lastPrev.get(p);
    const fn = firstNext.get(p);
    let carryIn = false;
    let carryOut = false;
    if (lp && addIsoDays(lp, 1) === t.startDate) carryIn = true;
    if (
      !carryIn &&
      monthStart &&
      currentRows &&
      prevMonthRows.some((r) => r.trip_group_id === t.id) &&
      currentRows.some((r) => r.trip_group_id === t.id) &&
      t.startDate < monthStart
    ) {
      carryIn = true;
    }
    /** Same pairing in prev + current month but different `trip_group_id` (common after per-month import). */
    if (
      !carryIn &&
      monthStart &&
      currentRows &&
      t.startDate < monthStart &&
      prevMonthRows.some((r) => (r.pairing_code ?? '').trim().toUpperCase() === p.toUpperCase()) &&
      currentRows.some((r) => (r.pairing_code ?? '').trim().toUpperCase() === p.toUpperCase())
    ) {
      carryIn = true;
    }
    if (fn && addIsoDays(t.endDate, 1) === fn) carryOut = true;
    if (!carryIn && !carryOut) return t;
    return {
      ...t,
      ledgerContext: {
        carryInFromPriorMonth: carryIn,
        carryOutToNextMonth: carryOut,
      },
    };
  });
}
