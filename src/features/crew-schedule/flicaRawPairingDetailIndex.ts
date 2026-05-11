/**
 * Index FLICA blue pairing-detail blocks from the same `raw_html` as the mini-calendar ledger.
 * Used to fill layover / report / D-END on hybrid calendar rows without snapshot or cache guessing.
 */

import {
  isFlicaNonFlyingActivityId,
  parseFlicaScheduleHtml,
  type FlicaCrew,
  type FlicaPairingHotel,
  type FlicaPairing,
  type FlicaLeg,
} from "../../services/flicaScheduleHtmlParser";
import { addIsoDays } from "./ledgerContext";

function normalizePairingCode(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .split("·")[0]
    ?.trim() ?? "";
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Map each leg row to a calendar ISO inside the pairing span.
 * FLICA leg tables only carry day-of-month; the naive "first matching DOM in [start,end]"
 * breaks when a trip spans duplicate DOMs (e.g. Apr 1 then May 1). We walk legs in order
 * so each leg resolves to the next calendar occurrence of that DOM at or after the prior leg.
 */
function assignDutyIsoPerLegOrdered(
  pairing: FlicaPairing,
  legs: FlicaLeg[],
): (string | null)[] {
  const start = pairing.startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return legs.map(() => null);
  }
  const parsedEnd = (pairing.endDate ?? pairing.startDate).slice(0, 10);
  const parsedEndOk =
    /^\d{4}-\d{2}-\d{2}$/.test(parsedEnd) && parsedEnd >= start;
  /** Upper bound: parsed end from header/onclick, or generous window for long / mis-closed ranges. */
  const upper = maxIso(parsedEndOk ? parsedEnd : start, addIsoDays(start, 50));

  let searchFrom = start;
  const out: (string | null)[] = [];
  for (const leg of legs) {
    const targetDom = leg.date;
    let cur = searchFrom;
    let found: string | null = null;
    while (cur <= upper) {
      const dom = parseInt(cur.slice(8, 10), 10);
      if (dom === targetDom) {
        found = cur;
        break;
      }
      cur = addIsoDays(cur, 1);
    }
    out.push(found);
    if (found) {
      searchFrom = found;
    }
  }
  return out;
}

export type FlicaRawPairingDutyIndexEntry = {
  pairingCodeNorm: string;
  pairingCodeRaw: string;
  scheduleLabel: string | null;
  dutyIso: string;
  route: string;
  flightNumber: string;
  arriveLocal: string;
  blockTime: string;
  equipment: string;
  isDeadhead: boolean;
  layoverCity: string;
  layoverRestRaw: string;
  hotelName: string;
  hotelPhone: string;
  dEndLocal: string;
  nextReportLocal: string;
  departLocal: string;
  reportLocal: string;
  reportFromPairingHeader: string;
  pairingStartIso: string;
  pairingEndIso: string;
  operatingStartIso: string;
  operatingEndIso: string;
  daysOfWeek: string;
  base: string;
  routeSummary: string;
  totalBlockMinutes: number | null;
  totalCreditMinutes: number | null;
  totalTafbMinutes: number | null;
  layoverTotalMinutes: number | null;
  crewMembers: FlicaCrew[];
  hotels: FlicaPairingHotel[];
};

/** Dev / audit summary of what made it into the index (proves coverage for carryover blocks). */
export type FlicaRawPairingDetailIndexAudit = {
  indexedPairingCodes: string[];
  indexedScheduleLabels: string[];
  indexedDutyRowsByPairingCode: Record<string, number>;
  hasJ4195InIndex: boolean;
  /** Pairing codes that have at least one indexed duty on `YYYY-03-30` for the schedule year (carry-in probe). */
  march30DutyPairingCodes: string[];
  pairingScopeSummaries: Array<{
    pairingCodeNorm: string;
    firstDutyIso: string;
    lastDutyIso: string;
    layoverRestValues: string[];
  }>;
};

export type FlicaRawPairingDetailIndex = {
  entries: FlicaRawPairingDutyIndexEntry[];
  rawPairingBlockCount: number;
  indexedDutyRowCount: number;
  indexAudit: FlicaRawPairingDetailIndexAudit;
};

function pairingCodeForIndex(p: FlicaPairing): string {
  return normalizePairingCode(
    String((p.applyPairingCode ?? p.id) ?? "").trim(),
  );
}

