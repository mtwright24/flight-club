/**
 * Modern Calendar List only: canonical pairing duty sequences, then row lookup.
 * Classic List does not use this module.
 */

import type { FlicaRawPairingDetailIndex } from "../flicaRawPairingDetailIndex";
import { addIsoDays } from "../ledgerContext";
import type { CrewScheduleTrip } from "../types";
import type { DayRow } from "./classicMonthGridCore";
import { isTripLikeKind } from "./classicMonthGridCore";
import { enumerateRawPairingBlocksForModern } from "./modernRawPairingDutyDatesForModern";

export function normalizeModernLedgerPairing(
  raw: string | undefined | null,
): string {
  return (
    String(raw ?? "")
      .trim()
      .toUpperCase()
      .split("·")[0]
      ?.trim() ?? ""
  );
}

export function isPlaceholderPairingCode(code: string): boolean {
  const c = code.trim();
  return c === "" || c === "-" || c === "—" || c === "–" || c === "CONT";
}

function isOnlyDashCity(cityRaw: string | undefined | null): boolean {
  return /^[-—–]$/.test(String(cityRaw ?? "").trim());
}

/**
 * Unambiguous calendar gap / day off (ledger dash-only continuation is not "off" here).
 */
export function isModernTrueDayOffRow(row: DayRow): boolean {
  const pt = normalizeModernLedgerPairing(row.pairingText);
  if (!isPlaceholderPairingCode(pt)) return false;
  const city = String(row.cityText ?? "").trim();
  if (city && !isOnlyDashCity(row.cityText)) return false;
  if (row.useFlicaLedgerLabels) return true;
  const hasDuty =
    String(row.reportText ?? "").trim() ||
    String(row.dEndText ?? "").trim() ||
    String(row.layoverText ?? "").trim();
  if (hasDuty) return false;
  if (row.trip) return false;
  if (row.kind !== "empty" && row.kind !== "off") return false;
  return true;
}

function isModernInjectedEmptyRow(row: DayRow): boolean {
  return String(row.id ?? "").startsWith("modern-empty:");
}

export function tripPairingBase(t: CrewScheduleTrip): string {
  return (
    String(t.pairingCode ?? "")
      .trim()
      .toUpperCase()
      .split("·")[0]
      ?.trim() ?? ""
  );
}

/** Every calendar YYYY-MM-DD from trip start through end, inclusive, sorted ascending. */
export function orderedCalendarDatesInTripSpan(
  trip: CrewScheduleTrip,
): string[] {
  const a = trip.startDate.slice(0, 10);
  const b = trip.endDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return [];
  }
  if (b < a) return [];
  const out: string[] = [];
  let cur = a;
  while (cur <= b) {
    out.push(cur);
    cur = addIsoDays(cur, 1);
  }
  return out;
}

/**
 * Trip attached on the hybrid row, or the unique / best match from `mergedTrips` for this
 * calendar date and optional ledger pairing code (Modern-only; no cache/snapshot).
 */
export function resolveModernLinkedTrip(
  row: DayRow,
  mergedTrips: CrewScheduleTrip[],
): CrewScheduleTrip | null {
  if (row.trip) return row.trip;

  const iso = row.dateIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const inSpan = mergedTrips.filter((t) => {
    const ts = t.startDate.slice(0, 10);
    const te = t.endDate.slice(0, 10);
    return iso >= ts && iso <= te;
  });
  if (!inSpan.length) return null;

  const rowCode = normalizeModernLedgerPairing(row.pairingText);
  const placeholder = isPlaceholderPairingCode(rowCode);
  const wantPtv = row.kind === "ptv" || rowCode === "PTV";

  if (wantPtv) {
    const ptvHits = inSpan.filter((t) => t.status === "ptv");
    if (ptvHits.length === 1) return ptvHits[0]!;
    if (ptvHits.length > 1) {
      ptvHits.sort((x, y) => y.startDate.localeCompare(x.startDate));
      return ptvHits[0]!;
    }
  }

  if (!placeholder && rowCode && rowCode !== "PTV") {
    const matched = inSpan.filter((t) => tripPairingBase(t) === rowCode);
    if (matched.length === 1) return matched[0]!;
    if (matched.length > 1) {
      matched.sort((x, y) => y.startDate.localeCompare(x.startDate));
      return matched[0]!;
    }
  }

  const flying = inSpan.filter((t) => t.status !== "ptv");
  if (flying.length === 1) return flying[0]!;
  if (flying.length > 1) {
    flying.sort((x, y) => y.startDate.localeCompare(x.startDate));
    return flying[0]!;
  }

  if (inSpan.length === 1) return inSpan[0]!;
  inSpan.sort((x, y) => y.startDate.localeCompare(x.startDate));
  return inSpan[0]!;
}

