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

export function tripForFlicaCalendarCell(
  trips: CrewScheduleTrip[],
  cell: FlicaCalendarCell,
): CrewScheduleTrip | null {
  const iso = cell.isoDate;
  const code = (cell.displayCode ?? "").trim();
  const u = code.toUpperCase();

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

  if (!code) return null;

  for (const t of trips) {
    if (iso < t.startDate.slice(0, 10) || iso > t.endDate.slice(0, 10))
      continue;
    const pc = (t.pairingCode ?? "").trim().toUpperCase();
    const base = pc.split("·")[0]?.trim() ?? pc;
    if (base === u || pc === u) return t;
  }
  return null;
}

export function kindFromLedgerCell(
  cell: FlicaCalendarCell,
  trip: CrewScheduleTrip | null,
): RowKind {
  const c = (cell.displayCode ?? "").trim().toUpperCase();
  if (!c) {
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
