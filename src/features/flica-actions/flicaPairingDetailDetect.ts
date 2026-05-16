import {
  parseFlicaScheduleHtml,
  type FlicaPairing,
  type ParseFlicaScheduleHtmlOptions,
} from "../../services/flicaScheduleHtmlParser";

const PAIRING_ID_RE = /\b(J[A-Z0-9]{3,5}:\d{1,2}[A-Z]{3})\b/i;

const PAIRING_DETAIL_MARKERS: Array<{ key: string; pattern: RegExp }> = [
  { key: "base_equip", pattern: /base\s*\/\s*equip\s*:/i },
  { key: "bse_rept", pattern: /\bbse\s+rept\s*:/i },
  { key: "only_on", pattern: /\bonly\s+on\b/i },
  { key: "operates", pattern: /\boperates\s*:/i },
  { key: "d_end", pattern: /\bd-?end\s*:/i },
  { key: "tafb", pattern: /\bt\.?\s*a\.?\s*f\.?\s*b\.?\b/i },
  { key: "crew", pattern: /\bcrew\s*:/i },
  { key: "duty_header", pattern: /dy\s+dd\s+dh\s+c\s+fltno\s+dps-ars/i },
  { key: "tcrd", pattern: /\btcrd\b/i },
  { key: "layover_col", pattern: /\blayover\b/i },
  { key: "hotel_phone", pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
];

export type FlicaPairingDetailDetection = {
  isPairingDetail: boolean;
  pairingId?: string;
  dateText?: string;
  sourceHints: string[];
};

export function detectFlicaPairingDetailHtml(html: string): FlicaPairingDetailDetection {
  const bodyText = stripTags(html);
  const blob = `${bodyText}\n${html}`;
  const sourceHints: string[] = [];

  for (const m of PAIRING_DETAIL_MARKERS) {
    if (m.pattern.test(blob)) sourceHints.push(m.key);
  }

  const idMatch = blob.match(PAIRING_ID_RE);
  const pairingId = idMatch?.[1]?.toUpperCase();
  const dateText = pairingId?.includes(":") ? pairingId.split(":")[1] : undefined;

  const isPairingDetail =
    sourceHints.length >= 2 ||
    (Boolean(pairingId) && sourceHints.some((h) => h === "d_end" || h === "duty_header" || h === "bse_rept"));

  return {
    isPairingDetail,
    pairingId,
    dateText,
    sourceHints,
  };
}

function stripTags(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `<title>` plain text for rbcpair / FLICA page classification. */
export function extractFlicaHtmlTitle(html: string): string {
  const m = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260);
}

/** e.g. `J3021 - JetBlue Airways May 2026 Pairing` */
export function isRbcpairJetbluePairingDetailTitle(title: string): boolean {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!/\bJ[A-Z0-9]{3,5}\b/i.test(t)) return false;
  if (!/jetblue|\bairways\b/i.test(t)) return false;
  if (!/pairing/i.test(t.toLowerCase())) return false;
  return true;
}