export type ModernChosenDaySource =
  | "raw_pairing_detail"
  | "trip_span"
  | "row_span";

/** Vertical rail cap / spine segment inside the pairing row tile. */
export type ModernRailSegmentPosition = "single" | "start" | "middle" | "end";

export type ModernCanonicalPairingSequence = {
  id: string;
  pairingCodeNorm: string;
  sourceUsed: ModernChosenDaySource;
  orderedDates: readonly string[];
  firstDutyDate: string;
  lastDutyDate: string;
  totalDays: number;
  dateSet: ReadonlySet<string>;
  isPtv: boolean;
  pairingCreditHours?: number;
};

export type ModernCanonicalRowAssignment = {
  sequenceId: string;
  dayIndex: number;
  dayNumber: number;
  totalDays: number;
};

function datesIntersectSet(
  dates: readonly string[],
  rowDates: ReadonlySet<string>,
): boolean {
  for (const d of dates) {
    if (rowDates.has(d)) return true;
  }
  return false;
}

function datesOverlap(a: readonly string[], b: readonly string[]): boolean {
  const bs = new Set(b);
  return a.some((d) => bs.has(d));
}

function sameOrderedDates(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((d, idx) => d === b[idx]);
}

function modernTripSpanDayCount(trip: CrewScheduleTrip | null): number {
  return trip ? orderedCalendarDatesInTripSpan(trip).length : 0;
}

function orderedDatesBetween(first: string, last: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last)) {
    return [];
  }
  if (last < first) return [];
  const out: string[] = [];
  let cur = first;
  while (cur <= last) {
    out.push(cur);
    cur = addIsoDays(cur, 1);
  }
  return out;
}

function modernSequenceRouteCity(row: DayRow): string {
  return String(row.cityText ?? "").trim().toUpperCase();
}

function modernSequenceTripBase(row: DayRow): string {
  return String(row.trip?.base ?? "JFK").trim().toUpperCase();
}

function shouldStartNewModernRowSpanOccurrence(
  previous: DayRow,
  current: DayRow,
  blockFirst: string,
  currentIso: string,
): boolean {
  const base = modernSequenceTripBase(previous) || modernSequenceTripBase(current);
  const currCity = modernSequenceRouteCity(current);
  if (!base || !currCity) return false;
  const currentLooksLikePairingStart =
    currCity !== base && !isOnlyDashCity(currCity);
  if (!currentLooksLikePairingStart) return false;
  return dayIndexInCalendarSpan(blockFirst, currentIso) >= 2;
}

