import { buildFlicaCalendarListModel } from "./flicaCalendarDisplaySource";
import { sanitizeFlicaLedgerCityText, type FlicaCalendarCell } from "./flicaMiniCalendarTableLedger";
import { fetchCrewScheduleFlicaForMonth } from "./scheduleApi";
import type { DetailHandoffPointer } from "./tripDetailNavCache";
import type { CrewScheduleTrip } from "./types";

export type PairingOccurrenceDisplaySpan = {
  displayStartDate: string;
  displayEndDate: string;
  dutyDayCount: number;
  source: "flica_ledger" | "raw_pairing_detail" | "trip_span";
};

const MAX_NORMAL_PAIRING_DAYS = 7;

function iso10(raw: string | null | undefined): string | null {
  const iso = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function normPairingCode(raw: string | null | undefined): string {
  return (
    String(raw ?? "")
      .trim()
      .toUpperCase()
      .split("·")[0]
      ?.trim() ?? ""
  );
}

function isPairingCode(raw: string | null | undefined): boolean {
  const code = normPairingCode(raw);
  return Boolean(code && code !== "-" && code !== "—" && code !== "–" && code !== "CONT");
}

function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function makeSpan(
  startIso: string,
  endIso: string,
  source: PairingOccurrenceDisplaySpan["source"],
): PairingOccurrenceDisplaySpan | null {
  if (!iso10(startIso) || !iso10(endIso) || endIso < startIso) return null;
  const days = spanDays(startIso, endIso);
  if (days <= 0) return null;
  return { displayStartDate: startIso, displayEndDate: endIso, dutyDayCount: days, source };
}

function monthParts(monthKey: string | null | undefined): { year: number; month: number } | null {
  const key = String(monthKey ?? "").trim();
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function resolveFromRawPairingDetail(
  trip: CrewScheduleTrip,
  pointer: DetailHandoffPointer | undefined,
  cellsModel: ReturnType<typeof buildFlicaCalendarListModel>,
): PairingOccurrenceDisplaySpan | null {
  if (cellsModel.mode !== "flica_mini_table") return null;
  const code = normPairingCode(pointer?.pairingCode || trip.pairingCode);
  const selectedDate = iso10(pointer?.selectedDateIso) ?? iso10(trip.startDate);
  if (!code || !selectedDate) return null;

  const groups = new Map<string, { start: string; end: string; dutyDates: Set<string> }>();
  for (const entry of cellsModel.rawPairingDetailIndex.entries) {
    if (entry.pairingCodeNorm !== code) continue;
    const start = iso10(entry.pairingStartIso);
    const end = iso10(entry.pairingEndIso) ?? start;
    const duty = iso10(entry.dutyIso);
    if (!start || !end || !duty) continue;
    const key = `${start}:${end}:${entry.scheduleLabel ?? ""}`;
    const group = groups.get(key) ?? { start, end, dutyDates: new Set<string>() };
    group.dutyDates.add(duty);
    groups.set(key, group);
  }

  const candidates = [...groups.values()]
    .map((group) => {
      const dutyDates = [...group.dutyDates].sort();
      const dutyStart = dutyDates[0] ?? group.start;
      const dutyEnd = dutyDates[dutyDates.length - 1] ?? group.end;
      const start = group.start <= dutyStart ? group.start : dutyStart;
      const end = group.end >= dutyEnd ? group.end : dutyEnd;
      return makeSpan(start, end, "raw_pairing_detail");
    })
    .filter((span): span is PairingOccurrenceDisplaySpan => {
      if (!span) return false;
      return selectedDate >= span.displayStartDate && selectedDate <= span.displayEndDate;
    })
    .sort((a, b) => {
      const normalA = a.dutyDayCount > 1 && a.dutyDayCount <= MAX_NORMAL_PAIRING_DAYS ? 0 : 1;
      const normalB = b.dutyDayCount > 1 && b.dutyDayCount <= MAX_NORMAL_PAIRING_DAYS ? 0 : 1;
      if (normalA !== normalB) return normalA - normalB;
      if (a.dutyDayCount !== b.dutyDayCount) return a.dutyDayCount - b.dutyDayCount;
      return a.displayStartDate.localeCompare(b.displayStartDate);
    });

  return candidates[0] ?? null;
}

function cityIsBase(cell: FlicaCalendarCell, trip: CrewScheduleTrip): boolean {
  const city = sanitizeFlicaLedgerCityText(cell.displayCity).trim().toUpperCase();
  const base = String(trip.base ?? "JFK").trim().toUpperCase();
  return Boolean(city && base && city === base);
}

function resolveFromFlicaLedger(
  trip: CrewScheduleTrip,
  pointer: DetailHandoffPointer | undefined,
  cellsModel: ReturnType<typeof buildFlicaCalendarListModel>,
): PairingOccurrenceDisplaySpan | null {
  if (cellsModel.mode !== "flica_mini_table") return null;
  const code = normPairingCode(pointer?.pairingCode || trip.pairingCode);
  const selectedDate = iso10(pointer?.selectedDateIso) ?? iso10(trip.startDate);
  if (!code || !selectedDate) return null;

  const cells = [...cellsModel.cells].sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  const selectedIndex = cells.findIndex((cell) => cell.isoDate === selectedDate);
  if (selectedIndex < 0) return null;

  let startIndex = -1;
  for (let i = selectedIndex; i >= 0; i -= 1) {
    const cellCode = normPairingCode(cells[i]?.displayCode);
    if (cellCode === code) {
      startIndex = i;
      break;
    }
    if (isPairingCode(cellCode) && cellCode !== code) break;
  }
  if (startIndex < 0) return null;

  let endIndex = -1;
  for (let i = Math.max(startIndex, selectedIndex); i < cells.length; i += 1) {
    const cell = cells[i]!;
    const cellCode = normPairingCode(cell.displayCode);
    if (i > startIndex && isPairingCode(cellCode)) {
      endIndex = i - 1;
      break;
    }
    if (i >= selectedIndex && cityIsBase(cell, trip)) {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) {
    const nextStart = cells.findIndex(
      (cell, idx) => idx > startIndex && isPairingCode(cell.displayCode),
    );
    endIndex = nextStart > startIndex ? nextStart - 1 : selectedIndex;
  }

  const start = cells[startIndex]?.isoDate;
  const end = cells[endIndex]?.isoDate;
  if (!start || !end || selectedDate < start || selectedDate > end) return null;
  const span = makeSpan(start, end, "flica_ledger");
  if (!span || span.dutyDayCount > MAX_NORMAL_PAIRING_DAYS) return null;
  return span;
}

function fallbackFromTripSpan(
  trip: CrewScheduleTrip,
  pointer: DetailHandoffPointer | undefined,
): PairingOccurrenceDisplaySpan | null {
  const selectedDate = iso10(pointer?.selectedDateIso) ?? iso10(trip.startDate);
  const start = iso10(trip.startDate);
  const end = iso10(trip.endDate);
  if (!selectedDate || !start || !end || selectedDate < start || selectedDate > end) return null;
  const span = makeSpan(start, end, "trip_span");
  if (!span || span.dutyDayCount > MAX_NORMAL_PAIRING_DAYS) return null;
  return span;
}

function filterDateRecord<T>(
  value: Record<string, T> | undefined,
  startIso: string,
  endIso: string,
): Record<string, T> | undefined {
  if (!value) return undefined;
  const out: Record<string, T> = {};
  for (const [dateIso, item] of Object.entries(value)) {
    const iso = iso10(dateIso);
    if (iso && iso >= startIso && iso <= endIso) out[dateIso] = item;
  }
  return Object.keys(out).length ? out : undefined;
}

function station(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(v) ? v : "";
}

function occurrenceRouteSummaryFromLegs(
  legs: CrewScheduleTrip["legs"],
): string | null {
  const ordered = [...(legs ?? [])].sort((a, b) => {
    const ad = iso10(a.dutyDate) ?? "";
    const bd = iso10(b.dutyDate) ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? ""));
  });
  const first = ordered[0];
  if (!first) return null;
  const chain: string[] = [];
  const dep = station(first.departureAirport);
  if (dep) chain.push(dep);
  for (const leg of ordered) {
    const arr = station(leg.arrivalAirport);
    if (arr && chain[chain.length - 1] !== arr) chain.push(arr);
  }
  return chain.length >= 2 ? chain.join("-") : null;
}

export function applyPairingOccurrenceDisplaySpanToTrip(
  trip: CrewScheduleTrip,
  span: Pick<PairingOccurrenceDisplaySpan, "displayStartDate" | "displayEndDate" | "dutyDayCount"> | null | undefined,
): CrewScheduleTrip {
  if (!span) return trip;
  const start = iso10(span.displayStartDate);
  const end = iso10(span.displayEndDate);
  if (!start || !end || end < start) return trip;

  const legs = (trip.legs ?? []).filter((leg) => {
    const duty = iso10(leg.dutyDate);
    return !duty || (duty >= start && duty <= end);
  });
  const routeSummary = occurrenceRouteSummaryFromLegs(legs) ?? trip.routeSummary;

  return {
    ...trip,
    startDate: start,
    endDate: end,
    dutyDays: span.dutyDayCount,
    routeSummary,
    legs,
    layoverByDate: filterDateRecord(trip.layoverByDate, start, end),
    layoverStationByDate: filterDateRecord(trip.layoverStationByDate, start, end),
    canonicalPairingDays: filterDateRecord(trip.canonicalPairingDays, start, end),
  };
}

export async function resolvePairingOccurrenceDisplaySpan(args: {
  trip: CrewScheduleTrip;
  pointer?: DetailHandoffPointer;
}): Promise<PairingOccurrenceDisplaySpan | null> {
  const monthKey =
    args.pointer?.selectedMonthKey ??
    `${args.trip.year}-${String(args.trip.month).padStart(2, "0")}`;
  const parts = monthParts(monthKey);
  if (!parts) return fallbackFromTripSpan(args.trip, args.pointer);

  let model: ReturnType<typeof buildFlicaCalendarListModel>;
  try {
    const row = await fetchCrewScheduleFlicaForMonth(parts.year, parts.month);
    model = buildFlicaCalendarListModel(parts.year, parts.month, row);
  } catch {
    return fallbackFromTripSpan(args.trip, args.pointer);
  }
  const ledgerSpan = resolveFromFlicaLedger(args.trip, args.pointer, model);
  if (ledgerSpan) return ledgerSpan;

  const rawSpan = resolveFromRawPairingDetail(args.trip, args.pointer, model);
  if (rawSpan) return rawSpan;

  return fallbackFromTripSpan(args.trip, args.pointer);
}
