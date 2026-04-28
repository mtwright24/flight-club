/**
 * FCV / Crewline monthly **pairing block** display — city column comes from a **per-pairing day sequence**
 * (not naive per-row leg heuristics that produced MCO/JFK for J4173 or dropped dash days for J3H95).
 */
import { addIsoDays } from './ledgerContext';
import { departureTimeForDutyDaySortKey } from './scheduleNormalizer';
import { isOvernightArrivalInRow } from './overnightArrivalInRow';
import type { CrewScheduleLeg, CrewScheduleTrip } from './types';

export { isOvernightArrivalInRow };

function compactToken(raw?: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^[A-Z]{3,4}$/.test(v)) return v;
  const cleaned = v.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  return cleaned || v.slice(0, 3).toUpperCase();
}

function normCode(s: string): string {
  return compactToken(s).toUpperCase();
}

function legsOnDate(trip: CrewScheduleTrip, dateIso: string): CrewScheduleLeg[] {
  return trip.legs.filter((l) => l.dutyDate === dateIso);
}

function lastLegChronological(trip: CrewScheduleTrip): CrewScheduleLeg | undefined {
  if (!trip.legs.length) return undefined;
  const sorted = [...trip.legs].sort(
    (a, b) =>
      (a.dutyDate ?? '').localeCompare(b.dutyDate ?? '') ||
      departureTimeForDutyDaySortKey(a.departLocal).localeCompare(departureTimeForDutyDaySortKey(b.departLocal)) ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
  return sorted[sorted.length - 1];
}

function hasOvernightLeg(legs: CrewScheduleLeg[]): boolean {
  for (const L of legs) {
    if (isOvernightArrivalInRow(L.departLocal, L.arriveLocal)) return true;
  }
  return false;
}

/**
 * True same-day *turn*: all legs on one calendar day, no overnight segment, and first departure
 * station equals last arrival (out-and-back in one duty day). → city column is **blank** per locked rule.
 */
function isSameDayRoundTurn(legs: CrewScheduleLeg[]): boolean {
  if (legs.length < 1) return false;
  const d0 = legs[0]!.dutyDate;
  if (!d0) return false;
  if (!legs.every((l) => l.dutyDate === d0)) return false;
  if (hasOvernightLeg(legs)) return false;
  const d = normCode(legs[0]!.departureAirport);
  const a = normCode(legs[legs.length - 1]!.arrivalAirport);
  return d.length > 0 && d === a;
}

/** Crewline-style continuation token in the city column (ASCII hyphen). */
const DASH = '-';

/**
 * **Pairing display sequence** for the classic month ledger (FCV / Crewline), computed from the whole
 * trip block `[startDate … endDate]`, not per-row in isolation.
 *
 * Examples (airport only):
 * - J1007 → LHR / - / JFK
 * - J4173 → LAS / - / LAS / JFK
 * - J3H95 → BOS / - / JFK
 */
export function buildFcvPairingCityColumn(trip: CrewScheduleTrip, dateIso: string): string {
  if (dateIso < trip.startDate || dateIso > trip.endDate) return '';

  const legs = legsOnDate(trip, dateIso);
  if (trip.startDate === trip.endDate && legs.length > 0 && isSameDayRoundTurn(legs)) {
    return '';
  }

  if (dateIso === trip.endDate) {
    if (legs.length) return compactToken(legs[legs.length - 1]!.arrivalAirport) || '';
    const bl = lastLegChronological(trip);
    return compactToken(bl?.arrivalAirport) || compactToken(trip.destination) || '';
  }

  if (dateIso === trip.startDate) {
    const fcv = trip.layoverStationByDate?.[dateIso];
    if (fcv) return compactToken(fcv);
    let dayLegs = legs;
    if (dayLegs.length === 0) {
      const nextIso = addIsoDays(dateIso, 1);
      const next = legsOnDate(trip, nextIso);
      const bl = next[0];
      const base = normCode(trip.base || 'JFK');
      if (
        bl &&
        isOvernightArrivalInRow(bl.departLocal, bl.arriveLocal) &&
        normCode(bl.departureAirport) === base
      ) {
        dayLegs = [bl];
      }
    }
    if (dayLegs.length) {
      if (hasOvernightLeg(dayLegs)) return compactToken(dayLegs[dayLegs.length - 1]!.arrivalAirport) || '';
      return compactToken(dayLegs[dayLegs.length - 1]!.arrivalAirport) || '';
    }
    return '';
  }

  if (dateIso > trip.startDate && dateIso < trip.endDate) {
    return DASH;
  }

  if (legs.length === 0) return DASH;
  return compactToken(legs[0]!.departureAirport) || '';
}

/** @deprecated use {@link buildFcvPairingCityColumn} */
export const monthlyLedgerCityColumn = buildFcvPairingCityColumn;

/**
 * True when the classic row is a “dash / continuation” line: strictly between first and last calendar
 * day of the block **and** no duty legs (layover / rest) — not “overnight on first day” heuristics.
 */
export function isFcvClassicContinuationRow(trip: CrewScheduleTrip, dateIso: string): boolean {
  if (dateIso <= trip.startDate || dateIso >= trip.endDate) return false;
  return legsOnDate(trip, dateIso).length === 0;
}

/** First rendered day where this trip shows pairing id in Classic (carry-in ⇒ first calendar day inside the viewed month, not March-only `trip.startDate`). */
export function firstClassicLedgerPairingShowDate(
  trip: CrewScheduleTrip,
  fullDateList: readonly string[],
  viewMonthStart: string,
  viewMonthEnd: string,
): string | null {
  const lo = trip.startDate;
  const hi = trip.endDate;
  const inTrip = (iso: string) => iso >= lo && iso <= hi;
  const inViewed = (iso: string) => iso >= viewMonthStart && iso <= viewMonthEnd;

  if (lo < viewMonthStart && hi >= viewMonthStart) {
    for (const iso of fullDateList) {
      if (!inTrip(iso)) continue;
      if (inViewed(iso)) return iso;
    }
  }
  for (const iso of fullDateList) {
    if (inTrip(iso)) return iso;
  }
  return null;
}

export function shouldShowPairingInClassicLedgerMonth(
  trip: CrewScheduleTrip,
  dateIso: string,
  fullDateList: readonly string[],
  viewMonthStart: string,
  viewMonthEnd: string,
): boolean {
  const d = firstClassicLedgerPairingShowDate(trip, fullDateList, viewMonthStart, viewMonthEnd);
  return d !== null && dateIso === d;
}
