/**
 * Canonical pairing object for trip detail/summary: highest-completeness merged trip,
 * never a duty-row fragment, using the same month data as the schedule grid.
 */
import type { CrewScheduleTrip } from './types';
import { monthCalendarKey } from './scheduleMonthCache';
import { pairingSnapshotKey, readCommittedMonthSnapshot } from './scheduleStableSnapshots';

function normPairingCode(code: string | undefined | null): string {
  return String(code ?? '')
    .trim()
    .toUpperCase();
}

function isoOk(s: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(s ?? '').slice(0, 10));
}

function isoSlice(s: string | null | undefined): string {
  return String(s ?? '').slice(0, 10);
}

/** Treat as missing base for scoring / richness. */
export function normBaseForScoring(b: string | null | undefined): string | null {
  const t = String(b ?? '')
    .trim()
    .toUpperCase();
  if (!t || t === '—' || t === '-' || t === '–' || t === 'NO BASE' || t.includes('NO BASE')) return null;
  return t;
}

export function routeOrderedIatasFromRouteString(route: string | null | undefined): string[] {
  const raw = String(route ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(/[–—\-/→]+/).flatMap((seg) => seg.trim().split(/\s+/).filter(Boolean));
  const out: string[] = [];
  for (const tok of parts) {
    const u = tok.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(u)) out.push(u);
  }
  return out;
}

/** True when route string starts and ends at JFK (typical JetBlue intl round-trip display from DB). */
export function routeHasJfkBookend(route: string | null | undefined): boolean {
  const ap = routeOrderedIatasFromRouteString(route);
  return ap.length >= 2 && ap[0] === 'JFK' && ap[ap.length - 1] === 'JFK';
}

function routeAirportCount(t: CrewScheduleTrip): number {
  const fromRoute = String(t.routeSummary ?? '')
    .split(/[–—\-/→]+/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]{3}$/i.test(x));
  const set = new Set(fromRoute.map((x) => x.toUpperCase()));
  for (const l of t.legs ?? []) {
    const d = String(l.departureAirport ?? '')
      .trim()
      .toUpperCase();
    const a = String(l.arrivalAirport ?? '')
      .trim()
      .toUpperCase();
    if (/^[A-Z]{3}$/.test(d)) set.add(d);
    if (/^[A-Z]{3}$/.test(a)) set.add(a);
  }
  const sr = String(t.summary?.route ?? '')
    .split(/[–—\-/→]+/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]{3}$/i.test(x));
  for (const x of sr) set.add(x.toUpperCase());
  return set.size;
}

const UUID_RE_PAIRING =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Count schedule_pairings / metadata numeric stats present on a trip (for hydration guards). */
export function statFieldsPresent(t: CrewScheduleTrip): number {
  let n = 0;
  if (t.pairingBlockHours != null && Number(t.pairingBlockHours) > 0) n++;
  if (t.pairingCreditHours != null && Number(t.pairingCreditHours) > 0) n++;
  if (t.pairingTafbHours != null && Number(t.pairingTafbHours) > 0) n++;
  if (t.tripLayoverTotalMinutes != null && Number(t.tripLayoverTotalMinutes) > 0) n++;
  if (t.summary?.blockTotal != null && Number(t.summary.blockTotal) > 0) n++;
  if (t.summary?.creditTotal != null && Number(t.summary.creditTotal) > 0) n++;
  return n;
}

function dutyDayCount(t: CrewScheduleTrip): number {
  const c = t.canonicalPairingDays ? Object.keys(t.canonicalPairingDays).length : 0;
  if (c > 0) return c;
  const byLeg = new Set<string>();
  for (const l of t.legs ?? []) {
    const d = String(l.dutyDate ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) byLeg.add(d);
  }
  return byLeg.size;
}

