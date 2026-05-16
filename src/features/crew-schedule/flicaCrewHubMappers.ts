import type { OpenTimeTrip, TradeboardPost, TradeboardPostType } from "./flicaCrewHubTypes";
import {
  buildOpenTimePairingDetailUrl,
  buildTradeboardPairingDetailUrl,
  parseFlicaPairOnclick,
} from "../flica-actions/flicaPairingDetailUrl";

/** Pairing + report date token as shown on Tradeboard (e.g. J3717:12MAY). */
const TRADEBOARD_PAIRING_DATE_RE = /\b(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i;
/** HTML / tag-split variants: optional entity or whitespace between id and date. */
const TRADEBOARD_PAIRING_FLEX_LOOSE_RE =
  /\b(J[A-Z0-9]{3,5})\s*(?::|&#58;|&#x3A;|&colon;)?\s*(\d{1,2}[A-Z]{3})\b/i;
const TRADEBOARD_PAIRING_ONLY_RE = /\b(J[A-Z0-9]{3,5})\b/i;
const OPENTIME_PAIRING_RE = /\b(J[A-Z0-9]{3,5})\b/i;
const DATE_TOKEN_RE = /\b(\d{1,2}[A-Z]{3})\b/i;

const EXACT_JUNK_TOKENS = new Set(
  [
    "FLICA",
    "SIGN OUT",
    "MY REQUESTS",
    "ALL REQUESTS",
    "FAVORITES",
    "MY RESPONSES",
    "POST A REQUEST",
    "MY SCHEDULE",
    "TRADEBOARD",
    "TRADE BOARD",
    "POST REQUEST",
    "TRADES BTWN CREWMEMBERS - OPEN",
    "TRADES BTWN CREWMEMBERS",
    "NBSP",
    "—",
    "-",
  ].map((s) => s.toUpperCase()),
);

const KNOWN_BASES = new Set([
  "JFK",
  "BOS",
  "LAX",
  "FLL",
  "MCO",
  "SEA",
  "SFO",
  "EWR",
  "LGA",
  "DCA",
  "ATL",
  "SLC",
  "PDX",
  "DEN",
  "ORD",
  "AUS",
  "SAN",
]);

export function djb2Hex(parts: string[]): string {
  const s = parts.join("::");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function firstMatch(re: RegExp, text: string): string {
  const m = text.match(re);
  return m?.[1] ? String(m[1]).trim() : "";
}

export function extractMoney(text: string): string {
  const m = text.match(/\$\s*[\d,]+(?:\.\d{2})?/);
  return m ? m[0]!.replace(/\s/g, "") : "";
}

function extractPercent(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractOffers(text: string): number | null {
  const m = text.match(/(\d+)\s*offers?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function detectTradeboardType(blob: string): TradeboardPostType {
  const u = blob.toUpperCase();
  if (/\bTRADE\s*\/\s*DROP\b|\bTRADE-DROP\b|\bTRADE\s*DROP\b/.test(u)) return "trade_drop";
  if (/\bPICK\s*UP\b|\bPICKUP\b|\bPK\b/.test(u)) return "pickup";
  if (/\bDROP\b|\bDR\b/.test(u)) return "drop";
  if (/\bSWAP\b|\bSW\b/.test(u)) return "swap";
  if (/\bTRADE\b/.test(u)) return "trade";
  return "unknown";
}

export function tradeboardTypeLongLabel(t: TradeboardPostType): string {
  switch (t) {
    case "swap":
      return "Swap";
    case "drop":
      return "Drop";
    case "pickup":
      return "Pickup";
    case "trade":
      return "Trade";
    case "trade_drop":
      return "Trade-Drop";
    default:
      return "Request";
  }
}

function guessDays(text: string): number | null {
  const dm = text.match(/\bDays\s*[:\s]+\s*(\d{1,2})\b/i);
  if (dm) {
    const n = Number(dm[1]);
    return Number.isFinite(n) && n >= 1 && n <= 14 ? n : null;
  }
  const m = text.match(/\b(\d)\s*D\b/i) || text.match(/\b(\d)\s*DAY\b/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function collapseWhitespace(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRowCells(cells: string[]): string[] {
  return cells.map((c) => collapseWhitespace(String(c ?? ""))).filter((c) => c.length > 0);
}

function openTimePairingFieldsFromOnclickBlob(onclickBlob: string): {
  pairingDetailUrl?: string;
  dateYmd?: string;
  pairingDetailUrlFromLiveHtml?: boolean;
} {
  const oc = parseFlicaPairOnclick(onclickBlob);
  if (!oc) return {};
  return {
    pairingDetailUrl: buildOpenTimePairingDetailUrl(oc.pid, oc.dateYmd),
    dateYmd: oc.dateYmd,
    pairingDetailUrlFromLiveHtml: true,
  };
}

function openTimePairingDetailUrlFromOnclickBlob(blob: string): string | undefined {
  return openTimePairingFieldsFromOnclickBlob(blob).pairingDetailUrl;
}

function tradeboardPairingDetailUrlFromOnclickBlob(blob: string): string | undefined {
  const p = parseFlicaPairOnclick(blob);
  if (!p) return undefined;
  return buildTradeboardPairingDetailUrl(p.pid, p.dateYmd);
}

function parseTradeboardPairing(
  line: string,
  cells: string[],
): { pairingId: string; pairingDateLabel: string } | null {
  const m = line.match(TRADEBOARD_PAIRING_DATE_RE);
  if (m)
    return { pairingId: String(m[1]).toUpperCase(), pairingDateLabel: String(m[2]).toUpperCase() };
  const flexLine = line.match(TRADEBOARD_PAIRING_FLEX_LOOSE_RE);
  if (flexLine)
    return {
      pairingId: String(flexLine[1]).toUpperCase(),
      pairingDateLabel: String(flexLine[2]).toUpperCase(),
    };
  for (const c of cells) {
    const cm = c.match(TRADEBOARD_PAIRING_DATE_RE);
    if (cm)
      return {
        pairingId: String(cm[1]).toUpperCase(),
        pairingDateLabel: String(cm[2]).toUpperCase(),
      };
    const cfx = c.match(TRADEBOARD_PAIRING_FLEX_LOOSE_RE);
    if (cfx)
      return {
        pairingId: String(cfx[1]).toUpperCase(),
        pairingDateLabel: String(cfx[2]).toUpperCase(),
      };
  }
  let pairingId = "";
  let dateLabel = "";
  for (const c of cells) {
    const pm = c.match(TRADEBOARD_PAIRING_ONLY_RE);
    if (pm) pairingId = String(pm[1]).toUpperCase();
    const dm = c.match(DATE_TOKEN_RE);
    if (dm && !TRADEBOARD_PAIRING_DATE_RE.test(c)) dateLabel = String(dm[1]).toUpperCase();
  }
  if (pairingId && dateLabel) return { pairingId, pairingDateLabel: dateLabel };
  return null;
}

function tradeboardRowLooksLikeJunk(line: string, cells: string[]): boolean {
  const t = line.trim();
  if (
    cells.length === 1 &&
    /^\s*J[A-Z0-9]{3,5}\s*(?::|&#58;|&#x3A;|&colon;)?\s*\d{1,2}[A-Z]{3}\s*$/i.test(t) &&
    !/\d{1,2}:\d{2}/.test(t)
  )
    return true;
  const u = line.toUpperCase().replace(/\s+/g, " ").trim();
  if (!u) return true;
  if (EXACT_JUNK_TOKENS.has(u)) return true;
  const first = (cells[0] ?? "").toUpperCase();
  if (/^PAIRING$/i.test(first) && line.toUpperCase().includes("POSTER")) return true;
  if (line.toUpperCase().includes("POSTER") && line.toUpperCase().includes("TRIP") && cells.length < 8)
    return true;
  const crewNameOnly =
    /^[A-Z][A-Z'\-]{0,24},\s+[A-Z][A-Z'\-]{0,24}$/.test(line.trim()) &&
    !TRADEBOARD_PAIRING_DATE_RE.test(line) &&
    !TRADEBOARD_PAIRING_ONLY_RE.test(line);
  if (crewNameOnly) return true;
  const toks = cells.map((c) => c.toUpperCase().replace(/\s+/g, " ").trim()).filter(Boolean);
  if (toks.length > 0 && toks.every((t) => EXACT_JUNK_TOKENS.has(t))) return true;
  return false;
}

function pickPosterName(cells: string[], line: string): string {
  for (const c of cells) {
    if (/^[A-Z][A-Z'\-]+,\s+[A-Z][A-Z'\-]+$/.test(c.trim())) return c.trim();
  }
  const m = line.match(/\b([A-Z][A-Z'\-]+,\s+[A-Z][A-Z'\-]+)\b/);
  if (m?.[1]) return m[1]!.trim();
  /** FLICA Tradeboard often shows "LAST - FIRST" without a comma. */
  const dash = line.match(
    /\b([A-Z][A-Za-z'\-]{1,22}\s*-\s*[A-Z][A-Za-z'\-\s]{1,36})\b/,
  );
  if (dash?.[1] && !/\b(J[A-Z0-9]{3,5}):/i.test(dash[1])) {
    const bits = dash[1].split(/\s*-\s*/).map((s) => s.trim());
    if (
      bits.length === 2 &&
      /^[A-Z]{3}$/.test(bits[0]!) &&
      /^[A-Z]{3}$/.test(bits[1]!) &&
      KNOWN_BASES.has(bits[0]!.toUpperCase()) &&
      KNOWN_BASES.has(bits[1]!.toUpperCase())
    ) {
      /* skip "JFK - BOS" style fragments */
    } else {
      return dash[1]!.replace(/\s*-\s*/, ", ").replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function pickBase(cells: string[]): string {
  for (const c of cells) {
    const t = c.trim().toUpperCase();
    if (KNOWN_BASES.has(t)) return t;
  }
  return "";
}

function pickPosition(cells: string[]): string {
  for (const c of cells) {
    const t = c.trim().toUpperCase();
    if (/^(FA|CA|FO|SC|FD)$/i.test(t)) return t;
  }
  return "";
}

function extractTimes(line: string): string[] {
  return (line.match(/\b\d{1,2}:\d{2}\b/g) ?? []).slice(0, 8);
}

/** Prefer parsed fields; if missing, recover times from `rawText` (tradeboard list + detail UI). */
export function tradeboardDisplayScheduleFields(p: TradeboardPost): {
  reportTime: string;
  departTime: string;
  arriveTime: string;
  block: string;
  credit: string;
} {
  const z = (s: string | undefined | null) => String(s ?? "").trim();
  let reportTime = z(p.reportTime);
  let departTime = z(p.departTime);
  let arriveTime = z(p.arriveTime);
  let block = z(p.block);
  let credit = z(p.credit);
  const raw = String(p.rawText ?? "").replace(/\s+/g, " ");
  if (!raw) {
    return {
      reportTime: reportTime || "—",
      departTime: departTime || "—",
      arriveTime: arriveTime || "—",
      block: block || "—",
      credit: credit || "—",
    };
  }
  const times = (raw.match(/\b\d{1,2}:\d{2}\b/g) ?? []).slice(0, 8);
  if (!reportTime) {
    reportTime = firstMatch(/\bRPT\s*[:.]?\s*(\d{1,2}:\d{2})\b/i, raw) || times[0] || "";
  }
  if (!departTime) departTime = times[1] || "";
  if (!arriveTime) arriveTime = times[2] || "";
  if (!block) {
    block = firstMatch(/\b(\d{1,2}:\d{2})\s*BLK/i, raw) || times[3] || "";
  }
  if (!credit) {
    credit =
      firstMatch(/\bCR\D*(\d{1,2}:\d{2})/i, raw) ||
      (times.length > 4 ? times[times.length - 1]! : times[4] || "") ||
      "";
  }
  return {
    reportTime: reportTime || "—",
    departTime: departTime || "—",
    arriveTime: arriveTime || "—",
    block: block || "—",
    credit: credit || "—",
  };
}

function pickPostedAtLabel(line: string): string {
  const mLong =
    line.match(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:EDT|EST|CST|CDT|PST|PDT|UTC)?\b/i,
    ) ||
    line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b[^A-Z]*\b\d{1,2}:\d{2}/i) ||
    line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/) ||
    line.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i);
  return mLong ? collapseWhitespace(mLong[0] ?? "") : "";
}

/**
 * Keep text that looks like a real crew comment; reject dense schedule/time tokens (table dumps).
 * Exported for HTML compact-row parsing to share the same rules.
 */
export function tradeboardSanitizeDisplayComment(raw: string): string {
  let t = collapseWhitespace(String(raw ?? "")).trim();
  if (!t || /^[\s_\-]+$/i.test(t)) return "";
  if (t.length > 520) t = `${t.slice(0, 517)}...`;
  const timeHits = (t.match(/\b\d{1,2}:\d{2}\b/g) ?? []).length;
  if (timeHits >= 4) return "";
  if (/^\d{1,2}:\d{2}(\b|\s)/.test(t) && timeHits >= 2 && t.length < 52) return "";
  const mostlySchedule =
    /^[\d\s:./A-Z$|·,\-–—]+$/i.test(t) && !/\b(and|with|the|need|please|for|any|swap|trade)\b/i.test(t);
  if (mostlySchedule && t.length < 88) return "";
  if (/[a-z]{2,}/.test(t)) return t;
  if (t.length >= 16 && /[A-Za-z]{4,}/.test(t) && timeHits <= 1) return t;
  return "";
}

function responseChunk(line: string): string {
  const parts: string[] = [];
  if (/\bpropose\s+trade\b/i.test(line)) parts.push("Propose Trade");
  if (/\bpickup\s+trip\b/i.test(line) || /\bpick\s*up\b/i.test(line)) parts.push("Pickup Trip");
  const email = line.match(/\b[^\s@]+@[^\s@]+\.[^\s]+\b/);
  if (email) parts.push(email[0]!);
  const phone = line.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  if (phone) parts.push(phone[0]!);
  return parts.join(" · ");
}

export type TradeboardSourcePageType = "my_requests" | "all_requests";

/**
 * Map FLICA native table rows to tradeboard posts. Filters nav/header junk and rows
 * without a real pairing anchor.
 */
export function mapTradeboardRowsToPosts(
  rows: string[][],
  sourcePageType: TradeboardSourcePageType,
  sourceUrl: string,
): TradeboardPost[] {
  const out: TradeboardPost[] = [];
  for (const row of rows) {
    const rawCells = normalizeRowCells(row.map((c) => String(c ?? "")));
    if (rawCells.length === 0) continue;
    const line = rawCells.join(" ");
    if (tradeboardRowLooksLikeJunk(line, rawCells)) continue;

    const pairing = parseTradeboardPairing(line, rawCells);
    if (!pairing) continue;

    const type = detectTradeboardType(`${rawCells[0] ?? ""} ${line}`);

    const worthRaw = extractMoney(line);
    const worth = worthRaw || null;
    const times = extractTimes(line);
    const reportTime =
      (times[0] ?? firstMatch(/\bRPT\s*[:.]?\s*(\d{1,2}:\d{2})\b/i, line)) || "";
    const departTime = times[1] ?? "";
    const arriveTime = times[2] ?? "";
    const block = firstMatch(/\b(\d{1,2}:\d{2})\s*BLK/i, line) || times[3] || "";
    const credit =
      firstMatch(/\bCR\D*(\d{1,2}:\d{2})/i, line) ||
      (times.length > 4 ? times[times.length - 1]! : firstMatch(/\bTPAY\D*(\d{1,2}:\d{2})/i, line)) ||
      "";

    const posterName = pickPosterName(rawCells, line);
    const base = pickBase(rawCells);
    const position = pickPosition(rawCells);
    const daysN = guessDays(line);
    const days = daysN != null ? String(daysN) : "";

    const routeSummary = line.includes("→")
      ? firstMatch(/([A-Z]{3}\s*(?:→\s*[A-Z]{3})+)/, line.replace(/\s+/g, " ")) ||
        rawCells.filter((c) => /→|[A-Z]{3}/.test(c)).slice(0, 4).join(" · ")
      : rawCells.filter((c) => !KNOWN_BASES.has(c.toUpperCase()) && !/^FA|CA|FO$/i.test(c.trim()))
          .slice(0, 5)
          .join(" · ");

    let comments = "";
    if (rawCells.length > 6) {
      comments = tradeboardSanitizeDisplayComment(rawCells.slice(-4, -1).join(" · "));
    }
    const responseMethodLabel = responseChunk(line);
    const postedAtLabel = pickPostedAtLabel(line);
    const canProposeTrade = /\bpropose\s+trade\b/i.test(line) || /\bpropose\b/i.test(line);
    const canPickup = /\bpickup\b/i.test(line) || /\bpick\s*up\b/i.test(line);

    const tbLayover =
      (line.match(/\b([A-Z]{3})\b/g) ?? []).find(
        (x) =>
          x.length === 3 &&
          x !== base &&
          x !== position.toUpperCase() &&
          !["CR", "BLK", "TPY", "DAY", "FLT", "RPT"].includes(x),
      ) ?? "";

    const id = djb2Hex([
      sourcePageType,
      pairing.pairingId,
      pairing.pairingDateLabel,
      posterName,
      type,
      rawCells.join("|"),
    ]);
    const onclickBlob = [line, ...rawCells].join(" ");
    const ocTb = parseFlicaPairOnclick(onclickBlob);
    const tbUrl = ocTb ? buildTradeboardPairingDetailUrl(ocTb.pid, ocTb.dateYmd) : undefined;
    const tbLive = Boolean(ocTb && tbUrl);

    out.push({
      id: `tb-${id}`,
      type,
      typeLabel: tradeboardTypeLongLabel(type),
      posterName,
      pairingId: pairing.pairingId,
      pairingDateLabel: pairing.pairingDateLabel,
      routeSummary: routeSummary || `${pairing.pairingId}:${pairing.pairingDateLabel}`,
      base,
      position,
      date: pairing.pairingDateLabel,
      days,
      reportTime,
      departTime,
      arriveTime,
      block,
      credit,
      worth,
      layover: tbLayover,
      comments,
      responseMethods: responseMethodLabel,
      responseMethodLabel,
      postedAt: postedAtLabel,
      postedAtLabel,
      canPickup,
      canProposeTrade,
      matchScore: extractPercent(line),
      legalCompatibility: /\blegal\b/i.test(line) ? true : null,
      sourceUrl,
      rawCells,
      rawText: line,
      offerCount: extractOffers(line),
      pairingDetailUrl: tbUrl,
      pairingDetailUrlFromLiveHtml: tbLive,
      dateYmd: ocTb?.dateYmd,
    });
  }
  return out;
}

/** @deprecated Prefer {@link mapTradeboardRowsToPosts} with explicit source page. */
export function mapRowsToTradeboardPosts(rows: string[][], sourceUrl: string): TradeboardPost[] {
  return mapTradeboardRowsToPosts(rows, "all_requests", sourceUrl);
}

const OT_JUNK_SUBSTRINGS = [
  "PAIRING",
  "OPEN TIME",
  "OPENTIME",
  "BLOCK",
  "CREDIT",
  "SIGN OUT",
  "FLICA",
  "GO TO",
  "POT LIST",
];

function openTimeRowLooksLikeJunk(line: string, cells: string[]): boolean {
  const u = line.toUpperCase();
  if (!u.trim()) return true;
  if (/^PAIRING\b/i.test(cells[0] ?? "") && /\bBID\b/i.test(u)) return true;
  if (cells.length <= 1 && u.length < 12) return true;
  if (/^PAIRING\b/i.test(cells[0] ?? "") && /\bBLOCK\b/i.test(u) && cells.length < 5) return true;
  for (const j of OT_JUNK_SUBSTRINGS) {
    if (u === j || (cells.length <= 3 && u.includes(j) && !OPENTIME_PAIRING_RE.test(line))) return true;
  }
  return false;
}

/**
 * FLICA Open Time Blk Hrs / Credit: keep HH:MM; map 3–4 digit HHMM (e.g. 1037 → 10:37).
 * Leaves values that are not valid clock-style times unchanged (e.g. cumulative hours).
 */
export function formatOpenTimeBlkCr(raw: string): string {
  const s = collapseWhitespace(String(raw ?? ""));
  if (!s) return "";
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  const hm = s.match(/^(\d{1,2}):(\d{2}):\d{2}$/);
  if (hm) return `${Number(hm[1])}:${String(hm[2]).padStart(2, "0")}`;
  if (/^\d{4}$/.test(s)) {
    const hh = parseInt(s.slice(0, 2), 10);
    const mm = parseInt(s.slice(2), 10);
    if (mm >= 60 || hh > 23) return s;
    return `${hh}:${String(mm).padStart(2, "0")}`;
  }
  if (/^\d{3}$/.test(s)) {
    const hh = parseInt(s.slice(0, 1), 10);
    const mm = parseInt(s.slice(1), 10);
    if (mm >= 60 || hh > 9) return s;
    return `${hh}:${String(mm).padStart(2, "0")}`;
  }
  return s;
}

function parseOpenTimePairingColumn(cell: string): { pairingId: string; dateLabel: string } {
  const colon = cell.match(/\b(J[A-Z0-9]{3,5})\s*:\s*(\d{1,2}[A-Z]{3})\b/i);
  if (colon) return { pairingId: colon[1]!.toUpperCase(), dateLabel: colon[2]!.toUpperCase() };
  const j = cell.match(/\b(J[A-Z0-9]{3,5})\b/i);
  return { pairingId: j?.[1]?.toUpperCase() ?? "", dateLabel: "" };
}

function guessLayoverFromLooseCells(rawCells: string[], pairingId: string): string {
  for (let i = rawCells.length - 1; i >= 0; i--) {
    const c = rawCells[i]!.trim();
    if (!c || c.toUpperCase() === pairingId) continue;
    if (/^\d{1,2}:\d{2}/.test(c)) continue;
    if (/^\$/.test(c)) continue;
    if (/^\d{3,4}$/.test(c)) continue;
    if (/^\d{1,2}$/.test(c) && Number(c) <= 14) continue;
    if (/^\d$/.test(c)) continue;
    if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(c)) continue;
    if (/\bJ[A-Z0-9]{3,5}\s*:/i.test(c)) continue;
    if (/\b[A-Z]{3}\b/.test(c) && !/^\d{1,2}[A-Z]{3}$/i.test(c)) return collapseWhitespace(c);
  }
  return "";
}

/** JetBlue FA open time: FLICA shows bid pos as F1–F9 (slot index → F + digit). */
const JETBLUE_FA_BID_POS_LITERAL = /^F[1-9]$/;

function looksLikeOpenTimeBlkOrCreditCell(raw: string): boolean {
  const s = collapseWhitespace(raw);
  if (!s) return false;
  if (/^\d{1,2}:\d{2}$/.test(s)) return true;
  if (/^\d{3,4}$/.test(s)) {
    const mm = parseInt(s.slice(-2), 10);
    return mm < 60;
  }
  return false;
}

/** `PosList[n]=new PosMap('3','F3')` from JetBlue FA open time pot HTML. */
export function parseJetBlueFlicaPosList(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /PosList\s*\[\s*\d+\s*\]\s*=\s*new\s+PosMap\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? ""))) !== null) {
    const id = collapseWhitespace(m[1] ?? "");
    const label = collapseWhitespace(m[2] ?? "").toUpperCase();
    if (id && label) map.set(id, label);
  }
  return map;
}

/**
 * JetBlue FA: FLICA stores bid slot as a number (e.g. `3`); display as `F3`.
 * Uses PosList when present, otherwise `F` + slot digit.
 */
export function formatJetBlueFaBidPosition(
  slotRaw: string,
  posList?: ReadonlyMap<string, string>,
): string {
  const slot = collapseWhitespace(slotRaw);
  if (!slot || !/^\d{1,2}$/.test(slot)) return "";
  const fromList = posList?.get(slot)?.toUpperCase() ?? "";
  if (fromList && JETBLUE_FA_BID_POS_LITERAL.test(fromList)) return fromList;
  const n = parseInt(slot, 10);
  if (n >= 1 && n <= 9) return `F${n}`;
  return "";
}

/**
 * JetBlue FA multi-open: FLICA concatenates slot ids before `FA` (e.g. `13` → F1 + F3).
 */
function jetBlueFaBidLabelsFromConcatenatedSlotDigits(
  slot: string,
  posList?: ReadonlyMap<string, string>,
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const ch of slot) {
    const p = formatJetBlueFaBidPosition(ch, posList);
    if (p && !seen.has(p)) {
      seen.add(p);
      parts.push(p);
    }
  }
  return parts.join(" ");
}

export function formatJetBlueFaBidPositionsFromSlotField(
  slotRaw: string,
  posList?: ReadonlyMap<string, string>,
): string {
  const slot = collapseWhitespace(slotRaw).toUpperCase();
  if (!slot) return "";

  if (JETBLUE_FA_BID_POS_LITERAL.test(slot)) return slot;

  const tokens = slot.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => JETBLUE_FA_BID_POS_LITERAL.test(t))) {
    return tokens.join(" ");
  }

  if (/^[1-9]$/.test(slot)) {
    return formatJetBlueFaBidPosition(slot, posList);
  }

  if (/^[1-9]{2,}$/.test(slot)) {
    return jetBlueFaBidLabelsFromConcatenatedSlotDigits(slot, posList);
  }

  return formatJetBlueFaBidPosition(slot, posList);
}

/** Normalize stored/display bid pos (F1–F9, space-separated when multi-open). */
export function normalizeOpenTimeBidPosition(raw: string): string {
  const trimmed = collapseWhitespace(raw).toUpperCase();
  if (!trimmed) return "";

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const tok of tokens) {
      const n = tok.replace(/[\s._-]+/g, "");
      if (JETBLUE_FA_BID_POS_LITERAL.test(n) && !seen.has(n)) {
        seen.add(n);
        labels.push(n);
      }
    }
    if (labels.length > 0) return labels.join(" ");
  }

  const compact = trimmed.replace(/[\s._-]+/g, "");
  if (!compact) return "";
  if (JETBLUE_FA_BID_POS_LITERAL.test(compact)) return compact;
  if (/^[1-9]{2,}$/.test(compact)) {
    return jetBlueFaBidLabelsFromConcatenatedSlotDigits(compact);
  }
  return "";
}

