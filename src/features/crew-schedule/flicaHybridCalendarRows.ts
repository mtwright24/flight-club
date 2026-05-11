/**
 * Merge FLICA mini-calendar ledger rows (label skeleton) with duty/trip-derived `DayRow` detail fields.
 */

import { isFlicaNonFlyingActivityId } from "../../services/flicaScheduleHtmlParser";
import type { CrewScheduleTrip } from "./types";
import type { FlicaCalendarCell } from "./flicaMiniCalendarTableLedger";
import { sanitizeFlicaLedgerCityText } from "./flicaMiniCalendarTableLedger";
import {
  kindFromLedgerCell,
  tripForFlicaCalendarCell,
} from "./flicaCalendarLedgerDayRows";
import { formatLayoverColumnDisplay } from "./scheduleTime";
import {
  legsForDutyDate,
} from "./modernClassic/modernClassicDayDisplay";
import {
  attachDayRowGrouping,
  type DayRow,
  type RowKind,
} from "./modernClassic/classicMonthGridCore";
import {
  matchLedgerRowToRawPairingDuty,
  type FlicaRawPairingDetailIndex,
} from "./flicaRawPairingDetailIndex";

function normalizePairingToken(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
}

function takeFromPool(
  pool: DayRow[],
  pred: (r: DayRow) => boolean,
): DayRow | null {
  const i = pool.findIndex(pred);
  if (i < 0) return null;
  const [row] = pool.splice(i, 1);
  return row ?? null;
}

/**
 * FLICA rest/layover tokens are often 4 digits. `formatLayoverColumnDisplay` treats them as clock
 * time (HH≤23); values like 2408 are valid Crewline layover/rest and must still display.
 */
function hybridLayoverTokenFromParsedRaw(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "-" || t === "—" || t === "–") return "";
  const clock = formatLayoverColumnDisplay(t);
  if (clock) return clock;
  if (/^\d{4}$/.test(t)) {
    const mm = Number(t.slice(2, 4));
    if (mm <= 59) return t;
  }
  return "";
}

function layoverTokenFromLegsForDuty(
  _trip: CrewScheduleTrip,
  legs: ReturnType<typeof legsForDutyDate>,
): string {
  if (!legs.length) return "";
  for (let i = legs.length - 1; i >= 0; i -= 1) {
    const leg = legs[i]!;
    const rest = leg.layoverRestDisplay?.trim();
    if (rest) {
      const f = hybridLayoverTokenFromParsedRaw(rest);
      if (f) return f;
    }
  }
  return "";
}

function isDateWithinTripSpan(trip: CrewScheduleTrip, iso: string): boolean {
  const d = iso.slice(0, 10);
  const a = trip.startDate.slice(0, 10);
  const b = trip.endDate.slice(0, 10);
  return d >= a && d <= b;
}

/**
 * Mini-calendar row shows a flying pairing code: attach the trip from `mergedTrips` when the date
 * falls in that pairing's span (adjacent-month rows often miss pool/fallback).
 */
