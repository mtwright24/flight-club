import type { CrewScheduleTrip } from './types';
import {
  type PairingCalendarBlock,
  type PairingDay,
  enumerateDatesInclusive,
  normPairingCode,
} from './pairingDayModel';
import { isFlicaNonFlyingActivityId } from '../../services/flicaScheduleHtmlParser';

/**
 * Smart list / trip preview line: one token per calendar day from ledger city column (BOS – JFK), not
 * `formatTripCompactShorthand` last-arrival-per-day (which can show BOS JFK JFK).
 */
export function routeSummaryFromCanonicalLedgerCities(trip: CrewScheduleTrip): string | null {
  const c = trip.canonicalPairingDays;
  if (!c) return null;
  const keys = Object.keys(c)
    .filter((k) => k >= trip.startDate && k <= trip.endDate)
    .sort((a, b) => a.localeCompare(b));
  if (!keys.length) return null;
  const parts: string[] = [];
  for (const k of keys) {
    const day = c[k];
    if (!day || day.phantomBlankDay) continue;
    const ledger = (day.displayCityLedger ?? '').trim();
    if (!ledger) continue;
    if (ledger === '-' || day.continuationDay) {
      parts.push('–');
    } else {
      parts.push(ledger);
    }
  }
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  return joined.length ? joined : null;
}

/**
 * Project canonical duty days onto `CrewScheduleTrip` rows (same `pairingCode` + overlapping dates).
 * Safe with carry-merge: `trip.startDate` / `endDate` bound which calendar rows receive `PairingDay`.
 */
export function attachCanonicalPairingDaysToTrips(
  trips: CrewScheduleTrip[],
  blocks: PairingCalendarBlock[],
): CrewScheduleTrip[] {
  if (!blocks.length) return trips;
  return trips.map((t) => {
    const code = normPairingCode(t.pairingCode);
    if (!code || code === '—' || code === 'CONT' || isFlicaNonFlyingActivityId(code)) return t;
    const block = blocks.find(
      (b) =>
        normPairingCode(b.pairingCode) === code &&
        !(t.endDate < b.operateStart || t.startDate > b.operateEnd),
    );
    if (!block) return t;
    const byDate: Record<string, PairingDay> = {};
    /**
     * `entriesToTrips` / merged `t.startDate` is often the first *schedule_entries* date, which can be one
     * calendar day **after** `schedule_pairings.operate_start_date` (e.g. BOS+LAS+948 on TH-23, first
     * row filed 4/24). We must project every `PairingDay` in the union of trip span and pairing block
     * span; otherwise the early duty days never get `canonicalPairingDays` and the classic ledger
     * falls back to `schedule_entries` layover (LAS) and wrong 948 `dutyDate`.
     */
    const from = t.startDate < block.operateStart ? t.startDate : block.operateStart;
    const to = t.endDate > block.operateEnd ? t.endDate : block.operateEnd;
    for (const d of enumerateDatesInclusive(from, to)) {
      const day = block.daysByDate[d];
      if (day) byDate[d] = day;
    }
    if (Object.keys(byDate).length === 0) return t;
    let next: CrewScheduleTrip = { ...t, canonicalPairingDays: byDate };
    const line = routeSummaryFromCanonicalLedgerCities(next);
    if (line) {
      next = { ...next, routeSummary: line };
    }
    return next;
  });
}