function buildModernRowSpanSequences(
  rows: DayRow[],
  rowDateSet: ReadonlySet<string>,
): ModernCanonicalPairingSequence[] {
  const codedRows = rows
    .map((row) => ({
      row,
      iso: row.dateIso.slice(0, 10),
      code: normalizeModernLedgerPairing(row.pairingText),
    }))
    .filter(
      (x) =>
        /^\d{4}-\d{2}-\d{2}$/.test(x.iso) &&
        !isPlaceholderPairingCode(x.code) &&
        x.code !== "PTV",
    )
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const sequences: ModernCanonicalPairingSequence[] = [];
  let blockCode = "";
  let blockFirst = "";
  let blockLast = "";
  let blockLastRow: DayRow | null = null;

  const flush = () => {
    if (!blockCode || !blockFirst || !blockLast) return;
    const orderedDates = orderedDatesBetween(blockFirst, blockLast);
    if (orderedDates.length < 2) return;
    if (!orderedDates.length || !datesIntersectSet(orderedDates, rowDateSet)) return;
    const id = `row:${blockCode}:${blockFirst}:${blockLast}`;
    sequences.push({
      id,
      pairingCodeNorm: blockCode,
      sourceUsed: "row_span",
      orderedDates,
      firstDutyDate: orderedDates[0]!,
      lastDutyDate: orderedDates[orderedDates.length - 1]!,
      totalDays: orderedDates.length,
      dateSet: new Set(orderedDates),
      isPtv: false,
    });
  };

  for (const item of codedRows) {
    if (!blockCode) {
      blockCode = item.code;
      blockFirst = item.iso;
      blockLast = item.iso;
      blockLastRow = item.row;
      continue;
    }

    const sameBlock =
      item.code === blockCode &&
      item.iso >= blockLast &&
      !(blockLastRow &&
        shouldStartNewModernRowSpanOccurrence(
          blockLastRow,
          item.row,
          blockFirst,
          item.iso,
        ));

    if (!sameBlock) {
      flush();
      blockCode = item.code;
      blockFirst = item.iso;
    }
    blockLast = item.iso;
    blockLastRow = item.row;
  }
  flush();

  return sequences;
}

function modernSequenceSourceRank(source: ModernChosenDaySource): number {
  switch (source) {
    case "trip_span":
      return 3;
    case "row_span":
      return 2;
    case "raw_pairing_detail":
      return 1;
    default:
      return 0;
  }
}

function chooseLongestModernSequence(
  candidates: ModernCanonicalPairingSequence[],
): ModernCanonicalPairingSequence[] {
  if (candidates.length <= 1) return candidates;
  const rowSpans = candidates.filter((s) => s.sourceUsed === "row_span");
  const rawSpans = candidates.filter((s) => s.sourceUsed === "raw_pairing_detail");
  const sourceCandidates =
    rowSpans.length > 0 ? rowSpans : rawSpans.length > 0 ? rawSpans : candidates;
  const sorted = [...sourceCandidates].sort((a, b) => {
    if (a.totalDays !== b.totalDays) return b.totalDays - a.totalDays;
    const sr = modernSequenceSourceRank(b.sourceUsed) - modernSequenceSourceRank(a.sourceUsed);
    if (sr !== 0) return sr;
    return a.firstDutyDate.localeCompare(b.firstDutyDate);
  });
  return [sorted[0]!];
}

/**
 * STEP 1 — Build one canonical sequence per pairing block (raw block or trip span), once per month model.
 * Raw and trip spans are never mixed inside one sequence.
 */