export function isOpenTimeBidPositionToken(raw: string): boolean {
  return normalizeOpenTimeBidPosition(raw) !== "";
}

/** Column holding JetBlue FA bid pos (F1–F9), not layover or trip days. */
export function detectOpenTimeBidPosColumnIndex(cells: string[]): number {
  for (let i = 1; i < cells.length; i++) {
    if (normalizeOpenTimeBidPosition(cells[i] ?? "")) return i;
  }
  for (let i = 1; i < cells.length; i++) {
    const s = collapseWhitespace(cells[i] ?? "");
    if (/^[1-9]{2,}$/.test(s) && formatJetBlueFaBidPositionsFromSlotField(s)) return i;
  }
  for (let i = 1; i < cells.length; i++) {
    const s = collapseWhitespace(cells[i] ?? "");
    if (!/^[1-9]$/.test(s)) continue;
    const next = collapseWhitespace(cells[i + 1] ?? "");
    if (i === 2 && /:\d{1,2}[A-Z]{3}$/i.test(cells[0] ?? "") && /^\d{1,2}:\d{2}$/.test(next)) {
      continue;
    }
    if (formatJetBlueFaBidPosition(s)) return i;
  }
  return -1;
}

/** Trip length in days (1–14), excluding bid-position column. */
function detectOpenTimeDaysColumnIndex(cells: string[], bidIdx: number): number {
  for (let i = 1; i < cells.length; i++) {
    if (i === bidIdx) continue;
    const s = collapseWhitespace(cells[i] ?? "");
    if (/^\d{1,2}$/.test(s)) {
      const n = parseInt(s, 10);
      if (n >= 1 && n <= 14) return i;
    }
  }
  if (bidIdx >= 0 && bidIdx + 1 < cells.length) return bidIdx + 1;
  return -1;
}