function extractOperationWindowIso(pairing: FlicaPairing): {
  start: string;
  end: string;
} {
  const html = pairing.rawPairingHtml ?? "";
  const m = html.match(/viewOperationDates\([^,]+,\s*(\d{8})\s*,\s*(\d{8})/i);
  const toIso = (raw: string | undefined) =>
    raw && /^\d{8}$/.test(raw)
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      : "";
  if (m) {
    return {
      start: toIso(m[1]),
      end: toIso(m[2]),
    };
  }
  return {
    start: pairing.startDate.slice(0, 10),
    end: (pairing.endDate || pairing.startDate).slice(0, 10),
  };
}

function buildIndexAudit(
  entries: FlicaRawPairingDutyIndexEntry[],
  monthKey: string,
): FlicaRawPairingDetailIndexAudit {
  const byCode = new Map<string, FlicaRawPairingDutyIndexEntry[]>();
  for (const e of entries) {
    const arr = byCode.get(e.pairingCodeNorm) ?? [];
    arr.push(e);
    byCode.set(e.pairingCodeNorm, arr);
  }

  const indexedPairingCodes = [...byCode.keys()].sort();

  const labelSet = new Set<string>();
  for (const e of entries) {
    const s = e.scheduleLabel;
    if (s) labelSet.add(s);
  }
  const indexedScheduleLabels = [...labelSet].sort();

  const indexedDutyRowsByPairingCode: Record<string, number> = {};
  for (const [k, arr] of byCode) {
    indexedDutyRowsByPairingCode[k] = arr.length;
  }

  const year = monthKey.slice(0, 4);
  const march30 = `${year}-03-30`;
  const march30DutyPairingCodes = [
    ...new Set(
      entries
        .filter((e) => e.dutyIso === march30)
        .map((e) => e.pairingCodeNorm),
    ),
  ].sort();

  const pairingScopeSummaries = indexedPairingCodes.map((code) => {
    const arr = byCode.get(code)!;
    const isoSorted = [...arr].sort((a, b) =>
      a.dutyIso.localeCompare(b.dutyIso),
    );
    const lays = [
      ...new Set(
        arr.map((e) => e.layoverRestRaw).filter((s) => String(s).trim()),
      ),
    ].slice(0, 16);
    return {
      pairingCodeNorm: code,
      firstDutyIso: isoSorted[0]!.dutyIso,
      lastDutyIso: isoSorted[isoSorted.length - 1]!.dutyIso,
      layoverRestValues: lays,
    };
  });

  return {
    indexedPairingCodes,
    indexedScheduleLabels,
    indexedDutyRowsByPairingCode,
    hasJ4195InIndex: byCode.has("J4195"),
    march30DutyPairingCodes,
    pairingScopeSummaries,
  };
}

export function buildFlicaRawPairingDetailIndex(
  html: string,
  monthKey: string,
): FlicaRawPairingDetailIndex {
  const trimmed = html.trim();
  if (!trimmed) {
    return {
      entries: [],
      rawPairingBlockCount: 0,
      indexedDutyRowCount: 0,
      indexAudit: buildIndexAudit([], monthKey),
    };
  }

  const parsed = parseFlicaScheduleHtml(trimmed, monthKey);
  const rawPairingBlockCount = parsed.pairings.filter(
    (p) => (p.legs?.length ?? 0) > 0,
  ).length;

  const entries: FlicaRawPairingDutyIndexEntry[] = [];

  for (const p of parsed.pairings) {
    const codeKey = pairingCodeForIndex(p);
    if (!codeKey || isFlicaNonFlyingActivityId(codeKey)) continue;

    const scheduleLabel = p.rawScheduleLabel ?? null;
    const reportHeader = (p.reportTime ?? p.baseReport ?? "").trim();
    const operationWindow = extractOperationWindowIso(p);
    const legs = p.legs ?? [];
    if (!legs.length) continue;

    const dutyIsos = assignDutyIsoPerLegOrdered(p, legs);
    const reportByDutyIso = new Map<string, string>();
    let previousDutyIso: string | null = null;
    let previousDutyNextReport = "";
    for (let i = 0; i < legs.length; i += 1) {
      const dutyIso = dutyIsos[i];
      if (!dutyIso) continue;
      if (dutyIso !== previousDutyIso && !reportByDutyIso.has(dutyIso)) {
        reportByDutyIso.set(dutyIso, previousDutyNextReport || reportHeader);
      }
      const nextReport = (legs[i]?.nextReportTime ?? "").trim();
      if (nextReport) previousDutyNextReport = nextReport;
      previousDutyIso = dutyIso;
    }

    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i]!;
      const dutyIso = dutyIsos[i];
      if (!dutyIso) continue;
      const isFirstLegForDuty = dutyIsos.findIndex((iso) => iso === dutyIso) === i;

      entries.push({
        pairingCodeNorm: codeKey,
        pairingCodeRaw: p.id,
        scheduleLabel,
        dutyIso,
        route: leg.route,
        flightNumber: (leg.flightNumber ?? "").trim(),
        arriveLocal: (leg.arriveLocal ?? "").trim(),
        blockTime: (leg.blockTime ?? "").trim(),
        equipment: (leg.equipment ?? "").trim(),
        isDeadhead: Boolean(leg.isDeadhead),
        layoverCity: (leg.layoverCity ?? "").trim(),
        layoverRestRaw: (leg.layoverTime ?? "").trim(),
        hotelName: (leg.hotel ?? "").trim(),
        hotelPhone: (leg.hotelPhone ?? "").trim(),
        dEndLocal: (leg.dEndLocal ?? "").trim(),
        nextReportLocal: (leg.nextReportTime ?? "").trim(),
        departLocal: (leg.departLocal ?? "").trim(),
        reportLocal: isFirstLegForDuty ? (reportByDutyIso.get(dutyIso) ?? "").trim() : "",
        reportFromPairingHeader: reportHeader,
        pairingStartIso: p.startDate.slice(0, 10),
        pairingEndIso: (p.endDate ?? p.startDate).slice(0, 10),
        operatingStartIso: operationWindow.start,
        operatingEndIso: operationWindow.end,
        daysOfWeek: (p.daysOfWeek ?? "").trim(),
        base: (p.baseCode ?? p.base ?? "").trim(),
        routeSummary: (p.routeSummary ?? "").trim(),
        totalBlockMinutes:
          p.totalBlockMinutes != null && Number.isFinite(p.totalBlockMinutes)
            ? p.totalBlockMinutes
            : null,
        totalCreditMinutes:
          p.totalCreditMinutes != null && Number.isFinite(p.totalCreditMinutes)
            ? p.totalCreditMinutes
            : null,
        totalTafbMinutes:
          p.totalTafbMinutes != null && Number.isFinite(p.totalTafbMinutes)
            ? p.totalTafbMinutes
            : null,
        layoverTotalMinutes:
          p.layoverTotalMinutes != null && Number.isFinite(p.layoverTotalMinutes)
            ? p.layoverTotalMinutes
            : null,
        crewMembers: p.crewMembers ?? [],
        hotels: p.hotels ?? [],
      });
    }
  }

  const indexAudit = buildIndexAudit(entries, monthKey);

  return {
    entries,
    rawPairingBlockCount,
    indexedDutyRowCount: entries.length,
    indexAudit,
  };
}

