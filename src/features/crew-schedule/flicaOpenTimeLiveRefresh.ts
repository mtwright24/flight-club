import { fetchFlicaHtmlUsingWebViewSession } from "../flica-actions/flicaActionsHttp";
import {
  FLICA_NATIVE_OT_BCID,
  FLICA_NATIVE_OT_BCID_EXTRA_CANDIDATES,
  FLICA_NATIVE_URLS,
  nativeFetchOpenTimePotBundleForBcid,
} from "../flica-actions/flicaActionsNativeService";
import type { FlicaActionsFetchResult } from "../flica-actions/flicaActionsTypes";
import { mapOpenTimeTripsWithHtmlFallback } from "./flicaCrewHubHtmlFallbackParse";
import type { OpenTimeRowSourceContext, OpenTimeTrip } from "./flicaCrewHubTypes";
import { crewHubDdMmmToYmd } from "./crewHubFlicaDetailUrl";
import { dateYmdFromRbcpairDetailUrl } from "./crewHubFlicaLiveGate";

const FLICA_ORIGIN = "https://jetblue.flica.net";

const OPEN_TIME_MAX_POT_FETCHES = 8;

/**
 * BCIDs to fetch: primary OT BCID, known multi-month candidates, and any `BCID=` links in HTML.
 * Pots that return zero rows are omitted so we do not add empty month tabs.
 */
function collectOpenTimeBcidsFromHtml(html: string, into: Set<string>): void {
  into.add(FLICA_NATIVE_OT_BCID);
  for (const c of FLICA_NATIVE_OT_BCID_EXTRA_CANDIDATES) into.add(c);
  const re = /(?:BCID|bcid)=([0-9]+\.[0-9]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? ""))) !== null) into.add(m[1]!);
}

function discoverOpenTimeBcidsFromHtml(html: string): string[] {
  const s = new Set<string>();
  collectOpenTimeBcidsFromHtml(html, s);
  return [...s].sort();
}

/** One FLICA Open Time pot (one BCID fetch); rows stay in pot order with per-pot dedupe only. */
export type OpenTimeMonthBucket = {
  /** `YYYY-MM` inferred from row dates / rbcpair URLs in this pot. */
  sourceMonthKey: string;
  sourceBcid: string;
  sourceOtFrameUrl: string;
  sourceOpenTimePotUrl: string;
  sourceToken: string;
  trips: OpenTimeTrip[];
};

