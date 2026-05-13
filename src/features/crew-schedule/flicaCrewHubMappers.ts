import type { OpenTimeTrip, TradeboardPost, TradeboardPostType } from "./flicaCrewHubTypes";

const PAIRING_RE = /\b([A-Z]\d{3,4}[A-Z]?)\b/;

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
  if (/\bTRADE\s*\/\s*DROP\b|\bTRADE-DROP\b/.test(u)) return "trade_drop";
  if (/\bPICK\s*UP\b|\bPICKUP\b|\bPK\b/.test(u)) return "pickup";
  if (/\bDROP\b|\bDR\b/.test(u)) return "drop";
  if (/\bSWAP\b|\bSW\b/.test(u)) return "swap";
  if (/\bTRADE\b/.test(u)) return "trade";
  return "unknown";
}

function guessDays(text: string): number | null {
  const m = text.match(/\b(\d)\s*D\b/i) || text.match(/\b(\d)\s*DAY\b/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Map FLICA native table rows to tradeboard posts (best-effort; table layouts vary). */
export function mapRowsToTradeboardPosts(
  rows: string[][],
  sourceUrl: string,
): TradeboardPost[] {
  const out: TradeboardPost[] = [];
  let i = 0;
  for (const cells of rows) {
    const rawCells = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (rawCells.length === 0) continue;
    const line = rawCells.join(" ");
    if (/^pairing$/i.test(rawCells[0] ?? "") && out.length === 0) continue;
    const blob = line.toUpperCase();
    if (blob.includes("POSTER") && blob.includes("TRIP")) continue;

    const pairingId = firstMatch(PAIRING_RE, line) || "";
    if (!pairingId && rawCells.length < 2) continue;

    const type = detectTradeboardType(line);
    const worth = extractMoney(line);
    const creditMatch =
      line.match(/\b(\d{1,2}:\d{2})\b/g) ?? line.match(/\b(\d{2,3}:\d{2})\b/g);
    const credit = creditMatch && creditMatch.length > 0 ? creditMatch[creditMatch.length - 1]! : "";

    const posterName = rawCells[0] && !PAIRING_RE.test(rawCells[0]!) ? rawCells[0]! : "";

    out.push({
      id: `tb-${i++}-${pairingId || "row"}`,
      type,
      posterName,
      pairingId,
      routeSummary: line.includes("→")
        ? (firstMatch(/([A-Z]{3}\s*→[\sA-Z→0-9]+)/, line.replace(/\s+/g, " ")) ||
            rawCells.slice(1, 4).join(" · "))
        : rawCells.slice(1, 5).join(" · "),
      base: "",
      position: "",
      date: firstMatch(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s*-\s*\d{1,2})?\b/i,
        line,
      ),
      days: String(guessDays(line) ?? ""),
      reportTime: firstMatch(/\bRPT\s*[:.]?\s*(\d{1,2}:\d{2})\b/i, line) || "",
      departTime: "",
      arriveTime: "",
      block: "",
      credit,
      worth,
      comments: line,
      responseMethods: "",
      postedAt: "",
      matchScore: extractPercent(line),
      legalCompatibility: /\blegal\b/i.test(line) ? true : null,
      sourceUrl,
      rawCells,
      offerCount: extractOffers(line),
    });
  }
  return out;
}

/** Map FLICA Open Time pot rows (best-effort). */
export function mapRowsToOpenTimeTrips(
  rows: string[][],
  sourceUrl: string,
): OpenTimeTrip[] {
  const out: OpenTimeTrip[] = [];
  let i = 0;
  for (const cells of rows) {
    const rawCells = cells.map((c) => String(c ?? "").trim());
    const line = rawCells.filter(Boolean).join(" ");
    if (!line) continue;
    const u = line.toUpperCase();
    if (u.includes("PAIRING") && u.includes("BLOCK")) continue;

    const pairingId = firstMatch(PAIRING_RE, line);
    if (!pairingId) continue;

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

    out.push({
      pairingId,
      date: firstMatch(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
        line,
      ),
      days,
      routeSummary: line.includes("→")
        ? firstMatch(/([A-Z]{3}\s*(?:→\s*[A-Z]{3})+)/, line) || line.slice(0, 80)
        : rawCells.slice(0, 6).join(" · "),
      reportTime,
      departTime,
      arriveTime,
      block: firstMatch(/\b(\d{1,2}:\d{2})\s*BLK/i, line) || times[3] || "",
      credit: firstMatch(/\bCR\D*(\d{1,2}:\d{2})/i, line) || times[4] || "",
      layover: layover || "",
      worth,
      dollarPerCreditHour: (() => {
        const m = line.match(/\$(\d+)\s*\/\s*(?:CR\s*)?HR/i);
        return m?.[1] ? `$${m[1]}/hr` : "";
      })(),
      legalityStatus: "",
      sourceUrl,
      rawCells,
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