export function buildModernCanonicalPairingModel(
  rows: DayRow[],
  mergedTrips: CrewScheduleTrip[],
  rawPairingDetailIndex: FlicaRawPairingDetailIndex | null | undefined,
): {
  sequences: ModernCanonicalPairingSequence[];
  sequenceById: Map<string, ModernCanonicalPairingSequence>;
  assignmentByRowId: Map<string, ModernCanonicalRowAssignment>;
} {
  const rowDateSet = new Set<string>();
  for (const r of rows) {
    const d = r.dateIso.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) rowDateSet.add(d);
  }

  const sequences: ModernCanonicalPairingSequence[] = [];
  const seenTripSequenceIds = new Set<string>();

  sequences.push(...buildModernRowSpanSequences(rows, rowDateSet));

  const rawBlocks = enumerateRawPairingBlocksForModern(rawPairingDetailIndex);
  for (const block of rawBlocks) {
    const {
      orderedDates,
      pairingCodeNorm,
      pairingStartIso,
      scheduleLabel,
      totalCreditMinutes,
    } =
      block;
    if (!orderedDates.length || !pairingCodeNorm) continue;
    if (!datesIntersectSet(orderedDates, rowDateSet)) continue;

    const lbl = (scheduleLabel ?? "").replace(/\|/g, "_");
    const id = `raw:${pairingCodeNorm}:${pairingStartIso}:${lbl}:${orderedDates[orderedDates.length - 1]!}`;
    sequences.push({
      id,
      pairingCodeNorm,
      sourceUsed: "raw_pairing_detail",
      orderedDates,
      firstDutyDate: orderedDates[0]!,
      lastDutyDate: orderedDates[orderedDates.length - 1]!,
      totalDays: orderedDates.length,
      dateSet: new Set(orderedDates),
      isPtv: false,
      pairingCreditHours:
        totalCreditMinutes != null && Number.isFinite(totalCreditMinutes)
          ? totalCreditMinutes / 60
          : undefined,
    });
  }

  for (const trip of mergedTrips) {
    const tripIsPtv = trip.status === "ptv";
    const code = tripPairingBase(trip);
    if (!code) continue;

    const tripDates = orderedCalendarDatesInTripSpan(trip);
    if (!tripDates.length || !datesIntersectSet(tripDates, rowDateSet))
      continue;

    if (tripIsPtv) {
      const dupPtv = sequences.some(
        (s) =>
          s.isPtv &&
          s.pairingCodeNorm === code &&
          datesOverlap(s.orderedDates, tripDates),
      );
      if (dupPtv) continue;
    }

    const id = `trip:${trip.id}:${code}`;
    if (seenTripSequenceIds.has(id)) continue;
    seenTripSequenceIds.add(id);

    sequences.push({
      id,
      pairingCodeNorm: code,
      sourceUsed: "trip_span",
      orderedDates: tripDates,
      firstDutyDate: tripDates[0]!,
      lastDutyDate: tripDates[tripDates.length - 1]!,
      totalDays: tripDates.length,
      dateSet: new Set(tripDates),
      isPtv: tripIsPtv,
    });
  }

  const sequenceById = new Map<string, ModernCanonicalPairingSequence>();
  for (const s of sequences) sequenceById.set(s.id, s);

  const assignmentByRowId = new Map<string, ModernCanonicalRowAssignment>();

  for (const row of rows) {
    const iso = row.dateIso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

    const wantPtv =
      row.kind === "ptv" ||
      normalizeModernLedgerPairing(row.pairingText) === "PTV";

    let codeGuess = "";
    const rowPairingNorm = normalizeModernLedgerPairing(row.pairingText);
    const rowCity = String(row.cityText ?? "").trim();
    const isBlankFlicaLedgerDate =
      Boolean(row.useFlicaLedgerLabels) &&
      isPlaceholderPairingCode(rowPairingNorm) &&
      (!rowCity || isOnlyDashCity(rowCity));
    const linked = resolveModernLinkedTrip(row, mergedTrips);
    const linkedSpanDays = modernTripSpanDayCount(linked);
    const linkedLooksLikeMergedRun = linkedSpanDays > 7;
    if (linked && (!isBlankFlicaLedgerDate || !linkedLooksLikeMergedRun)) {
      codeGuess = tripPairingBase(linked);
    } else {
      if (!isPlaceholderPairingCode(rowPairingNorm)) codeGuess = rowPairingNorm;
    }
    if (
      !codeGuess &&
      row.trip &&
      (!isBlankFlicaLedgerDate || modernTripSpanDayCount(row.trip) <= 7)
    ) {
      codeGuess = tripPairingBase(row.trip);
    }

    let basePool = sequences.filter(
      (s) => s.isPtv === wantPtv && s.dateSet.has(iso),
    );
    if (isBlankFlicaLedgerDate) {
      basePool = basePool.filter(
        (s) => s.sourceUsed !== "trip_span" || s.totalDays <= 7,
      );
    }

    let candidates = codeGuess
      ? basePool.filter((s) => s.pairingCodeNorm === codeGuess)
      : basePool;

    if (candidates.length !== 1 && !codeGuess && basePool.length === 1) {
      candidates = basePool;
    }

    if (candidates.length > 1) {
      const canonicalFromRowsOrRaw = candidates.filter(
        (s) => s.sourceUsed !== "trip_span",
      );
      if (canonicalFromRowsOrRaw.length > 0) {
        candidates = chooseLongestModernSequence(canonicalFromRowsOrRaw);
      }
      if (candidates.length > 1 && linked) {
        const linkedDates = orderedCalendarDatesInTripSpan(linked);
        const exactTripSpan = candidates.filter(
          (s) =>
            s.sourceUsed === "trip_span" &&
            s.firstDutyDate === linked.startDate.slice(0, 10) &&
            s.lastDutyDate === linked.endDate.slice(0, 10) &&
            sameOrderedDates(s.orderedDates, linkedDates),
        );
        if (exactTripSpan.length === 1) {
          candidates = exactTripSpan;
        } else {
          const linkedSpan = new Set(linkedDates);
          const ov = candidates.filter((s) =>
            s.orderedDates.some((d) => linkedSpan.has(d)),
          );
          if (ov.length === 1) candidates = ov;
          else {
            const ts = linked.startDate.slice(0, 10);
            const te = linked.endDate.slice(0, 10);
            const inSpan = candidates.filter(
              (s) => s.firstDutyDate <= te && s.lastDutyDate >= ts,
            );
            if (inSpan.length === 1) candidates = inSpan;
          }
        }
      }
      if (candidates.length > 1) {
        candidates = chooseLongestModernSequence(candidates);
      }
    }

    if (candidates.length !== 1) continue;

    const seq = candidates[0]!;
    const dayIndex = seq.orderedDates.indexOf(iso);
    if (dayIndex < 0) continue;

    assignmentByRowId.set(row.id, {
      sequenceId: seq.id,
      dayIndex,
      dayNumber: dayIndex + 1,
      totalDays: seq.totalDays,
    });
  }

  return { sequences, sequenceById, assignmentByRowId };
}

