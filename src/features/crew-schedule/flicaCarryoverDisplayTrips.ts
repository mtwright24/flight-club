import type { FlicaCalendarListModel } from "./flicaCalendarDisplaySource";
import type { FlicaCalendarCell } from "./flicaMiniCalendarTableLedger";
import { isFlicaNonFlyingActivityId } from "../../services/flicaScheduleHtmlParser";
import type { FlicaRawPairingDutyIndexEntry } from "./flicaRawPairingDetailIndex";
import type { PairingDay } from "./pairingDayModel";
import type { CrewScheduleLeg, CrewScheduleTrip, ScheduleCrewMember, TripSummary } from "./types";

type RawEntry = FlicaRawPairingDutyIndexEntry;

function iso10(raw: string | null | undefined): string {
  return String(raw ?? "").trim().slice(0, 10);
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate(),
  ).padStart(2, "0")}`;
  return { start, end };
}

function spanDays(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T12:00:00`);
  const b = new Date(`${endIso}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(aEnd < bStart || aStart > bEnd);
}

function normCode(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase().split("·")[0]?.trim() ?? "";
}

function station(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(v) ? v : "";
}

function routeStations(raw: string | null | undefined): { dep: string; arr: string } | null {
  const parts = String(raw ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const dep = station(parts[0]);
  const arr = station(parts[parts.length - 1]);
  return dep && arr ? { dep, arr } : null;
}

function minutesToHours(raw: number | null | undefined): number | undefined {
  return raw != null && Number.isFinite(raw) ? raw / 60 : undefined;
}

function hhmmToHours(raw: string | null | undefined): number {
  const s = String(raw ?? "").replace(/\D/g, "");
  if (s.length < 3) return 0;
  const v = s.padStart(4, "0").slice(0, 4);
  const h = Number(v.slice(0, 2));
  const m = Number(v.slice(2, 4));
  return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : 0;
}

function routeSummaryFromLegs(legs: CrewScheduleLeg[], fallback: string): string {
  if (!legs.length) return fallback;
  return [legs[0]?.departureAirport, ...legs.map((leg) => leg.arrivalAirport)]
    .filter(Boolean)
    .join("-");
}

function routeArrivalAirport(raw: string | null | undefined): string {
  return routeStations(raw)?.arr ?? "";
}

function splitRawEntriesIntoOccurrences(entries: RawEntry[]): RawEntry[][] {
  const first = entries[0];
  if (!first) return [];
  const base = station(first.base) || "JFK";
  const ordered = [...entries].sort((a, b) => {
    const ad = iso10(a.dutyIso);
    const bd = iso10(b.dutyIso);
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? ""));
  });
  const groups: RawEntry[][] = [];
  let current: RawEntry[] = [];
  for (const entry of ordered) {
    current.push(entry);
    if (base && routeArrivalAirport(entry.route) === base) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function crewMembersFromRaw(entries: RawEntry[]): ScheduleCrewMember[] {
  const members = entries[0]?.crewMembers ?? [];
  return members.map((member) => ({
    position: member.position,
    name: member.name,
    employeeId: member.employeeId || undefined,
    roleLabel: member.roleLabel || member.status || undefined,
  }));
}

function hotelFromRaw(entries: RawEntry[]): CrewScheduleTrip["hotel"] | undefined {
  const hotelRow = (entries[0]?.hotels ?? []).find(
    (hotel) => String(hotel.hotelName ?? "").trim() || String(hotel.layoverCity ?? "").trim(),
  );
  if (hotelRow) {
    return {
      name: hotelRow.hotelName?.trim() || undefined,
      city: hotelRow.layoverCity?.trim() || undefined,
      phone: hotelRow.hotelPhone?.trim() || undefined,
    };
  }
  const legHotel = entries.find(
    (entry) => entry.hotelName.trim() || entry.hotelPhone.trim() || entry.layoverCity.trim(),
  );
  if (!legHotel) return undefined;
  return {
    name: legHotel.hotelName.trim() || undefined,
    city: legHotel.layoverCity.trim() || undefined,
    phone: legHotel.hotelPhone.trim() || undefined,
  };
}

function reportByDutyFromRaw(entries: RawEntry[]): Map<string, string> {
  const ordered = [...entries].sort((a, b) => {
    const ad = iso10(a.dutyIso);
    const bd = iso10(b.dutyIso);
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? ""));
  });
  const out = new Map<string, string>();
  let previousDutyIso = "";
  let previousDutyNextReport = "";
  for (const entry of ordered) {
    const dutyIso = iso10(entry.dutyIso);
    if (!dutyIso) continue;
    if (dutyIso !== previousDutyIso && !out.has(dutyIso)) {
      const report =
        entry.reportLocal?.trim() ||
        previousDutyNextReport ||
        entry.reportFromPairingHeader?.trim() ||
        "";
      if (report) out.set(dutyIso, report);
    }
    const nextReport = entry.nextReportLocal?.trim();
    if (nextReport) previousDutyNextReport = nextReport;
    previousDutyIso = dutyIso;
  }
  return out;
}

function buildCanonicalPairingDays(entries: RawEntry[], tripId: string, code: string, base: string): Record<string, PairingDay> {
  const reportByDuty = reportByDutyFromRaw(entries);
  const byDate = new Map<string, RawEntry[]>();
  for (const entry of entries) {
    const dutyDate = iso10(entry.dutyIso);
    if (!dutyDate) continue;
    const arr = byDate.get(dutyDate) ?? [];
    arr.push(entry);
    byDate.set(dutyDate, arr);
  }
  const dutyDates = [...byDate.keys()].sort();
  const firstDuty = dutyDates[0] ?? "";
  const lastDuty = dutyDates[dutyDates.length - 1] ?? "";
  const dates = dutyDates;
  const out: Record<string, PairingDay> = {};
  for (let i = 0; i < dates.length; i += 1) {
    const dateIso = dates[i]!;
    const dutyEntries = [...(byDate.get(dateIso) ?? [])].sort((a, b) =>
      String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? "")),
    );
    const lastEntry = dutyEntries[dutyEntries.length - 1];
    const layoverStation = lastEntry?.layoverCity?.trim().toUpperCase() || null;
    const displayCity = layoverStation ||
      (dateIso === lastDuty
        ? base
        : routeStations(lastEntry?.route)?.arr ?? "-");
    out[dateIso] = {
      pairingUuid: tripId,
      pairingCode: code,
      calendarDate: dateIso,
      dutyDayIndex: i,
      operatingDate: dateIso,
      reportTimeDisplay: reportByDuty.get(dateIso) ?? null,
      dEndTimeDisplay: lastEntry?.dEndLocal?.trim() || null,
      segments: dutyEntries.flatMap((entry) => {
        const route = routeStations(entry.route);
        if (!route) return [];
        return [{
          departureStation: route.dep,
          arrivalStation: route.arr,
          flightNumber: entry.flightNumber.trim() || null,
          isDeadhead: entry.isDeadhead,
          routeLabel: `${route.dep}-${route.arr}`,
          departTimeLocal: entry.departLocal.trim() || null,
          arriveTimeLocal: entry.arriveLocal.trim() || null,
          blockTimeLocal: entry.blockTime.trim() || null,
          equipmentCode: entry.equipment.trim() || null,
        }];
      }),
      displayCityLedger: displayCity,
      layoverStation: layoverStation || (displayCity !== "-" && displayCity !== base ? displayCity : null),
      layoverRestDisplay: lastEntry?.layoverRestRaw?.trim() || null,
      baseReturnDay: dateIso === lastDuty,
      continuationDay: false,
      sameDayTurn: Boolean(dutyEntries.length && routeStations(dutyEntries[0]?.route)?.dep === routeStations(lastEntry?.route)?.arr),
      carryIn: dateIso === firstDuty && firstDuty < iso10(entries[0]?.pairingStartIso),
      carryOut: dateIso === lastDuty && lastDuty > iso10(entries[0]?.pairingEndIso),
      firstDutyDateWithLegs: firstDuty,
      lastDutyDateWithLegs: lastDuty,
    };
  }
  return out;
}

function buildSummary(trip: CrewScheduleTrip, entries: RawEntry[]): TripSummary {
  const credit = minutesToHours(entries[0]?.totalCreditMinutes) ?? 0;
  const block = minutesToHours(entries[0]?.totalBlockMinutes) ?? 0;
  const tafb = minutesToHours(entries[0]?.totalTafbMinutes) ?? 0;
  const layover = minutesToHours(entries[0]?.layoverTotalMinutes) ?? 0;
  return {
    pairingCode: trip.pairingCode,
    route: trip.routeSummary,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dutyDays: trip.dutyDays,
    legsCount: trip.legs.length,
    blockTotal: block,
    creditTotal: credit,
    tafbTotal: tafb,
    layoverTotal: layover,
    legs: trip.legs.map((leg, index) => ({
      dayIndex: index + 1,
      route: `${leg.departureAirport}-${leg.arrivalAirport}`,
      date: leg.dutyDate ?? trip.startDate,
      report: leg.reportLocal,
      dep: leg.departureAirport,
      arr: leg.arrivalAirport,
      block: hhmmToHours(leg.blockTimeLocal),
      layover: undefined,
      dutyEnd: leg.releaseLocal,
    })),
    crew: (trip.crewMembers ?? []).map((member) => ({
      position: member.position,
      name: member.name,
      role: member.roleLabel,
    })),
    hotel: trip.hotel?.name
      ? {
          name: trip.hotel.name,
          city: trip.hotel.city ?? "",
          nights: 1,
        }
      : undefined,
  };
}

function groupKey(entry: RawEntry): string {
  return [
    entry.pairingCodeNorm,
    iso10(entry.pairingStartIso),
    iso10(entry.pairingEndIso),
    entry.scheduleLabel ?? "",
  ].join("\u0000");
}

function existingTripCovers(
  trips: CrewScheduleTrip[],
  code: string,
  dateIso: string,
): boolean {
  return trips.some((trip) => {
    if (trip.status === "off") return false;
    if (normCode(trip.pairingCode) !== code) return false;
    const start = iso10(trip.startDate);
    const end = iso10(trip.endDate);
    return Boolean(start && end && dateIso >= start && dateIso <= end);
  });
}

function rangesOverlapTrip(a: CrewScheduleTrip, b: CrewScheduleTrip): boolean {
  const as = iso10(a.startDate);
  const ae = iso10(a.endDate);
  const bs = iso10(b.startDate);
  const be = iso10(b.endDate);
  return Boolean(as && ae && bs && be && overlaps(as, ae, bs, be));
}

function overlapDayCount(a: CrewScheduleTrip, b: CrewScheduleTrip): number {
  const as = iso10(a.startDate);
  const ae = iso10(a.endDate);
  const bs = iso10(b.startDate);
  const be = iso10(b.endDate);
  if (!as || !ae || !bs || !be || !overlaps(as, ae, bs, be)) return 0;
  const start = as > bs ? as : bs;
  const end = ae < be ? ae : be;
  return spanDays(start, end);
}

function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T12:00:00`);
  const b = new Date(`${bIso}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    out.push(cur);
    cur = addIsoDays(cur, 1);
  }
  return out;
}

function hasUncoveredVisibleDate(
  trips: CrewScheduleTrip[],
  code: string,
  startIso: string,
  endIso: string,
): boolean {
  return datesBetween(startIso, endIso).some(
    (dateIso) => !existingTripCovers(trips, code, dateIso),
  );
}

function exactTripExists(
  trips: CrewScheduleTrip[],
  code: string,
  startIso: string,
  endIso: string,
): boolean {
  return trips.some(
    (trip) =>
      trip.status !== "off" &&
      normCode(trip.pairingCode) === code &&
      iso10(trip.startDate) === startIso &&
      iso10(trip.endDate) === endIso,
  );
}

function firstDutyIso(entries: RawEntry[]): string {
  return [...new Set(entries.map((entry) => iso10(entry.dutyIso)).filter(Boolean))].sort()[0] ?? "";
}

function lastDutyIso(entries: RawEntry[]): string {
  const dates = [...new Set(entries.map((entry) => iso10(entry.dutyIso)).filter(Boolean))].sort();
  return dates[dates.length - 1] ?? "";
}

function shiftRawOccurrenceEntries(entries: RawEntry[], newStartIso: string): RawEntry[] {
  const originalStart = firstDutyIso(entries);
  const originalEnd = lastDutyIso(entries);
  if (!originalStart || !originalEnd) return [];
  const offset = dayDiff(originalStart, newStartIso);
  const newEndIso = addIsoDays(originalEnd, offset);
  const monthLabel = new Date(`${newStartIso}T12:00:00`)
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();
  return entries.map((entry) => ({
    ...entry,
    dutyIso: addIsoDays(iso10(entry.dutyIso), offset),
    pairingStartIso: newStartIso,
    pairingEndIso: newEndIso,
    scheduleLabel: entry.scheduleLabel
      ? entry.scheduleLabel.replace(/\d{1,2}[A-Z]{3}/i, `${newStartIso.slice(8, 10)}${monthLabel}`)
      : entry.scheduleLabel,
  }));
}

function explicitFlyingLedgerCode(cell: FlicaCalendarCell): string {
  const code = normCode(cell.displayCode);
  if (!code || isFlicaNonFlyingActivityId(code)) return "";
  if (code === "PTV" || code === "PTO" || code === "RSV" || code === "OFF") return "";
  return code;
}

function ledgerCity(cell: FlicaCalendarCell | null | undefined): string {
  return String(cell?.displayCity ?? "").trim().toUpperCase();
}

function hasLedgerContinuationCity(cell: FlicaCalendarCell): boolean {
  const city = ledgerCity(cell);
  return Boolean(city && city !== "-" && city !== "—" && city !== "–");
}

function ledgerCellIsBlankGap(cell: FlicaCalendarCell | undefined): boolean {
  if (!cell) return false;
  const code = normCode(cell.displayCode);
  const city = ledgerCity(cell);
  return !code && (!city || city === "-" || city === "—" || city === "–");
}

function baseForLedgerCode(code: string, entriesByCode: Map<string, RawEntry[]>): string {
  const fromRaw = station(entriesByCode.get(code)?.[0]?.base);
  return fromRaw || "JFK";
}

function buildLedgerOccurrences(
  cells: FlicaCalendarCell[],
  entriesByCode: Map<string, RawEntry[]>,
  preferredSpanByCode: Map<string, number>,
): Array<{ code: string; startIso: string; endIso: string; cells: FlicaCalendarCell[] }> {
  const ordered = [...cells].sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  const occurrences: Array<{ code: string; startIso: string; endIso: string; cells: FlicaCalendarCell[] }> = [];
  let current: {
    code: string;
    startIso: string;
    endIso: string;
    previousCell: FlicaCalendarCell;
    cells: FlicaCalendarCell[];
  } | null = null;

  const closeCurrent = () => {
    if (current) {
      occurrences.push({
        code: current.code,
        startIso: current.startIso,
        endIso: current.endIso,
        cells: current.cells,
      });
    }
    current = null;
  };

  for (const cell of ordered) {
    const code = explicitFlyingLedgerCode(cell);
    if (!code) {
      const isCurrentNextDate = current
        ? cell.isoDate === addIsoDays(current.endIso, 1)
        : false;
      if (current && isCurrentNextDate && hasLedgerContinuationCity(cell)) {
        current.endIso = cell.isoDate;
        current.previousCell = cell;
        current.cells.push(cell);
        continue;
      }
      closeCurrent();
      continue;
    }

    const base = baseForLedgerCode(code, entriesByCode);
    const previousReturnedToBase = current
      ? ledgerCity(current.previousCell) === base
      : false;
    const isNextDate = current
      ? cell.isoDate === addIsoDays(current.endIso, 1)
      : false;
    const currentReachedTemplateSpan = current
      ? spanDays(current.startIso, current.endIso) >=
        (preferredSpanByCode.get(current.code) ?? Number.MAX_SAFE_INTEGER)
      : false;

    if (
      !current ||
      current.code !== code ||
      !isNextDate ||
      previousReturnedToBase ||
      currentReachedTemplateSpan
    ) {
      closeCurrent();
      current = {
        code,
        startIso: cell.isoDate,
        endIso: cell.isoDate,
        previousCell: cell,
        cells: [cell],
      };
      continue;
    }

    current.endIso = cell.isoDate;
    current.previousCell = cell;
    current.cells.push(cell);
  }
  closeCurrent();

  return occurrences;
}

function preferredLedgerSpanByCode(rawOccurrenceEntries: RawEntry[][]): Map<string, number> {
  const spansByCode = new Map<string, number[]>();
  for (const entries of rawOccurrenceEntries) {
    const code = normCode(entries[0]?.pairingCodeNorm);
    const start = firstDutyIso(entries);
    const end = lastDutyIso(entries);
    if (!code || !start || !end) continue;
    const spans = spansByCode.get(code) ?? [];
    spans.push(spanDays(start, end));
    spansByCode.set(code, spans);
  }
  const out = new Map<string, number>();
  for (const [code, spans] of spansByCode.entries()) {
    spans.sort((a, b) => a - b);
    out.set(code, spans[0] ?? 1);
  }
  return out;
}

function bestRawEntriesForLedgerOccurrence(
  occurrence: { code: string; startIso: string; endIso: string },
  templates: RawEntry[][],
): RawEntry[] | null {
  const span = spanDays(occurrence.startIso, occurrence.endIso);
  const candidates = templates
    .filter((entries) => normCode(entries[0]?.pairingCodeNorm) === occurrence.code)
    .map((entries) => ({
      entries,
      start: firstDutyIso(entries),
      end: lastDutyIso(entries),
    }))
    .filter((x) => x.start && x.end)
    .sort((a, b) => {
      const aExact = spanDays(a.start, a.end) === span ? 0 : 1;
      const bExact = spanDays(b.start, b.end) === span ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aDistance = Math.abs(dayDiff(a.start, occurrence.startIso));
      const bDistance = Math.abs(dayDiff(b.start, occurrence.startIso));
      if (aDistance !== bDistance) return aDistance - bDistance;
      return a.start.localeCompare(b.start);
    });
  return candidates[0]?.entries ?? null;
}

function buildTripFromLedgerOccurrence(
  occurrence: {
    code: string;
    startIso: string;
    endIso: string;
    cells: FlicaCalendarCell[];
  },
  entriesByCode: Map<string, RawEntry[]>,
  year: number,
  month: number,
): CrewScheduleTrip {
  const base = baseForLedgerCode(occurrence.code, entriesByCode);
  const cityTokens = occurrence.cells
    .map((cell) => ledgerCity(cell))
    .filter((city) => city && city !== "-" && city !== "—" && city !== "–");
  const routeSummary = cityTokens.length
    ? [...new Set(cityTokens)].join(" · ")
    : occurrence.code;
  const trip: CrewScheduleTrip = {
    id: `flica-ledger-occurrence:${occurrence.code}:${occurrence.startIso}:${occurrence.endIso}`,
    pairingCode: occurrence.code,
    base,
    month,
    year,
    startDate: occurrence.startIso,
    endDate: occurrence.endIso,
    dutyDays: spanDays(occurrence.startIso, occurrence.endIso),
    status: "flying",
    routeSummary,
    origin: base,
    destination: cityTokens[cityTokens.length - 1] || base,
    layoverCity: cityTokens.find((city) => city !== base),
    legs: [],
    summary: {
      pairingCode: occurrence.code,
      route: routeSummary,
      startDate: occurrence.startIso,
      endDate: occurrence.endIso,
      dutyDays: spanDays(occurrence.startIso, occurrence.endIso),
      legsCount: 0,
      blockTotal: 0,
      creditTotal: 0,
      tafbTotal: 0,
      layoverTotal: 0,
      legs: [],
      crew: [],
    },
  };
  return trip;
}

function buildLedgerOccurrenceTrips(
  cells: FlicaCalendarCell[],
  rawOccurrenceEntries: RawEntry[][],
  entriesByCode: Map<string, RawEntry[]>,
  existingTrips: CrewScheduleTrip[],
  year: number,
  month: number,
): CrewScheduleTrip[] {
  const additions: CrewScheduleTrip[] = [];
  const allRawTemplates = [...rawOccurrenceEntries];
  for (const entries of entriesByCode.values()) {
    for (const occurrenceEntries of splitRawEntriesIntoOccurrences(entries)) {
      if (occurrenceEntries.length) allRawTemplates.push(occurrenceEntries);
    }
  }
  const preferredSpanByCode = preferredLedgerSpanByCode(allRawTemplates);
  for (const occurrence of buildLedgerOccurrences(cells, entriesByCode, preferredSpanByCode)) {
    if (
      exactTripExists(
        [...existingTrips, ...additions],
        occurrence.code,
        occurrence.startIso,
        occurrence.endIso,
      )
    ) {
      continue;
    }
    const template = bestRawEntriesForLedgerOccurrence(occurrence, allRawTemplates);
    const trip = template
      ? buildTripFromRawGroup(
          `ledger-occurrence:${occurrence.code}:${occurrence.startIso}:${occurrence.endIso}`,
          shiftRawOccurrenceEntries(template, occurrence.startIso),
          year,
          month,
        )
      : buildTripFromLedgerOccurrence(occurrence, entriesByCode, year, month);
    if (trip) additions.push(trip);
  }
  return additions;
}

function synthesizeBlankCalendarGapOccurrences(
  cells: FlicaCalendarCell[],
  rawOccurrenceEntries: RawEntry[][],
  existingTrips: CrewScheduleTrip[],
  year: number,
  month: number,
): CrewScheduleTrip[] {
  const cellByIso = new Map(cells.map((cell) => [cell.isoDate, cell]));
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const byCode = new Map<string, RawEntry[][]>();
  for (const entries of rawOccurrenceEntries) {
    const code = normCode(entries[0]?.pairingCodeNorm);
    const start = firstDutyIso(entries);
    const end = lastDutyIso(entries);
    if (!code || !start || !end) continue;
    const arr = byCode.get(code) ?? [];
    arr.push(entries);
    byCode.set(code, arr);
  }

  const additions: CrewScheduleTrip[] = [];
  for (const [code, templates] of byCode.entries()) {
    const sorted = [...templates].sort((a, b) =>
      firstDutyIso(a).localeCompare(firstDutyIso(b)),
    );
    const first = sorted[0];
    if (!first) continue;
    const span = spanDays(firstDutyIso(first), lastDutyIso(first));
    if (span <= 1 || span > 7) continue;

    const canFillBlankGap = (startIso: string, endIso: string): boolean => {
      if (!overlaps(startIso, endIso, monthStart, monthEnd)) return false;
      return datesBetween(startIso, endIso).every((dateIso) => {
        if (dateIso < monthStart || dateIso > monthEnd) return true;
        return ledgerCellIsBlankGap(cellByIso.get(dateIso));
      });
    };

    const addSynthetic = (template: RawEntry[], startIso: string) => {
      const endIso = addIsoDays(startIso, span - 1);
      if (!canFillBlankGap(startIso, endIso)) return;
      if (
        exactTripExists([...existingTrips, ...additions], code, startIso, endIso)
      ) {
        return;
      }
      const trip = buildTripFromRawGroup(
        `synthetic-calendar-gap:${code}:${startIso}:${endIso}`,
        shiftRawOccurrenceEntries(template, startIso),
        year,
        month,
      );
      if (trip) additions.push(trip);
    };

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i]!;
      const currentStart = firstDutyIso(current);
      const nextStart = firstDutyIso(sorted[i + 1]!);
      const gap = dayDiff(currentStart, nextStart);
      if (gap <= span || gap % span !== 0) continue;
      let probe = addIsoDays(currentStart, span);
      while (probe < nextStart) {
        addSynthetic(current, probe);
        probe = addIsoDays(probe, span);
      }
    }
  }
  return additions;
}

function buildTripFromRawGroup(
  key: string,
  entries: RawEntry[],
  year: number,
  month: number,
): CrewScheduleTrip | null {
  const first = entries[0];
  if (!first) return null;
  const code = normCode(first.pairingCodeNorm);
  if (!code || isFlicaNonFlyingActivityId(code)) return null;
  const dutyDates = [...new Set(entries.map((entry) => iso10(entry.dutyIso)).filter(Boolean))].sort();
  const rawStart = iso10(first.pairingStartIso);
  const rawEnd = iso10(first.pairingEndIso);
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const hasVisibleDutyDate = dutyDates.some((dateIso) =>
    overlaps(dateIso, dateIso, monthStart, monthEnd),
  );
  const crossesVisibleMonthBoundary = Boolean(
    rawStart &&
      rawEnd &&
      overlaps(rawStart, rawEnd, monthStart, monthEnd) &&
      (rawStart < monthStart || rawEnd > monthEnd),
  );
  const useRawHeaderSpan = crossesVisibleMonthBoundary && !hasVisibleDutyDate;
  const start = useRawHeaderSpan
    ? rawStart
    : dutyDates[0] || rawStart;
  const end = useRawHeaderSpan
    ? rawEnd
    : dutyDates[dutyDates.length - 1] || rawEnd || start;
  if (!start || !end || end < start) return null;

  const sortedEntries = [...entries].sort((a, b) => {
    const ad = iso10(a.dutyIso);
    const bd = iso10(b.dutyIso);
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.departLocal ?? "").localeCompare(String(b.departLocal ?? ""));
  });
  const reportByDuty = reportByDutyFromRaw(sortedEntries);
  const seenReportDutyDates = new Set<string>();
  const legs: CrewScheduleLeg[] = sortedEntries.reduce<CrewScheduleLeg[]>((acc, entry, idx) => {
      const route = routeStations(entry.route);
      const dutyDate = iso10(entry.dutyIso);
      if (!route || !dutyDate) return acc;
      const reportLocal = !seenReportDutyDates.has(dutyDate)
        ? reportByDuty.get(dutyDate)
        : undefined;
      seenReportDutyDates.add(dutyDate);
      acc.push({
        id: `flica-raw-carry:${key}:${idx}`,
        dutyDate,
        departureAirport: route.dep,
        arrivalAirport: route.arr,
        reportLocal,
        departLocal: entry.departLocal || undefined,
        arriveLocal: entry.arriveLocal || undefined,
        releaseLocal: entry.dEndLocal || undefined,
        isDeadhead: entry.isDeadhead,
        flightNumber: entry.flightNumber || undefined,
        blockTimeLocal: entry.blockTime || undefined,
        equipmentCode: entry.equipment || undefined,
        layoverCityLeg: entry.layoverCity || undefined,
        layoverRestDisplay: entry.layoverRestRaw || undefined,
      });
      return acc;
    }, []);

  const layoverByDate: Record<string, string> = {};
  const layoverStationByDate: Record<string, string> = {};
  for (const entry of entries) {
    const dutyDate = iso10(entry.dutyIso);
    if (!dutyDate) continue;
    if (entry.layoverRestRaw?.trim()) layoverByDate[dutyDate] = entry.layoverRestRaw.trim();
    if (entry.layoverCity?.trim()) layoverStationByDate[dutyDate] = entry.layoverCity.trim().toUpperCase();
  }

  const base = station(first.base) || "JFK";
  const routeSummary = first.routeSummary || routeSummaryFromLegs(legs, code);
  const trip: CrewScheduleTrip = {
    id: `flica-raw-carry:${key}`,
    pairingCode: code,
    base,
    month,
    year,
    startDate: start,
    endDate: end,
    dutyDays: spanDays(start, end),
    status: "flying",
    routeSummary,
    origin: legs[0]?.departureAirport,
    destination: legs[legs.length - 1]?.arrivalAirport,
    layoverCity: Object.values(layoverStationByDate).find(Boolean),
    legs,
    pairingBlockHours: minutesToHours(first.totalBlockMinutes),
    pairingCreditHours: minutesToHours(first.totalCreditMinutes),
    pairingTafbHours: minutesToHours(first.totalTafbMinutes),
    tripLayoverTotalMinutes: first.layoverTotalMinutes ?? undefined,
    crewMembers: crewMembersFromRaw(entries),
    hotel: hotelFromRaw(entries),
    canonicalPairingDays: buildCanonicalPairingDays(sortedEntries, `flica-raw-carry:${key}`, code, base),
    ...(Object.keys(layoverByDate).length ? { layoverByDate } : {}),
    ...(Object.keys(layoverStationByDate).length ? { layoverStationByDate } : {}),
  };
  return {
    ...trip,
    summary: buildSummary(trip, sortedEntries),
  };
}

function mergeRawFlicaDetailIntoTrip(existing: CrewScheduleTrip, rawTrip: CrewScheduleTrip): CrewScheduleTrip {
  const rawStart = iso10(rawTrip.startDate);
  const rawEnd = iso10(rawTrip.endDate);
  const rawSpanIsNormal = Boolean(
    rawStart && rawEnd && rawEnd >= rawStart && spanDays(rawStart, rawEnd) <= 7,
  );
  const useRawSpan = existing.status === "continuation" || rawSpanIsNormal;
  return {
    ...existing,
    base: existing.base?.trim() ? existing.base : rawTrip.base,
    startDate: useRawSpan ? rawTrip.startDate || existing.startDate : existing.startDate,
    endDate: useRawSpan ? rawTrip.endDate || existing.endDate : existing.endDate,
    dutyDays: useRawSpan ? rawTrip.dutyDays || existing.dutyDays : existing.dutyDays,
    status: existing.status === "continuation" ? "flying" : existing.status,
    routeSummary: rawTrip.routeSummary || existing.routeSummary,
    origin: rawTrip.origin ?? existing.origin,
    destination: rawTrip.destination ?? existing.destination,
    layoverCity: rawTrip.layoverCity ?? existing.layoverCity,
    legs: rawTrip.legs?.length ? rawTrip.legs.map((leg) => ({ ...leg, scheduleEntryId: leg.scheduleEntryId })) : existing.legs,
    pairingBlockHours: rawTrip.pairingBlockHours ?? existing.pairingBlockHours,
    pairingCreditHours: rawTrip.pairingCreditHours ?? existing.pairingCreditHours,
    pairingTafbHours: rawTrip.pairingTafbHours ?? existing.pairingTafbHours,
    tripLayoverTotalMinutes: rawTrip.tripLayoverTotalMinutes ?? existing.tripLayoverTotalMinutes,
    layoverByDate: rawTrip.layoverByDate ?? existing.layoverByDate,
    layoverStationByDate: rawTrip.layoverStationByDate ?? existing.layoverStationByDate,
    canonicalPairingDays: rawTrip.canonicalPairingDays ?? existing.canonicalPairingDays,
    crewMembers: rawTrip.crewMembers?.length ? rawTrip.crewMembers : existing.crewMembers,
    hotel: rawTrip.hotel ?? existing.hotel,
    summary: rawTrip.summary ?? existing.summary,
  };
}

function bestRawTripForExisting(existing: CrewScheduleTrip, rawTrips: CrewScheduleTrip[]): CrewScheduleTrip | null {
  const code = normCode(existing.pairingCode);
  if (!code) return null;
  const candidates = rawTrips
    .filter((rawTrip) => normCode(rawTrip.pairingCode) === code && rangesOverlapTrip(existing, rawTrip))
    .sort((a, b) => {
      const overlapDelta = overlapDayCount(b, existing) - overlapDayCount(a, existing);
      if (overlapDelta !== 0) return overlapDelta;
      const spanDelta = spanDays(iso10(a.startDate), iso10(a.endDate)) -
        spanDays(iso10(b.startDate), iso10(b.endDate));
      if (spanDelta !== 0) return spanDelta;
      return iso10(a.startDate).localeCompare(iso10(b.startDate));
    });
  return candidates[0] ?? null;
}

export function augmentTripsWithFlicaCarryoverDisplayTrips(
  trips: CrewScheduleTrip[],
  model: FlicaCalendarListModel,
  year: number,
  month: number,
): CrewScheduleTrip[] {
  if (model.mode !== "flica_mini_table") return trips;
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const ledgerDates = model.cells.map((cell) => iso10(cell.isoDate)).filter(Boolean).sort();
  const displayStart = ledgerDates[0] ?? monthStart;
  const displayEnd = ledgerDates[ledgerDates.length - 1] ?? monthEnd;
  const groups = new Map<string, RawEntry[]>();
  const entriesByCode = new Map<string, RawEntry[]>();
  for (const entry of model.rawPairingDetailIndex.entries) {
    const code = normCode(entry.pairingCodeNorm);
    if (!code || isFlicaNonFlyingActivityId(code)) continue;
    const codeEntries = entriesByCode.get(code) ?? [];
    codeEntries.push(entry);
    entriesByCode.set(code, codeEntries);
    const start = iso10(entry.pairingStartIso);
    const end = iso10(entry.pairingEndIso);
    if (!start || !end || !overlaps(start, end, monthStart, monthEnd)) continue;
    const k = groupKey(entry);
    const arr = groups.get(k) ?? [];
    arr.push(entry);
    groups.set(k, arr);
  }

  const rawTrips: CrewScheduleTrip[] = [];
  const rawOccurrenceEntries: RawEntry[][] = [];
  for (const [key, entries] of groups.entries()) {
    const occurrences = splitRawEntriesIntoOccurrences(entries);
    occurrences.forEach((occurrenceEntries, occurrenceIndex) => {
      rawOccurrenceEntries.push(occurrenceEntries);
      const trip = buildTripFromRawGroup(`${key}:${occurrenceIndex}`, occurrenceEntries, year, month);
      if (trip) rawTrips.push(trip);
    });
  }
  rawTrips.push(
    ...buildLedgerOccurrenceTrips(
      model.cells,
      rawOccurrenceEntries,
      entriesByCode,
      [...trips, ...rawTrips],
      year,
      month,
    ),
  );
  rawTrips.push(
    ...synthesizeBlankCalendarGapOccurrences(
      model.cells,
      rawOccurrenceEntries,
      [...trips, ...rawTrips],
      year,
      month,
    ),
  );
  if (!rawTrips.length) return trips;

  const enrichedTrips = trips.map((trip) => {
    const rawTrip = bestRawTripForExisting(trip, rawTrips);
    return rawTrip ? mergeRawFlicaDetailIntoTrip(trip, rawTrip) : trip;
  });

  const additions: CrewScheduleTrip[] = [];
  for (const rawTrip of [...rawTrips].sort((a, b) => {
    return spanDays(iso10(a.startDate), iso10(a.endDate)) -
      spanDays(iso10(b.startDate), iso10(b.endDate));
  })) {
    const code = normCode(rawTrip.pairingCode);
    const rawStart = iso10(rawTrip.startDate);
    const rawEnd = iso10(rawTrip.endDate);
    if (!code || !rawStart || !rawEnd) continue;
    const visibleStart = rawStart > displayStart ? rawStart : displayStart;
    const visibleEnd = rawEnd < displayEnd ? rawEnd : displayEnd;
    if (visibleEnd < visibleStart) continue;
    const exactLedgerOccurrence = rawTrip.id.startsWith("flica-raw-carry:ledger-occurrence:");
    if (
      exactLedgerOccurrence
        ? exactTripExists([...enrichedTrips, ...additions], code, rawStart, rawEnd)
        : !hasUncoveredVisibleDate([...enrichedTrips, ...additions], code, visibleStart, visibleEnd)
    ) {
      continue;
    }
    additions.push(rawTrip);
  }

  return additions.length ? [...enrichedTrips, ...additions] : enrichedTrips;
}
