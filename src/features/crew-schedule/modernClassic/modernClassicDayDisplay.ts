import type { CrewScheduleLeg, CrewScheduleTrip } from "../types";

function dutyIso(leg: CrewScheduleLeg): string | null {
  const d = String(leg.dutyDate ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function depCode(leg: CrewScheduleLeg): string {
  return String(leg.departureAirport ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 4);
}

function arrCode(leg: CrewScheduleLeg): string {
  return String(leg.arrivalAirport ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 4);
}

function sortKey(leg: CrewScheduleLeg): string {
  return `${String(leg.reportLocal ?? "").trim()}_${String(leg.departLocal ?? "").trim()}_${depCode(leg)}`;
}

/** Legs rostered on this calendar day (dutyDate), sorted by time. */
export function legsForDutyDate(
  trip: CrewScheduleTrip,
  dateIso: string,
): CrewScheduleLeg[] {
  const legs = trip.legs ?? [];
  const hit = legs.filter((l) => dutyIso(l) === dateIso);
  if (hit.length) return [...hit].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return [];
}

export function formatLegChain(legs: CrewScheduleLeg[]): string {
  return legs
    .map((l) => `${depCode(l)}→${arrCode(l)}`)
    .filter((s) => s.length > 3)
    .join(" · ");
}

/** Primary route line: first leg only `DEP → ARR`. */
export function primaryDayRoute(
  trip: CrewScheduleTrip,
  dateIso: string,
  cityTextFallback: string,
): string {
  const legs = legsForDutyDate(trip, dateIso);
  if (legs.length) {
    const a = depCode(legs[0]!);
    const b = arrCode(legs[0]!);
    if (a && b) return `${a} → ${b}`;
  }
  const t = String(cityTextFallback ?? "").trim();
  return t || "—";
}

export function additionalLegsSummary(
  trip: CrewScheduleTrip,
  dateIso: string,
): string | null {
  const legs = legsForDutyDate(trip, dateIso);
  if (legs.length <= 1) return null;
  const rest = legs.slice(1);
  const chain = formatLegChain(rest);
  if (!chain) return null;
  const n = rest.length;
  if (n === 1) return `Additional leg: ${chain}`;
  return `+${n} additional legs · ${chain}`;
}

export function dutyDayIndexLabel(
  trip: CrewScheduleTrip,
  dateIso: string,
): { current: number; total: number } | null {
  const days = [
    ...new Set(
      (trip.legs ?? [])
        .map((l) => dutyIso(l))
        .filter((x): x is string => !!x),
    ),
  ].sort();
  if (!days.length) {
    const total = Math.max(1, trip.dutyDays ?? 1);
    const start = trip.startDate.slice(0, 10);
    if (dateIso < start) return { current: 1, total };
    let cur = 1 + Math.round(
      (new Date(`${dateIso}T12:00:00`).getTime() -
        new Date(`${start}T12:00:00`).getTime()) /
        86400000,
    );
    cur = Math.min(total, Math.max(1, cur));
    return { current: cur, total };
  }
  const idx = days.indexOf(dateIso);
  if (idx < 0) return { current: 1, total: Math.max(days.length, trip.dutyDays ?? days.length) };
  return {
    current: idx + 1,
    total: Math.max(days.length, trip.dutyDays ?? days.length),
  };
}

export function dailyCreditDisplay(
  trip: CrewScheduleTrip,
  _dateIso: string,
): { main: string; plus: string | null } {
  const total =
    trip.pairingCreditHours ??
    trip.creditHours ??
    null;
  const dutyN = Math.max(1, trip.dutyDays ?? 1);
  const daily = total != null ? total / dutyN : null;
  if (daily == null || Number.isNaN(daily)) {
    return { main: "—", plus: null };
  }
  const totalMin = Math.round(daily * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const main = `${hh}:${String(mm).padStart(2, "0")}`;
  return { main, plus: `+CR ${main}` };
}
