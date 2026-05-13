import type {
  FlicaActionsFetchResult,
  TradeBoardAllRequestsNativeDebug,
} from "../flica-actions/flicaActionsTypes";
import type { FlicaCrewHubFallbackParseMeta } from "./flicaCrewHubHtmlFallbackParse";

/** One native fetch + mapper outcome for crew hub parse inspection (__DEV__). */
export type FlicaCrewHubParseDebugFetchEntry = {
  name: string;
  requestedUrl: string;
  finalUrl: string;
  ok: boolean;
  htmlState: string;
  pageTitle: string | null;
  htmlLength: number;
  nativeParsePageType: string;
  preMapperRowCount: number;
  preMapperRowsFirst10: string[][];
  postMapperCount: number;
  postMapperFirst10: unknown[];
  nativeParseButtons: unknown[];
  nativeParseForms: unknown[];
  nativeParseActionEndpoints: string[];
  /** Hidden inputs from parsed HTML (name + value). */
  nativeParseHiddenFields?: { name: string; value: string }[];
  bodyPreviewFirst1000: string;
  /** Populated for Tradeboard All Requests native filter-reset flow. */
  tradeBoardAllRequestsNativeDebug?: TradeBoardAllRequestsNativeDebug;
};

export type FlicaCrewHubParseDebugPayload = {
  screen: "tradeboard" | "opentime";
  refreshedAt: string;
  loadReason: "focus" | "pull";
  note?: string;
  fetches: FlicaCrewHubParseDebugFetchEntry[];
  tradeboardFallback?: {
    allRequests: FlicaCrewHubFallbackParseMeta;
    myRequests: FlicaCrewHubFallbackParseMeta;
  };
  openTimeFallback?: FlicaCrewHubFallbackParseMeta;
};

function safeRowsFirst10(rows: string[][] | undefined): string[][] {
  const r = rows ?? [];
  return r.slice(0, 10).map((row) => row.map((c) => String(c ?? "")));
}

export function buildCrewHubParseDebugFetchEntry(
  name: string,
  r: FlicaActionsFetchResult,
  mapped: unknown[],
): FlicaCrewHubParseDebugFetchEntry {
  const np = r.nativeParse;
  const rows = np?.rows ?? [];
  const body = String(r.bodyPreview ?? "");
  return {
    name,
    requestedUrl: String(r.requestedUrl ?? r.url ?? ""),
    finalUrl: String(r.url ?? ""),
    ok: !!r.ok,
    htmlState: String(r.htmlState ?? ""),
    pageTitle: (np?.pageTitle ?? r.title ?? null) as string | null,
    htmlLength: Number(r.htmlLength ?? 0),
    nativeParsePageType: String(np?.pageType ?? ""),
    preMapperRowCount: rows.length,
    preMapperRowsFirst10: safeRowsFirst10(rows),
    postMapperCount: mapped.length,
    postMapperFirst10: mapped.slice(0, 10),
    nativeParseButtons: np?.buttons ?? [],
    nativeParseForms: np?.forms ?? [],
    nativeParseActionEndpoints: np?.actionEndpoints ?? [],
    nativeParseHiddenFields: np?.hiddenFields?.slice(0, 60),
    bodyPreviewFirst1000: body.slice(0, 1000),
    tradeBoardAllRequestsNativeDebug: r.tradeBoardAllRequestsNativeDebug,
  };
}