function pickDisambiguated(
  candidates: FlicaRawPairingDutyIndexEntry[],
  ledgerCitySanitized: string,
  reason: string,
): { entry: FlicaRawPairingDutyIndexEntry; reason: string } | null {
  let c = candidates;
  const city = ledgerCitySanitized;
  if (city && city !== "-") {
    const u = city.toUpperCase();
    const byCity = c.filter(
      (e) =>
        e.layoverCity.toUpperCase() === u ||
        e.route.toUpperCase().includes(u),
    );
    if (byCity.length === 1) {
      return { entry: byCity[0]!, reason: `${reason}_city_route` };
    }
    if (byCity.length > 1) {
      c = byCity;
    }
  }

  const withLay = c.filter((e) => String(e.layoverRestRaw ?? "").trim());
  if (c.length > 1 && withLay.length === 1) {
    return { entry: withLay[0]!, reason: `${reason}_unique_layover_cell` };
  }

  if (c.length === 1) {
    return { entry: c[0]!, reason };
  }

  return null;
}

export function matchLedgerRowToRawPairingDuty(input: {
  dateIso: string;
  ledgerPairingNorm: string;
  ledgerCitySanitized: string;
  inferredSequencePairingNorm: string;
  index: FlicaRawPairingDetailIndex;
}): { entry: FlicaRawPairingDutyIndexEntry; reason: string } | null {
  const iso = input.dateIso.slice(0, 10);
  const pair = input.ledgerPairingNorm.trim();
  const seq = input.inferredSequencePairingNorm.trim();
  const effectivePairing = pair || seq;
  const city = input.ledgerCitySanitized;

  if (effectivePairing) {
    const forPairing = input.index.entries.filter(
      (e) => e.pairingCodeNorm === effectivePairing,
    );
    const byDate = (d: string) => forPairing.filter((e) => e.dutyIso === d);

    const exact = byDate(iso);
    const rExact = pickDisambiguated(exact, city, "date_pairing");
    if (rExact) return rExact;

    return null;
  }

  const candidates = input.index.entries.filter((e) => e.dutyIso === iso);
  return pickDisambiguated(candidates, city, "date_only");
}