function openTimeFirstTimeColumnIndex(cells: string[], afterIdx: number): number {
  for (let i = Math.max(1, afterIdx + 1); i < cells.length; i++) {
    const s = collapseWhitespace(cells[i] ?? "");
    if (/^\d{1,2}:\d{2}$/.test(s)) return i;
  }
  return Math.max(1, afterIdx + 1);
}

/** Scan row cells for JetBlue FA bid pos (F1–F9). */
export function extractOpenTimeBidPosFromCells(
  cells: string[],
  preferredIdx?: number,
  posList?: ReadonlyMap<string, string>,
): string {
  if (preferredIdx != null && preferredIdx >= 0 && preferredIdx < cells.length) {
    const direct = normalizeOpenTimeBidPosition(cells[preferredIdx] ?? "");
    if (direct) return direct;
    const slot = formatJetBlueFaBidPositionsFromSlotField(cells[preferredIdx] ?? "", posList);
    if (slot) return slot;
  }
  for (const c of cells) {
    const p = normalizeOpenTimeBidPosition(c);
    if (p) return p;
  }
  const bidIdx = detectOpenTimeBidPosColumnIndex(cells);
  if (bidIdx >= 0) {
    return (
      normalizeOpenTimeBidPosition(cells[bidIdx] ?? "") ||
      formatJetBlueFaBidPositionsFromSlotField(cells[bidIdx] ?? "", posList)
    );
  }
  return "";
}