function railSegmentFromDayIndex(
  dayNumber: number,
  totalDays: number,
): ModernRailSegmentPosition | null {
  if (totalDays <= 0 || dayNumber <= 0) return null;
  if (totalDays === 1) return "single";
  if (dayNumber === 1) return "start";
  if (dayNumber === totalDays) return "end";
  return "middle";
}

function dayIndexInCalendarSpan(firstIso: string, iso: string): number {
  const start = new Date(`${firstIso}T12:00:00`);
  const current = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(current.getTime())) {
    return -1;
  }
  const diff = Math.round((current.getTime() - start.getTime()) / 864e5);
  return diff >= 0 ? diff : -1;
}

function pickLinkedTripForCanonicalRow(
  row: DayRow,
  seq: ModernCanonicalPairingSequence,
  mergedTrips: CrewScheduleTrip[],
): CrewScheduleTrip | null {
  const iso = row.dateIso.slice(0, 10);
  const resolved = resolveModernLinkedTrip(row, mergedTrips);
  if (resolved && tripPairingBase(resolved) === seq.pairingCodeNorm) {
    if (seq.isPtv === (resolved.status === "ptv")) return resolved;
  }

  const pool = mergedTrips.filter((tr) => {
    if (tripPairingBase(tr) !== seq.pairingCodeNorm) return false;
    if (seq.isPtv !== (tr.status === "ptv")) return false;
    const ts = tr.startDate.slice(0, 10);
    const te = tr.endDate.slice(0, 10);
    return iso >= ts && iso <= te;
  });
  if (pool.length === 1) return pool[0]!;
  if (pool.length > 1) {
    pool.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return pool[0]!;
  }
  if (row.trip && tripPairingBase(row.trip) === seq.pairingCodeNorm) {
    return row.trip;
  }
  return resolved;
}