function inferMonthKeyFromHtml(html: string, detection: FlicaPairingDetailDetection): string {
  const ymd = html.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  if (detection.pairingId) {
    const mon = detection.pairingId.match(/:\d{1,2}([A-Z]{3})$/i)?.[1];
    if (mon) {
      const months: Record<string, string> = {
        JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
        JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
      };
      const mm = months[mon.toUpperCase()];
      if (mm) {
        const year = new Date().getFullYear();
        return `${year}-${mm}`;
      }
    }
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type FlicaParsedReplayPairingSummary = {
  pairingId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  report: string;
  routeSummary: string;
  layoverCount: number;
  hotelCount: number;
  crewCount: number;
  legCount: number;
  dEnd: string;
  tafb: string;
  credit: string;
  block: string;
};

export type FlicaParsedReplayPairingResult = {
  ok: boolean;
  detection: FlicaPairingDetailDetection;
  monthKey: string;
  pairing: FlicaPairing | null;
  summary: FlicaParsedReplayPairingSummary | null;
  error?: string;
};

function pairingToSummary(p: FlicaPairing): FlicaParsedReplayPairingSummary {
  const layovers = p.legs.filter((l) => l.layoverCity).map((l) => l.layoverCity);
  return {
    pairingId: p.id,
    startDate: p.startDate,
    endDate: p.endDate ?? p.startDate,
    daysOfWeek: p.daysOfWeek ?? "",
    report: p.baseReport ?? "",
    routeSummary: p.routeSummary ?? "",
    layoverCount: new Set(layovers).size,
    hotelCount: p.hotels?.length ?? 0,
    crewCount: p.crewMembers?.length ?? 0,
    legCount: p.legs.length,
    dEnd: p.legs.map((l) => l.dEndLocal).filter(Boolean).join("; ") || "",
    tafb: p.tafb ?? "",
    credit: p.totalCredit ?? "",
    block: p.totalBlock ?? "",
  };
}

/** Parse replay HTML via existing schedule pairing parser (RBCPair body). */
export function parseReplayHtmlAsPairingDetail(
  html: string,
  hints?: {
    pairingId?: string;
    monthKey?: string;
    /** Caller (Open Time detail fetch) already validated rbcpair URL — allow whole-document parse without marker heuristics. */
    forceRbcpairWholeDocument?: boolean;
    /** Response was loaded from `/full/rbcpair.cgi` (HTML body often omits that path string). */
    responseFromRbcpairDetailUrl?: boolean;
  },
): FlicaParsedReplayPairingResult {
  const detection = detectFlicaPairingDetailHtml(html);
  const title = extractFlicaHtmlTitle(html);
  const rbcpairPage =
    /rbcpair\.cgi/i.test(html) || Boolean(hints?.responseFromRbcpairDetailUrl);
  const titlePairingPage = isRbcpairJetbluePairingDetailTitle(title);
  const allowParse =
    detection.isPairingDetail ||
    titlePairingPage ||
    Boolean(hints?.forceRbcpairWholeDocument) ||
    (rbcpairPage && Boolean((hints?.pairingId ?? "").trim()));

  if (!allowParse) {
    return {
      ok: false,
      detection,
      monthKey: hints?.monthKey ?? inferMonthKeyFromHtml(html, detection),
      pairing: null,
      summary: null,
      error: "HTML does not look like FLICA pairing detail (insufficient markers)",
    };
  }

  const monthKey = hints?.monthKey ?? inferMonthKeyFromHtml(html, detection);
  let wantId = (hints?.pairingId ?? detection.pairingId ?? "").toUpperCase().trim();
  if (wantId.includes(":")) {
    wantId = wantId.split(":")[0]!.trim().toUpperCase();
  }

  const pickPairing = (month: ReturnType<typeof parseFlicaScheduleHtml>): FlicaPairing | null => {
    let p: FlicaPairing | null = null;
    if (wantId) {
      p =
        month.pairings.find((x) => x.id.toUpperCase() === wantId) ??
        month.pairings.find((x) => wantId.startsWith(x.id.toUpperCase().split(":")[0] ?? "")) ??
        null;
    }
    if (!p && month.pairings.length === 1) p = month.pairings[0] ?? null;
    if (!p && month.pairings.length > 0) p = month.pairings[0] ?? null;
    return p;
  };

  const tryParse = (o: ParseFlicaScheduleHtmlOptions): FlicaPairing | null => {
    const month = parseFlicaScheduleHtml(html, monthKey, o);
    return pickPairing(month);
  };

  let pairing = tryParse({});

  if (!pairing && rbcpairPage) {
    pairing = tryParse({
      treatWholeDocumentAsSinglePairingWhenNoBlocks: true,
      rbcpairForceWholeDocument: titlePairingPage || Boolean(hints?.forceRbcpairWholeDocument),
      responseFromRbcpairDetailUrl: hints?.responseFromRbcpairDetailUrl,
    });
  }

  if (!pairing && rbcpairPage) {
    pairing = tryParse({
      treatWholeDocumentAsSinglePairingWhenNoBlocks: true,
      rbcpairForceWholeDocument: true,
      responseFromRbcpairDetailUrl: hints?.responseFromRbcpairDetailUrl,
    });
  }

  if (!pairing) {
    return {
      ok: false,
      detection,
      monthKey,
      pairing: null,
      summary: null,
      error: "FLICA rbcpair / pairing detail HTML could not be parsed into a pairing block",
    };
  }

  return {
    ok: true,
    detection,
    monthKey,
    pairing,
    summary: pairingToSummary(pairing),
  };
}

export function formatPairingDetailParseProbe(
  result: FlicaParsedReplayPairingResult,
): string {
  const lines: string[] = [];
  lines.push("[FLICA_PAIRING_DETAIL_PARSE_PROBE]");
  lines.push(`ok=${result.ok}`);
  lines.push(`isPairingDetail=${result.detection.isPairingDetail}`);
  lines.push(`markers=${result.detection.sourceHints.join(",") || "(none)"}`);
  lines.push(`detectedPairingId=${result.detection.pairingId ?? "(none)"}`);
  lines.push(`monthKey=${result.monthKey}`);
  if (result.error) lines.push(`error=${result.error}`);
  if (result.summary) {
    const s = result.summary;
    lines.push(`pairingId=${s.pairingId}`);
    lines.push(`startDate=${s.startDate}`);
    lines.push(`endDate=${s.endDate}`);
    lines.push(`days=${s.daysOfWeek}`);
    lines.push(`report=${s.report}`);
    lines.push(`route=${s.routeSummary}`);
    lines.push(`layovers=${s.layoverCount} hotels=${s.hotelCount} crew=${s.crewCount} legs=${s.legCount}`);
    lines.push(`dEnd=${s.dEnd} tafb=${s.tafb} credit=${s.credit} block=${s.block}`);
  }
  return lines.join("\n");
}
