import type { CrewScheduleTrip } from './types';
import {
  type PairingCalendarBlock,
  type PairingDay,
  enumerateDatesInclusive,
  normPairingCode,
} from './pairingDayModel';

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
    if (!code || code === '—' || code === 'PTV' || code === 'PTO' || code === 'CONT') return t;
    const block = blocks.find(
      (b) =>
        normPairingCode(b.pairingCode) === code &&
        !(t.endDate < b.operateStart || t.startDate > b.operateEnd),
    );
    if (!block) return t;
    const byDate: Record<string, PairingDay> = {};
    for (const d of enumerateDatesInclusive(t.startDate, t.endDate)) {
      const day = block.daysByDate[d];
      if (day) byDate[d] = day;
    }
    if (Object.keys(byDate).length === 0) return t;
    return { ...t, canonicalPairingDays: byDate };
  });
}
