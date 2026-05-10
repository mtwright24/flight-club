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

export function normalizeModernLedgerPairing(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
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
  if (row.trip) return false;
  if (row.kind !== "empty" && row.kind !== "off") return false;
  const hasDuty =
    String(row.reportText ?? "").trim() ||
    String(row.dEndText ?? "").trim() ||
    String(row.layoverText ?? "").trim();
  if (hasDuty) return false;
  const pt = normalizeModernLedgerPairing(row.pairingText);
  if (!isPlaceholderPairingCode(pt)) return false;
  if (row.useFlicaLedgerLabels && isOnlyDashCity(row.cityText)) {
    return false;
  }
  const city = String(row.cityText ?? "").trim();
  if (city && !isOnlyDashCity(row.cityText)) return false;
  return true;
}

export function tripPairingBase(t: CrewScheduleTrip): string {
  return String(t.pairingCode ?? "")
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
}

/** Every calendar YYYY-MM-DD from trip start through end, inclusive, sorted ascending. */
export function orderedCalendarDatesInTripSpan(trip: CrewScheduleTrip): string[] {
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

export type ModernChosenDaySource = "raw_pairing_detail" | "trip_span";

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

  const rawBlocks = enumerateRawPairingBlocksForModern(rawPairingDetailIndex);
  for (const block of rawBlocks) {
    const { orderedDates, pairingCodeNorm, pairingStartIso, scheduleLabel } = block;
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
    });
  }

  for (const trip of mergedTrips) {
    const tripIsPtv = trip.status === "ptv";
    const code = tripPairingBase(trip);
    if (!code) continue;

    const tripDates = orderedCalendarDatesInTripSpan(trip);
    if (!tripDates.length || !datesIntersectSet(tripDates, rowDateSet)) continue;

    if (!tripIsPtv) {
      const rawCovers = sequences.some(
        (s) =>
          !s.isPtv &&
          s.pairingCodeNorm === code &&
          s.sourceUsed === "raw_pairing_detail" &&
          datesOverlap(s.orderedDates, tripDates),
      );
      if (rawCovers) continue;
    } else {
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

    const linkedOffProbe = resolveModernLinkedTrip(row, mergedTrips);
    if (isModernTrueDayOffRow(row) && !linkedOffProbe) continue;

    const wantPtv =
      row.kind === "ptv" || normalizeModernLedgerPairing(row.pairingText) === "PTV";

    let codeGuess = "";
    const linked = linkedOffProbe;
    if (linked) {
      codeGuess = tripPairingBase(linked);
    } else {
      const pt = normalizeModernLedgerPairing(row.pairingText);
      if (!isPlaceholderPairingCode(pt)) codeGuess = pt;
    }
    if (!codeGuess && row.trip) {
      codeGuess = tripPairingBase(row.trip);
    }

    const basePool = sequences.filter(
      (s) => s.isPtv === wantPtv && s.dateSet.has(iso),
    );

    let candidates =
      codeGuess ?
        basePool.filter((s) => s.pairingCodeNorm === codeGuess)
      : basePool;

    if (candidates.length !== 1 && !codeGuess && basePool.length === 1) {
      candidates = basePool;
    }

    if (candidates.length > 1 && codeGuess) {
      const hint = linked?.startDate.slice(0, 10);
      const narrowed = candidates.filter((s) => s.firstDutyDate === hint);
      if (narrowed.length === 1) {
        candidates = narrowed;
      } else if (linked) {
        const linkedSpan = new Set(orderedCalendarDatesInTripSpan(linked));
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
};

function buildMetaForRow(
  row: DayRow,
  mergedTrips: CrewScheduleTrip[],
  canonical: {
    sequences: ModernCanonicalPairingSequence[];
    sequenceById: Map<string, ModernCanonicalPairingSequence>;
    assignmentByRowId: Map<string, ModernCanonicalRowAssignment>;
  },
): ModernRowDayMeta {
  const linkedProbe = resolveModernLinkedTrip(row, mergedTrips);
  const isDayOffTile = isModernTrueDayOffRow(row) && !linkedProbe;

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

  const assign = canonical.assignmentByRowId.get(row.id);
  if (assign) {
    const seq = canonical.sequenceById.get(assign.sequenceId);
    if (seq) {
      const linked = pickLinkedTripForCanonicalRow(row, seq, mergedTrips);
      const iso = row.dateIso.slice(0, 10);
      const idx = seq.orderedDates.indexOf(iso);
      const dayNumber = idx >= 0 ? idx + 1 : 0;
      const totalDays = seq.totalDays;
      let reasonIfNoDayCount: string | null = null;
      if (idx < 0) reasonIfNoDayCount = "date_outside_chosen_span";

      const pairingDisplay = seq.pairingCodeNorm;
      const dayLine =
        reasonIfNoDayCount || totalDays === 0 ? "" : `Day ${dayNumber} of ${totalDays}`;
      const renderedTitle = dayLine
        ? `${pairingDisplay} · ${dayLine}`
        : pairingDisplay;

      const tripSpanForAudit = linked ? orderedCalendarDatesInTripSpan(linked) : [];

      return {
        linkedTrip: linked,
        canonicalSequenceId: seq.id,
        pairingCodeUsed: seq.pairingCodeNorm,
        pairingDisplay,
        dayNumber,
        totalDays,
        orderedTripDates: [...seq.orderedDates],
        tripSpanDates:
          seq.sourceUsed === "trip_span" ? [...seq.orderedDates] : tripSpanForAudit,
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
      };
    }
  }

  const linked = linkedProbe;

  if (linked) {
    const tripSpanDates = orderedCalendarDatesInTripSpan(linked);
    const code = tripPairingBase(linked) || "—";
    const ledgerNorm = normalizeModernLedgerPairing(row.pairingText);
    const rawPairing = String(row.pairingText ?? "").trim();
    const pairingDisplay =
      rawPairing && !isPlaceholderPairingCode(ledgerNorm)
        ? rawPairing.toUpperCase().split("·")[0]?.trim() ?? code
        : code;

    return {
      linkedTrip: linked,
      canonicalSequenceId: null,
      pairingCodeUsed: code,
      pairingDisplay,
      dayNumber: 0,
      totalDays: 0,
      orderedTripDates: [],
      tripSpanDates,
      rawPairingDetailDates: [],
      chosenSource: null,
      railSegmentPosition: null,
      dayLine: "",
      renderAsPairingCard: true,
      renderAsMiscCard: false,
      isDayOff: false,
      renderedTitle: pairingDisplay,
      reasonIfNoDayCount: "no_canonical_sequence_match",
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