function modernTripSequenceId(trip: CrewScheduleTrip): string {
  const code = tripPairingBase(trip);
  const identity = String(trip.schedulePairingId ?? trip.id ?? "").replace(
    /\|/g,
    "_",
  );
  return `trip:${identity}:${code}:${trip.startDate.slice(0, 10)}:${trip.endDate.slice(0, 10)}`;
}

export type ModernRowDayMeta = {
  linkedTrip: CrewScheduleTrip | null;
  /** Stable id for rail grouping; one per canonical sequence. */
  canonicalSequenceId: string | null;
  pairingCodeUsed: string;
  pairingDisplay: string;
  dayNumber: number;
  totalDays: number;
  orderedTripDates: string[];
  tripSpanDates: string[];
  rawPairingDetailDates: string[];
  chosenSource: ModernChosenDaySource | null;
  railSegmentPosition: ModernRailSegmentPosition | null;
  dayLine: string;
  renderAsPairingCard: boolean;
  renderAsMiscCard: boolean;
  isDayOff: boolean;
  renderedTitle: string;
  reasonIfNoDayCount: string | null;
  displayRouteText?: string;
  displayReportText?: string;
  displayDEndText?: string;
  displayLayoverText?: string;
  displayCreditText?: string;
};

function modernCreditTextFromHours(hours: number | null | undefined): string | undefined {
  if (hours == null || !Number.isFinite(Number(hours)) || Number(hours) <= 0) {
    return undefined;
  }
  return Number(hours).toFixed(2);
}