function formatEntry(e: FlicaCrewHubParseDebugFetchEntry, idx: number): string {
  const lines: string[] = [];
  lines.push(`--- Fetch ${idx + 1}: ${e.name} ---`);
  lines.push(`requestedUrl: ${e.requestedUrl}`);
  lines.push(`finalUrl: ${e.finalUrl}`);
  lines.push(`ok: ${e.ok}`);
  lines.push(`htmlState: ${e.htmlState}`);
  lines.push(`pageTitle: ${e.pageTitle ?? ""}`);
  lines.push(`htmlLength: ${e.htmlLength}`);
  lines.push(`nativeParse.pageType: ${e.nativeParsePageType}`);
  lines.push(`nativeParse.rows.length (pre-mapper): ${e.preMapperRowCount}`);
  lines.push(`first 10 raw table rows (pre-mapper):`);
  lines.push(JSON.stringify(e.preMapperRowsFirst10, null, 2));
  lines.push(`mapped rows/posts/trips length (post-mapper): ${e.postMapperCount}`);
  lines.push(`first 10 mapped (post-mapper):`);
  lines.push(JSON.stringify(e.postMapperFirst10, null, 2));
  lines.push(`nativeParse.buttons: ${JSON.stringify(e.nativeParseButtons, null, 2)}`);
  lines.push(`nativeParse.forms: ${JSON.stringify(e.nativeParseForms, null, 2)}`);
  lines.push(`nativeParse.actionEndpoints: ${JSON.stringify(e.nativeParseActionEndpoints, null, 2)}`);
  if (e.nativeParseHiddenFields?.length) {
    lines.push(`nativeParse.hiddenFields (name=value):`);
    for (const h of e.nativeParseHiddenFields) {
      lines.push(`  ${h.name}=${h.value}`);
    }
  }
  if (e.tradeBoardAllRequestsNativeDebug) {
    lines.push(`tradeBoardAllRequestsNativeDebug: ${JSON.stringify(e.tradeBoardAllRequestsNativeDebug, null, 2)}`);
  }
  lines.push(`first 1000 chars of bodyPreview:`);
  lines.push(e.bodyPreviewFirst1000);
  lines.push("");
  return lines.join("\n");
}

function formatFallbackMeta(title: string, m: FlicaCrewHubFallbackParseMeta): string {
  return [`--- ${title} ---`, JSON.stringify(m, null, 2), ""].join("\n");
}

export function formatCrewHubParseDebugPayload(payload: FlicaCrewHubParseDebugPayload): string {
  const head = [
    `Flight Club — Crew hub parse debug`,
    `screen: ${payload.screen}`,
    `refreshedAt: ${payload.refreshedAt}`,
    `loadReason: ${payload.loadReason}`,
    payload.note ? `note: ${payload.note}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  const body = payload.fetches.map((e, i) => formatEntry(e, i)).join("\n");
  let tail = "";
  if (payload.tradeboardFallback) {
    tail += formatFallbackMeta("Fallback parse (All Requests)", payload.tradeboardFallback.allRequests);
    tail += formatFallbackMeta("Fallback parse (My Requests)", payload.tradeboardFallback.myRequests);
  }
  if (payload.openTimeFallback) {
    tail += formatFallbackMeta("Fallback parse (Open Time Pot)", payload.openTimeFallback);
  }
  return `${head}\n${body}\n${tail}`.trimEnd() + "\n";
}

let lastTradeboardParseDebugSnapshot: FlicaCrewHubParseDebugPayload | null = null;
let lastOpenTimeParseDebugSnapshot: FlicaCrewHubParseDebugPayload | null = null;

export function commitTradeboardParseDebugSnapshot(
  payload: FlicaCrewHubParseDebugPayload | null,
): void {
  lastTradeboardParseDebugSnapshot = payload;
}

export function commitOpenTimeParseDebugSnapshot(
  payload: FlicaCrewHubParseDebugPayload | null,
): void {
  lastOpenTimeParseDebugSnapshot = payload;
}

export function getTradeboardParseDebugSnapshot(): FlicaCrewHubParseDebugPayload | null {
  return lastTradeboardParseDebugSnapshot;
}

export function getOpenTimeParseDebugSnapshot(): FlicaCrewHubParseDebugPayload | null {
  return lastOpenTimeParseDebugSnapshot;
}

export function pickDebugFetchEntry(
  payload: FlicaCrewHubParseDebugPayload | null,
  name: string,
): FlicaCrewHubParseDebugFetchEntry | null {
  const byName = payload?.fetches?.find((x) => x.name === name);
  if (byName) return byName;
  const first = payload?.fetches?.[0];
  return first ?? null;
}
