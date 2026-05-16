/**
 * Fallback parsers when FLICA returns table rows built from JS templates (TAry[i], QAry[idx])
 * or display-only rows, while real data still exists in page HTML / scripts.
 */
import type { FlicaActionsFetchResult } from "../flica-actions/flicaActionsTypes";
import {
  buildOpenTimePairingDetailUrl,
  buildTradeboardPairingDetailUrl,
  extractPairOnclickPidYmdsFromHtml,
  normalizeFlicaDdMmmToken,
  parseFlicaPairOnclick,
  ymdToDdMmmToken,
} from "../flica-actions/flicaPairingDetailUrl";
import type { OpenTimeTrip, TradeboardPost, TradeboardPostType } from "./flicaCrewHubTypes";
import { dateYmdFromRbcpairDetailUrl } from "./crewHubFlicaLiveGate";
import {
  djb2Hex,
  detectTradeboardType,
  extractMoney,
  formatOpenTimeBlkCr,
  mapRowsToOpenTimeTrips,
  mapTradeboardRowsToPosts,
  tradeboardSanitizeDisplayComment,
  tradeboardTypeLongLabel,
  type TradeboardSourcePageType,
} from "./flicaCrewHubMappers";

export type FlicaCrewHubFallbackParseMeta = {
  htmlLength: number;
  rawRowsCount: number;
  fallbackTextParserUsed: boolean;
  extractedPostCount: number;
  extractedTripCount: number;
  firstExtractedRawBlock: string;
  markersFound: string[];
  markersMissing: string[];
  /** Open Time pot: TAry / Task script extraction diagnostics (dev-oriented). */
  openTimeTaryExtractDebug?: OpenTimeTaryExtractDebug;
  /** Tradeboard All Requests / pageHtml fallback extraction diagnostics. */
  tradeboardExtractDebug?: TradeboardExtractDebug;
};

/** Serialized parse-inspection payload for Open Time HTML fallback (copy/debug panel). */
export type OpenTimeTaryExtractDebug = {
  /** Prefer TAry data init (`TAry=new Array`, `TAry[TAry.length]=new Task`, …); else first `TAry`. */
  firstTaryContext3000: string;
  patternAttempts: { pattern: string; matchCount: number }[];
  firstMatchedTaryRawBlock: string;
  taryOccurrenceCount: number;
  /** Up to 200 index positions of `TAry` (payload cap). */
  taryOccurrenceIndexesAll: number[];
  taryOccurrenceIndexesSample: number[];
  first20TaryContexts: { index: number; window: string }[];
  initializationHints: { name: string; count: number }[];
  taskConstructorCount: number;
  first10TaskMatches: OpenTimeTaskMatchDebug[];
  acceptedTaskCount: number;
  rejectedTaskCount: number;
  firstAcceptedTaskRawBlock: string;
  detectedTaskArgShape: {
    argCountHistogram: Record<string, number>;
    sampleAcceptedArgHead: string[][];
  } | null;
  /** Trips produced by this HTML script fallback only (before merge with native rows). */
  extractedTripCount: number;
};

export type OpenTimeTaskMatchDebug = {
  argCount: number;
  first25ArgsPreview: string[];
  rawPreview: string;
  accepted: boolean;
  rejectReason?: string;
};

export type TradeboardRowCandidateDebug = {
  textPreview: string;
  rawPreview?: string;
  accepted: boolean;
  rejectReason?: string;
};

export type TradeboardJsProbeDebug = {
  constructorCount: number;
  first10ConstructorMatches: string[];
  arrayAssignmentPatterns: { pattern: string; matchCount: number }[];
  pairingOccurrenceContexts: { index: number; window: string }[];
};

export type TradeboardExtractDebug = {
  htmlLength: number;
  pageTitle: string | null;
  markerList: string[];
  allRequestsDetected: boolean;
  tradeboardOccurrenceContexts: { index: number; window: string }[];
  requestRowCandidateCount: number;
  acceptedRowCount: number;
  rejectedRowCount: number;
  first10CandidateRows: TradeboardRowCandidateDebug[];
  firstAcceptedRawBlock: string;
  detectedExtractionMode: string;
  tradeboardJsProbe?: TradeboardJsProbeDebug;
  /** True when raw `pageHtml` matches strict `J####:DDMON` or FLEX pairing on entity-decoded / tag-flattened prep string. */
  fullHtmlContainsPairingPattern: boolean;
  /** FLEX pairing matches on {@link tradeboardPrepareFullHtmlForFlexPairing} string. */
  flexPairingMatchCountOnPreparedHtml: number;
  /** Same pattern test on normalized full-page text used for row slicing. */
  normalizedTextContainsPairingPattern: boolean;
  /** Pairing-token match count on normalized text. */
  pairingMatchCount: number;
  /** Whether script-stripped normalization had at least as many pairing hits as unwrap path. */
  normalizedScriptStrippedPreferred: boolean;
  /** Up to 20 ±350 char windows around pairing matches on normalized text. */
  first20PairingPatternContexts: { index: number; window: string }[];
  /** Raw HTML diagnostics for known screenshot pairing ids (+ 13MAY). */
  knownTokenProbes: TradeboardKnownTokenProbeResult[];
  /** All Requests: first pipe-joined `<td>` table rows (fallback path). */
  first10AllRequestsTablePipeLines?: string[];
  /** All Requests: `r[n]=new A(...)` assignments found in page HTML. */
  allRequestsARecordBodiesFound?: number;
  /** All Requests: A-records that produced a {@link TradeboardPost}. */
  allRequestsARecordPostsCount?: number;
  /** First 5 A-record arg diagnostics (dev). */
  allRequestsARecordFirst5ArgDiagnostics?: {
    recordIndex: number;
    argCount: number;
    arg0?: string;
    arg4?: string;
    arg5?: string;
    arg7?: string;
    arg12?: string;
    arg13?: string;
    arg16?: string;
    argsHeadPreview?: string[];
  }[];
};

export type TradeboardKnownTokenProbeResult = {
  pairingId: string;
  idIndex: number;
  dateIndex: number;
  colonIndexNearby: number;
  rawContextAroundId: string;
};

function emptyMeta(htmlLen: number, rawRows: number): FlicaCrewHubFallbackParseMeta {
  return {
    htmlLength: htmlLen,
    rawRowsCount: rawRows,
    fallbackTextParserUsed: false,
    extractedPostCount: 0,
    extractedTripCount: 0,
    firstExtractedRawBlock: "",
    markersFound: [],
    markersMissing: [],
  };
}

function stripScripts(html: string): string {
  return String(html ?? "").replace(/<script[\s\S]*?<\/script>/gi, "");
}

function stripTags(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function fullTextFromHtml(html: string): string {
  return collapseWs(stripTags(stripScripts(html)));
}

function parseQuotedStringsInArrayLiteral(inner: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const q = inner[i];
    if (q !== '"' && q !== "'") {
      i++;
      continue;
    }
    const quote = q;
    let buf = "";
    i++;
    while (i < inner.length) {
      const c = inner[i]!;
      if (c === "\\" && inner[i + 1] != null) {
        buf += inner[i + 1]!;
        i += 2;
        continue;
      }
      if (c === quote) {
        out.push(buf);
        i++;
        break;
      }
      buf += c;
      i++;
    }
  }
  return out;
}

function countRegexMatches(src: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  let n = 0;
  while (rx.exec(src) !== null) n++;
  return n;
}

function allRegexMatchIndexes(src: string, re: RegExp): number[] {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) out.push(m.index);
  return out;
}