function findTripByLedgerPairingInSpan(
  mergedTrips: CrewScheduleTrip[],
  ledgerPairingToken: string,
  dateIso: string,
): CrewScheduleTrip | null {
  const iso10 = dateIso.slice(0, 10);
  const pt = normalizePairingToken(ledgerPairingToken);
  if (!pt || pt === "-" || pt === "PTV") return null;
  if (isFlicaNonFlyingActivityId(pt)) return null;

  const matches = mergedTrips.filter(
    (t) =>
      t.status !== "ptv" &&
      normalizePairingToken(t.pairingCode ?? "") === pt &&
      isDateWithinTripSpan(t, iso10),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  matches.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return matches[0] ?? null;
}

type HybridLayoverResolutionAudit = {
  rawDutyRowLayover: string;
  rawLegLayovers: string[];
  rawTripLayoverMap: string | null;
  chosenSource: string;
  blankReason: string | null;
  candidateBeforeNormalize: string;
};

/**
 * Layover column: matched duty text → same-date legs only → same-day `layoverByDate` only.
 * No bracket/n_neighbor inheritance, no prior-row context.
 */
function resolveHybridLayoverWithAudit(
  trip: CrewScheduleTrip | null,
  iso: string,
  dutyRowLayoverRaw: string,
  rowKind: RowKind,
): { text: string; audit: HybridLayoverResolutionAudit } {
  const iso10 = iso.slice(0, 10);

  const emptyAudit = (
    blankReason: string,
  ): HybridLayoverResolutionAudit => ({
    rawDutyRowLayover: dutyRowLayoverRaw,
    rawLegLayovers: [],
    rawTripLayoverMap: trip?.layoverByDate?.[iso10] ?? null,
    chosenSource: "",
    blankReason,
    candidateBeforeNormalize: "",
  });

  if (!trip) {
    return { text: "", audit: emptyAudit("no_trip") };
  }
  if (rowKind === "ptv" || trip.status === "ptv") {
    return { text: "", audit: emptyAudit("ptv") };
  }
  if (!isDateWithinTripSpan(trip, iso10)) {
    return { text: "", audit: emptyAudit("outside_trip_span") };
  }

  const legsStrict = legsForDutyDate(trip, iso10);
  const rawLegLayovers = legsStrict.map((l) =>
    String(l.layoverRestDisplay ?? "").trim(),
  );
  const rawMapLayover = trip.layoverByDate?.[iso10] ?? null;

  const fromDuty = hybridLayoverTokenFromParsedRaw(dutyRowLayoverRaw);
  const fromLeg = layoverTokenFromLegsForDuty(trip, legsStrict);
  const fromMap = hybridLayoverTokenFromParsedRaw(rawMapLayover ?? "");

  let text = "";
  let chosenSource = "";
  let blankReason: string | null = null;

  if (fromDuty) {
    text = fromDuty;
    chosenSource = "duty_row_layover_text";
  } else if (fromLeg) {
    text = fromLeg;
    chosenSource = "legs_same_duty_date_rest";
  } else if (fromMap) {
    text = fromMap;
    chosenSource = "trip_layover_by_date_same_iso";
  } else {
    blankReason = "no_parsed_layover";
  }

  const baseAudit: HybridLayoverResolutionAudit = {
    rawDutyRowLayover: dutyRowLayoverRaw,
    rawLegLayovers,
    rawTripLayoverMap: rawMapLayover,
    chosenSource,
    blankReason,
    candidateBeforeNormalize: text,
  };

  return {
    text,
    audit: {
      ...baseAudit,
      chosenSource,
      blankReason,
      candidateBeforeNormalize: text,
    },
  };
}

/** Never display a lone dash as layover; parsed tokens pass through unchanged. */
function finalizeHybridLayoverColumn(row: DayRow): DayRow {
  let lay = String(row.layoverText ?? "").trim();
  if (lay === "-" || lay === "—" || lay === "–") lay = "";
  return { ...row, layoverText: lay };
}

function overlayTripLegDetailsOntoRow(row: DayRow, _cell: FlicaCalendarCell): DayRow {
  const t = row.trip;
  if (!t) return row;
  let next = row;
  const iso = row.dateIso.slice(0, 10);

  const legsForTimes = legsForDutyDate(t, iso);

  if (!String(row.reportText).trim() || !String(row.dEndText).trim()) {
    if (legsForTimes.length) {
      const rpt = legsForTimes[0]?.reportLocal?.trim() ?? "";
      const dend = legsForTimes[legsForTimes.length - 1]?.releaseLocal?.trim() ?? "";
      next = {
        ...next,
        reportText: String(next.reportText).trim() ? next.reportText : rpt,
        dEndText: String(next.dEndText).trim() ? next.dEndText : dend,
      };
    }
  }

  if (
    !String(next.wxText).trim() &&
    t.status !== "off" &&
    t.status !== "ptv" &&
    next.kind !== "ptv"
  ) {
    next = { ...next, wxText: "☀︎" };
  }
  return next;
}

function formatFlicaDetailTimeToken(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function syntheticCalendarGapDisplayForRow(
  trip: CrewScheduleTrip | null,
  dateIso: string,
): { pairingText: string; cityText: string } | null {
  if (!isSyntheticCalendarGapTrip(trip)) {
    return null;
  }
  const iso = dateIso.slice(0, 10);
  const day = trip?.canonicalPairingDays?.[iso];
  const start = trip?.startDate.slice(0, 10) ?? "";
  const end = trip?.endDate.slice(0, 10) ?? "";
  const continuationDash = start && end && iso > start && iso < end ? "-" : "";
  return {
    pairingText: iso === start ? trip.pairingCode : "",
    cityText: day?.displayCityLedger ?? continuationDash,
  };
}

function isSyntheticCalendarGapTrip(trip: CrewScheduleTrip | null): boolean {
  return String(trip?.id ?? "").startsWith(
    "flica-raw-carry:synthetic-calendar-gap:",
  );
}

export function buildHybridFlicaCalendarRows({
  ledgerCells,
  tripDerivedRows,
  mergedTrips,
  todayIso,
  rawPairingDetailIndex,
}: {
  ledgerCells: FlicaCalendarCell[];
  tripDerivedRows: DayRow[];
  visibleMonth: string;
  mergedTrips: CrewScheduleTrip[];
  todayIso: string;
  rawPairingDetailIndex: FlicaRawPairingDetailIndex;
}): DayRow[] {
  const buckets = new Map<string, DayRow[]>();
  for (const r of tripDerivedRows) {
    const k = r.dateIso.slice(0, 10);
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }

  let prevTrip: CrewScheduleTrip | null = null;

  const out: DayRow[] = [];

  let sequencePairingNorm = "";

  ledgerCells.forEach((cell, rowIdx) => {
    const dateIso = cell.isoDate;
    const iso10 = dateIso.slice(0, 10);

    const pool = buckets.get(dateIso) ?? [];

    const ledgerPairingText =
      cell.displayCode == null ? "" : String(cell.displayCode);
    const lcRaw = ledgerPairingText.trim();
    const lc = normalizePairingToken(lcRaw);
    const ledgerCity = sanitizeFlicaLedgerCityText(cell.displayCity);
    const cityForRow = ledgerCity;

    let picked: DayRow | null = null;

    if (lc === "PTV") {
      picked = takeFromPool(
        pool,
        (r) =>
          r.kind === "ptv" || normalizePairingToken(r.pairingText) === "PTV",
      );
    } else if (lc && isFlicaNonFlyingActivityId(lc)) {
      picked = takeFromPool(
        pool,
        (r) =>
          normalizePairingToken(r.pairingText) === lc ||
          (!!r.trip &&
            normalizePairingToken(r.trip.pairingCode ?? "") === lc),
      );
    } else if (!lc || lc === "-" || lcRaw === "—" || lcRaw === "–") {
      const prevPid = prevTrip
        ? normalizePairingToken(prevTrip.pairingCode ?? "")
        : "";
      picked = takeFromPool(
        pool,
        (r) =>
          r.kind === "continuation" ||
          (!!prevTrip &&
            !!r.trip &&
            normalizePairingToken(r.trip.pairingCode ?? "") === prevPid),
      );
      if (!picked && pool.length) {
        picked = takeFromPool(pool, () => true);
      }
    } else {
      picked = takeFromPool(
        pool,
        (r) =>
          normalizePairingToken(r.pairingText) === lc ||
          (!!r.trip && normalizePairingToken(r.trip.pairingCode ?? "") === lc),
      );
    }

    const fallbackTrip = tripForFlicaCalendarCell(mergedTrips, cell);
    const afterPrimaryTrip = picked?.trip ?? fallbackTrip;

    let trip = afterPrimaryTrip;

    const ledgerPairingBlankContinuation =
      !lc || lc === "-" || lcRaw === "—" || lcRaw === "–";
    const ledgerVisibleFlyingPairing =
      Boolean(lc) &&
      !ledgerPairingBlankContinuation &&
      lc !== "PTV" &&
      !isFlicaNonFlyingActivityId(lc);

    if (ledgerVisibleFlyingPairing) {
      sequencePairingNorm = lc;
    }

    if (!trip && ledgerVisibleFlyingPairing) {
      const byPairing = findTripByLedgerPairingInSpan(mergedTrips, lc, dateIso);
      if (byPairing) trip = byPairing;
    }

    if (trip) prevTrip = trip;

    const syntheticGapDisplay = syntheticCalendarGapDisplayForRow(trip, dateIso);
    const rawMatch = isSyntheticCalendarGapTrip(trip)
      ? null
      : matchLedgerRowToRawPairingDuty({
          dateIso,
          ledgerPairingNorm: ledgerVisibleFlyingPairing ? lc : "",
          ledgerCitySanitized: ledgerCity,
          inferredSequencePairingNorm: sequencePairingNorm,
          index: rawPairingDetailIndex,
        });

    const kind = kindFromLedgerCell(cell, trip);

    const merged: DayRow = {
      id: `flica-hybrid:${dateIso}:${rowIdx}`,
      dateIso,
      kind,
      trip,
      dayCode: cell.dayOfWeekLabel,
      dayNum: cell.dayOfMonth,
      isWeekend: cell.isWeekend,
      pairingText: ledgerPairingText || syntheticGapDisplay?.pairingText || "",
      cityText: cityForRow || syntheticGapDisplay?.cityText || "",
      reportText: picked?.reportText ?? "",
      dEndText: picked?.dEndText ?? "",
      layoverText: picked?.layoverText ?? "",
      wxText: picked?.wxText ?? "",
      statusText: picked?.statusText ?? "",
      reportMinutes: picked?.reportMinutes ?? null,
      releaseMinutes: picked?.releaseMinutes ?? null,
      isToday: dateIso === todayIso,
      groupedWithPrev: false,
      groupedWithNext: false,
      useFlicaLedgerLabels: true,
    };

    const dutyRowLayoverRaw = picked?.layoverText ?? "";
    const layRes = resolveHybridLayoverWithAudit(
      trip,
      dateIso,
      dutyRowLayoverRaw,
      kind,
    );

    let withTimes = overlayTripLegDetailsOntoRow(merged, cell);

    let layoverTextOut = layRes.text;
    if (rawMatch) {
      const layFromRaw = hybridLayoverTokenFromParsedRaw(
        rawMatch.entry.layoverRestRaw,
      );
      if (layFromRaw) {
        layoverTextOut = layFromRaw;
      }
      const dEndTok = formatFlicaDetailTimeToken(rawMatch.entry.dEndLocal);
      if (dEndTok) {
        withTimes = { ...withTimes, dEndText: dEndTok };
      }
      if (
        iso10 === rawMatch.entry.pairingStartIso &&
        rawMatch.entry.reportFromPairingHeader
      ) {
        const rpt = formatFlicaDetailTimeToken(
          rawMatch.entry.reportFromPairingHeader,
        );
        if (rpt) {
          withTimes = { ...withTimes, reportText: rpt };
        }
      }
    }

    const withLegs = { ...withTimes, layoverText: layoverTextOut };
    const rowCityForPlacement = String(withLegs.cityText ?? "").trim();
    const suppressContinuationReportAndLayover =
      ledgerPairingBlankContinuation &&
      !ledgerPairingText.trim() &&
      (!rowCityForPlacement || rowCityForPlacement === "-");
    const suppressAllFieldsOnBlankOffDay =
      ledgerPairingBlankContinuation && !ledgerCity && !trip;
    const finalRow = suppressAllFieldsOnBlankOffDay
      ? {
          ...withLegs,
          pairingText: "",
          reportText: "",
          cityText: "",
          dEndText: "",
          layoverText: "",
          wxText: "",
        }
      : suppressContinuationReportAndLayover
        ? { ...withLegs, reportText: "", dEndText: "", layoverText: "" }
        : withLegs;

    const normalized = finalizeHybridLayoverColumn(finalRow);

    out.push(normalized);
  });

  const mergedRows = attachDayRowGrouping(out);

  return mergedRows;
}