/**
 * JetBlue FA `new Task(…, slotIndex, "FA", …)` — bid pos is the numeric arg before `FA`.
 */
export function extractOpenTimeBidPosFromTaskArgs(
  args: string[],
  posList?: ReadonlyMap<string, string>,
): string {
  const normed = args.map((a) => collapseWhitespace(normalizeTaskArgForOpenTime(a)));
  for (let i = 5; i < normed.length; i++) {
    if (normed[i] !== "FA") continue;
    const beforeFa = formatJetBlueFaBidPositionsFromSlotField(normed[i - 1] ?? "", posList);
    if (beforeFa) return beforeFa;
    for (let j = i + 1; j < Math.min(i + 8, normed.length); j++) {
      const s = normed[j] ?? "";
      if (/^[1-9]{2,}$/.test(s)) {
        const alt = formatJetBlueFaBidPositionsFromSlotField(s, posList);
        if (alt) return alt;
      }
    }
  }
  for (let i = 4; i < normed.length; i++) {
    const p = normalizeOpenTimeBidPosition(normed[i] ?? "");
    if (p) return p;
  }
  return "";
}

function normalizeTaskArgForOpenTime(a: string): string {
  let s = String(a ?? "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s;
}

/** First data column after pairing (and optional standalone dates column). */
function openTimeMetricColumnStart(cells: string[]): number {
  if (cells.length < 8) return -1;
  if (/^\d{1,2}[A-Z]{3}$/i.test(collapseWhitespace(cells[1] ?? ""))) return 2;
  return 1;
}

/** FLICA pot row: Pairing [| Dates] | Bid Pos | Days | Report | Depart | Arrive | Blk Hrs | Credit | Layover [| Prem] */
function tryMapOpenTimeStructuredColumns(rawCells: string[], sourceUrl: string): OpenTimeTrip | null {
  const cells = rawCells.map((c) => collapseWhitespace(String(c ?? "")));
  if (cells.length < 8) return null;
  const { pairingId, dateLabel } = parseOpenTimePairingColumn(cells[0] ?? "");
  if (!pairingId.startsWith("J")) return null;

  const bidIdx = detectOpenTimeBidPosColumnIndex(cells);
  const start = openTimeMetricColumnStart(cells);
  if (bidIdx < 0 && start < 0) return null;

  const datesCol = (() => {
    const c1 = collapseWhitespace(cells[1] ?? "");
    if (bidIdx !== 1 && start !== 1 && /^\d{1,2}[A-Z]{3}$/i.test(c1)) return c1;
    return "";
  })();

  const bidPos = extractOpenTimeBidPosFromCells(cells, bidIdx >= 0 ? bidIdx : undefined, undefined);

  const daysIdx =
    bidIdx >= 0
      ? detectOpenTimeDaysColumnIndex(cells, bidIdx)
      : start >= 0
        ? start + 1
        : -1;
  const daysStr = daysIdx >= 0 ? collapseWhitespace(cells[daysIdx] ?? "") : "";
  const daysN = parseInt(daysStr.replace(/\D/g, ""), 10);
  const daysGuess = guessDays(cells.join(" "));
  const days =
    Number.isFinite(daysN) && daysN >= 1 && daysN <= 14 ? daysN : daysGuess;

  const metricAfter =
    bidIdx >= 0
      ? Math.max(bidIdx, daysIdx >= 0 ? daysIdx : bidIdx)
      : start >= 0
        ? start + 1
        : 1;
  const timeStart =
    bidIdx >= 0
      ? openTimeFirstTimeColumnIndex(cells, metricAfter)
      : start >= 0
        ? start + 2
        : openTimeFirstTimeColumnIndex(cells, metricAfter);
  const reportTime = collapseWhitespace(cells[timeStart] ?? "");
  const departTime = collapseWhitespace(cells[timeStart + 1] ?? "");
  const arriveTime = collapseWhitespace(cells[timeStart + 2] ?? "");
  const blkRaw = collapseWhitespace(cells[timeStart + 3] ?? "");
  const crRaw = collapseWhitespace(cells[timeStart + 4] ?? "");
  const block = formatOpenTimeBlkCr(blkRaw);
  const credit = formatOpenTimeBlkCr(crRaw);
  if (!block && !credit) return null;
  if (!looksLikeOpenTimeBlkOrCreditCell(blkRaw) && !looksLikeOpenTimeBlkOrCreditCell(crRaw)) {
    return null;
  }

  const layover = collapseWhitespace(cells[timeStart + 5] ?? "");
  const premium =
    cells.length > timeStart + 6 ? collapseWhitespace(cells[timeStart + 6] ?? "") : "";

  const line = rawCells.join(" ");
  const worth = extractMoney(line);
  const dateDisplay = datesCol || dateLabel;
  const dollarM = line.match(/\$(\d+)\s*\/\s*(?:CR\s*)?HR/i);
  const onclickBlob = [line, ...rawCells].join(" ");
  const otPair = openTimePairingFieldsFromOnclickBlob(onclickBlob);

  return {
    pairingId,
    date: dateDisplay,
    dates: dateDisplay,
    dateLabel: dateLabel || undefined,
    days,
    bidPos: bidPos || undefined,
    routeSummary: layover,
    reportTime,
    departTime,
    arriveTime,
    block,
    credit,
    layover,
    worth,
    premium: premium || undefined,
    dollarPerCreditHour: dollarM?.[1] ? `$${dollarM[1]}/hr` : "",
    legalityStatus: "",
    sourceUrl,
    rawCells: rawCells.map((c) => collapseWhitespace(String(c ?? ""))),
    ...otPair,
  };
}

/** Map FLICA Open Time pot rows (filters nav / junk; requires J-prefixed pairing id). */
export function mapRowsToOpenTimeTrips(rows: string[][], sourceUrl: string): OpenTimeTrip[] {
  const out: OpenTimeTrip[] = [];
  for (const cells of rows) {
    const rawCells = normalizeRowCells(cells.map((c) => String(c ?? "")));
    const line = rawCells.join(" ");
    if (!line) continue;
    if (openTimeRowLooksLikeJunk(line, rawCells)) continue;

    const structured = tryMapOpenTimeStructuredColumns(rawCells, sourceUrl);
    if (structured) {
      out.push(structured);
      continue;
    }

    const pm = line.match(OPENTIME_PAIRING_RE);
    if (!pm) continue;
    const pairingId = String(pm[1]).toUpperCase();
    const dateTok =
      parseOpenTimePairingColumn(rawCells[0] ?? "").dateLabel ||
      (firstMatch(DATE_TOKEN_RE, line) || "").toUpperCase();

    const worth = extractMoney(line);
    const times = line.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
    const reportTime = times[0] ?? "";
    const departTime = times[1] ?? "";
    const arriveTime = times[2] ?? "";

    const days = guessDays(line);
    const layover = guessLayoverFromLooseCells(rawCells, pairingId);

    const dateHuman = firstMatch(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s*-\s*\d{1,2})?\b/i,
      line,
    );
    const dateRange =
      firstMatch(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s*-\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
        line,
      ) || dateHuman;

    const bidPos = extractOpenTimeBidPosFromCells(rawCells);

    const blockRaw =
      firstMatch(/\bBLK\s*HRS?\D*(\d{1,2}:\d{2}|\d{3,4})\b/i, line) ||
      firstMatch(/\b(\d{1,2}:\d{2}|\d{3,4})\s*BLK/i, line) ||
      times[3] ||
      "";
    const creditRaw =
      firstMatch(/\b(?:T-?)?CRED(?:IT)?\D*(\d{1,2}:\d{2}|\d{3,4})\b/i, line) ||
      firstMatch(/\bCR(?:EDIT)?\D*(\d{1,2}:\d{2}|\d{3,4})\b/i, line) ||
      times[4] ||
      "";

    const dateDisplay = dateRange || dateHuman || dateTok;
    const onclickBlob = [line, ...rawCells].join(" ");
    const otPair = openTimePairingFieldsFromOnclickBlob(onclickBlob);

    out.push({
      pairingId,
      date: dateDisplay,
      dates: dateDisplay,
      dateLabel: dateTok || undefined,
      days,
      bidPos: bidPos || undefined,
      routeSummary: layover,
      reportTime,
      departTime,
      arriveTime,
      block: formatOpenTimeBlkCr(blockRaw),
      credit: formatOpenTimeBlkCr(creditRaw),
      layover,
      worth,
      premium: firstMatch(/\b(?:PREM|PREMIUM)\D*(\$?\s*[\d,]+)/i, line) || "",
      dollarPerCreditHour: (() => {
        const m = line.match(/\$(\d+)\s*\/\s*(?:CR\s*)?HR/i);
        return m?.[1] ? `$${m[1]}/hr` : "";
      })(),
      legalityStatus: "",
      sourceUrl,
      rawCells: cells.map((c) => collapseWhitespace(String(c ?? ""))),
      ...otPair,
    });
  }
  return out;
}

/** Four hub categories: Trade (includes FLICA swap), Drop, Trade/Drop, Pickup. */
export function tradeboardTypeLabel(t: TradeboardPostType): string {
  switch (t) {
    case "swap":
    case "trade":
      return "Trade";
    case "drop":
      return "Drop";
    case "pickup":
      return "Pickup";
    case "trade_drop":
      return "Trade/Drop";
    default:
      return "—";
  }
}

/** Punchy premium accents: red trade, orange drop, yellow trade/drop, green pickup. */
export function tradeboardTypeBadgeColor(t: TradeboardPostType): string {
  switch (t) {
    case "swap":
    case "trade":
      return "#dc2626";
    case "drop":
      return "#ea580c";
    case "trade_drop":
      return "#ca8a04";
    case "pickup":
      return "#15803d";
    default:
      return "#78716c";
  }
}