/** Higher = more complete pairing (prefer for detail/summary). */
export function scorePairingCompleteness(t: CrewScheduleTrip): number {
  let s = 0;
  if (normBaseForScoring(t.base)) s += 120;
  s += routeAirportCount(t) * 35;
  if (isoOk(t.startDate) && isoOk(t.endDate)) {
    s += 40;
    const span =
      (Date.parse(`${isoSlice(t.endDate)}T12:00:00`) - Date.parse(`${isoSlice(t.startDate)}T12:00:00`)) / 86400000;
    if (Number.isFinite(span) && span > 0) s += Math.min(30, Math.round(span) * 4);
  }
  s += statFieldsPresent(t) * 45;
  s += (t.legs?.length ?? 0) * 14;
  s += dutyDayCount(t) * 55;
  if (t.hotel?.name?.trim() || t.hotel?.city?.trim()) s += 25;
  if ((t.crewMembers?.length ?? 0) > 0) s += 20;
  const r = String(t.routeSummary ?? '').trim();
  if (r && r !== '—' && !/^([A-Z]{3})\s*[–—-]\s*$/i.test(r)) s += 35;
  return s;
}

/**
 * Crew base from FLICA pairing row: `base_code` when present, else infer JFK bookend / closed loop from route_summary.
 */
export function crewBaseFromPairingDbFields(
  routeSummaryDb: string,
  baseCodeFromRow: string | null | undefined,
): string | undefined {
  const bc = String(baseCodeFromRow ?? '')
    .trim()
    .toUpperCase();
  if (bc && /^[A-Z]{3}$/.test(bc)) return bc;
  const ap = routeOrderedIatasFromRouteString(routeSummaryDb);
  if (ap.length >= 2 && ap[0] === 'JFK' && ap[ap.length - 1] === 'JFK') return 'JFK';
  if (ap.length >= 2 && ap[0] === ap[ap.length - 1] && /^[A-Z]{3}$/.test(ap[0]!)) return ap[0];
  return undefined;
}

/** True when trip shows evidence of a `schedule_pairings` / pairing-detail fetch merge (not only schedule_entries). */
export function isDbEnrichedPairing(t: CrewScheduleTrip): boolean {
  const sid = String(t.schedulePairingId ?? '').trim();
  if (sid && UUID_RE_PAIRING.test(sid)) return true;
  if (statFieldsPresent(t) >= 1) return true;
  if ((t.crewMembers?.length ?? 0) > 0) return true;
  if (t.hotel?.name?.trim() || t.hotel?.city?.trim()) return true;
  if (t.tripLayoverTotalMinutes != null && Number(t.tripLayoverTotalMinutes) > 0) return true;
  if (normBaseForScoring(t.base) != null && routeHasJfkBookend(t.routeSummary)) return true;
  return false;
}

/**
 * Visible-only snapshot: missing base, missing schedule stats, and route looks like a layover-first fragment
 * (e.g. LHR–JFK) rather than full base-to-base from pairing row.
 */
export function isPartialVisiblePairing(t: CrewScheduleTrip): boolean {
  const noBase = normBaseForScoring(t.base) == null;
  const statsMissing = statFieldsPresent(t) < 1;
  const ap = routeOrderedIatasFromRouteString(t.routeSummary);
  const shortOrNoJfkBookend =
    (ap.length > 0 && ap.length < 3) || (ap.length >= 2 && !(ap[0] === 'JFK' && ap[ap.length - 1] === 'JFK'));
  const overseasFirst =
    ap.length > 0 && ap[0] !== 'JFK' && ap[0] !== 'BOS' && /^[A-Z]{3}$/.test(ap[0]!);
  return noBase && statsMissing && (shortOrNoJfkBookend || overseasFirst);
}

export function sameTripGroupAndPairingCode(a: CrewScheduleTrip, b: CrewScheduleTrip): boolean {
  return (
    String(a.id).trim() === String(b.id).trim() && normPairingCode(a.pairingCode) === normPairingCode(b.pairingCode)
  );
}

/** DB bundle adds fields the visible snapshot is missing — prefer candidate over leg-inflated completeness score. */
export function dbEnrichmentAddsAuthoritativeFields(current: CrewScheduleTrip, candidate: CrewScheduleTrip): boolean {
  if (!isDbEnrichedPairing(candidate)) return false;
  const cb = normBaseForScoring(current.base);
  const nb = normBaseForScoring(candidate.base);
  if (!cb && nb) return true;
  if (statFieldsPresent(candidate) > statFieldsPresent(current)) return true;
  if ((candidate.crewMembers?.length ?? 0) > (current.crewMembers?.length ?? 0)) return true;
  const ch = candidate.hotel?.name?.trim() || candidate.hotel?.city?.trim();
  const hh = current.hotel?.name?.trim() || current.hotel?.city?.trim();
  if (ch && !hh) return true;
  if (routeAirportCount(candidate) > routeAirportCount(current) && nb) return true;
  if (routeHasJfkBookend(candidate.routeSummary) && !routeHasJfkBookend(current.routeSummary)) return true;
  return false;
}