function buildMetaForRow(
  row: DayRow,
  mergedTrips: CrewScheduleTrip[],
  canonical: {
    sequences: ModernCanonicalPairingSequence[];
    sequenceById: Map<string, ModernCanonicalPairingSequence>;
    assignmentByRowId: Map<string, ModernCanonicalRowAssignment>;
  },
): ModernRowDayMeta {
  const trueOffRow = isModernTrueDayOffRow(row);
  const injectedEmptyRow = isModernInjectedEmptyRow(row);
  const linkedProbe = resolveModernLinkedTrip(row, mergedTrips);

  const assign = canonical.assignmentByRowId.get(row.id);
  if (assign) {
    const seq = canonical.sequenceById.get(assign.sequenceId);
    if (seq) {
      const linked = pickLinkedTripForCanonicalRow(row, seq, mergedTrips);
      const iso = row.dateIso.slice(0, 10);
      const idx = dayIndexInCalendarSpan(seq.firstDutyDate, iso);
      const dayNumber = idx >= 0 ? idx + 1 : 0;
      const totalDays = dayIndexInCalendarSpan(seq.firstDutyDate, seq.lastDutyDate) + 1;
      let reasonIfNoDayCount: string | null = null;
      if (idx < 0 || iso > seq.lastDutyDate)
        reasonIfNoDayCount = "date_outside_chosen_span";

      const pairingDisplay = seq.pairingCodeNorm;
      const dayLine =
        reasonIfNoDayCount || totalDays === 0
          ? ""
          : `Day ${dayNumber} of ${totalDays}`;
      const renderedTitle = dayLine
        ? `${pairingDisplay} · ${dayLine}`
        : pairingDisplay;

      const tripSpanForAudit = linked
        ? orderedCalendarDatesInTripSpan(linked)
        : [];

      return {
        linkedTrip: linked,
        canonicalSequenceId: seq.id,
        pairingCodeUsed: seq.pairingCodeNorm,
        pairingDisplay,
        dayNumber,
        totalDays,
        orderedTripDates: orderedDatesBetween(seq.firstDutyDate, seq.lastDutyDate),
        tripSpanDates:
          seq.sourceUsed === "trip_span"
            ? orderedDatesBetween(seq.firstDutyDate, seq.lastDutyDate)
            : tripSpanForAudit,
        rawPairingDetailDates:
          seq.sourceUsed === "raw_pairing_detail" ? [...seq.orderedDates] : [],
        chosenSource: seq.sourceUsed,
        railSegmentPosition: railSegmentFromDayIndex(dayNumber, totalDays),
        dayLine,
        renderAsPairingCard: true,
        renderAsMiscCard: false,
        isDayOff: false,
        renderedTitle,
        reasonIfNoDayCount,
        displayCreditText:
          dayNumber === 1
            ? modernCreditTextFromHours(seq.pairingCreditHours)
            : undefined,
      };
    }
  }

  const linkedProbeSpanDays = modernTripSpanDayCount(linkedProbe);
  const isDayOffTile =
    trueOffRow &&
    !injectedEmptyRow &&
    (!linkedProbe || linkedProbeSpanDays > 7);

  if (isDayOffTile) {
    return {
      linkedTrip: null,
      canonicalSequenceId: null,
      pairingCodeUsed: "",
      pairingDisplay: "",
      dayNumber: 0,
      totalDays: 0,
      orderedTripDates: [],
      tripSpanDates: [],
      rawPairingDetailDates: [],
      chosenSource: null,
      railSegmentPosition: null,
      dayLine: "",
      renderAsPairingCard: false,
      renderAsMiscCard: false,
      isDayOff: true,
      renderedTitle: "DAY OFF",
      reasonIfNoDayCount: null,
    };
  }

  const linked = linkedProbe;

  if (linked) {
    const tripSpanDates = orderedCalendarDatesInTripSpan(linked);
    const code = tripPairingBase(linked) || "—";
    const iso = row.dateIso.slice(0, 10);
    const dayIndex = tripSpanDates.indexOf(iso);
    const dayNumber = dayIndex >= 0 ? dayIndex + 1 : 0;
    const totalDays = tripSpanDates.length;
    const dayLine =
      dayNumber > 0 && totalDays > 0 ? `Day ${dayNumber} of ${totalDays}` : "";
    const ledgerNorm = normalizeModernLedgerPairing(row.pairingText);
    const rawPairing = String(row.pairingText ?? "").trim();
    const pairingDisplay =
      rawPairing && !isPlaceholderPairingCode(ledgerNorm)
        ? (rawPairing.toUpperCase().split("·")[0]?.trim() ?? code)
        : code;

    return {
      linkedTrip: linked,
      canonicalSequenceId: dayLine ? modernTripSequenceId(linked) : null,
      pairingCodeUsed: code,
      pairingDisplay,
      dayNumber,
      totalDays,
      orderedTripDates: [],
      tripSpanDates,
      rawPairingDetailDates: [],
      chosenSource: dayLine ? "trip_span" : null,
      railSegmentPosition: railSegmentFromDayIndex(dayNumber, totalDays),
      dayLine,
      renderAsPairingCard: true,
      renderAsMiscCard: false,
      isDayOff: false,
      renderedTitle: dayLine ? `${pairingDisplay} · ${dayLine}` : pairingDisplay,
      reasonIfNoDayCount: dayLine ? null : "no_canonical_sequence_match",
    };
  }

  if (row.kind !== "empty" && isTripLikeKind(row.kind)) {
    const pd =
      normalizeModernLedgerPairing(row.pairingText) ||
      String(row.pairingText ?? "").trim() ||
      "—";
    return {
      linkedTrip: null,
      canonicalSequenceId: null,
      pairingCodeUsed: pd,
      pairingDisplay: pd,
      dayNumber: 0,
      totalDays: 0,
      orderedTripDates: [],
      tripSpanDates: [],
      rawPairingDetailDates: [],
      chosenSource: null,
      railSegmentPosition: null,
      dayLine: "",
      renderAsPairingCard: true,
      renderAsMiscCard: false,
      isDayOff: false,
      renderedTitle: pd,
      reasonIfNoDayCount: "no_linked_trip_for_row_date",
    };
  }

  return {
    linkedTrip: null,
    canonicalSequenceId: null,
    pairingCodeUsed: "",
    pairingDisplay: row.pairingText || row.cityText || "—",
    dayNumber: 0,
    totalDays: 0,
    orderedTripDates: [],
    tripSpanDates: [],
    rawPairingDetailDates: [],
    chosenSource: null,
    railSegmentPosition: null,
    dayLine: "",
    renderAsPairingCard: false,
    renderAsMiscCard: true,
    isDayOff: false,
    renderedTitle: row.pairingText || row.cityText || "—",
    reasonIfNoDayCount: null,
  };
}