/** `(` at `openParenIndex` → inner text inside matching `)`, quote-aware. */
function sliceBalancedParenInner(s: string, openParenIndex: number): string | null {
  if (s[openParenIndex] !== "(") return null;
  let depth = 1;
  let i = openParenIndex + 1;
  let inStr: false | '"' | "'" | "`" = false;
  while (i < s.length) {
    const c = s[i]!;
    if (inStr) {
      if (inStr === "`") {
        if (c === "\\" && s[i + 1] != null) {
          i += 2;
          continue;
        }
        if (c === "`") inStr = false;
        i++;
        continue;
      }
      if (c === "\\" && s[i + 1] != null) {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return s.slice(openParenIndex + 1, i);
    }
    i++;
  }
  return null;
}

/**
 * Split top-level comma-separated JS call arguments (inside outer parens already removed).
 * Respects nested `()`, `[]`, `{}` and strings ' " ` including escapes.
 */
function splitJsCallArgs(body: string): string[] {
  const args: string[] = [];
  let buf = "";
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inStr: false | '"' | "'" | "`" = false;
  let i = 0;
  while (i < body.length) {
    const c = body[i]!;
    if (inStr) {
      if (inStr === "`") {
        if (c === "\\" && body[i + 1] != null) {
          buf += c + body[i + 1]!;
          i += 2;
          continue;
        }
        if (c === "`") {
          inStr = false;
          buf += c;
          i++;
          continue;
        }
        buf += c;
        i++;
        continue;
      }
      if (c === "\\" && body[i + 1] != null) {
        buf += c + body[i + 1]!;
        i += 2;
        continue;
      }
      if (c === inStr) {
        inStr = false;
        buf += c;
        i++;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c as '"' | "'" | "`";
      buf += c;
      i++;
      continue;
    }
    if (c === "(") depthParen++;
    else if (c === ")") depthParen--;
    else if (c === "[") depthBracket++;
    else if (c === "]") depthBracket--;
    else if (c === "{") depthBrace++;
    else if (c === "}") depthBrace--;
    if (
      c === "," &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      args.push(buf.trim());
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail.length) args.push(tail);
  return args;
}

function decodeHtmlEntitiesLight(s: string): string {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#32;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeHtmlEntitiesTradeboard(s: string): string {
  return decodeHtmlEntitiesLight(String(s ?? ""))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&colon;/gi, ":")
    .replace(/&#58;/g, ":")
    .replace(/&#x3a;/gi, ":")
    .replace(/&#x3A;/g, ":");
}

function normalizeTaskArg(a: string): string {
  let s = decodeHtmlEntitiesLight(String(a ?? "").trim());
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    const q = s[0]!;
    s = s.slice(1, -1);
    s = s.replace(new RegExp(`\\\\${q}`, "g"), q);
  }
  return collapseWs(s);
}

function findTaryDataInitContext(src: string): { index: number; label: string } | null {
  const patterns: { label: string; re: RegExp }[] = [
    { label: "TAry=new Array(", re: /\bTAry\s*=\s*new\s+Array\s*\(/i },
    { label: "TAry[TAry.length]=new Task(", re: /\bTAry\s*\[\s*TAry\.length\s*\]\s*=\s*new\s+Task\s*\(/i },
    { label: "TAry[n]=new Task(", re: /\bTAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Task\s*\(/i },
    { label: "var TAry", re: /\bvar\s+TAry\b/i },
    { label: "ReqAry[ReqAry.length]=new Task(", re: /\bReqAry\s*\[\s*ReqAry\.length\s*\]\s*=\s*new\s+Task\s*\(/i },
  ];
  let best: { index: number; label: string } | null = null;
  for (const { label, re } of patterns) {
    const m = src.match(re);
    if (m?.index == null) continue;
    if (best == null || m.index < best.index) best = { index: m.index, label };
  }
  return best;
}

function openTimeTripFromTaskArgs(
  argsRaw: string[],
  rawPreview: string,
  sourceUrl: string,
): { trip: OpenTimeTrip | null; rejectReason?: string } {
  const args = argsRaw.map(normalizeTaskArg);
  const blob = args.join(" ");

  /** `new Task(docOrder, "PID","DDMMM","YYYYMMDD", …)` — real OT rows from TAry script. */
  let pairingId = "";
  let dateTok = "";
  let taryDateYmd: string | undefined;

  if (args.length >= 4) {
    const a1 = args[1]!.trim().toUpperCase();
    const a2 = args[2]!.trim();
    const a3 = args[3]!.trim();
    if (/^J[A-Z0-9]{3,5}$/.test(a1) && /^\d{1,2}[A-Z]{3}$/i.test(a2) && /^\d{8}$/.test(a3)) {
      pairingId = a1;
      dateTok = a2.toUpperCase();
      taryDateYmd = a3;
    }
  }
  if (!pairingId && args.length >= 3) {
    const a0 = args[0]!.trim().toUpperCase();
    const a1 = args[1]!.trim();
    const a2 = args[2]!.trim();
    if (/^J[A-Z0-9]{3,5}$/.test(a0) && /^\d{1,2}[A-Z]{3}$/i.test(a1) && /^\d{8}$/.test(a2)) {
      pairingId = a0;
      dateTok = a1.toUpperCase();
      taryDateYmd = a2;
    }
  }

  if (!pairingId) {
    if (!/\bJ[A-Z0-9]{3,5}\b/i.test(blob)) {
      return { trip: null, rejectReason: "no_j_pairing_literal_in_args" };
    }
    const mColon = blob.match(/\b(J[A-Z0-9]{3,5})\s*:\s*(\d{1,2}[A-Z]{3})\b/i);
    if (mColon) {
      pairingId = mColon[1]!.toUpperCase();
      dateTok = mColon[2]!.toUpperCase();
    } else {
      const mJ = blob.match(/\b(J[A-Z0-9]{3,5})\b/i);
      const mD = blob.match(/\b(\d{1,2}[A-Z]{3})\b/i);
      if (mJ) pairingId = mJ[1]!.toUpperCase();
      if (mD) dateTok = mD[1]!.toUpperCase();
    }
  }
  if (!pairingId.startsWith("J")) {
    return { trip: null, rejectReason: "pairing_unparsed" };
  }

  const times = blob.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  const reportTime = times[0] ?? "";
  const departTime = times[1] ?? "";
  const arriveTime = times[2] ?? "";

  let days: number | null = null;
  for (const a of args) {
    if (/^\d$/.test(a)) {
      const n = parseInt(a, 10);
      if (n >= 1 && n <= 9) {
        days = n;
        break;
      }
    }
  }
  if (days == null) {
    const dm = blob.match(/\b(?:^|\s)(\d)\s+(?:\d{1,2}:\d{2})/);
    if (dm?.[1]) {
      const n = parseInt(dm[1], 10);
      if (n >= 1 && n <= 9) days = n;
    }
  }

  const bidPosRaw =
    args.find((a) => /^[A-Z]{2}$/i.test(a) && !/^(JFK|LAX|BOS|FLL|MCO|MIA|ATL|SEA|SLC)$/i.test(a)) ??
    args.find((a) => /^[A-Z]{2,4}$/i.test(a) && a.length <= 4) ??
    "";

  const layFromArgs =
    args.find((a) => {
      const t = normalizeTaskArg(a).trim();
      return /^[A-Z]{3}(\s+[A-Z]{3})+$/.test(t);
    }) ?? "";

  const blockRaw = times[3] ?? "";
  const creditRaw = times[4] ?? "";

  const pairingCol = dateTok ? `${pairingId}:${dateTok}` : pairingId;
  const syntheticCells = [
    pairingCol,
    dateTok || "",
    typeof bidPosRaw === "string" ? bidPosRaw : "",
    days != null ? String(days) : "",
    reportTime,
    departTime,
    arriveTime,
    formatOpenTimeBlkCr(blockRaw),
    formatOpenTimeBlkCr(creditRaw),
    layFromArgs,
  ];
  const mapped = mapRowsToOpenTimeTrips([syntheticCells], sourceUrl);
  let trip: OpenTimeTrip;
  if (mapped.length === 1) {
    trip = mapped[0]!;
  } else {
    trip = {
      pairingId,
      date: dateTok,
      dates: dateTok,
      dateLabel: dateTok || undefined,
      days,
      bidPos: (typeof bidPosRaw === "string" ? bidPosRaw : "") || undefined,
      routeSummary: layFromArgs,
      reportTime,
      departTime,
      arriveTime,
      block: formatOpenTimeBlkCr(blockRaw),
      credit: formatOpenTimeBlkCr(creditRaw),
      layover: layFromArgs,
      worth: (() => {
        const wm = blob.match(/\$\s*[\d,]+(?:\.\d{2})?/);
        return wm ? wm[0]!.replace(/\s+/g, "") : "";
      })(),
      premium: undefined,
      dollarPerCreditHour: "",
      legalityStatus: "",
      sourceUrl,
      rawCells: args.slice(0, 24),
    };
  }

  if (taryDateYmd && /^\d{8}$/.test(taryDateYmd)) {
    trip = applyOpenTimeTaryTaskPairingDetail(trip, pairingId, taryDateYmd);
  }

  return { trip };
}

type TaskBody = { start: number; openParenIdx: number; inner: string; source: string };

function collectTaryTaskAssignments(src: string): TaskBody[] {
  const out: TaskBody[] = [];
  const patterns = [
    /\bTAry\s*\[\s*TAry\.length\s*\]\s*=\s*new\s+Task\s*/gi,
    /\bTAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Task\s*/gi,
    /\bReqAry\s*\[\s*ReqAry\.length\s*\]\s*=\s*new\s+Task\s*/gi,
    /\bReqAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Task\s*/gi,
  ];
  const seen = new Set<number>();
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const after = m.index + m[0].length;
      const openIdx = src.indexOf("(", after);
      if (openIdx < 0 || src[openIdx] !== "(") continue;
      const inner = sliceBalancedParenInner(src, openIdx);
      if (inner == null) continue;
      if (seen.has(openIdx)) continue;
      seen.add(openIdx);
      out.push({ start: m.index, openParenIdx: openIdx, inner, source: "TAry/ReqAry=new Task" });
    }
  }
  return out;
}

function extractTasksInsideTaryNewArray(src: string): TaskBody[] {
  const out: TaskBody[] = [];
  const re = /\bTAry\s*=\s*new\s+Array\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const arrayOpenParen = m.index + m[0].length - 1;
    const innerArray = sliceBalancedParenInner(src, arrayOpenParen);
    if (innerArray == null) continue;
    const innerArrayContentStart = arrayOpenParen + 1;
    const sub = /\bnew\s+Task\s*/gi;
    let t: RegExpExecArray | null;
    let k = 0;
    while ((t = sub.exec(innerArray)) !== null) {
      const openParenRel = innerArray.indexOf("(", t.index);
      if (openParenRel < 0 || innerArray[openParenRel] !== "(") continue;
      const inner = sliceBalancedParenInner(innerArray, openParenRel);
      if (inner == null) continue;
      const openParenIdx = innerArrayContentStart + openParenRel;
      out.push({
        start: m.index,
        openParenIdx,
        inner,
        source: "TAry=new Array(Task...)",
      });
      k++;
      if (k > 500) break;
    }
  }
  return out;
}

function enumerateAllNewTasksInOrder(src: string): TaskBody[] {
  const out: TaskBody[] = [];
  const taskRe = /\bnew\s+Task\s*\(/gi;
  let tm: RegExpExecArray | null;
  while ((tm = taskRe.exec(src)) !== null) {
    const openParen = tm.index + tm[0].length - 1;
    const inner = sliceBalancedParenInner(src, openParen);
    if (inner == null) continue;
    out.push({ start: tm.index, openParenIdx: openParen, inner, source: "new Task(doc_order)" });
  }
  return out;
}

function dedupeTaskBodiesByOpenParen(bodies: TaskBody[]): TaskBody[] {
  const m = new Map<number, TaskBody>();
  for (const b of bodies) {
    if (!m.has(b.openParenIdx)) m.set(b.openParenIdx, b);
  }
  return [...m.values()];
}

function findBroadTaskAnchors(src: string): number[] {
  const anchors: number[] = [];
  const init = findTaryDataInitContext(src);
  if (init) anchors.push(init.index);
  const ta = src.search(/\bTAry\s*=\s*new\s+Array\s*\(/i);
  if (ta >= 0) anchors.push(ta);
  const tb = src.search(/\bTAry\s*\[\s*TAry\.length\s*\]/i);
  if (tb >= 0) anchors.push(tb);
  const ra = src.search(/\bReqAry\s*\[\s*ReqAry\.length\s*\]/i);
  if (ra >= 0) anchors.push(ra);
  return [...new Set(anchors)].sort((a, b) => a - b);
}

function isTaskNearTaryInit(taskOpenParenIdx: number, anchors: number[], window: number): boolean {
  if (anchors.length === 0) return false;
  return anchors.some((a) => taskOpenParenIdx >= a && taskOpenParenIdx <= a + window);
}

const OT_TEXT_LINE_RE =
  /^\s*(\bJ[A-Z0-9]{3,5}\b)\s+(\d{1,2}[A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{2})\s+_\s+(\d)\s+((?:\d{1,2}:\d{2}\s+){3,8})([A-Za-z][A-Za-z0-9\s]{2,80}?)\s*$/i;

function extractOpenTimeTripsFromScriptLines(src: string, sourceUrl: string): OpenTimeTrip[] {
  const trips: OpenTimeTrip[] = [];
  const chunks = src.split(/[\n;]+/);
  for (const ch of chunks) {
    const line = collapseWs(ch);
    if (line.length < 28) continue;
    if (OT_TEXT_LINE_RE.test(line)) {
      const m = line.match(OT_TEXT_LINE_RE);
      if (m) {
        const pairingId = m[1]!.toUpperCase();
        const dateTok = m[2]!.toUpperCase();
        const base = m[3]!;
        const pos = m[4]!;
        const days = parseInt(m[5]!, 10);
        const timesBlob = m[6]!.trim();
        const tail = m[7]!.trim();
        const times = timesBlob.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
        const synthetic = `${pairingId}:${dateTok} ${base} ${pos} _ ${Number.isFinite(days) ? days : ""} ${times.join(" ")} ${tail}`;
        trips.push(...mapRowsToOpenTimeTrips([[synthetic]], sourceUrl));
      }
      continue;
    }
    const loose = line.match(
      /\b(J[A-Z0-9]{3,5})\s+(\d{1,2}[A-Z]{3})\b\s+(.{2,120}?)\s+((?:\d{1,2}:\d{2}\s+){3,})([A-Za-z0-9][A-Za-z0-9\s]{1,80})$/i,
    );
    if (loose) {
      const pairingId = loose[1]!.toUpperCase();
      const dateTok = loose[2]!.toUpperCase();
      const mid = loose[3]!.trim();
      const timesBlob = loose[4]!.trim();
      const tail = loose[5]!.trim();
      const times = timesBlob.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
      if (times.length >= 3) {
        const synthetic = `${pairingId}:${dateTok} ${mid} ${times.join(" ")} ${tail}`;
        trips.push(...mapRowsToOpenTimeTrips([[synthetic]], sourceUrl));
      }
    }
  }
  return dedupeTrips(trips);
}

function buildOpenTimeTaryExtractDebugAndTaskTrips(
  src: string,
  sourceUrl: string,
): { debug: OpenTimeTaryExtractDebug; taskTrips: OpenTimeTrip[]; textTrips: OpenTimeTrip[] } {
  const html = String(src ?? "");
  const allTaryIdx = allRegexMatchIndexes(html, /TAry/gi);
  const taryOccurrenceIndexesAll = allTaryIdx.slice(0, 200);
  const taryOccurrenceIndexesSample = allTaryIdx.slice(0, 20);
  const taryOccurrenceCount = allTaryIdx.length;

  const first20TaryContexts = taryOccurrenceIndexesSample.map((index) => ({
    index,
    window: html.slice(Math.max(0, index - 500), Math.min(html.length, index + 500)),
  }));

  const initCtx = findTaryDataInitContext(html);
  const firstTaryContext3000 =
    initCtx != null
      ? html.slice(
          Math.max(0, initCtx.index - 500),
          Math.min(html.length, initCtx.index + 2500),
        )
      : taryOccurrenceIndexesSample[0] != null
        ? html.slice(
            Math.max(0, taryOccurrenceIndexesSample[0]! - 500),
            Math.min(html.length, taryOccurrenceIndexesSample[0]! + 2500),
          )
        : "";

  const initHintDefs: { name: string; re: RegExp }[] = [
    { name: "TAry=new Array", re: /TAry\s*=\s*new\s+Array/gi },
    { name: "TAry = new Array", re: /TAry\s*=\s*new\s+Array/gi },
    { name: "var TAry", re: /\bvar\s+TAry\b/gi },
    { name: "new Task(", re: /\bnew\s+Task\s*\(/gi },
    { name: "Task(", re: /\bTask\s*\(/gi },
    { name: "ReqAry", re: /\bReqAry\b/gi },
    { name: ".rpttime", re: /\.rpttime\b/gi },
    { name: ".dpttime", re: /\.dpttime\b/gi },
    { name: ".endtime", re: /\.endtime\b/gi },
    { name: ".pay", re: /\.pay\b/gi },
    { name: ".lay", re: /\.lay\b/gi },
  ];
  const initializationHints = initHintDefs.map(({ name, re }) => ({
    name,
    count: countRegexMatches(html, re),
  }));

  const patternAttempts = [
    ...OT_TARY_DEBUG_PATTERNS.map(({ name, re }) => ({
      pattern: name,
      matchCount: countRegexMatches(html, re),
    })),
    ...initHintDefs.map(({ name, re }) => ({
      pattern: `hint:${name}`,
      matchCount: countRegexMatches(html, re),
    })),
  ];

  let firstMatchedTaryRawBlock = "";
  const taryEq = html.match(/\bTAry\s*=\s*new\s+Array\s*\(/i);
  if (taryEq?.index != null) {
    firstMatchedTaryRawBlock = html.slice(taryEq.index, Math.min(html.length, taryEq.index + 2800));
  } else {
    const tLen = html.match(/\bTAry\s*\[\s*TAry\.length\s*\]\s*=\s*new\s+Task\s*\(/i);
    if (tLen?.index != null) {
      firstMatchedTaryRawBlock = html.slice(tLen.index, Math.min(html.length, tLen.index + 2800));
    }
  }

  const taskBodiesRaw: TaskBody[] = [];
  for (const x of collectTaryTaskAssignments(html)) {
    taskBodiesRaw.push(x);
  }
  for (const x of extractTasksInsideTaryNewArray(html)) {
    taskBodiesRaw.push(x);
  }

  const taskRe = /\bnew\s+Task\s*\(/gi;
  const allTaskOpens: number[] = [];
  let tm: RegExpExecArray | null;
  while ((tm = taskRe.exec(html)) !== null) {
    const openParen = tm.index + tm[0].length - 1;
    allTaskOpens.push(openParen);
  }

  const anchors = findBroadTaskAnchors(html);
  const window = 80000;
  const seenOpen = new Set(taskBodiesRaw.map((b) => b.openParenIdx));
  for (const openParen of allTaskOpens) {
    const inner = sliceBalancedParenInner(html, openParen);
    if (inner == null) continue;
    if (!isTaskNearTaryInit(openParen, anchors, window)) continue;
    if (seenOpen.has(openParen)) continue;
    seenOpen.add(openParen);
    taskBodiesRaw.push({
      start: openParen,
      openParenIdx: openParen,
      inner,
      source: "new Task(broad_near_init)",
    });
  }

  const taskBodies = dedupeTaskBodiesByOpenParen(taskBodiesRaw);

  const taskConstructorCount = allTaskOpens.length;

  const first10DocTasks = enumerateAllNewTasksInOrder(html).slice(0, 10);
  const first10TaskMatches: OpenTimeTaskMatchDebug[] = [];
  for (const doc of first10DocTasks) {
    const argsRaw = splitJsCallArgs(doc.inner);
    const rawPreview = html.slice(
      Math.max(0, doc.start - 30),
      Math.min(html.length, doc.start + Math.min(doc.inner.length + 60, 420)),
    );
    const { trip, rejectReason } = openTimeTripFromTaskArgs(argsRaw, rawPreview, sourceUrl);
    const accepted = trip != null;
    first10TaskMatches.push({
      argCount: argsRaw.length,
      first25ArgsPreview: argsRaw.slice(0, 25).map((a) => normalizeTaskArg(a).slice(0, 160)),
      rawPreview: rawPreview.slice(0, 520),
      accepted,
      rejectReason: accepted ? undefined : rejectReason ?? "rejected",
    });
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[FLICA_OPENTIME_TASK_MATCH]", {
        source: doc.source,
        argCount: argsRaw.length,
        first25Args: argsRaw.slice(0, 25).map((a) => normalizeTaskArg(a).slice(0, 160)),
        rawPreview: rawPreview.slice(0, 520),
        accepted,
        rejectReason: accepted ? undefined : rejectReason ?? "rejected",
      });
    }
  }

  let acceptedTaskCount = 0;
  let rejectedTaskCount = 0;
  let firstAcceptedTaskRawBlock = "";
  const argCountHistogram: Record<string, number> = {};
  let sampleAcceptedArgHead: string[][] | null = null;

  for (const body of taskBodies) {
    const argsRaw = splitJsCallArgs(body.inner);
    const rawPreview = html.slice(
      Math.max(0, body.start - 40),
      Math.min(html.length, body.start + Math.min(body.inner.length + 80, 400)),
    );
    const { trip, rejectReason } = openTimeTripFromTaskArgs(argsRaw, rawPreview, sourceUrl);
    if (trip != null) {
      acceptedTaskCount++;
      const k = String(argsRaw.length);
      argCountHistogram[k] = (argCountHistogram[k] ?? 0) + 1;
      if (!sampleAcceptedArgHead) {
        sampleAcceptedArgHead = [argsRaw.slice(0, 18).map((a) => normalizeTaskArg(a).slice(0, 120))];
      }
      if (!firstAcceptedTaskRawBlock) {
        firstAcceptedTaskRawBlock = rawPreview.slice(0, 2400);
      }
    } else {
      rejectedTaskCount++;
    }
  }

  const taskTrips: OpenTimeTrip[] = [];
  const seenTrip = new Set<string>();
  for (const body of taskBodies) {
    const argsRaw = splitJsCallArgs(body.inner);
    const rawPreview = html.slice(body.start, Math.min(html.length, body.start + 400));
    const { trip } = openTimeTripFromTaskArgs(argsRaw, rawPreview, sourceUrl);
    if (!trip) continue;
    const k = `${trip.pairingId}:${trip.date}:${trip.reportTime}`;
    if (seenTrip.has(k)) continue;
    seenTrip.add(k);
    taskTrips.push(trip);
  }

  const textTrips = extractOpenTimeTripsFromScriptLines(html, sourceUrl);

  const taskTripsDeduped = dedupeTrips(taskTrips);
  const textTripsDeduped = dedupeTrips(textTrips);
  const mergedScript = dedupeTrips([...taskTripsDeduped, ...textTripsDeduped]);

  const detectedTaskArgShape =
    acceptedTaskCount > 0
      ? { argCountHistogram, sampleAcceptedArgHead: sampleAcceptedArgHead ?? [] }
      : sampleAcceptedArgHead
        ? { argCountHistogram, sampleAcceptedArgHead }
        : null;

  const debug: OpenTimeTaryExtractDebug = {
    firstTaryContext3000,
    patternAttempts,
    firstMatchedTaryRawBlock,
    taryOccurrenceCount,
    taryOccurrenceIndexesAll,
    taryOccurrenceIndexesSample,
    first20TaryContexts,
    initializationHints,
    taskConstructorCount,
    first10TaskMatches,
    acceptedTaskCount,
    rejectedTaskCount,
    firstAcceptedTaskRawBlock,
    detectedTaskArgShape,
    extractedTripCount: mergedScript.length,
  };

  return { debug, taskTrips: taskTripsDeduped, textTrips: textTripsDeduped };
}

/** `{` at `openBraceIndex` → inner object text (excluding outer braces), or null if unterminated. Quote-aware. */
function sliceBalancedBraceObjectInner(html: string, openBraceIndex: number): string | null {
  let depth = 0;
  let i = openBraceIndex;
  let inStr: false | '"' | "'" | "`" = false;
  while (i < html.length) {
    const c = html[i]!;
    if (inStr) {
      if (inStr === "`") {
        if (c === "\\" && html[i + 1] != null) {
          i += 2;
          continue;
        }
        if (c === "`") inStr = false;
        i++;
        continue;
      }
      if (c === "\\" && html[i + 1] != null) {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(openBraceIndex + 1, i);
    }
    i++;
  }
  return null;
}

function collectAryObjectBodies(html: string, ary: "TAry" | "QAry"): string[] {
  const bodies: string[] = [];
  const src = String(html ?? "");
  const assignRe = new RegExp(`${ary}\\s*\\[\\s*\\d+\\s*\\]\\s*=\\s*\\{`, "gi");
  let m: RegExpExecArray | null;
  while ((m = assignRe.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const inner = sliceBalancedBraceObjectInner(src, open);
    if (inner != null && inner.length > 2) bodies.push(inner);
  }
  const pushRe = new RegExp(`${ary}\\.push\\s*\\(\\s*\\{`, "gi");
  while ((m = pushRe.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const inner = sliceBalancedBraceObjectInner(src, open);
    if (inner != null && inner.length > 2) bodies.push(inner);
  }
  return bodies;
}

function otFieldString(body: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*:\\s*(?:['"]([^'"]*)['"]|(\`[^\`]*\`)|([^,}\\]\\s]+))`, "i");
  const m = body.match(re);
  if (!m) return "";
  const v = m[1] ?? m[2] ?? m[3] ?? "";
  const s = String(v).trim();
  if (s.startsWith("`") && s.endsWith("`")) return collapseWs(s.slice(1, -1));
  return collapseWs(s);
}

function openTimeTripFromPotObjectBody(body: string, sourceUrl: string): OpenTimeTrip | null {
  const disppair =
    otFieldString(body, "disppair") ||
    otFieldString(body, "dispPair") ||
    otFieldString(body, "d") ||
    otFieldString(body, "pairDisp");
  if (!disppair || !/\bJ[A-Z0-9]{3,5}/i.test(disppair)) return null;
  if (/\bTAry\s*\[|\bQAry\s*\[|\$\{/i.test(disppair)) return null;

  const pd = disppair.match(/\b(J[A-Z0-9]{3,5})\s*:\s*(\d{1,2}[A-Z]{3})\b/i);
  const pairingId = (pd?.[1] ?? disppair.match(/\b(J[A-Z0-9]{3,5})\b/i)?.[1] ?? "").toUpperCase();
  if (!pairingId.startsWith("J")) return null;
  const dateTok = (pd?.[2] ?? "").toUpperCase();

  const bidPos =
    otFieldString(body, "fullBidPos") ||
    otFieldString(body, "bidPos") ||
    otFieldString(body, "bid") ||
    "";
  const daysStr = otFieldString(body, "days");
  let days: number | null = null;
  if (daysStr) {
    const n = parseInt(daysStr.replace(/\D/g, ""), 10);
    days = Number.isFinite(n) ? n : null;
  }

  const rpttime = otFieldString(body, "rpttime") || otFieldString(body, "rptTime");
  const dpttime = otFieldString(body, "dpttime") || otFieldString(body, "dptTime");
  const endtime = otFieldString(body, "endtime") || otFieldString(body, "endTime");
  const hrs = otFieldString(body, "hrs") || otFieldString(body, "block");
  const payRaw = otFieldString(body, "pay") || otFieldString(body, "credit");
  const lay = otFieldString(body, "lay") || otFieldString(body, "layover");
  const premium = otFieldString(body, "premium") || otFieldString(body, "prem");
  const dateAlt = otFieldString(body, "date") || otFieldString(body, "dates") || otFieldString(body, "dispdate");

  const creditOnly = otFieldString(body, "credit");
  const payForCredit =
    creditOnly || payRaw.replace(/\$\s*[\d,]+(?:\.\d{2})?/g, "").replace(/\/\s*HR.*/i, "").trim();

  const worth = extractMoney(payRaw);

  const rawCells = [disppair, bidPos, daysStr, rpttime, dpttime, endtime, hrs, payForCredit, lay].filter(Boolean);

  const dateLabel = dateTok || dateAlt;
  const dateDisplay = dateAlt || dateTok;
  const oc = parseFlicaPairOnclick(body);

  return {
    pairingId,
    date: dateDisplay,
    dates: dateDisplay,
    dateLabel: dateTok || undefined,
    days,
    bidPos: bidPos || undefined,
    routeSummary: lay,
    reportTime: rpttime,
    departTime: dpttime,
    arriveTime: endtime,
    block: formatOpenTimeBlkCr(hrs),
    credit: formatOpenTimeBlkCr(payForCredit),
    layover: lay,
    worth,
    premium: premium || undefined,
    dollarPerCreditHour: (() => {
      const mm = payRaw.match(/\$(\d+)\s*\/\s*(?:CR\s*)?HR/i);
      return mm?.[1] ? `$${mm[1]}/hr` : "";
    })(),
    legalityStatus: otFieldString(body, "legal") || otFieldString(body, "legality") || "",
    sourceUrl,
    rawCells,
    pairingDetailUrl: oc ? buildOpenTimePairingDetailUrl(oc.pid, oc.dateYmd) : undefined,
  };
}

/** Extract `TAry[n] = new Array(...)` / `QAry[n] = new Array(...)` row cell arrays from HTML + scripts. */
function extractAryNewArrayRows(html: string, aryNames: ("TAry" | "QAry")[]): string[][] {
  const rows: string[][] = [];
  const src = String(html ?? "");
  for (const name of aryNames) {
    const re = new RegExp(
      `${name}\\s*\\[\\s*\\d+\\s*\\]\\s*=\\s*new\\s+Array\\s*\\(\\s*([\\s\\S]*?)\\)\\s*;`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const inner = m[1] ?? "";
      const cells = parseQuotedStringsInArrayLiteral(inner).map((s) => collapseWs(s));
      if (cells.length >= 2) rows.push(cells);
    }
  }
  return rows;
}

function extractAryBracketArrayRows(html: string, aryNames: ("TAry" | "QAry")[]): string[][] {
  const rows: string[][] = [];
  const src = String(html ?? "");
  for (const name of aryNames) {
    const re = new RegExp(`${name}\\s*\\[\\s*\\d+\\s*\\]\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const inner = m[1] ?? "";
      const cells = parseQuotedStringsInArrayLiteral(inner).map((s) => collapseWs(s));
      if (cells.length >= 2) rows.push(cells);
    }
  }
  return rows;
}

function extractAryPushNewArrayRows(html: string, aryNames: ("TAry" | "QAry")[]): string[][] {
  const rows: string[][] = [];
  const src = String(html ?? "");
  for (const name of aryNames) {
    const re = new RegExp(
      `${name}\\.push\\s*\\(\\s*new\\s+Array\\s*\\(\\s*([\\s\\S]*?)\\)\\s*\\)`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const inner = m[1] ?? "";
      const cells = parseQuotedStringsInArrayLiteral(inner).map((s) => collapseWs(s));
      if (cells.length >= 2) rows.push(cells);
    }
  }
  return rows;
}

function extractAryPushBracketArrayRows(html: string, aryNames: ("TAry" | "QAry")[]): string[][] {
  const rows: string[][] = [];
  const src = String(html ?? "");
  for (const name of aryNames) {
    const re = new RegExp(`${name}\\.push\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const inner = m[1] ?? "";
      const cells = parseQuotedStringsInArrayLiteral(inner).map((s) => collapseWs(s));
      if (cells.length >= 2) rows.push(cells);
    }
  }
  return rows;
}

const OT_TARY_DEBUG_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "TAry[TAry.length]=new Task(", re: /\bTAry\s*\[\s*TAry\.length\s*\]\s*=\s*new\s+Task\s*\(/gi },
  { name: "TAry[n]=new Task(", re: /\bTAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Task\s*\(/gi },
  { name: "TAry[n]=new Array(", re: /TAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Array\s*\(/gi },
  { name: "TAry[n]=[", re: /TAry\s*\[\s*\d+\s*\]\s*=\s*\[/gi },
  { name: "TAry[n]={", re: /TAry\s*\[\s*\d+\s*\]\s*=\s*\{/gi },
  { name: "TAry.push(new Array(", re: /TAry\.push\s*\(\s*new\s+Array\s*\(/gi },
  { name: "TAry.push([", re: /TAry\.push\s*\(\s*\[/gi },
  { name: "TAry.push({", re: /TAry\.push\s*\(\s*\{/gi },
  { name: "TAry=new Array", re: /TAry\s*=\s*new\s+Array/gi },
  { name: "TAry=[", re: /TAry\s*=\s*\[/gi },
  { name: "QAry[n]=new Array(", re: /QAry\s*\[\s*\d+\s*\]\s*=\s*new\s+Array\s*\(/gi },
  { name: "QAry[n]={", re: /QAry\s*\[\s*\d+\s*\]\s*=\s*\{/gi },
  { name: "QAry.push({", re: /QAry\.push\s*\(\s*\{/gi },
  { name: "disppair:", re: /\bdisppair\s*:/gi },
  { name: "rpttime:", re: /\brpttime\s*:/gi },
  { name: "dpttime:", re: /\bdpttime\s*:/gi },
  { name: "endtime:", re: /\bendtime\s*:/gi },
  { name: ".d:", re: /\bd\s*:\s*['"][^'"]*J[A-Z0-9]{3,5}/gi },
];

export function openTimePageSaysNoPot(html: string): boolean {
  const u = stripTags(stripScripts(html)).toUpperCase();
  return (
    /\bNO\s+OPEN\s*TIME\b/.test(u) ||
    /\bNO\s+OPENTIME\b/.test(u) ||
    /\bNO\s+OPEN\s+TIME\s+TRIPS?\b/.test(u)
  );
}

function rowsContainJsTemplateTokens(rows: string[][]): boolean {
  const blob = rows.map((r) => r.join(" ")).join("\n");
  return (
    /\bTAry\s*\[|QAry\s*\[|disppair\s*\[/i.test(blob) ||
    /\$\{\s*TAry|\$\{\s*QAry|\+\s*TAry|\+\s*QAry/i.test(blob) ||
    /\bTAry\s*\.\s*length\b/i.test(blob)
  );
}

function rowsContainTradeboardPairing(rows: string[][]): boolean {
  const re = /\b(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i;
  return rows.some((cells) => cells.some((c) => re.test(String(c))));
}

function extractTradeboardTextBlocks(html: string): string[] {
  const plain = fullTextFromHtml(html);
  const re = /\bJ[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3}\b/gi;
  const matches = [...plain.matchAll(re)];
  const blocks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]?.index ?? 0;
    const nextIdx = i + 1 < matches.length ? matches[i + 1]!.index ?? plain.length : plain.length;
    const end = Math.min(plain.length, Math.max(start + 1, Math.min(start + 1200, nextIdx)));
    const slice = collapseWs(plain.slice(start, end));
    if (slice.length < 24) continue;
    const u = slice.toUpperCase();
    if (u.startsWith("DISPLAY OPTIONS")) continue;
    if (u.includes("POST A REQUEST") && slice.length < 80) continue;
    if (/^TYPE\s+TRIP\s+BASE\b/i.test(slice) && !slice.includes(":")) continue;
    blocks.push(slice);
  }
  return blocks;
}

function dedupePosts(posts: TradeboardPost[]): TradeboardPost[] {
  const seen = new Set<string>();
  const out: TradeboardPost[] = [];
  for (const p of posts) {
    const k = `${p.pairingId}:${p.pairingDateLabel}:${p.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function tradeboardScheduleDedupeKey(p: TradeboardPost): string {
  return `${p.pairingId}:${p.pairingDateLabel}:${p.type}`;
}

/** When HTML fallback posts lack RPT/DEP/ARR/CR/BLK, fill from native table parse (same pairing key). */
function mergePrimaryScheduleIntoPosts(primary: TradeboardPost[], posts: TradeboardPost[]): TradeboardPost[] {
  if (!primary.length || !posts.length) return posts;
  const srcBy = new Map<string, TradeboardPost>();
  for (const pr of primary) {
    srcBy.set(tradeboardScheduleDedupeKey(pr), pr);
  }
  return posts.map((p) => {
    const src = srcBy.get(tradeboardScheduleDedupeKey(p));
    if (!src) return p;
    return {
      ...p,
      reportTime: p.reportTime?.trim() || src.reportTime?.trim() || "",
      departTime: p.departTime?.trim() || src.departTime?.trim() || "",
      arriveTime: p.arriveTime?.trim() || src.arriveTime?.trim() || "",
      block: p.block?.trim() || src.block?.trim() || "",
      credit: p.credit?.trim() || src.credit?.trim() || "",
      comments: p.comments?.trim() || src.comments?.trim() || "",
      pairingDetailUrl: p.pairingDetailUrl?.trim() || src.pairingDetailUrl?.trim() || undefined,
    };
  });
}

function dedupeTrips(trips: OpenTimeTrip[]): OpenTimeTrip[] {
  const seen = new Set<string>();
  const out: OpenTimeTrip[] = [];
  for (const t of trips) {
    const k = `${t.pairingId}:${t.date}:${t.reportTime}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** TAry `new Task(_, "PID","DDMMM","YYYYMMDD", …)` — same rbcpair shape as FLICA `pair()` for Open Time. */
function applyOpenTimeTaryTaskPairingDetail(trip: OpenTimeTrip, pairingId: string, dateYmd: string): OpenTimeTrip {
  const pid = pairingId.trim().toUpperCase();
  const y = dateYmd.trim();
  if (!/^J[A-Z0-9]{3,5}$/i.test(pid) || !/^\d{8}$/.test(y)) return trip;
  return {
    ...trip,
    pairingId: pid,
    dateYmd: y,
    pairingDetailUrl: buildOpenTimePairingDetailUrl(pid, y),
    pairingDetailUrlFromLiveHtml: true,
  };
}

function logOpenTimeMapDiagnostics(trips: OpenTimeTrip[], label: string): void {
  const rowsWithDateYmd = trips.filter((t) => /^\d{8}$/.test(String(t.dateYmd ?? "").trim())).length;
  const rowsWithPairingDetailUrl = trips.filter((t) => Boolean(t.pairingDetailUrl?.trim())).length;
  const rowsWithPairingDetailUrlFromLiveHtml = trips.filter((t) => t.pairingDetailUrlFromLiveHtml === true).length;
  const sample = trips.slice(0, 5).map((t) => ({
    pairingId: t.pairingId,
    dateLabel: t.dateLabel ?? t.date,
    dateYmd: t.dateYmd,
    sourceBcid: t.sourceBcid,
    pairingDetailUrl: t.pairingDetailUrl?.trim(),
    pairingDetailUrlFromLiveHtml: t.pairingDetailUrlFromLiveHtml,
  }));
  console.log(
    "[FC_OPENTIME_MAP_DIAG]",
    JSON.stringify({
      label,
      tripCount: trips.length,
      rowsWithDateYmd,
      rowsWithPairingDetailUrl,
      rowsWithPairingDetailUrlFromLiveHtml,
      sample,
    }),
  );
}

function enrichOpenTimeTripsWithPairingDetailUrlsFromHtml(html: string, trips: OpenTimeTrip[]): OpenTimeTrip[] {
  const h = String(html ?? "").trim();
  if (!h || trips.length === 0) return trips;
  const hits = extractPairOnclickPidYmdsFromHtml(h);
  if (!hits.length) return trips;
  const byPidDdmm = new Map<string, string>();
  for (const { pid, dateYmd } of hits) {
    const tok = ymdToDdMmmToken(dateYmd);
    if (!tok) continue;
    byPidDdmm.set(`${pid}|${normalizeFlicaDdMmmToken(tok)}`, buildOpenTimePairingDetailUrl(pid, dateYmd));
  }
  return trips.map((t) => {
    if (t.pairingDetailUrl?.trim() && t.pairingDetailUrlFromLiveHtml && t.dateYmd?.trim()) return t;
    const existingYmd = t.dateYmd?.trim() || dateYmdFromRbcpairDetailUrl(t.pairingDetailUrl ?? "");
    if (t.pairingDetailUrl?.trim() && existingYmd && /^\d{8}$/.test(existingYmd)) {
      return {
        ...t,
        dateYmd: existingYmd,
        pairingDetailUrlFromLiveHtml: true,
      };
    }
    if (t.pairingDetailUrl?.trim()) return t;
    const tok = t.dateLabel ? normalizeFlicaDdMmmToken(t.dateLabel) : "";
    if (tok) {
      const u = byPidDdmm.get(`${t.pairingId}|${tok}`);
      if (u) {
        const ymd = dateYmdFromRbcpairDetailUrl(u);
        return { ...t, pairingDetailUrl: u, dateYmd: ymd, pairingDetailUrlFromLiveHtml: true };
      }
    }
    const forPid = hits.filter((x) => x.pid === t.pairingId);
    if (forPid.length === 1) {
      const { pid, dateYmd } = forPid[0]!;
      const u = buildOpenTimePairingDetailUrl(pid, dateYmd);
      return { ...t, pairingDetailUrl: u, dateYmd, pairingDetailUrlFromLiveHtml: true };
    }
    return t;
  });
}

function enrichTradeboardPostsWithPairingDetailUrlsFromHtml(html: string, posts: TradeboardPost[]): TradeboardPost[] {
  const h = String(html ?? "").trim();
  if (!h || posts.length === 0) return posts;
  const hits = extractPairOnclickPidYmdsFromHtml(h);
  if (!hits.length) return posts;
  const byPidDdmm = new Map<string, string>();
  for (const { pid, dateYmd } of hits) {
    const tok = ymdToDdMmmToken(dateYmd);
    if (!tok) continue;
    byPidDdmm.set(`${pid}|${normalizeFlicaDdMmmToken(tok)}`, buildTradeboardPairingDetailUrl(pid, dateYmd));
  }
  return posts.map((p) => {
    if (p.pairingDetailUrl?.trim() && p.pairingDetailUrlFromLiveHtml) return p;
    const tok = normalizeFlicaDdMmmToken(p.pairingDateLabel);
    const u = byPidDdmm.get(`${p.pairingId}|${tok}`);
    if (u) return { ...p, pairingDetailUrl: u, pairingDetailUrlFromLiveHtml: true };
    const forPid = hits.filter((x) => x.pid === p.pairingId);
    if (forPid.length === 1) {
      const { pid, dateYmd } = forPid[0]!;
      return {
        ...p,
        pairingDetailUrl: buildTradeboardPairingDetailUrl(pid, dateYmd),
        pairingDetailUrlFromLiveHtml: true,
      };
    }
    if (p.pairingDetailUrl?.trim() && !p.pairingDetailUrlFromLiveHtml) {
      for (const x of hits) {
        if (x.pid !== p.pairingId) continue;
        const cand = buildTradeboardPairingDetailUrl(x.pid, x.dateYmd);
        if (cand === p.pairingDetailUrl.trim()) {
          return { ...p, pairingDetailUrlFromLiveHtml: true };
        }
      }
    }
    return p;
  });
}

export function mapOpenTimeTripsWithHtmlFallback(
  rows: string[][],
  r: Pick<FlicaActionsFetchResult, "htmlLength" | "bodyPreview" | "nativeParse" | "pageHtml">,
  sourceUrl: string,
): { trips: OpenTimeTrip[]; meta: FlicaCrewHubFallbackParseMeta } {
  const html = String(r.pageHtml ?? "");
  const htmlLen = Number(r.htmlLength ?? html.length ?? 0);
  const rawRows = rows?.length ?? 0;
  const markersFound: string[] = [];
  const markersMissing: string[] = [];
  const otEx = html ? buildOpenTimeTaryExtractDebugAndTaskTrips(html, sourceUrl) : null;
  const openTimeTaryExtractDebugBase = otEx?.debug;

  const primary = mapRowsToOpenTimeTrips(rows, sourceUrl);
  const templatey = rowsContainJsTemplateTokens(rows);
  const hasPairingInRows = rows.some((cells) =>
    cells.some(
      (c) =>
        /\bJ[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3}\b/i.test(String(c)) &&
        !/\bTAry\s*\[|\bQAry\s*\[|\$\{/i.test(String(c)),
    ),
  );

  if (primary.length > 0 && !templatey && hasPairingInRows) {
    const enriched = enrichOpenTimeTripsWithPairingDetailUrlsFromHtml(html, primary);
    logOpenTimeMapDiagnostics(enriched, "native_parse_rows");
    return {
      trips: enriched,
      meta: {
        ...emptyMeta(htmlLen, rawRows),
        markersFound: ["nativeParse.rows"],
        extractedTripCount: primary.length,
        firstExtractedRawBlock: primary[0]?.routeSummary ?? primary[0]?.pairingId ?? "",
        openTimeTaryExtractDebug: openTimeTaryExtractDebugBase,
      },
    };
  }

  if (html && openTimePageSaysNoPot(html)) {
    markersFound.push("no_opentime_message");
    logOpenTimeMapDiagnostics([], "no_opentime_pot_message");
    return {
      trips: [],
      meta: {
        ...emptyMeta(htmlLen, rawRows),
        markersFound,
        markersMissing,
        openTimeTaryExtractDebug: openTimeTaryExtractDebugBase,
      },
    };
  }

  const scriptMarkers = ["TAry", "QAry", "disppair", "rpttime", "dpttime", "endtime"];
  for (const m of scriptMarkers) {
    if (html.includes(m)) markersFound.push(m);
    else markersMissing.push(m);
  }

  const aryNew = extractAryNewArrayRows(html, ["TAry", "QAry"]);
  const aryBracket = extractAryBracketArrayRows(html, ["TAry", "QAry"]);
  const aryPushNew = extractAryPushNewArrayRows(html, ["TAry", "QAry"]);
  const aryPushBracket = extractAryPushBracketArrayRows(html, ["TAry", "QAry"]);
  if (aryNew.length) markersFound.push(`new_Array_rows:${aryNew.length}`);
  if (aryBracket.length) markersFound.push(`bracket_array_rows:${aryBracket.length}`);
  if (aryPushNew.length) markersFound.push(`push_newArray_rows:${aryPushNew.length}`);
  if (aryPushBracket.length) markersFound.push(`push_bracket_rows:${aryPushBracket.length}`);

  const objectBodies = [...collectAryObjectBodies(html, "TAry"), ...collectAryObjectBodies(html, "QAry")];
  if (objectBodies.length) markersFound.push(`object_literal_bodies:${objectBodies.length}`);

  let fromScriptRows: OpenTimeTrip[] = [];
  for (const cells of [...aryNew, ...aryBracket, ...aryPushNew, ...aryPushBracket]) {
    fromScriptRows.push(...mapRowsToOpenTimeTrips([cells], sourceUrl));
  }

  const fromObjects: OpenTimeTrip[] = [];
  for (const ob of objectBodies) {
    const t = openTimeTripFromPotObjectBody(ob, sourceUrl);
    if (t) fromObjects.push(t);
  }

  if (otEx?.taskTrips?.length) markersFound.push(`task_constructor_trips:${otEx.taskTrips.length}`);
  if (otEx?.textTrips?.length) markersFound.push(`script_line_trips:${otEx.textTrips.length}`);

  let fromScript = dedupeTrips([
    ...fromScriptRows,
    ...fromObjects,
    ...(otEx?.taskTrips ?? []),
    ...(otEx?.textTrips ?? []),
  ]);

  const openTimeTaryExtractDebug: OpenTimeTaryExtractDebug | undefined =
    openTimeTaryExtractDebugBase != null
      ? { ...openTimeTaryExtractDebugBase, extractedTripCount: fromScript.length }
      : undefined;

  let trips = fromScript.length ? fromScript : !templatey && primary.length ? primary : [];
  const scriptRowSources =
    aryNew.length + aryBracket.length + aryPushNew.length + aryPushBracket.length;
  const fallbackTextParserUsed =
    scriptRowSources > 0 ||
    objectBodies.length > 0 ||
    (otEx != null && (otEx.taskTrips.length > 0 || otEx.textTrips.length > 0));

  if (trips.length === 0) {
    if (!html.includes("TAry") && !html.includes("QAry")) markersMissing.push("TAry/QAry_script_arrays");
    if (!/\bJ[A-Z0-9]{3,5}/i.test(html)) markersMissing.push("pairing_token_J####");
  }

  const firstBlock =
    openTimeTaryExtractDebug?.firstAcceptedTaskRawBlock?.slice(0, 500) ||
    (objectBodies[0] && objectBodies[0]!.slice(0, 500)) ||
    (aryNew[0] && aryNew[0]!.join(" | ")) ||
    (aryBracket[0] && aryBracket[0]!.join(" | ")) ||
    trips[0]?.routeSummary ||
    trips[0]?.pairingId ||
    "";

  return {
    trips: (() => {
      const enriched = enrichOpenTimeTripsWithPairingDetailUrlsFromHtml(html, trips);
      logOpenTimeMapDiagnostics(enriched, "fallback_html_script");
      return enriched;
    })(),
    meta: {
      htmlLength: htmlLen,
      rawRowsCount: rawRows,
      fallbackTextParserUsed,
      extractedPostCount: 0,
      extractedTripCount: trips.length,
      firstExtractedRawBlock: firstBlock.slice(0, 400),
      markersFound,
      markersMissing,
      openTimeTaryExtractDebug,
    },
  };
}

/** Tradeboard pairing: optional `:` / `&#58;` / `&#x3A;` / `&colon;` and whitespace between J-id and date (capturing). */
const FLEX_PAIRING_RE = /\b(J[A-Z0-9]{3,5})\s*(?::|&#58;|&#x3A;|&colon;)?\s*(\d{1,2}[A-Z]{3})\b/gi;

const TRADEBOARD_KNOWN_PAIRING_IDS_FOR_PROBE = [
  "J3306",
  "J3932",
  "J3A28",
  "J3B21",
  "J3D53",
  "J3C69",
  "J4148",
  "J3141",
  "J3445",
] as const;

const TRADEBOARD_DATE_PROBE = "13MAY";

function stripZeroWidthAndBom(s: string): string {
  return String(s ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Decode entities, strip ZW/BOM, turn tags into spaces (pairing id/date may be split across tags),
 * then normalize flexible colon spacing between J-id and date token.
 */
function tradeboardPrepareFullHtmlForFlexPairingWithStats(raw: string): { prepared: string; flexHitCount: number } {
  let s = stripScripts(String(raw ?? ""));
  s = decodeHtmlEntitiesTradeboard(s);
  s = stripZeroWidthAndBom(s);
  s = s.replace(/<\/?[a-zA-Z][^>]{0,1200}?>/g, " ");
  s = decodeHtmlEntitiesTradeboard(s);
  s = collapseWs(s);
  const flexHitCount = [...s.matchAll(new RegExp(FLEX_PAIRING_RE.source, "gi"))].length;
  const prepared = s.replace(
    /\b(J[A-Z0-9]{3,5})\s*:\s*(\d{1,2}[A-Z]{3})\b/gi,
    (_, a, b) => `${String(a).toUpperCase()}:${String(b).toUpperCase()}`,
  );
  return { prepared, flexHitCount };
}

export function tradeboardPrepareFullHtmlForFlexPairing(raw: string): string {
  return tradeboardPrepareFullHtmlForFlexPairingWithStats(raw).prepared;
}

function tradeboardFlexPairingMatchCountOnString(s: string): number {
  return [...String(s ?? "").matchAll(new RegExp(FLEX_PAIRING_RE.source, "gi"))].length;
}

function lineContainsFlexOrStrictPairingToken(line: string): boolean {
  const t = collapseWs(String(line ?? ""));
  if (/\bJ[A-Z0-9]{3,5}\s*:\s*\d{1,2}[A-Z]{3}\b/i.test(t)) return true;
  return new RegExp(FLEX_PAIRING_RE.source, "i").test(t);
}

function runTradeboardKnownTokenProbes(rawHtml: string): TradeboardKnownTokenProbeResult[] {
  const src = String(rawHtml ?? "");
  const out: TradeboardKnownTokenProbeResult[] = [];
  const logOne = (pairingId: string, idIndex: number, dateIndex: number, colonIndexNearby: number, rawContextAroundId: string) => {
    const row: TradeboardKnownTokenProbeResult = {
      pairingId,
      idIndex,
      dateIndex,
      colonIndexNearby,
      rawContextAroundId,
    };
    out.push(row);
    console.log("[FLICA_TRADEBOARD_KNOWN_TOKEN_PROBE]", row);
  };

  for (const pairingId of TRADEBOARD_KNOWN_PAIRING_IDS_FOR_PROBE) {
    const esc = pairingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idRe = new RegExp(esc, "i");
    const idM = idRe.exec(src);
    const idIndex = idM?.index ?? -1;
    let dateIndex = -1;
    let colonIndexNearby = -1;
    let rawContextAroundId = "";
    if (idIndex >= 0) {
      const winStart = Math.max(0, idIndex - 500);
      const winEnd = Math.min(src.length, idIndex + 500);
      const win = src.slice(winStart, winEnd);
      const dateRe = /\b13MAY\b/i;
      const dm = dateRe.exec(win);
      dateIndex = dm ? winStart + dm.index : -1;
      const sliceAroundColon = src.slice(Math.max(0, idIndex - 80), Math.min(src.length, idIndex + pairingId.length + 80));
      const colonM = sliceAroundColon.match(/:|<|&#58;|&#x3A;|&colon;/i);
      colonIndexNearby = colonM ? Math.max(0, idIndex - 80) + (colonM.index ?? 0) : -1;
      rawContextAroundId = src.slice(winStart, winEnd);
    }
    logOne(pairingId, idIndex, dateIndex, colonIndexNearby, rawContextAroundId);
  }

  {
    const pairingId = TRADEBOARD_DATE_PROBE;
    const idIndex = src.search(/\b13MAY\b/i);
    let dateIndex = idIndex;
    let colonIndexNearby = -1;
    let rawContextAroundId = "";
    if (idIndex >= 0) {
      const winStart = Math.max(0, idIndex - 500);
      const winEnd = Math.min(src.length, idIndex + 500);
      rawContextAroundId = src.slice(winStart, winEnd);
      const sliceBefore = src.slice(Math.max(0, idIndex - 120), idIndex);
      const colonM = sliceBefore.match(/:|<|&#58;|&#x3A;|&colon;/gi);
      if (colonM && colonM.length) {
        const last = colonM[colonM.length - 1]!;
        colonIndexNearby = idIndex - 120 + sliceBefore.lastIndexOf(last);
      }
    }
    logOne(pairingId, idIndex, dateIndex, colonIndexNearby, rawContextAroundId);
  }

  return out;
}

function tradeboardTdInnerToPlain(html: string): string {
  let s = String(html ?? "");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]{0,800}?>/g, " ");
  s = decodeHtmlEntitiesTradeboard(s);
  s = stripZeroWidthAndBom(s);
  return collapseWs(s);
}

/**
 * All Requests: each `<tr>` that looks like a data row → pipe-separated cell texts (Safari column order).
 */
function extractAllRequestsTableRowsAsPipeLines(html: string): string[] {
  const src = stripScripts(String(html ?? ""));
  const lines: string[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(src)) !== null) {
    const inner = m[1] ?? "";
    const u = inner.toUpperCase();
    if (/PAIRING\s+DETAILS|RESPONSE\s+METHODS|TYPE\s+.*\s+TRIP/i.test(u) && inner.length < 500) continue;
    if (!/Add\s+to\s+Favorites/i.test(inner) && !/\bJ[A-Z0-9]{3,5}\b/i.test(inner)) continue;

    const cells: string[] = [];
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tdRe.exec(inner)) !== null) {
      cells.push(tradeboardTdInnerToPlain(tm[1] ?? ""));
    }
    if (cells.length < 4) continue;
    const pipe = cells.map((c) => c.replace(/\s*\|\s*/g, " ").trim()).join(" | ");
    if (pipe.length < 28) continue;
    if (!lineContainsFlexOrStrictPairingToken(pipe)) continue;
    lines.push(pipe);
  }
  return lines;
}

const POSTED_EDT_COMPACT =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\s+\d{2}:\d{2}:\d{2}\s+EDT\b/i;

const TB_MARKER_DEFS: { id: string; re: RegExp }[] = [
  { id: "TradeBoard", re: /\bTradeBoard\b/i },
  { id: "Trades_btwn_Crewmembers", re: /Trades\s+btwn\s+Crewmembers/i },
  { id: "All_Requests", re: /\bAll\s+Requests\b/i },
  { id: "Add_to_Favorites", re: /Add\s+to\s+Favorites/i },
  { id: "Pickup_Trip", re: /Pickup\s+Trip/i },
  { id: "Propose_Trade", re: /Propose\s+Trade/i },
];

function collectTradeboardMarkers(html: string): string[] {
  const src = String(html ?? "");
  const found: string[] = [];
  for (const { id, re } of TB_MARKER_DEFS) {
    if (re.test(src)) found.push(id);
  }
  return found;
}

function tradeboardPageLooksLikeTradeboard(html: string): boolean {
  const m = collectTradeboardMarkers(html);
  return m.length >= 2 || /\bTradeBoard\b/i.test(String(html ?? ""));
}

function tradeboardAllRequestsDetected(html: string, sourcePageType: TradeboardSourcePageType): boolean {
  return sourcePageType === "all_requests" || /\bAll\s+Requests\b/i.test(String(html ?? ""));
}

function tradeboardBuildOccurrenceContexts(html: string, max: number): { index: number; window: string }[] {
  const src = String(html ?? "");
  const needles = ["TradeBoard", "All Requests", "Trades btwn Crewmembers"];
  const out: { index: number; window: string }[] = [];
  for (const n of needles) {
    let i = 0;
    while (out.length < max) {
      const j = src.indexOf(n, i);
      if (j < 0) break;
      out.push({
        index: j,
        window: src.slice(Math.max(0, j - 400), Math.min(src.length, j + 600)),
      });
      i = j + n.length;
    }
  }
  return out.slice(0, max);
}

function tradeboardRawSliceToPlain(slice: string): string {
  return collapseWs(
    decodeHtmlEntitiesTradeboard(
      String(slice ?? "")
        .replace(/<br\s*\/?>/gi, "|ROWSEP|")
        .replace(/<\/(?:td|th|tr|div|p)\s*>/gi, "|ROWSEP|")
        .replace(/<[^>]+>/g, " "),
    ).replace(/\s*\|ROWSEP\|\s*/g, " "),
  );
}

function tradeboardHtmlTableRowLines(html: string): string[] {
  const src = stripScripts(String(html ?? ""));
  const rows: string[] = [];
  let i = 0;
  while (i < src.length) {
    const a = src.indexOf("<tr", i);
    if (a < 0) break;
    const b = src.indexOf("</tr>", a);
    if (b < 0) break;
    const chunk = src.slice(a, b + 5);
    const line = tradeboardRawSliceToPlain(chunk);
    if (line.length > 24) rows.push(line);
    i = b + 5;
  }
  return rows;
}

function tradeboardPairingWindowsFromRawHtml(html: string): string[] {
  const prep = tradeboardPrepareFullHtmlForFlexPairing(html);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of prep.matchAll(new RegExp(FLEX_PAIRING_RE.source, "gi"))) {
    const key = `${String(m[1]).toUpperCase()}:${String(m[2]).toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = Math.max(0, (m.index ?? 0) - 380);
    const end = Math.min(prep.length, (m.index ?? 0) + 1900);
    out.push(collapseWs(prep.slice(start, end)));
  }
  return out;
}

function tradeboardPairingWindowsFromPlainText(plain: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of plain.matchAll(new RegExp(FLEX_PAIRING_RE.source, "gi"))) {
    const key = `${String(m[1]).toUpperCase()}:${String(m[2]).toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = Math.max(0, (m.index ?? 0) - 280);
    const end = Math.min(plain.length, (m.index ?? 0) + 900);
    out.push(collapseWs(plain.slice(start, end)));
  }
  return out;
}

function unwrapScriptBodiesToPlainText(html: string): string {
  return String(html ?? "").replace(/<script[\s\S]*?<\/script>/gi, (block) => {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    const flat = collapseWs(decodeHtmlEntitiesTradeboard(inner.replace(/<[^>]+>/g, " ")));
    return ` |ROWSEP| ${flat} |ROWSEP| `;
  });
}

function tradeboardNormalizeHtmlToText(htmlFrag: string): string {
  let s = String(htmlFrag ?? "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "|ROWSEP|");
  s = s.replace(/<\/(?:td|th|tr|div|p)\s*>/gi, "|ROWSEP|");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntitiesTradeboard(s);
  s = s.replace(/\s*\|ROWSEP\|\s*/g, "\n");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]+\n/g, "\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function tradeboardPairingMatchCount(norm: string): number {
  return tradeboardFlexPairingMatchCountOnString(norm);
}

function tradeboardBuildNormalizedFromPageHtml(pageHtml: string): {
  normalized: string;
  normalizedScriptStrippedPreferred: boolean;
} {
  const raw = String(pageHtml ?? "");
  const stripped = stripScripts(raw);
  const normStrip = tradeboardNormalizeHtmlToText(stripped);
  const normUnwrap = tradeboardNormalizeHtmlToText(unwrapScriptBodiesToPlainText(raw));
  const cStrip = tradeboardPairingMatchCount(normStrip);
  const cUnwrap = tradeboardPairingMatchCount(normUnwrap);
  const normalizedScriptStrippedPreferred = cStrip >= cUnwrap;
  return {
    normalized: normalizedScriptStrippedPreferred ? normStrip : normUnwrap,
    normalizedScriptStrippedPreferred,
  };
}

function tradeboardFirst20PairingContexts(norm: string): { index: number; window: string }[] {
  const out: { index: number; window: string }[] = [];
  for (const m of norm.matchAll(new RegExp(FLEX_PAIRING_RE.source, "gi"))) {
    if (out.length >= 20) break;
    const i = m.index ?? 0;
    out.push({
      index: i,
      window: norm.slice(Math.max(0, i - 350), Math.min(norm.length, i + 350)),
    });
  }
  return out;
}

function findLastRequestTypeIndex(norm: string, beforeIdx: number, maxBack: number): number {
  const start = Math.max(0, beforeIdx - maxBack);
  const slice = norm.slice(start, beforeIdx);
  const re = /\b(?:Trade\s*\/\s*Drop|Trade-Drop|Trade\s+Drop|Drop|Trade|Pickup)\b/gi;
  let last = -1;
  let x: RegExpExecArray | null;
  while ((x = re.exec(slice)) !== null) last = start + x.index;
  return last;
}

function tradeboardCandidateHasRowContext(block: string, sourcePageType: TradeboardSourcePageType): boolean {
  const hasPair =
    /\bJ[A-Z0-9]{3,5}\s*:\s*\d{1,2}[A-Z]{3}\b/i.test(block) ||
    new RegExp(FLEX_PAIRING_RE.source, "i").test(block);
  if (!hasPair) return false;
  const hasAction = /Pickup\s+Trip|Propose\s+Trade|Add\s+to\s+Favorites/i.test(block);
  const hasEmail = /\bEmail\s*:/i.test(block);
  const hasPhone = /\bPhone\b/i.test(block);
  const hasPoster =
    /\([0-9]{4,6}\)/.test(block) &&
    /\b[A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+)+\s*\(\s*\d{4,6}\s*\)/.test(block);
  const hasTs = POSTED_EDT_COMPACT.test(block);
  if (sourcePageType === "my_requests") return hasTs || hasEmail || hasPhone || hasPoster;
  return hasAction || hasTs || hasEmail || hasPhone || hasPoster;
}

function sliceTradeboardRowBlocksFromNormalized(
  norm: string,
  sourcePageType: TradeboardSourcePageType,
): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();
  const flexG = new RegExp(FLEX_PAIRING_RE.source, "gi");
  for (const m of norm.matchAll(flexG)) {
    const idx = m.index ?? 0;
    const tokenLen = (m[0] ?? "").length;
    const pairEnd = idx + tokenLen;
    const ts = findLastRequestTypeIndex(norm, idx, 250);
    const rowStart = ts >= 0 ? ts : Math.max(0, idx - 60);
    const tail = norm.slice(pairEnd);
    const minGap = 36;
    const tailPast = tail.slice(minGap);
    let nextPair = 10_000;
    const nm = tailPast.match(new RegExp(FLEX_PAIRING_RE.source, "i"));
    if (nm && nm.index != null) nextPair = minGap + nm.index;

    let nextTypePair = 10_000;
    const ntp = tailPast.search(
      /\b(?:Trade\s*\/\s*Drop|Trade-Drop|Trade\s+Drop|Drop|Trade|Pickup)\s+J[A-Z0-9]{3,5}\s*(?::|&#58;|&#x3A;)?\s*\d{1,2}[A-Z]{3}\b/i,
    );
    if (ntp >= 0) nextTypePair = minGap + ntp;

    const sepA = tail.indexOf("|ROWSEP|");
    const sepB = tail.search(/\n\s*\n/);
    const sepCand = [sepA >= minGap ? sepA : 10_000, sepB >= minGap ? sepB : 10_000].reduce((a, b) =>
      Math.min(a, b),
    );

    let endRel = Math.min(900, Math.min(nextPair, nextTypePair, sepCand));
    if (!Number.isFinite(endRel) || endRel < minGap) endRel = 720;
    if (endRel < 420) endRel = 560;
    const block = norm.slice(rowStart, pairEnd + endRel).trim();
    if (!tradeboardCandidateHasRowContext(block, sourcePageType)) continue;
    const key = `${String(m[1]).toUpperCase()}:${String(m[2]).toUpperCase()}@${rowStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(block);
  }
  return blocks;
}

function splitLayoverAndComments(prePoster: string): { layover: string; comments: string } {
  const parts = prePoster
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lay: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const tok = parts[i]!;
    if (
      /^[A-Z]{3}$/.test(tok) ||
      /^[A-Z]\d$/i.test(tok) ||
      /^F\d+$/i.test(tok) ||
      /^[A-Z]{2}\d$/i.test(tok)
    ) {
      lay.push(tok);
      i++;
      continue;
    }
    break;
  }
  return { layover: lay.join(" "), comments: parts.slice(i).join(" ").trim() };
}

function buildTradeboardResponseLabelFromLine(line: string): string {
  const parts: string[] = [];
  if (/\bpropose\s+trade\b/i.test(line)) parts.push("Propose Trade");
  if (/\bpickup\s+trip\b/i.test(line) || /\bpick\s*up\b/i.test(line)) parts.push("Pickup Trip");
  const email = line.match(/\b[^\s@]+@[^\s@]+\.[^\s]+\b/);
  if (email) parts.push(email[0]!);
  const phone = line.match(/\b(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
  if (phone) parts.push(phone[0]!.replace(/\s+/g, ""));
  return parts.join(" · ");
}

function tradeboardLineIsPairingTokenOnly(line: string): boolean {
  const t = collapseWs(line);
  if (!lineContainsFlexOrStrictPairingToken(t)) return false;
  if (/\d{1,2}:\d{2}/.test(t)) return false;
  if (/^(?:Drop|Trade\/Drop|Trade|Pickup)\s+J[A-Z0-9]{3,5}\s*:\s*\d{1,2}[A-Z]{3}$/i.test(t)) return true;
  if (/^J[A-Z0-9]{3,5}\s*:\s*\d{1,2}[A-Z]{3}$/i.test(t)) return true;
  return false;
}

/**
 * After the base/position/seat/days prefix, FLICA rows may interleave airport tokens
 * before the first clock time. Consume successive `HH:MM` tokens, skipping other tokens.
 */
function extractCompactRowScheduleTimes(rest: string): { times: string[]; remainder: string } {
  const times: string[] = [];
  let scan = rest.trim();
  let guard = 0;
  while (guard++ < 80 && scan.length > 0 && times.length < 8) {
    const tm = scan.match(/^(\d{1,2}:\d{2})\b/);
    if (tm) {
      times.push(tm[1]!);
      scan = scan.slice(tm[0]!.length).trim();
      continue;
    }
    const skip = scan.match(/^(\S+)/);
    if (!skip) break;
    scan = scan.slice(skip[0]!.length).trim();
  }
  return { times, remainder: scan };
}

function mergeCompactPostWithMapperRow(compact: TradeboardPost, m: TradeboardPost): TradeboardPost {
  const pick = (a: string, b: string) => (a?.trim() ? a.trim() : b?.trim() ? b.trim() : "");
  return {
    ...compact,
    reportTime: pick(compact.reportTime, m.reportTime),
    departTime: pick(compact.departTime, m.departTime),
    arriveTime: pick(compact.arriveTime, m.arriveTime),
    block: pick(compact.block, m.block),
    credit: pick(compact.credit, m.credit),
    comments: pick(compact.comments, m.comments),
    pairingDetailUrl: compact.pairingDetailUrl?.trim() || m.pairingDetailUrl?.trim() || undefined,
  };
}

function parseCompactTradeboardRowBlock(
  block: string,
  sourcePageType: TradeboardSourcePageType,
  sourceUrl: string,
): TradeboardPost | null {
  let line = collapseWs(block.replace(/\|ROWSEP\|/g, " ").replace(/\n+/g, " "));
  line = tradeboardPrepareFullHtmlForFlexPairing(line);
  if (line.length < 40) return null;

  const flex = line.match(
    /\b(Drop|Trade\s*\/\s*Drop|Trade|Pickup)\s+(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i,
  );
  if (flex == null || flex.index == null) return null;
  line = line.slice(flex.index).trim();
  const lead = line.match(
    /^(Drop|Trade\s*\/\s*Drop|Trade|Pickup)\s+(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i,
  );
  if (!lead) return null;

  const pairingId = lead[2]!.toUpperCase();
  const pairingDateLabel = lead[3]!.toUpperCase();
  let rest = line.slice(lead[0].length).trim();

  const bp = rest.match(/^([A-Z]{3})\s+(FA|CA|FO|SC|FD)\s+(\S)\s+(\d{1,2})\s+/i);
  if (!bp) return null;
  const base = bp[1]!.toUpperCase();
  const position = bp[2]!.toUpperCase();
  const days = bp[4]!;
  rest = rest.slice(bp[0].length).trim();

  const { times, remainder } = extractCompactRowScheduleTimes(rest);
  rest = remainder;
  if (times.length < 3) return null;
  const reportTime = times[0] ?? "";
  const departTime = times[1] ?? "";
  const arriveTime = times[2] ?? "";
  const blockTime = times[3] ?? "";
  const credit = times[4] ?? "";

  const postM = line.match(POSTED_EDT_COMPACT);
  const postedAtLabel = postM ? String(postM[0]).trim() : "";

  let posterName = "";
  const posterMatchesRest = [
    ...rest.matchAll(/\b([A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+)+)\s*\(\s*(\d{4,6})\s*\)/g),
  ];
  const posterMatch = posterMatchesRest.length ? posterMatchesRest[posterMatchesRest.length - 1]! : null;
  if (posterMatch) {
    posterName = posterMatch[1]!.replace(/\s+/g, " ").trim();
  }

  let prePoster = rest;
  if (posterMatch && typeof posterMatch.index === "number") {
    prePoster = rest.slice(0, posterMatch.index).trim();
  }
  const { layover, comments: splitComments } = splitLayoverAndComments(prePoster);
  const comments = tradeboardSanitizeDisplayComment(splitComments);

  const type = detectTradeboardType(`${lead[1]} ${line}`);
  const routeSummary = layover ? `${base} · ${layover}` : `${pairingId}:${pairingDateLabel} · ${base}`;
  const worthM = line.match(/\$\s*[\d,]{2,12}/);
  const worth = worthM?.[0] ? worthM[0] : null;
  const responseMethodLabel = buildTradeboardResponseLabelFromLine(line);
  const canProposeTrade = /\bpropose\s+trade\b/i.test(line);
  const canPickup = /\bpickup\s+trip\b/i.test(line) || /\bpickup\b/i.test(line);

  const rawCells = line.split(/\s+/).filter(Boolean).slice(0, 48);
  const id = djb2Hex([sourcePageType, pairingId, pairingDateLabel, posterName, type, line.slice(0, 240)]);
  const oc = parseFlicaPairOnclick(line);
  const pairingDetailUrl = oc ? buildTradeboardPairingDetailUrl(oc.pid, oc.dateYmd) : undefined;

  return {
    id: `tb-${id}`,
    type,
    typeLabel: tradeboardTypeLongLabel(type),
    posterName,
    pairingId,
    pairingDateLabel,
    routeSummary,
    base,
    position,
    date: pairingDateLabel,
    days,
    reportTime,
    departTime,
    arriveTime,
    block: blockTime,
    credit,
    worth,
    layover,
    comments,
    responseMethods: responseMethodLabel,
    responseMethodLabel,
    postedAt: postedAtLabel,
    postedAtLabel,
    canPickup,
    canProposeTrade,
    matchScore: null,
    legalCompatibility: /\blegal\b/i.test(line) ? true : null,
    sourceUrl,
    rawCells,
    rawText: line,
    offerCount: null,
    pairingDetailUrl,
  };
}

function rejectTradeboardRowCandidate(t: string): string | null {
  if (t.length < 32) return "too_short";
  if (/DISPLAY\s+OPTIONS/i.test(t)) return "display_options";
  if (/\bPAIRING\s+DETAILS\b/i.test(t) && /\bRESPONSE\s+METHODS\b/i.test(t)) return "column_header_row";
  if (!lineContainsFlexOrStrictPairingToken(t)) return "no_pairing_token";
  const u = t.toUpperCase();
  if (/^TYPE(\s+|$)/i.test(t.trim()) && u.includes("TRIP") && u.includes("BASE") && t.length < 120) {
    return "type_trip_header";
  }
  if (/\bNEXT\s+50\b|\bPREV\s+50\b|\bPAGE\s+\d+\b/i.test(u)) return "pagination_controls";
  if (/\bCOPYRIGHT\b|\bTerms\s+of\s+Use\b/i.test(u)) return "footer";
  return null;
}

/** FLICA `new A(...)` placeholders: bare S, lowercase d, false, empty — not type code `D`. */
function tradeboardBlankPlaceholderArg(raw: string): string {
  let s = normalizeTaskArg(raw).trim();
  const u = s.toUpperCase();
  if (s === "" || u === "S" || s === "d" || u === "FALSE") return "";
  return collapseWs(s);
}

function tradeboardTryDecodeURIComponent(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t.replace(/\+/g, "%20"));
  } catch {
    return t;
  }
}

function tradeboardMapRequestCodeToPostType(code: string): TradeboardPostType {
  switch (normalizeTaskArg(code).trim().toUpperCase()) {
    case "D":
      return "drop";
    case "X":
      return "trade_drop";
    case "T":
      return "trade";
    case "G":
      return "pickup";
    case "R":
      return "unknown";
    default:
      return "unknown";
  }
}

function tradeboardFormatEmployeeNumber(raw: string): string {
  const t = tradeboardBlankPlaceholderArg(raw);
  const m = t.match(/^\(\s*(\d+)\s*\)$/);
  if (m) return m[1]!;
  return t.replace(/[()]/g, "").trim();
}

function tradeboardResponseMethodLineFromType(type: TradeboardPostType): string {
  const parts: string[] = [];
  if (type === "pickup" || type === "drop" || type === "trade_drop") {
    parts.push("Pickup Trip");
  }
  if (type === "trade" || type === "trade_drop" || type === "drop" || type === "swap") {
    parts.push("Propose Trade");
  }
  return parts.join(" | ");
}

function extractTradeboardNewAInners(pageHtml: string): string[] {
  const src = String(pageHtml ?? "");
  const re = /\br\[\d+\]\s*=\s*new\s+A\s*\(/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const full = m[0] ?? "";
    const openIdx = m.index + full.length - 1;
    if (src[openIdx] !== "(") continue;
    const inner = sliceBalancedParenInner(src, openIdx);
    if (inner != null && inner.length > 12) out.push(inner);
  }
  return out;
}

function tradeboardBuildPostFromNewAArgs(
  args: string[],
  sourceUrl: string,
  rawInnerPreview: string,
): TradeboardPost | null {
  if (args.length < 28) return null;
  const g = (i: number) => (i < args.length ? args[i]! : "");
  const pairingId = tradeboardBlankPlaceholderArg(g(5)).toUpperCase();
  const dateLabel = tradeboardBlankPlaceholderArg(g(7)).toUpperCase();
  if (!/^J[A-Z0-9]{3,5}$/i.test(pairingId)) return null;
  if (!/^\d{1,2}[A-Z]{3}$/i.test(dateLabel)) return null;

  const codeRaw = normalizeTaskArg(g(4)).trim().toUpperCase();
  const type = tradeboardMapRequestCodeToPostType(codeRaw);
  let typeLabel = tradeboardTypeLongLabel(type);
  if (codeRaw === "R") typeLabel = "Reserve / Other";

  const first = tradeboardBlankPlaceholderArg(g(12));
  const last = tradeboardBlankPlaceholderArg(g(13));
  const posterName = collapseWs(`${first} ${last}`).trim() || "—";

  let comments = tradeboardTryDecodeURIComponent(tradeboardBlankPlaceholderArg(g(14)));
  comments = collapseWs(comments);
  if (!comments || /^[\s_\-]+$/i.test(comments)) comments = "";

  let layover = collapseWs(tradeboardBlankPlaceholderArg(g(24)).replace(/&nbsp;/gi, " "));
  if (layover === "_" || layover.toUpperCase() === "NBSP") layover = "";

  const base = tradeboardBlankPlaceholderArg(g(27)).toUpperCase();
  const position = tradeboardBlankPlaceholderArg(g(29)).toUpperCase();
  let seat = "_";
  if (args.length > 37) {
    const sv = tradeboardBlankPlaceholderArg(g(37));
    seat = sv === "" ? "_" : sv;
  }
  const emp = tradeboardFormatEmployeeNumber(g(30));
  const postedAtLabel = tradeboardBlankPlaceholderArg(g(16));
  const reportTime = tradeboardBlankPlaceholderArg(g(20));
  const days = tradeboardBlankPlaceholderArg(g(21));
  const block = tradeboardBlankPlaceholderArg(g(22));
  const credit = tradeboardBlankPlaceholderArg(g(23));
  const departTime = tradeboardBlankPlaceholderArg(g(25));
  const arriveTime = tradeboardBlankPlaceholderArg(g(26));

  const routeSummary = `${pairingId}:${dateLabel}`;
  const canPickup = type === "pickup" || type === "drop" || type === "trade_drop";
  const canProposeTrade = type === "trade" || type === "trade_drop" || type === "drop" || type === "swap";
  const responseMethodLabel = tradeboardResponseMethodLineFromType(type);

  let worth: string | null = null;
  for (let i = 34; i < args.length; i++) {
    const x = tradeboardBlankPlaceholderArg(args[i]!);
    const wm = x.match(/\$\s*[\d,]+(?:\.\d{2})?/);
    if (wm) {
      worth = wm[0]!.replace(/\s/g, "");
      break;
    }
  }

  const rawCells = args
    .slice(0, Math.min(args.length, 42))
    .map((a) => tradeboardBlankPlaceholderArg(a).slice(0, 96));
  if (emp) rawCells.push(`employeeNumber=${emp}`);
  rawCells.push(`seat=${seat}`);
  const rawText = rawInnerPreview.slice(0, 520);
  const id = djb2Hex(["tb-a", pairingId, dateLabel, codeRaw, posterName, type, rawText.slice(0, 160)]);
  const oc = parseFlicaPairOnclick(rawInnerPreview);
  const pairingDetailUrl = oc ? buildTradeboardPairingDetailUrl(oc.pid, oc.dateYmd) : undefined;

  return {
    id: `tb-${id}`,
    type,
    typeLabel,
    posterName,
    pairingId,
    pairingDateLabel: dateLabel,
    routeSummary,
    base,
    position,
    date: dateLabel,
    days,
    reportTime,
    departTime,
    arriveTime,
    block,
    credit,
    worth,
    layover,
    comments,
    responseMethods: responseMethodLabel,
    responseMethodLabel,
    postedAt: postedAtLabel,
    postedAtLabel,
    canPickup,
    canProposeTrade,
    matchScore: null,
    legalCompatibility: /\blegal\b/i.test(rawText) ? true : null,
    sourceUrl,
    rawCells,
    rawText,
    offerCount: null,
    pairingDetailUrl,
  };
}

function parseTradeboardAllRequestsFromNewARecords(
  pageHtml: string,
  sourceUrl: string,
): {
  posts: TradeboardPost[];
  bodiesFound: number;
  postsAccepted: number;
  first5Diagnostics: NonNullable<TradeboardExtractDebug["allRequestsARecordFirst5ArgDiagnostics"]>;
} {
  const inners = extractTradeboardNewAInners(pageHtml);
  const posts: TradeboardPost[] = [];
  const first5Diagnostics: NonNullable<TradeboardExtractDebug["allRequestsARecordFirst5ArgDiagnostics"]> =
    [];

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FLICA_TRADEBOARD_A_RECORD_COUNT]", inners.length);
  }

  inners.forEach((inner, idx) => {
    const args = splitJsCallArgs(inner);
    if (idx < 5) {
      const argsHeadPreview = args.slice(0, 22).map((a) => tradeboardBlankPlaceholderArg(a).slice(0, 48));
      const row = {
        recordIndex: idx,
        argCount: args.length,
        arg0: tradeboardBlankPlaceholderArg(args[0] ?? "").slice(0, 24),
        arg4: tradeboardBlankPlaceholderArg(args[4] ?? "").slice(0, 8),
        arg5: tradeboardBlankPlaceholderArg(args[5] ?? "").slice(0, 16),
        arg7: tradeboardBlankPlaceholderArg(args[7] ?? "").slice(0, 16),
        arg12: tradeboardBlankPlaceholderArg(args[12] ?? "").slice(0, 16),
        arg13: tradeboardBlankPlaceholderArg(args[13] ?? "").slice(0, 20),
        arg16: tradeboardBlankPlaceholderArg(args[16] ?? "").slice(0, 40),
        argsHeadPreview,
      };
      first5Diagnostics.push(row);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_A_RECORD_ARGS]", row);
      }
    }
    const p = tradeboardBuildPostFromNewAArgs(args, sourceUrl, inner);
    if (p) {
      posts.push(p);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_A_ROW]", {
          pairingDisplay: `${p.pairingId}:${p.pairingDateLabel}`,
          type: p.type,
          days: p.days,
          reportTime: p.reportTime,
          departTime: p.departTime,
          arriveTime: p.arriveTime,
          block: p.block,
          credit: p.credit,
          layover: p.layover,
          posterName: p.posterName,
          postedAtLabel: p.postedAtLabel,
        });
      }
    }
  });

  return { posts, bodiesFound: inners.length, postsAccepted: posts.length, first5Diagnostics };
}

function tradeboardBuildJsProbe(html: string): TradeboardJsProbeDebug {
  const src = String(html ?? "");
  const arrPatterns = [
    { pattern: "QAry[", re: /\bQAry\s*\[/gi },
    { pattern: "TAry[", re: /\bTAry\s*\[/gi },
    { pattern: "ReqAry[", re: /\bReqAry\s*\[/gi },
    { pattern: "new Array(", re: /\bnew\s+Array\s*\(/gi },
    { pattern: "new Task(", re: /\bnew\s+Task\s*\(/gi },
  ];
  const constructors = [...src.matchAll(/\bnew\s+[A-Za-z][A-Za-z0-9_]*\s*\(/g)];
  const nearTb = constructors
    .map((m) => ({ idx: m.index ?? 0, text: (m[0] ?? "").slice(0, 40) }))
    .filter(({ idx }) => {
      const w = src.slice(Math.max(0, idx - 280), Math.min(src.length, idx + 280));
      return /TradeBoard|Trades\s+btwn|All\s+Requests|QAry|Pickup\s+Trip|Propose\s+Trade|Requests/i.test(
        w,
      );
    })
    .slice(0, 10)
    .map((x) => `${x.text} @${x.idx}`);
  const prep = tradeboardPrepareFullHtmlForFlexPairing(src);
  const pairingIdx = allRegexMatchIndexes(prep, new RegExp(FLEX_PAIRING_RE.source, "gi")).slice(0, 24);
  const pairingOccurrenceContexts = pairingIdx.slice(0, 8).map((index) => ({
    index,
    window: prep.slice(Math.max(0, index - 100), Math.min(prep.length, index + 380)),
  }));
  return {
    constructorCount: constructors.length,
    first10ConstructorMatches: nearTb,
    arrayAssignmentPatterns: arrPatterns.map(({ pattern, re }) => ({
      pattern,
      matchCount: countRegexMatches(src, re),
    })),
    pairingOccurrenceContexts,
  };
}

function extractTradeboardPostsFromPageHtml(
  html: string,
  r: Pick<FlicaActionsFetchResult, "htmlLength" | "bodyPreview" | "nativeParse" | "pageHtml" | "title">,
  sourcePageType: TradeboardSourcePageType,
  sourceUrl: string,
): { posts: TradeboardPost[]; debug: TradeboardExtractDebug } {
  const pageHtml = String(r.pageHtml ?? html ?? "");
  const htmlLen = Number(r.htmlLength ?? pageHtml.length ?? 0);
  const pageTitle = ((r.nativeParse?.pageTitle ?? r.title ?? null) as string | null) ?? null;
  const markerList = collectTradeboardMarkers(pageHtml);
  const allRequestsDetected = tradeboardAllRequestsDetected(pageHtml, sourcePageType);
  const tradeboardOccurrenceContexts = tradeboardBuildOccurrenceContexts(pageHtml, 8);
  const jsProbe = tradeboardBuildJsProbe(pageHtml);
  let allRequestsARecordBodiesFound = 0;
  let allRequestsARecordPostsCount = 0;
  let allRequestsARecordFirst5ArgDiagnostics: NonNullable<
    TradeboardExtractDebug["allRequestsARecordFirst5ArgDiagnostics"]
  > = [];

  const prepStats = tradeboardPrepareFullHtmlForFlexPairingWithStats(pageHtml);
  const knownTokenProbes =
    sourcePageType === "all_requests" ? runTradeboardKnownTokenProbes(pageHtml) : [];

  const pairingBoundaryStrict = /\bJ[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3}\b/i;
  const emptyFullTextDebug = {
    fullHtmlContainsPairingPattern:
      pairingBoundaryStrict.test(pageHtml) || prepStats.flexHitCount > 0,
    flexPairingMatchCountOnPreparedHtml: prepStats.flexHitCount,
    normalizedTextContainsPairingPattern: false,
    pairingMatchCount: 0,
    normalizedScriptStrippedPreferred: true,
    first20PairingPatternContexts: [] as { index: number; window: string }[],
    knownTokenProbes,
    first10AllRequestsTablePipeLines: [] as string[],
    allRequestsARecordBodiesFound: 0,
    allRequestsARecordPostsCount: 0,
    allRequestsARecordFirst5ArgDiagnostics: [] as NonNullable<
      TradeboardExtractDebug["allRequestsARecordFirst5ArgDiagnostics"]
    >,
  };

  if (!tradeboardPageLooksLikeTradeboard(pageHtml)) {
    return {
      posts: [],
      debug: {
        htmlLength: htmlLen,
        pageTitle,
        markerList,
        allRequestsDetected,
        tradeboardOccurrenceContexts,
        requestRowCandidateCount: 0,
        acceptedRowCount: 0,
        rejectedRowCount: 0,
        first10CandidateRows: [],
        firstAcceptedRawBlock: "",
        detectedExtractionMode: "not_tradeboard_page",
        tradeboardJsProbe: jsProbe,
        ...emptyFullTextDebug,
      },
    };
  }

  const fullHtmlContainsPairingPattern = emptyFullTextDebug.fullHtmlContainsPairingPattern;
  const { normalized, normalizedScriptStrippedPreferred } = tradeboardBuildNormalizedFromPageHtml(pageHtml);
  const normalizedTextContainsPairingPattern =
    pairingBoundaryStrict.test(normalized) || tradeboardFlexPairingMatchCountOnString(normalized) > 0;
  const pairingMatchCount = tradeboardPairingMatchCount(normalized);
  const first20PairingPatternContexts = tradeboardFirst20PairingContexts(normalized);
  const rowBlocks = sliceTradeboardRowBlocksFromNormalized(normalized, sourcePageType);

  const plainFullPage = fullTextFromHtml(pageHtml);
  const trLines = tradeboardHtmlTableRowLines(pageHtml);
  const winHtml = tradeboardPairingWindowsFromRawHtml(pageHtml);
  const winPlain = tradeboardPairingWindowsFromPlainText(plainFullPage);
  const legacyBlocks = extractTradeboardTextBlocks(pageHtml);

  const allReqTablePipe =
    sourcePageType === "all_requests" ? extractAllRequestsTableRowsAsPipeLines(pageHtml) : [];
  if (typeof __DEV__ !== "undefined" && __DEV__ && allReqTablePipe.length) {
    for (const row of allReqTablePipe.slice(0, 10)) {
      console.log("[FLICA_TRADEBOARD_TABLE_PIPE_ROW]", row);
    }
  }

  const orderedSources: { label: string; lines: string[] }[] =
    sourcePageType === "all_requests"
      ? [
          { label: "all_requests_table_td_pipe", lines: allReqTablePipe },
          { label: "pairing_row_block", lines: rowBlocks },
          { label: "table_tr", lines: trLines },
          { label: "pairing_window_html", lines: winHtml },
          { label: "pairing_window_plain", lines: winPlain },
          { label: "legacy_text_blocks", lines: legacyBlocks },
        ]
      : [
          { label: "pairing_row_block", lines: rowBlocks },
          { label: "table_tr", lines: trLines },
          { label: "pairing_window_html", lines: winHtml },
          { label: "pairing_window_plain", lines: winPlain },
          { label: "legacy_text_blocks", lines: legacyBlocks },
        ];

  const seenPostKey = new Set<string>();
  const posts: TradeboardPost[] = [];
  const first10CandidateRows: TradeboardRowCandidateDebug[] = [];
  let requestRowCandidateCount = 0;
  let rejectedRowCount = 0;
  let acceptedRowCount = 0;
  let firstAcceptedRawBlock = "";
  let detectedExtractionMode = "none";

  if (sourcePageType === "all_requests") {
    const ar = parseTradeboardAllRequestsFromNewARecords(pageHtml, sourceUrl);
    allRequestsARecordBodiesFound = ar.bodiesFound;
    allRequestsARecordPostsCount = ar.postsAccepted;
    allRequestsARecordFirst5ArgDiagnostics = ar.first5Diagnostics;
    requestRowCandidateCount += ar.bodiesFound;
    for (const p of ar.posts) {
      const k = `${p.pairingId}:${p.pairingDateLabel}:${p.type}`;
      if (seenPostKey.has(k)) continue;
      seenPostKey.add(k);
      posts.push(p);
      acceptedRowCount++;
      if (!firstAcceptedRawBlock) firstAcceptedRawBlock = p.rawText.slice(0, 900);
    }
    if (ar.posts.length > 0) detectedExtractionMode = "all_requests_new_a_records";
  }

  const pushCandidateRow = (row: TradeboardRowCandidateDebug): void => {
    if (first10CandidateRows.length >= 10) return;
    first10CandidateRows.push(row);
  };

  const tryCandidate = (rawLine: string, sourceLabel: string): void => {
    const line = collapseWs(rawLine);
    const rawPreviewForDev = line.slice(0, 900);
    if (!line) return;

    const rej = rejectTradeboardRowCandidate(line);
    if (rej) {
      rejectedRowCount++;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_CANDIDATE]", {
          accepted: false,
          reason: rej,
          source: sourceLabel,
          rawPreview: rawPreviewForDev.slice(0, 400),
        });
      }
      pushCandidateRow({
        textPreview: line.slice(0, 220),
        rawPreview: rawPreviewForDev,
        accepted: false,
        rejectReason: rej,
      });
      return;
    }

    if (tradeboardLineIsPairingTokenOnly(line)) {
      rejectedRowCount++;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_CANDIDATE]", {
          accepted: false,
          reason: "token_only_pairing",
          source: sourceLabel,
          rawPreview: rawPreviewForDev.slice(0, 400),
        });
      }
      pushCandidateRow({
        textPreview: line.slice(0, 220),
        rawPreview: rawPreviewForDev,
        accepted: false,
        rejectReason: "token_only_pairing",
      });
      return;
    }

    if (
      (sourceLabel === "pairing_window_plain" || sourceLabel === "legacy_text_blocks") &&
      !tradeboardCandidateHasRowContext(line, sourcePageType)
    ) {
      rejectedRowCount++;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_CANDIDATE]", {
          accepted: false,
          reason: "body_window_missing_context",
          source: sourceLabel,
          rawPreview: rawPreviewForDev.slice(0, 400),
        });
      }
      pushCandidateRow({
        textPreview: line.slice(0, 220),
        rawPreview: rawPreviewForDev,
        accepted: false,
        rejectReason: "body_window_missing_context",
      });
      return;
    }

    requestRowCandidateCount++;
    let mapped: TradeboardPost[] = [];
    let compact: TradeboardPost | null = null;
    const cells =
      sourceLabel === "all_requests_table_td_pipe"
        ? line.split(/\s*\|\s*/).map((c) => c.trim()).filter(Boolean)
        : null;
    const mapperRows: string[][] = cells ? [cells] : [[line]];
    const spaceLine = cells ? cells.join(" ") : line;
    compact = parseCompactTradeboardRowBlock(spaceLine, sourcePageType, sourceUrl);
    const fromMapper = mapTradeboardRowsToPosts(mapperRows, sourcePageType, sourceUrl);
    if (compact && fromMapper.length > 0) {
      mapped = [mergeCompactPostWithMapperRow(compact, fromMapper[0]!)];
    } else if (compact) {
      mapped = [compact];
    } else {
      mapped = fromMapper;
    }
    if (mapped.length === 0) {
      rejectedRowCount++;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_CANDIDATE]", {
          accepted: false,
          reason: "mapper_returned_0",
          source: sourceLabel,
          rawPreview: rawPreviewForDev.slice(0, 400),
        });
      }
      pushCandidateRow({
        textPreview: line.slice(0, 220),
        rawPreview: rawPreviewForDev,
        accepted: false,
        rejectReason: "mapper_returned_0",
      });
      return;
    }
    for (const p of mapped) {
      const k = `${p.pairingId}:${p.pairingDateLabel}:${p.type}`;
      if (seenPostKey.has(k)) continue;
      seenPostKey.add(k);
      posts.push(p);
      acceptedRowCount++;
      if (!firstAcceptedRawBlock) firstAcceptedRawBlock = line.slice(0, 900);
      if (detectedExtractionMode === "none") {
        if (sourceLabel === "all_requests_table_td_pipe") detectedExtractionMode = "all_requests_table_td_pipe";
        else if (sourceLabel === "pairing_row_block") detectedExtractionMode = "pairing_row_block";
        else if (sourceLabel === "table_tr") detectedExtractionMode = "table_tr";
        else if (sourceLabel.startsWith("pairing_window")) detectedExtractionMode = "body_pairing_window";
        else detectedExtractionMode = "legacy_text_block";
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[FLICA_TRADEBOARD_CANDIDATE]", {
          accepted: true,
          reason:
            compact && fromMapper.length > 0
              ? "compact_plus_mapper_schedule"
              : compact
                ? "compact_row"
                : "mapper_row",
          source: sourceLabel,
          rawPreview: rawPreviewForDev.slice(0, 400),
        });
      }
      pushCandidateRow({
        textPreview: line.slice(0, 220),
        rawPreview: rawPreviewForDev,
        accepted: true,
      });
    }
  };

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FLICA_TRADEBOARD_FULL_TEXT]", {
      fullHtmlContainsPairingPattern,
      flexPairingMatchCountOnPreparedHtml: prepStats.flexHitCount,
      normalizedTextContainsPairingPattern,
      pairingMatchCount,
      normalizedScriptStrippedPreferred,
    });
    console.log(
      "[FLICA_TRADEBOARD_CONTEXT]",
      first20PairingPatternContexts.slice(0, 10).map((c) => ({
        index: c.index,
        head: c.window.slice(0, 120),
      })),
    );
  }

  for (const { label, lines } of orderedSources) {
    const seenLine = new Set<string>();
    for (const rawLine of lines) {
      const line = collapseWs(rawLine);
      if (!line) continue;
      const shortKey = line.slice(0, Math.min(160, line.length));
      if (seenLine.has(shortKey)) continue;
      seenLine.add(shortKey);
      tryCandidate(line, label);
    }
  }

  if (posts.length === 0) {
    detectedExtractionMode =
      requestRowCandidateCount > 0 ? "failed_mapper_see_probe" : "failed_no_row_candidates_see_probe";
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[FLICA_TRADEBOARD_PARSE]", {
      mode: detectedExtractionMode,
      candidateCount: requestRowCandidateCount,
      acceptedCount: acceptedRowCount,
      rejectedCount: rejectedRowCount,
    });
    for (const p of posts.slice(0, 15)) {
      console.log("[FLICA_TRADEBOARD_ROW]", {
        pairingDisplay: `${p.pairingId}:${p.pairingDateLabel}`,
        type: p.type,
        days: p.days,
        reportTime: p.reportTime,
        departTime: p.departTime,
        arriveTime: p.arriveTime,
        block: p.block,
        credit: p.credit,
        layover: p.layover,
        posterName: p.posterName,
        postedAtLabel: p.postedAtLabel,
        responseMethods: p.responseMethods,
      });
    }
  }

  return {
    posts,
    debug: {
      htmlLength: htmlLen,
      pageTitle,
      markerList,
      allRequestsDetected,
      tradeboardOccurrenceContexts,
      requestRowCandidateCount,
      acceptedRowCount,
      rejectedRowCount,
      first10CandidateRows,
      firstAcceptedRawBlock,
      detectedExtractionMode,
      tradeboardJsProbe: jsProbe,
      fullHtmlContainsPairingPattern,
      flexPairingMatchCountOnPreparedHtml: prepStats.flexHitCount,
      normalizedTextContainsPairingPattern,
      pairingMatchCount,
      normalizedScriptStrippedPreferred,
      first20PairingPatternContexts,
      knownTokenProbes,
      first10AllRequestsTablePipeLines: allReqTablePipe.slice(0, 10),
      allRequestsARecordBodiesFound,
      allRequestsARecordPostsCount,
      allRequestsARecordFirst5ArgDiagnostics,
    },
  };
}

function emptyTradeboardExtractDebug(
  htmlLen: number,
  r: Pick<FlicaActionsFetchResult, "title">,
  primary: TradeboardPost[],
): TradeboardExtractDebug {
  return {
    htmlLength: htmlLen,
    pageTitle: r.title ?? null,
    markerList: [],
    allRequestsDetected: false,
    tradeboardOccurrenceContexts: [],
    requestRowCandidateCount: 0,
    acceptedRowCount: primary.length,
    rejectedRowCount: 0,
    first10CandidateRows: [],
    firstAcceptedRawBlock: primary[0]?.rawText?.slice(0, 400) ?? "",
    detectedExtractionMode: "native_parse_rows",
    fullHtmlContainsPairingPattern: false,
    flexPairingMatchCountOnPreparedHtml: 0,
    normalizedTextContainsPairingPattern: false,
    pairingMatchCount: 0,
    normalizedScriptStrippedPreferred: false,
    first20PairingPatternContexts: [],
    knownTokenProbes: [],
  };
}

export function mapTradeboardPostsWithHtmlFallback(
  rows: string[][],
  r: Pick<FlicaActionsFetchResult, "htmlLength" | "bodyPreview" | "nativeParse" | "pageHtml" | "title">,
  sourcePageType: TradeboardSourcePageType,
  sourceUrl: string,
): { posts: TradeboardPost[]; meta: FlicaCrewHubFallbackParseMeta } {
  const html = String(r.pageHtml ?? "");
  const htmlLen = Number(r.htmlLength ?? html.length ?? 0);
  const rawRows = rows?.length ?? 0;
  const markersFound: string[] = [];
  const markersMissing: string[] = [];

  const primary = mapTradeboardRowsToPosts(rows, sourcePageType, sourceUrl);
  const templatey = rowsContainJsTemplateTokens(rows);
  const hasPairing = rowsContainTradeboardPairing(rows);

  if (primary.length > 0 && !templatey && hasPairing) {
    return {
      posts: enrichTradeboardPostsWithPairingDetailUrlsFromHtml(html, primary),
      meta: {
        ...emptyMeta(htmlLen, rawRows),
        markersFound: ["nativeParse.rows"],
        extractedPostCount: primary.length,
        firstExtractedRawBlock: primary[0]?.rawText?.slice(0, 400) ?? "",
        tradeboardExtractDebug: emptyTradeboardExtractDebug(htmlLen, r, primary),
      },
    };
  }

  const tbExtract = extractTradeboardPostsFromPageHtml(html, r, sourcePageType, sourceUrl);
  const tradeboardExtractDebug = tbExtract.debug;

  let posts = dedupePosts([...tbExtract.posts]);
  posts = mergePrimaryScheduleIntoPosts(primary, posts);
  posts = enrichTradeboardPostsWithPairingDetailUrlsFromHtml(html, posts);
  if (posts.length) markersFound.push(`html_fallback_posts:${posts.length}`);

  const fallbackUsed =
    posts.length > 0 || templatey || !hasPairing || (rows.length > 0 && primary.length === 0);

  if (posts.length === 0) {
    markersMissing.push("tradeboard_post_blocks");
    const prepMiss = tradeboardPrepareFullHtmlForFlexPairingWithStats(html);
    if (!/\b(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i.test(html) && prepMiss.flexHitCount === 0) {
      markersMissing.push("pairing_date_token_J####:DDMON_in_html");
    }
  }

  const firstBlock =
    tradeboardExtractDebug.firstAcceptedRawBlock?.slice(0, 400) ||
    posts[0]?.rawText ||
    primary[0]?.rawText ||
    "";

  return {
    posts: enrichTradeboardPostsWithPairingDetailUrlsFromHtml(html, posts.length ? posts : primary),
    meta: {
      htmlLength: htmlLen,
      rawRowsCount: rawRows,
      fallbackTextParserUsed: fallbackUsed && posts.length > 0,
      extractedPostCount: (posts.length ? posts : primary).length,
      extractedTripCount: 0,
      firstExtractedRawBlock: firstBlock.slice(0, 400),
      markersFound,
      markersMissing,
      tradeboardExtractDebug,
    },
  };
}
