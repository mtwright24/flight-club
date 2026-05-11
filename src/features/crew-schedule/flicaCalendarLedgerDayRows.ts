/**
 * FLICA calendar views use mini calendar table as source of truth. Do not rebuild calendar display
 * from pairing legs.
 */
import { isFlicaNonFlyingActivityId } from "../../services/flicaScheduleHtmlParser";
import type { FlicaCalendarCell } from "./flicaMiniCalendarTableLedger";
import {
  attachDayRowGrouping,
  type DayRow,
  type RowKind,
} from "./modernClassic/classicMonthGridCore";
import type { CrewScheduleTrip } from "./types";

function iso10(raw: string | null | undefined): string {
  return String(raw ?? "").trim().slice(0, 10);
}

function spanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function nonDashCity(cell: FlicaCalendarCell): boolean {
  const city = String(cell.displayCity ?? "").trim();
  return Boolean(city && city !== "-" && city !== "—" && city !== "–");
}

function isDashMarker(raw: string | null | undefined): boolean {
  const value = String(raw ?? "").trim();
  return value === "-" || value === "—" || value === "–";
}

function shortestMatchingTrip(
  trips: CrewScheduleTrip[],
  predicate: (trip: CrewScheduleTrip) => boolean,
): CrewScheduleTrip | null {
  return (
    trips
      .filter(predicate)
      .sort((a, b) => {
        const spanDelta =
          spanDays(iso10(a.startDate), iso10(a.endDate)) -
          spanDays(iso10(b.startDate), iso10(b.endDate));
        if (spanDelta !== 0) return spanDelta;
        return iso10(b.startDate).localeCompare(iso10(a.startDate));
      })[0] ?? null
  );
}

function tripHasExactFlicaDutyDate(trip: CrewScheduleTrip, iso: string): boolean {
  return Boolean(
    trip.canonicalPairingDays?.[iso] ||
      trip.legs?.some((leg) => iso10(leg.dutyDate) === iso),
  );
}

export function tripForFlicaCalendarCell(
  trips: CrewScheduleTrip[],
  cell: FlicaCalendarCell,
): CrewScheduleTrip | null {
  const iso = cell.isoDate;
  const code = (cell.displayCode ?? "").trim();
  const u = code.toUpperCase();
  const hasContinuationDash = isDashMarker(cell.displayCode) || isDashMarker(cell.displayCity);

  if (u === "PTV") {
    const hit =
      trips.find(
        (t) =>
          t.status === "ptv" &&
          iso >= t.startDate.slice(0, 10) &&
          iso <= t.endDate.slice(0, 10),
      ) ?? null;
    return hit;
  }

  if (code && isFlicaNonFlyingActivityId(u)) {
    const hit = trips.find((t) => {
      if (iso < t.startDate.slice(0, 10) || iso > t.endDate.slice(0, 10))
        return false;
      return (t.pairingCode ?? "").trim().toUpperCase() === u;
    });
    return hit ?? null;
  }

  if (!code || isDashMarker(code)) {
    if (!nonDashCity(cell)) {
      return shortestMatchingTrip(
        trips,
        (t) =>
          (String(t.id ?? "").startsWith("flica-raw-carry:synthetic-calendar-gap:") ||
            (String(t.id ?? "").startsWith("flica-raw-carry:") &&
              (tripHasExactFlicaDutyDate(t, iso) ||
                (hasContinuationDash &&
                  iso >= iso10(t.startDate) &&
                  iso <= iso10(t.endDate))))) &&
          t.status !== "off" &&
          iso >= iso10(t.startDate) &&
          iso <= iso10(t.endDate),
      );
    }
    return shortestMatchingTrip(
      trips,
      (t) =>
        t.status !== "off" &&
        iso >= iso10(t.startDate) &&
        iso <= iso10(t.endDate),
    );
  }

  return shortestMatchingTrip(trips, (t) => {
    if (iso < iso10(t.startDate) || iso > iso10(t.endDate))
      return false;
    const pc = (t.pairingCode ?? "").trim().toUpperCase();
    const base = pc.split("·")[0]?.trim() ?? pc;
    return base === u || pc === u;
  });
}

export function kindFromLedgerCell(
  cell: FlicaCalendarCell,
  trip: CrewScheduleTrip | null,
): RowKind {
  const c = (cell.displayCode ?? "").trim().toUpperCase();
  if (!c || isDashMarker(c)) {
    if (trip) return "continuation";
    const city = (cell.displayCity ?? "").trim();
    if (city && city !== "-" && city !== "—") return "continuation";
    return "empty";
  }
  if (c === "PTV") return "ptv";
  if (c === "RSV") return "reserve";
  if (c === "PTO") return "pto";
  if (isFlicaNonFlyingActivityId(c)) return "special";
  if (trip?.status === "deadhead") return "deadhead";
  return "trip";
}

/** Build classic/month **DayRow** list from FLICA mini-calendar cells (table order). */
export function buildDayRowsFromFlicaCalendarLedger(
  cells: FlicaCalendarCell[],
  trips: CrewScheduleTrip[],
  todayIso: string,
): DayRow[] {
  const rows: DayRow[] = cells.map((cell, rowIdx) => {
    const trip = tripForFlicaCalendarCell(trips, cell);
    const kind = kindFromLedgerCell(cell, trip);
    return {
      id: `flica-cal:${cell.isoDate}:${rowIdx}`,
      dateIso: cell.isoDate,
      kind,
      trip,
      dayCode: cell.dayOfWeekLabel,
      dayNum: cell.dayOfMonth,
      isWeekend: cell.isWeekend,
      pairingText: cell.displayCode ?? "",
      reportText: "",
      cityText: cell.displayCity ?? "",
      dEndText: "",
      layoverText: "",
      wxText: "",
      statusText: "",
      reportMinutes: null,
      releaseMinutes: null,
      isToday: cell.isoDate === todayIso,
      groupedWithPrev: false,
      groupedWithNext: false,
    };
  });
  return attachDayRowGrouping(rows);
}

export function flicaCalendarCellsByIso(
  cells: FlicaCalendarCell[],
): Map<string, FlicaCalendarCell> {
  const m = new Map<string, FlicaCalendarCell>();
  for (const c of cells) {
    m.set(c.isoDate, c);
  }
  return m;
}