export type ModernDayCountAuditRailPosition =
  | ModernRailSegmentPosition
  | "none";

export type ModernDayCountAudit = {
  visibleMonth: string;
  rowCount: number;
  rows: Array<{
    dateIso: string;
    pairingCode: string;
    chosenSource: ModernChosenDaySource | "none";
    canonicalSequenceId: string | null;
    rawPairingDetailDates: string[];
    tripSpanDates: string[];
    chosenDates: string[];
    dayNumber: number;
    totalDays: number;
    railPosition: ModernDayCountAuditRailPosition;
  }>;
};

export type ModernCanonicalSequenceAudit = {
  pairings: Array<{
    pairingCode: string;
    sourceUsed: ModernChosenDaySource;
    orderedDates: string[];
    totalDays: number;
    firstDutyDate: string;
    lastDutyDate: string;
  }>;
  rows: Array<{
    rowDate: string;
    pairingCode: string;
    matchedSequence: string | null;
    dayNumber: number;
    totalDays: number;
    railPosition: ModernDayCountAuditRailPosition;
  }>;
};

export function buildModernDayCountAudit(
  rows: DayRow[],
  mergedTrips: CrewScheduleTrip[],
  visibleMonth: string,
  rawPairingDetailIndex: FlicaRawPairingDetailIndex | null | undefined,
): {
  metaByRowId: Map<string, ModernRowDayMeta>;
  audit: ModernDayCountAudit;
  canonicalAudit: ModernCanonicalSequenceAudit;
} {
  const canonical = buildModernCanonicalPairingModel(
    rows,
    mergedTrips,
    rawPairingDetailIndex,
  );

  const metaByRowId = new Map<string, ModernRowDayMeta>();
  const auditRows: ModernDayCountAudit["rows"] = [];
  const canonicalRowAudit: ModernCanonicalSequenceAudit["rows"] = [];

  for (const row of rows) {
    const meta = buildMetaForRow(row, mergedTrips, canonical);
    metaByRowId.set(row.id, meta);
    auditRows.push({
      dateIso: row.dateIso.slice(0, 10),
      pairingCode: meta.pairingCodeUsed,
      chosenSource: meta.chosenSource ?? "none",
      canonicalSequenceId: meta.canonicalSequenceId,
      rawPairingDetailDates: meta.rawPairingDetailDates,
      tripSpanDates: meta.tripSpanDates,
      chosenDates: meta.orderedTripDates,
      dayNumber: meta.dayNumber,
      totalDays: meta.totalDays,
      railPosition: meta.railSegmentPosition ?? "none",
    });
    canonicalRowAudit.push({
      rowDate: row.dateIso.slice(0, 10),
      pairingCode: meta.pairingDisplay,
      matchedSequence: meta.canonicalSequenceId,
      dayNumber: meta.dayNumber,
      totalDays: meta.totalDays,
      railPosition: meta.railSegmentPosition ?? "none",
    });
  }

  const canonicalAudit: ModernCanonicalSequenceAudit = {
    pairings: canonical.sequences.map((s) => ({
      pairingCode: s.pairingCodeNorm,
      sourceUsed: s.sourceUsed,
      orderedDates: [...s.orderedDates],
      totalDays: s.totalDays,
      firstDutyDate: s.firstDutyDate,
      lastDutyDate: s.lastDutyDate,
    })),
    rows: canonicalRowAudit,
  };

  return {
    metaByRowId,
    audit: {
      visibleMonth,
      rowCount: rows.length,
      rows: auditRows,
    },
    canonicalAudit,
  };
}
