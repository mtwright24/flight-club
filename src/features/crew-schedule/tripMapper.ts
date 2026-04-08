import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleDutyStatus } from './types';
import type { ScheduleEntryRow } from './scheduleApi';

function statusFromCode(code: string | null | undefined): ScheduleDutyStatus {
  const u = String(code ?? '').toUpperCase();
  if (u === 'OFF') return 'off';
  if (u === 'PTO') return 'pto';
  if (u === 'RSV') return 'rsv';
  if (u === 'DH') return 'deadhead';
  if (u === 'CONT') return 'continuation';
  if (u === 'BLANK' || u === 'UNK') return 'other';
  return 'flying';
}

function formatTimeDisplay(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) {
    return `${s.slice(0, 2)}:${s.slice(2)}`;
  }
  return s;
}

/** Map one trip_group's rows to a single CrewScheduleTrip. */
export function entriesToSingleTrip(rows: ScheduleEntryRow[]): CrewScheduleTrip | undefined {
  if (!rows.length) return undefined;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return entryGroupToTrip(sorted);
}

/** Group schedule_entries rows into CrewScheduleTrip blocks by trip_group_id. */
export function entriesToTrips(rows: ScheduleEntryRow[]): CrewScheduleTrip[] {
  const byGroup = new Map<string, ScheduleEntryRow[]>();
  for (const r of rows) {
    const g = r.trip_group_id;
    const arr = byGroup.get(g) ?? [];
    arr.push(r);
    byGroup.set(g, arr);
  }

  const trips: CrewScheduleTrip[] = [];
  for (const [, days] of byGroup) {
    days.sort((a, b) => a.date.localeCompare(b.date));
    trips.push(entryGroupToTrip(days));
  }

  trips.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return trips;
}

function entryGroupToTrip(days: ScheduleEntryRow[]): CrewScheduleTrip {
  const first = days[0];
  const last = days[days.length - 1];
  const y = Number(first.month_key.slice(0, 4));
  const m = Number(first.month_key.slice(5, 7));

  const status = statusFromCode(first.status_code);
  const pairingCode = first.pairing_code ?? '—';

  const origin = first.city?.includes('→') ? first.city.split('→')[0]?.trim() : first.city ?? undefined;
  const destination = first.city?.includes('→')
    ? first.city.split('→')[1]?.trim()
    : days.find((d) => d.city?.includes('→'))?.city?.split('→')[1]?.trim();

  const routeSummary =
    first.city?.includes('→') ? `${origin ?? ''} → ${destination ?? ''}`.trim() : first.city ?? pairingCode;

  const legs: CrewScheduleLeg[] = [];
  if (status === 'flying' || status === 'deadhead' || status === 'continuation') {
    legs.push({
      id: `${first.id}-leg`,
      departureAirport: origin ?? '—',
      arrivalAirport: destination ?? '—',
      reportLocal: formatTimeDisplay(first.report_time),
      releaseLocal: formatTimeDisplay(first.d_end_time),
      isDeadhead: status === 'deadhead',
      flightNumber: pairingCode !== '—' && pairingCode !== 'DH' ? pairingCode : undefined,
    });
  }

  return {
    id: first.trip_group_id,
    pairingCode,
    month: m,
    year: y,
    startDate: first.date,
    endDate: last.date,
    dutyDays: days.length,
    status,
    routeSummary: routeSummary || pairingCode,
    origin,
    destination,
    layoverCity: first.layover ?? undefined,
    legs,
  };
}
