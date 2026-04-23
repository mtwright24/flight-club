/**
 * Merges adjacent `CrewScheduleTrip` objects that share a real `pairing_code` and connect on
 * consecutive calendar days. Import often assigns *different* `trip_group_id` per day; without this,
 * the monthly ledger shows pairing on every "first day" of each fragment and breaks FC-style rows.
 * Display-only — does not change Supabase.
 */
import { addIsoDays } from './ledgerContext';
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleDutyStatus } from './types';

function calendarSpanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function isRealPairing(p: string): boolean {
  const u = p.trim().toUpperCase();
  return u.length > 0 && u !== 'CONT' && u !== '—' && u !== 'RDO' && u !== 'PTV';
}

function isMergeableDuty(t: CrewScheduleTrip): boolean {
  if (!isRealPairing(t.pairingCode)) return false;
  if (t.status === 'off' || t.status === 'pto' || t.status === 'rsv' || t.status === 'training') return false;
  if (t.status === 'other') return false;
  return true;
}

function legSortKey(l: CrewScheduleLeg): string {
  return `${l.dutyDate ?? ''}::${l.id}`;
}

function pickMergedStatus(a: CrewScheduleTrip, b: CrewScheduleTrip, legs: CrewScheduleLeg[]): ScheduleDutyStatus {
  if (!legs.length) return a.status;
  if (a.status === 'deadhead' && b.status === 'deadhead' && legs.every((l) => l.isDeadhead)) {
    return 'deadhead';
  }
  if (a.status === 'flying' || b.status === 'flying' || a.status === 'deadhead' || b.status === 'deadhead') {
    return 'flying';
  }
  if (a.status === 'continuation' || b.status === 'continuation') return 'flying';
  return a.status;
}

function mergeTwoTrips(a: CrewScheduleTrip, b: CrewScheduleTrip): CrewScheduleTrip {
  const legs: CrewScheduleLeg[] = [...a.legs, ...b.legs].sort((x, y) => legSortKey(x).localeCompare(legSortKey(y)));
  const lay: Record<string, string> = { ...a.layoverByDate, ...b.layoverByDate };
  const stn: Record<string, string> = { ...a.layoverStationByDate, ...b.layoverStationByDate };
  // Caller only merges `b` when it is the calendar day after `a`'s `endDate`, so the block is [a.start, b.end].
  const startDate = a.startDate;
  const endDate = b.endDate;
  const first = legs[0];
  const last = legs[legs.length - 1];
  const st = pickMergedStatus(a, b, legs);
  return {
    ...a,
    id: a.id,
    endDate,
    startDate: startDate,
    status: st,
    dutyDays: calendarSpanDays(startDate, endDate),
    legs,
    origin: first?.departureAirport ?? a.origin,
    destination: last?.arrivalAirport ?? b.destination,
    layoverByDate: Object.keys(lay).length > 0 ? lay : a.layoverByDate,
    layoverStationByDate: Object.keys(stn).length > 0 ? stn : a.layoverStationByDate,
    ledgerContext: {
      carryInFromPriorMonth: Boolean(a.ledgerContext?.carryInFromPriorMonth || b.ledgerContext?.carryInFromPriorMonth),
      carryOutToNextMonth: Boolean(a.ledgerContext?.carryOutToNextMonth || b.ledgerContext?.carryOutToNextMonth),
    },
  };
}

/**
 * If two trip rows are the next calendar day and share the same pairing, merge for ledger math.
 */
export function mergeContiguousPairingTrips(trips: CrewScheduleTrip[]): CrewScheduleTrip[] {
  const sorted = [...trips].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.pairingCode.localeCompare(b.pairingCode) || a.id.localeCompare(b.id),
  );
  const out: CrewScheduleTrip[] = [];
  for (const t of sorted) {
    if (!isMergeableDuty(t)) {
      out.push(t);
      continue;
    }
    const last = out[out.length - 1];
    if (
      last &&
      isMergeableDuty(last) &&
      last.pairingCode.trim() === t.pairingCode.trim() &&
      addIsoDays(last.endDate, 1) === t.startDate
    ) {
      out[out.length - 1] = mergeTwoTrips(last, t);
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Calendar days *strictly* between `endA` and `startB` (exclusive of both), e.g. Mar31→Apr2 has 0, Apr3→Apr5 has 1 (Apr4).
 */
function exclusiveGapDayCount(endA: string, startB: string): number {
  const t0 = new Date(`${endA}T12:00:00`);
  const t1 = new Date(`${startB}T12:00:00`);
  const d = (t1.getTime() - t0.getTime()) / 864e5;
  if (d <= 0) return -1;
  return Math.max(0, d - 1);
}

/**
 * **Same pairing, one missing calendar day in `schedule_entries`** (e.g. J1007 Apr3 + Apr5 but CONT row
 * missing from DB) → two trips with the same `pairing_code` and exactly **one** day gap. Merge so the
 * ledger shows one block and **pairing id once** (first day) like Crewline.
 */
export function mergeGappedContiguousPairingTrips(
  trips: CrewScheduleTrip[],
  maxGapDays: number
): CrewScheduleTrip[] {
  if (maxGapDays < 1) return trips;
  const sorted = [...trips].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.pairingCode.localeCompare(b.pairingCode) || a.id.localeCompare(b.id),
  );
  const out: CrewScheduleTrip[] = [];
  for (const t of sorted) {
    if (!isMergeableDuty(t)) {
      out.push(t);
      continue;
    }
    const last = out[out.length - 1];
    if (!last || !isMergeableDuty(last) || last.pairingCode.trim() !== t.pairingCode.trim()) {
      out.push(t);
      continue;
    }
    const gap = exclusiveGapDayCount(last.endDate, t.startDate);
    if (gap < 0) {
      out.push(t);
      continue;
    }
    // After mergeContiguous, true adjacency is already merged; here only 1+ calendar days between end and start
    if (gap >= 1 && gap <= maxGapDays) {
      out[out.length - 1] = mergeTwoTrips(last, t);
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Contiguous + one-day-gap merge (import often splits a pairing across `trip_group_id` / missing CONT row). */
export function mergeLedgerPairingBlocks(trips: CrewScheduleTrip[], maxGapDays = 1): CrewScheduleTrip[] {
  let cur = mergeContiguousPairingTrips(trips);
  for (let i = 0; i < 4; i += 1) {
    const next = mergeGappedContiguousPairingTrips(mergeContiguousPairingTrips(cur), maxGapDays);
    if (next.length === cur.length) return next;
    cur = next;
  }
  return cur;
}