function yearFromHubMonthFallback(hub: string): number {
  const y = parseInt(String(hub).trim().slice(0, 4), 10);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

function ymdFromTripForMonth(t: OpenTimeTrip, yearHint: number): string | undefined {
  const d = t.dateYmd?.trim();
  if (d && /^\d{8}$/.test(d)) return d;
  const fromUrl = dateYmdFromRbcpairDetailUrl(t.pairingDetailUrl ?? "");
  if (fromUrl) return fromUrl;
  const blob = `${t.dateLabel ?? ""} ${t.date ?? ""} ${t.dates ?? ""}`;
  const m = String(blob).toUpperCase().match(/\b(\d{1,2})([A-Z]{3})\b/);
  if (m) {
    const tok = `${String(parseInt(m[1]!, 10)).padStart(2, "0")}${m[2]}`;
    const y = crewHubDdMmmToYmd(tok, yearHint);
    return y ?? undefined;
  }
  return undefined;
}

/**
 * Label bucket `YYYY-MM` from **this pot’s rows** (dominant calendar month by row count),
 * not the crew-hub schedule month — otherwise every pot shows as “May” when the strip is May.
 */
export function inferOpenTimeBucketMonthKey(trips: OpenTimeTrip[], hubMonthFallback: string): string {
  const yearHint = yearFromHubMonthFallback(hubMonthFallback);
  const ymCounts = new Map<string, number>();
  for (const t of trips) {
    const y = ymdFromTripForMonth(t, yearHint);
    if (!y) continue;
    const ym = `${y.slice(0, 4)}-${y.slice(4, 6)}`;
    ymCounts.set(ym, (ymCounts.get(ym) ?? 0) + 1);
  }
  if (ymCounts.size > 0) {
    let bestYm = "";
    let bestC = -1;
    for (const [ym, c] of ymCounts) {
      if (c > bestC || (c === bestC && (bestYm === "" || ym < bestYm))) {
        bestC = c;
        bestYm = ym;
      }
    }
    return bestYm;
  }
  const sm = trips[0]?.sourceMonthKey?.trim();
  if (sm && /^\d{4}-\d{2}$/.test(sm)) return sm;
  return hubMonthFallback.trim() || "1970-01";
}

/** Attach BCID / frame / pot / token from the live fetch that produced this HTML. */
export function attachOpenTimePotSourceContext(
  trips: OpenTimeTrip[],
  ctx: OpenTimeRowSourceContext,
): OpenTimeTrip[] {
  return trips.map((t) => {
    const ymd = t.dateYmd?.trim() || dateYmdFromRbcpairDetailUrl(t.pairingDetailUrl ?? "") || undefined;
    const urlOk = Boolean(t.pairingDetailUrl?.trim());
    const live = Boolean(urlOk && ymd && /^\d{8}$/.test(ymd));
    return {
      ...t,
      sourceBcid: ctx.sourceBcid,
      sourceOtFrameUrl: ctx.sourceOtFrameUrl,
      sourceOpenTimePotUrl: ctx.sourceOpenTimePotUrl,
      sourceToken: ctx.sourceToken,
      sourceMonthKey: ctx.sourceMonthKey ?? t.sourceMonthKey,
      sourceFrameName: ctx.sourceFrameName ?? t.sourceFrameName,
      dateYmd: ymd,
      pairingDetailUrlFromLiveHtml: live,
    };
  });
}

function dedupeOpenTimeTripsWithinPot(trips: OpenTimeTrip[]): OpenTimeTrip[] {
  const seen = new Set<string>();
  const out: OpenTimeTrip[] = [];
  for (const t of trips) {
    const ymd =
      t.dateYmd?.trim() ||
      dateYmdFromRbcpairDetailUrl(t.pairingDetailUrl ?? "") ||
      "";
    const mk = (t.sourceMonthKey ?? "").trim();
    const k = `${(t.sourceBcid ?? "").trim()}|${mk}|${t.pairingId}|${ymd}|${(t.reportTime ?? "").trim()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function sortOpenTimeMonthBucketsChronologically(buckets: OpenTimeMonthBucket[]): OpenTimeMonthBucket[] {
  return [...buckets].sort((a, b) => {
    const ka = a.sourceMonthKey;
    const kb = b.sourceMonthKey;
    if (ka !== kb) return ka.localeCompare(kb);
    return a.sourceBcid.localeCompare(b.sourceBcid);
  });
}

export function flattenOpenTimeMonthBuckets(buckets: OpenTimeMonthBucket[]): OpenTimeTrip[] {
  return buckets.flatMap((b) => b.trips);
}

/**
 * Rebuild month/pot buckets from a flat cached list (e.g. after cache load).
 * Groups by BCID + pot URL when present; otherwise one group per inferred `YYYY-MM`.
 */
export function groupOpenTimeTripsIntoMonthBuckets(
  trips: OpenTimeTrip[],
  hubMonthFallback: string,
): OpenTimeMonthBucket[] {
  const fb = hubMonthFallback.trim() || "1970-01";
  const potKey = (t: OpenTimeTrip) => {
    const bc = (t.sourceBcid ?? "").trim();
    const pot = (t.sourceOpenTimePotUrl ?? t.sourceOtFrameUrl ?? "").trim();
    if (bc && pot) return `pot|${bc}|${pot}`;
    return `month|${inferOpenTimeBucketMonthKey([t], fb)}`;
  };
  const m = new Map<string, OpenTimeTrip[]>();
  for (const t of trips) {
    const k = potKey(t);
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  const buckets: OpenTimeMonthBucket[] = [];
  for (const arr of m.values()) {
    const sorted = [...arr].sort(
      (a, b) => (a.originalDisplayOrder ?? 1e9) - (b.originalDisplayOrder ?? 1e9),
    );
    const head = sorted[0]!;
    const smk = inferOpenTimeBucketMonthKey(sorted, fb);
    const deduped = dedupeOpenTimeTripsWithinPot(
      sorted.map((x) => ({ ...x, sourceMonthKey: smk })),
    );
    if (deduped.length === 0) continue;
    buckets.push({
      sourceMonthKey: smk,
      sourceBcid: head.sourceBcid ?? "",
      sourceOtFrameUrl: head.sourceOtFrameUrl ?? "",
      sourceOpenTimePotUrl: head.sourceOpenTimePotUrl ?? "",
      sourceToken: head.sourceToken ?? "",
      trips: deduped,
    });
  }
  return sortOpenTimeMonthBucketsChronologically(buckets);
}

export type OpenTimeLiveRefreshDiag = {
  refreshedAt: string;
  sourceHtmlUrl: string;
  seedFrameHtmlLen: number;
  otFrameUrlsDiscovered: string[];
  potUrlsDiscovered: string[];
  rowsCountPerBcid: Record<string, number>;
  rowsWithPairingDetailUrlPerBcid: Record<string, number>;
  rowsTotal: number;
  rowsWithPairingDetailUrlTotal: number;
  monthBucketCount: number;
  sampleRows: Array<{
    pairingId: string;
    dateYmd?: string;
    sourceBcid?: string;
    pairingDetailUrl?: string;
  }>;
  errors: string[];
};

/**
 * Discover every `BCID` referenced in the Open Time seed frame, fetch each pot with its own token,
 * parse rows — **one bucket per pot** (no cross-month merge). Chronological bucket order by `sourceMonthKey`.
 */
export async function fetchAllOpenTimePotContextsMerged(hubMonthFallback: string): Promise<{
  monthBuckets: OpenTimeMonthBucket[];
  trips: OpenTimeTrip[];
  diag: OpenTimeLiveRefreshDiag;
  primaryPotResult: FlicaActionsFetchResult | null;
}> {
  const errors: string[] = [];
  const refreshedAt = new Date().toISOString();
  const seed = await fetchFlicaHtmlUsingWebViewSession(FLICA_NATIVE_URLS.otFrameView, {
    referer: FLICA_ORIGIN,
  });
  const seedHtml = String(seed.html ?? "");
  const bcidSet = new Set<string>();
  collectOpenTimeBcidsFromHtml(seedHtml, bcidSet);
  const fetched = new Set<string>();
  const potUrlsDiscovered: string[] = [];
  const rowsCountPerBcid: Record<string, number> = {};
  const rowsWithPairingDetailUrlPerBcid: Record<string, number> = {};
  const monthBucketsRaw: OpenTimeMonthBucket[] = [];
  let primaryPotResult: FlicaActionsFetchResult | null = null;

  while (fetched.size < bcidSet.size && fetched.size < OPEN_TIME_MAX_POT_FETCHES) {
    const queue = [...bcidSet].filter((b) => !fetched.has(b)).sort();
    for (const bcid of queue) {
      if (fetched.size >= OPEN_TIME_MAX_POT_FETCHES) break;
      fetched.add(bcid);
      const b = await nativeFetchOpenTimePotBundleForBcid(bcid);
      if (!b.ok) {
        errors.push(`${bcid}: ${b.error}`);
        continue;
      }
      collectOpenTimeBcidsFromHtml(String(b.pot.pageHtml ?? ""), bcidSet);

      if (bcid === FLICA_NATIVE_OT_BCID) {
        primaryPotResult = b.pot;
      } else if (!primaryPotResult) {
        primaryPotResult = b.pot;
      }

      potUrlsDiscovered.push(b.sourceOpenTimePotUrl);
      const ctxBase: OpenTimeRowSourceContext = {
        sourceBcid: bcid,
        sourceOtFrameUrl: b.sourceOtFrameUrl,
        sourceOpenTimePotUrl: b.sourceOpenTimePotUrl,
        sourceToken: b.sourceToken,
      };
      const fb = mapOpenTimeTripsWithHtmlFallback(b.pot.nativeParse?.rows ?? [], b.pot, b.pot.url);
      const withOrder: OpenTimeTrip[] = fb.trips.map((trip, idx) => ({
        ...trip,
        originalDisplayOrder: idx,
      }));
      const attached = attachOpenTimePotSourceContext(withOrder, ctxBase);
      const smk = inferOpenTimeBucketMonthKey(attached, hubMonthFallback);
      const withSmk = attached.map((t) => ({ ...t, sourceMonthKey: smk }));
      const tripsPot = dedupeOpenTimeTripsWithinPot(withSmk);
      rowsCountPerBcid[bcid] = tripsPot.length;
      rowsWithPairingDetailUrlPerBcid[bcid] = tripsPot.filter((x) => x.pairingDetailUrl?.trim()).length;
      if (tripsPot.length === 0) continue;
      monthBucketsRaw.push({
        sourceMonthKey: smk,
        sourceBcid: bcid,
        sourceOtFrameUrl: b.sourceOtFrameUrl,
        sourceOpenTimePotUrl: b.sourceOpenTimePotUrl,
        sourceToken: b.sourceToken,
        trips: tripsPot,
      });
    }
  }

  const bcids = [...bcidSet].sort();
  const otFrameUrlsDiscovered = bcids.map(
    (b) => `${FLICA_ORIGIN}/full/otframe.cgi?BCID=${encodeURIComponent(b)}&ViewOT=1`,
  );

  const monthBuckets = sortOpenTimeMonthBucketsChronologically(monthBucketsRaw);
  const merged = flattenOpenTimeMonthBuckets(monthBuckets);
  const rowsWithPairingDetailUrlTotal = merged.filter((x) => x.pairingDetailUrl?.trim()).length;

  const diag: OpenTimeLiveRefreshDiag = {
    refreshedAt,
    sourceHtmlUrl: FLICA_NATIVE_URLS.otFrameView,
    seedFrameHtmlLen: seedHtml.length,
    otFrameUrlsDiscovered,
    potUrlsDiscovered,
    rowsCountPerBcid,
    rowsWithPairingDetailUrlPerBcid,
    rowsTotal: merged.length,
    rowsWithPairingDetailUrlTotal,
    monthBucketCount: monthBuckets.length,
    sampleRows: merged.slice(0, 4).map((r) => ({
      pairingId: r.pairingId,
      dateYmd: r.dateYmd,
      sourceBcid: r.sourceBcid,
      pairingDetailUrl: r.pairingDetailUrl,
    })),
    errors,
  };

  console.log("[FC_OPENTIME_LIVE_REFRESH]", JSON.stringify(diag));

  return { monthBuckets, trips: merged, diag, primaryPotResult };
}
