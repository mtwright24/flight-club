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
  pairingCreditHours?: number;
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

function routeArrivalAirport(raw: string | null | undefined): string {
  const parts = String(raw ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return /^[A-Z0-9]{3,4}$/.test(last) ? last : "";
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
  pairingCreditMinutes?: number | null,
): PairingOccurrenceDisplaySpan | null {
  if (!iso10(startIso) || !iso10(endIso) || endIso < startIso) return null;
  const days = spanDays(startIso, endIso);
  if (days <= 0) return null;
  return {
    displayStartDate: startIso,
    displayEndDate: endIso,
    dutyDayCount: days,
    source,
    pairingCreditHours:
      pairingCreditMinutes != null && Number.isFinite(pairingCreditMinutes)
        ? pairingCreditMinutes / 60
        : undefined,
  };
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

  type RawOccurrenceEntry = (typeof cellsModel.rawPairingDetailIndex.entries)[number];
  const groups = new Map<
    string,
    { start: string; end: string; entries: RawOccurrenceEntry[]; creditMinutes: number | null }
  >();
  for (const entry of cellsModel.rawPairingDetailIndex.entries) {
    if (entry.pairingCodeNorm !== code) continue;
    const start = iso10(entry.pairingStartIso);
    const end = iso10(entry.pairingEndIso) ?? start;
    const duty = iso10(entry.dutyIso);
    if (!start || !end || !duty) continue;
    const key = `${start}:${end}:${entry.scheduleLabel ?? ""}`;
    const group = groups.get(key) ?? {
      start,
      end,
      entries: [],
      creditMinutes: null,
    };
    group.entries.push(entry);
    if (
      group.creditMinutes == null &&
      entry.totalCreditMinutes != null &&
      Number.isFinite(entry.totalCreditMinutes)
    ) {
      group.creditMinutes = entry.totalCreditMinutes;
    }
    groups.set(key, group);
  }

  const base = String(trip.base ?? "JFK").trim().toUpperCase();
  const candidateGroups: Array<{
    start: string;
    end: string;
    dutyDates: string[];
    creditMinutes: number | null;
  }> = [];
  for (const group of groups.values()) {
    const ordered = [...group.entries].sort((a, b) => {
      const ad = iso10(a.dutyIso) ?? "";
      const bd = iso10(b.dutyIso) ?? "";
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? ""));
    });
    let segmentDutyDates: string[] = [];
    const flushSegment = () => {
      const dutyDates = [...new Set(segmentDutyDates)].sort();
      if (dutyDates.length) {
        candidateGroups.push({
          start: group.start,
          end: group.end,
          dutyDates,
          creditMinutes: group.creditMinutes,
        });
      }
      segmentDutyDates = [];
    };
    for (const entry of ordered) {
      const duty = iso10(entry.dutyIso);
      if (!duty) continue;
      segmentDutyDates.push(duty);
      if (base && routeArrivalAirport(entry.route) === base) {
        flushSegment();
      }
    }
    flushSegment();
  }

  const candidates = candidateGroups
    .map((group) => {
      const dutyDates = group.dutyDates;
      const dutyStart = dutyDates[0] ?? group.start;
      const dutyEnd = dutyDates[dutyDates.length - 1] ?? group.end;
      return makeSpan(dutyStart, dutyEnd, "raw_pairing_detail", group.creditMinutes);
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

function hasLedgerCellEvidence(cell: FlicaCalendarCell | undefined, code: string): boolean {
  if (!cell) return false;
  if (normPairingCode(cell.displayCode) === code) return true;
  const city = sanitizeFlicaLedgerCityText(cell.displayCity).trim();
  return Boolean(city && city !== "-" && city !== "—" && city !== "–");
}

function tripHasDateEvidence(trip: CrewScheduleTrip, dateIso: string): boolean {
  if (
    String(trip.id ?? "").startsWith("flica-ledger:") &&
    dateIso >= String(trip.startDate ?? "").slice(0, 10) &&
    dateIso <= String(trip.endDate ?? "").slice(0, 10)
  ) {
    return true;
  }
  if (trip.legs?.some((leg) => iso10(leg.dutyDate) === dateIso)) return true;
  const canonicalDay = trip.canonicalPairingDays?.[dateIso];
  if (canonicalDay?.segments?.length) return true;
  if (trip.layoverByDate?.[dateIso] || trip.layoverStationByDate?.[dateIso]) return true;
  return trip.status === "continuation";
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
  const selectedCell = cells[selectedIndex];
  if (
    !hasLedgerCellEvidence(selectedCell, code) &&
    !tripHasDateEvidence(trip, selectedDate)
  ) {
    return null;
  }

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

function pickShortestNormalSpan(
  spans: Array<PairingOccurrenceDisplaySpan | null>,
): PairingOccurrenceDisplaySpan | null {
  const candidates = spans.filter(
    (span): span is PairingOccurrenceDisplaySpan => Boolean(span),
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const normalA = a.dutyDayCount > 0 && a.dutyDayCount <= MAX_NORMAL_PAIRING_DAYS ? 0 : 1;
    const normalB = b.dutyDayCount > 0 && b.dutyDayCount <= MAX_NORMAL_PAIRING_DAYS ? 0 : 1;
    if (normalA !== normalB) return normalA - normalB;
    if (a.dutyDayCount !== b.dutyDayCount) return a.dutyDayCount - b.dutyDayCount;
    return a.displayStartDate.localeCompare(b.displayStartDate);
  });
  return candidates[0] ?? null;
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
  span: Pick<PairingOccurrenceDisplaySpan, "displayStartDate" | "displayEndDate" | "dutyDayCount" | "pairingCreditHours"> | null | undefined,
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
    pairingCreditHours:
      span.pairingCreditHours != null && Number.isFinite(span.pairingCreditHours)
        ? span.pairingCreditHours
        : trip.pairingCreditHours,
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
  const hasExplicitSelectedDate = Boolean(iso10(args.pointer?.selectedDateIso));
  const monthKey =
    args.pointer?.selectedMonthKey ??
    `${args.trip.year}-${String(args.trip.month).padStart(2, "0")}`;
  const parts = monthParts(monthKey);
  if (!parts) {
    return fallbackFromTripSpan(args.trip, args.pointer);
  }

  let model: ReturnType<typeof buildFlicaCalendarListModel>;
  try {
    const row = await fetchCrewScheduleFlicaForMonth(parts.year, parts.month);
    model = buildFlicaCalendarListModel(parts.year, parts.month, row);
  } catch {
    return fallbackFromTripSpan(args.trip, args.pointer);
  }
  const selectedDate = iso10(args.pointer?.selectedDateIso);
  if (selectedDate && model.mode === "flica_mini_table") {
    const code = normPairingCode(args.pointer?.pairingCode || args.trip.pairingCode);
    const selectedCell = model.cells.find((cell) => cell.isoDate === selectedDate);
    if (
      !hasLedgerCellEvidence(selectedCell, code) &&
      !tripHasDateEvidence(args.trip, selectedDate)
    ) {
      return null;
    }
  }
  const ledgerSpan = resolveFromFlicaLedger(args.trip, args.pointer, model);
  const rawSpan = resolveFromRawPairingDetail(args.trip, args.pointer, model);
  const tripSpan = fallbackFromTripSpan(args.trip, args.pointer);

  const bestSpan = pickShortestNormalSpan([rawSpan, tripSpan, ledgerSpan]);
  if (bestSpan) {
    return {
      ...bestSpan,
      pairingCreditHours: bestSpan.pairingCreditHours ?? rawSpan?.pairingCreditHours,
    };
  }

  if (hasExplicitSelectedDate) {
    return fallbackFromTripSpan(args.trip, args.pointer);
  }
  return fallbackFromTripSpan(args.trip, args.pointer);
}
