import type { OpenTimeTrip, TradeboardPost, TradeboardPostType } from "./flicaCrewHubTypes";

/** Pairing + report date token as shown on Tradeboard (e.g. J3717:12MAY). */
const TRADEBOARD_PAIRING_DATE_RE = /\b(J[A-Z0-9]{3,5}):(\d{1,2}[A-Z]{3})\b/i;
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

function djb2Hex(parts: string[]): string {
  const s = parts.join("::");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = Math.imul(h, 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function firstMatch(re: RegExp, text: string): string {
  const m = text.match(re);
  return m?.[1] ? String(m[1]).trim() : "";
}

function extractMoney(text: string): string {
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

function detectTradeboardType(blob: string): TradeboardPostType {
  const u = blob.toUpperCase();
  if (/\bTRADE\s*\/\s*DROP\b|\bTRADE-DROP\b|\bTRADE\s*DROP\b/.test(u)) return "trade_drop";
  if (/\bPICK\s*UP\b|\bPICKUP\b|\bPK\b/.test(u)) return "pickup";
  if (/\bDROP\b|\bDR\b/.test(u)) return "drop";
  if (/\bSWAP\b|\bSW\b/.test(u)) return "swap";
  if (/\bTRADE\b/.test(u)) return "trade";
  return "unknown";
}

function tradeboardTypeLongLabel(t: TradeboardPostType): string {
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

function parseTradeboardPairing(
  line: string,
  cells: string[],
): { pairingId: string; pairingDateLabel: string } | null {
  const m = line.match(TRADEBOARD_PAIRING_DATE_RE);
  if (m)
    return { pairingId: String(m[1]).toUpperCase(), pairingDateLabel: String(m[2]).toUpperCase() };
  for (const c of cells) {
    const cm = c.match(TRADEBOARD_PAIRING_DATE_RE);
    if (cm)
      return {
        pairingId: String(cm[1]).toUpperCase(),
        pairingDateLabel: String(cm[2]).toUpperCase(),
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
  return m?.[1]?.trim() ?? "";
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

function pickPostedAtLabel(line: string): string {
  const m =
    line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b[^A-Z]*\b\d{1,2}:\d{2}/i) ||
    line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/) ||
    line.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i);
  return m ? collapseWhitespace(m[0] ?? "") : "";
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

    const comments = rawCells.length > 6 ? rawCells.slice(-4, -1).join(" · ") : line;
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
  if (cells.length <= 1 && u.length < 12) return true;
  if (/^PAIRING\b/i.test(cells[0] ?? "") && /\bBLOCK\b/i.test(u) && cells.length < 5) return true;
  for (const j of OT_JUNK_SUBSTRINGS) {
    if (u === j || (cells.length <= 3 && u.includes(j) && !OPENTIME_PAIRING_RE.test(line))) return true;
  }
  return false;
}

/** Map FLICA Open Time pot rows (filters nav / junk; requires J-prefixed pairing id). */
export function mapRowsToOpenTimeTrips(rows: string[][], sourceUrl: string): OpenTimeTrip[] {
  const out: OpenTimeTrip[] = [];
  for (const cells of rows) {
    const rawCells = normalizeRowCells(cells.map((c) => String(c ?? "")));
    const line = rawCells.join(" ");
    if (!line) continue;
    if (openTimeRowLooksLikeJunk(line, rawCells)) continue;

    const pm = line.match(OPENTIME_PAIRING_RE);
    if (!pm) continue;
    const pairingId = String(pm[1]).toUpperCase();

    const worth = extractMoney(line);
    const times = line.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
    const reportTime = times[0] ?? "";
    const departTime = times[1] ?? "";
    const arriveTime = times[2] ?? "";

    const days = guessDays(line);
    const layoverMatch = line.match(/\b([A-Z]{3})\b/g);
    const layover =
      layoverMatch && layoverMatch.length > 1
        ? layoverMatch.find((x) => !["JFK", "BOS", "LAX", "FLL"].includes(x)) ?? ""
        : "";
    const layoverClean = layover === pairingId ? "" : layover;

    const dateHuman = firstMatch(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s*-\s*\d{1,2})?\b/i,
      line,
    );
    const dateRange =
      firstMatch(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s*-\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
        line,
      ) || dateHuman;

    const bidPos = firstMatch(/\b(?:BID|POS)\s*[:\s]+([A-Z]{2,4})\b/i, line) || "";

    out.push({
      pairingId,
      date: dateRange || dateHuman || "",
      dates: dateRange || dateHuman || "",
      days,
      bidPos: bidPos || undefined,
      routeSummary: line.includes("→")
        ? firstMatch(/([A-Z]{3}\s*(?:→\s*[A-Z]{3})+)/, line) || line.slice(0, 80)
        : rawCells.filter((c) => c.toUpperCase() !== pairingId).slice(0, 6).join(" · "),
      reportTime,
      departTime,
      arriveTime,
      block: firstMatch(/\b(\d{1,2}:\d{2})\s*BLK/i, line) || times[3] || "",
      credit: firstMatch(/\bCR\D*(\d{1,2}:\d{2})/i, line) || times[4] || "",
      layover: layoverClean || "",
      worth,
      premium: firstMatch(/\b(?:PREM|PREMIUM)\D*(\$?\s*[\d,]+)/i, line) || "",
      dollarPerCreditHour: (() => {
        const m = line.match(/\$(\d+)\s*\/\s*(?:CR\s*)?HR/i);
        return m?.[1] ? `$${m[1]}/hr` : "";
      })(),
      legalityStatus: "",
      sourceUrl,
      rawCells: cells.map((c) => collapseWhitespace(String(c ?? ""))),
    });
  }
  return out;
}

export function tradeboardTypeLabel(t: TradeboardPostType): string {
  switch (t) {
    case "swap":
      return "SW";
    case "drop":
      return "DR";
    case "pickup":
      return "PK";
    case "trade":
      return "TR";
    case "trade_drop":
      return "TD";
    default:
      return "??";
  }
}

export function tradeboardTypeBadgeColor(t: TradeboardPostType): string {
  switch (t) {
    case "swap":
      return "#2563eb";
    case "drop":
      return "#ea580c";
    case "pickup":
      return "#16a34a";
    default:
      return "#6b7280";
  }
}