/** Heuristic “full enough” for logging / UX labels. */
export function isPairingDetailFullTrip(t: CrewScheduleTrip): boolean {
  return (
    normBaseForScoring(t.base) != null &&
    statFieldsPresent(t) >= 2 &&
    routeAirportCount(t) >= 3 &&
    dutyDayCount(t) >= 2
  );
}

export function adjacentMonthKeys(centerMonthKey: string): string[] {
  const [ys, ms] = centerMonthKey.split('-');
  const y = parseInt(ys ?? '', 10);
  const mo = parseInt(ms ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return [centerMonthKey];
  const prev = new Date(y, mo - 2, 1);
  const next = new Date(y, mo, 1);
  return [
    monthCalendarKey(prev.getFullYear(), prev.getMonth() + 1),
    centerMonthKey,
    monthCalendarKey(next.getFullYear(), next.getMonth() + 1),
  ];
}

/** Committed schedule builds only (same source as month hook). */
export function buildMonthTripsByKeyCache(centerMonthKey: string): Record<string, CrewScheduleTrip[]> {
  const out: Record<string, CrewScheduleTrip[]> = {};
  for (const k of adjacentMonthKeys(centerMonthKey)) {
    const snap = readCommittedMonthSnapshot(k);
    if (snap?.trips?.length) out[k] = snap.trips;
  }
  return out;
}

function flattenPool(visibleTrips: CrewScheduleTrip[], monthTripsByKeyCache: Record<string, CrewScheduleTrip[]>): CrewScheduleTrip[] {
  const map = new Map<string, CrewScheduleTrip>();
  const put = (t: CrewScheduleTrip) => {
    const k = pairingSnapshotKey(t);
    const prev = map.get(k);
    if (!prev || scorePairingCompleteness(t) > scorePairingCompleteness(prev)) map.set(k, t);
  };
  for (const t of visibleTrips) put(t);
  for (const list of Object.values(monthTripsByKeyCache)) {
    for (const t of list) put(t);
  }
  return [...map.values()];
}

function dateInSpan(dateIso: string, t: CrewScheduleTrip): boolean {
  if (!isoOk(dateIso) || !isoOk(t.startDate) || !isoOk(t.endDate)) return false;
  const d = isoSlice(dateIso);
  return d >= isoSlice(t.startDate) && d <= isoSlice(t.endDate);
}

function rangesOverlap(a: CrewScheduleTrip, b: CrewScheduleTrip): boolean {
  if (!isoOk(a.startDate) || !isoOk(a.endDate) || !isoOk(b.startDate) || !isoOk(b.endDate)) return false;
  const as = isoSlice(a.startDate);
  const ae = isoSlice(a.endDate);
  const bs = isoSlice(b.startDate);
  const be = isoSlice(b.endDate);
  return as <= be && ae >= bs;
}

/** Subjective “touch” for carryover (±1 day gap). */
function rangesChainTouch(a: CrewScheduleTrip, b: CrewScheduleTrip): boolean {
  if (!isoOk(a.startDate) || !isoOk(a.endDate) || !isoOk(b.startDate) || !isoOk(b.endDate)) return false;
  const ae = Date.parse(`${isoSlice(a.endDate)}T12:00:00`);
  const bs = Date.parse(`${isoSlice(b.startDate)}T12:00:00`);
  const as = Date.parse(`${isoSlice(a.startDate)}T12:00:00`);
  const be = Date.parse(`${isoSlice(b.endDate)}T12:00:00`);
  if (!Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(as) || !Number.isFinite(be)) return false;
  const day = 86400000;
  return (bs >= ae - day && bs <= ae + day) || (as >= be - day && as <= be + day);
}

function expandConnectedSameCode(group: CrewScheduleTrip[], all: CrewScheduleTrip[]): CrewScheduleTrip[] {
  let pool = [...group];
  let grew = true;
  while (grew) {
    grew = false;
    let lo = isoSlice(pool[0]!.startDate);
    let hi = isoSlice(pool[0]!.endDate);
    for (const t of pool) {
      lo = lo < isoSlice(t.startDate) ? lo : isoSlice(t.startDate);
      hi = hi > isoSlice(t.endDate) ? hi : isoSlice(t.endDate);
    }
    for (const t of all) {
      if (pool.includes(t)) continue;
      const carry =
        t.ledgerContext?.carryInFromPriorMonth === true || t.ledgerContext?.carryOutToNextMonth === true;
      const overlap = pool.some((p) => rangesOverlap(p, t));
      const chain = pool.some((p) => rangesChainTouch(p, t));
      const inWindow = isoOk(t.startDate) && isoSlice(t.startDate) <= hi && isoSlice(t.endDate) >= lo;
      if (overlap || chain || (carry && inWindow)) {
        pool.push(t);
        grew = true;
      }
    }
  }
  return pool;
}

function mergeLegsDedup(legsLists: Array<NonNullable<CrewScheduleTrip['legs']>>): NonNullable<CrewScheduleTrip['legs']> {
  type Leg = NonNullable<CrewScheduleTrip['legs']>[number];
  const byKey = new Map<string, Leg>();
  for (const legs of legsLists) {
    for (const leg of legs ?? []) {
      const id = String(leg.id ?? '').trim();
      const k =
        id ||
        `${String(leg.dutyDate ?? '').slice(0, 10)}|${String(leg.flightNumber ?? '').trim()}|${String(leg.departureAirport ?? '').trim()}|${String(leg.arrivalAirport ?? '').trim()}|${String(leg.reportLocal ?? '').trim()}`;
      if (!byKey.has(k)) byKey.set(k, leg);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const da = String(a.dutyDate ?? '').localeCompare(String(b.dutyDate ?? ''));
    if (da !== 0) return da;
    return String(a.reportLocal ?? '').localeCompare(String(b.reportLocal ?? ''));
  });
}

function mergeCanonicalDays(trips: CrewScheduleTrip[]): Record<string, NonNullable<CrewScheduleTrip['canonicalPairingDays']>[string]> | undefined {
  const out: Record<string, NonNullable<CrewScheduleTrip['canonicalPairingDays']>[string]> = {};
  const ordered = [...trips].sort((a, b) => isoSlice(a.startDate).localeCompare(isoSlice(b.startDate)));
  for (const t of ordered) {
    const c = t.canonicalPairingDays;
    if (c) Object.assign(out, c);
  }
  return Object.keys(out).length ? out : undefined;
}

function mergeLayoverMaps(trips: CrewScheduleTrip[]): {
  layoverByDate?: CrewScheduleTrip['layoverByDate'];
  layoverStationByDate?: CrewScheduleTrip['layoverStationByDate'];
} {
  const lay: Record<string, string> = {};
  const st: Record<string, string> = {};
  const ordered = [...trips].sort((a, b) => isoSlice(a.startDate).localeCompare(isoSlice(b.startDate)));
  for (const t of ordered) {
    if (t.layoverByDate) Object.assign(lay, t.layoverByDate);
    if (t.layoverStationByDate) Object.assign(st, t.layoverStationByDate);
  }
  return {
    layoverByDate: Object.keys(lay).length ? lay : undefined,
    layoverStationByDate: Object.keys(st).length ? st : undefined,
  };
}

function mergeCarryoverGroup(group: CrewScheduleTrip[], tripGroupId: string): CrewScheduleTrip {
  if (group.length === 0) throw new Error('mergeCarryoverGroup: empty');
  if (group.length === 1) {
    const one = group[0]!;
    return { ...one, id: tripGroupId };
  }
  const ordered = [...group].sort((a, b) => isoSlice(a.startDate).localeCompare(isoSlice(b.startDate)));
  const best = ordered.reduce((a, b) => (scorePairingCompleteness(a) >= scorePairingCompleteness(b) ? a : b));
  const start = isoSlice(ordered[0]!.startDate);
  const end = isoSlice(ordered[ordered.length - 1]!.endDate);
  const legs = mergeLegsDedup(ordered.map((t) => t.legs ?? []));
  const canon = mergeCanonicalDays(ordered);
  const { layoverByDate, layoverStationByDate } = mergeLayoverMaps(ordered);
  return {
    ...best,
    id: tripGroupId,
    startDate: start,
    endDate: end,
    legs,
    canonicalPairingDays: canon ?? best.canonicalPairingDays,
    layoverByDate: layoverByDate ?? best.layoverByDate,
    layoverStationByDate: layoverStationByDate ?? best.layoverStationByDate,
    ledgerContext: {
      carryInFromPriorMonth: ordered.some((x) => x.ledgerContext?.carryInFromPriorMonth === true),
      carryOutToNextMonth: ordered.some((x) => x.ledgerContext?.carryOutToNextMonth === true),
    },
  };
}

export type ResolveFullPairingForDetailParams = {
  pairingCode: string;
  selectedDateIso: string | null | undefined;
  selectedMonthKey: string;
  visibleTrips: CrewScheduleTrip[];
  monthTripsByKeyCache: Record<string, CrewScheduleTrip[]>;
  /** Navigation / schedule_entries trip group id */
  tripGroupId: string;
};

export type ResolveFullPairingForDetailResult = {
  trip: CrewScheduleTrip;
  score: number;
  source: 'single_best_in_span' | 'merged_carryover' | 'fallback_code';
  reason: string;
};

export function resolveFullPairingForDetail(params: ResolveFullPairingForDetailParams): ResolveFullPairingForDetailResult {
  const code = normPairingCode(params.pairingCode);
  const pool = flattenPool(params.visibleTrips, params.monthTripsByKeyCache);
  const anchor = params.selectedDateIso && isoOk(params.selectedDateIso) ? isoSlice(params.selectedDateIso) : null;

  const byCode = pool.filter((t) => normPairingCode(t.pairingCode) === code);

  const inSpan = anchor ? byCode.filter((t) => dateInSpan(anchor, t)) : byCode;
  const candidateSeeds = inSpan.length ? inSpan : byCode;

  let bestSingle = candidateSeeds[0];
  let bestScore = bestSingle ? scorePairingCompleteness(bestSingle) : -1;
  for (const t of candidateSeeds) {
    const sc = scorePairingCompleteness(t);
    if (sc > bestScore) {
      bestScore = sc;
      bestSingle = t;
    }
  }

  if (!bestSingle) {
    const stub: CrewScheduleTrip = {
      id: params.tripGroupId,
      pairingCode: code,
      month: parseInt(params.selectedMonthKey.split('-')[1] ?? '1', 10),
      year: parseInt(params.selectedMonthKey.split('-')[0] ?? '2026', 10),
      startDate: anchor ?? `${params.selectedMonthKey}-01`,
      endDate: anchor ?? `${params.selectedMonthKey}-01`,
      dutyDays: 0,
      status: 'flying',
      routeSummary: code,
      legs: [],
    };
    return { trip: stub, score: 0, source: 'fallback_code', reason: 'no_candidates' };
  }

  const expanded = expandConnectedSameCode([bestSingle], byCode);
  const crossesMonths =
    expanded.length > 1 &&
    new Set(expanded.map((t) => `${t.year}-${t.month}`)).size > 1;
  const hasCarryLedger = expanded.some(
    (t) => t.ledgerContext?.carryInFromPriorMonth === true || t.ledgerContext?.carryOutToNextMonth === true,
  );
  const shouldMerge = expanded.length > 1 && (crossesMonths || hasCarryLedger || bestScore < 180);

  let trip: CrewScheduleTrip;
  let source: ResolveFullPairingForDetailResult['source'];
  let reason: string;

  if (shouldMerge) {
    trip = mergeCarryoverGroup(expanded, params.tripGroupId);
    source = 'merged_carryover';
    reason = crossesMonths ? 'cross_month_chain' : hasCarryLedger ? 'ledger_carryover' : 'multi_segment_merge';
  } else {
    trip = { ...bestSingle, id: params.tripGroupId };
    source = 'single_best_in_span';
    reason = anchor ? 'highest_score_in_date_span' : 'highest_score_same_code';
  }

  const score = scorePairingCompleteness(trip);

  return { trip, score, source, reason };
}
