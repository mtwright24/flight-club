import {
  extractFlicaHtmlTitle,
  parseReplayHtmlAsPairingDetail,
} from "../flica-actions/flicaPairingDetailDetect";
import { fetchFlicaHtmlUsingWebViewSession } from "../flica-actions/flicaActionsHttp";
import { parseFlicaScheduleHtml } from "../../services/flicaScheduleHtmlParser";
import { flicaPairingToMarketplaceDetail } from "./flicaMarketplacePairingDetailFromParsed";
import type { FlicaMarketplacePairingDetail } from "./flicaMarketplacePairingDetailTypes";
import { flicaHtmlLooksLikeSessionOrApplicationFailure } from "./crewHubFlicaLiveGate";

function monthKeyFromDetailUrl(url: string, fallbackYm: string): string {
  try {
    const d = new URL(url).searchParams.get("DATE");
    if (d && /^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}`;
  } catch {
    /* ignore */
  }
  return fallbackYm.length >= 7 ? fallbackYm.slice(0, 7) : "2026-01";
}

function pidFromDetailUrl(url: string): string | undefined {
  try {
    const p = new URL(url).searchParams.get("PID")?.trim().toUpperCase();
    return p || undefined;
  } catch {
    return undefined;
  }
}

/** Markers to diagnose whether the HTTP response looks like pairing detail vs frame/login. */
function pairingDetailFetchMarkers(html: string): Record<string, boolean> {
  const blob = html.slice(0, 120000);
  const lower = blob.toLowerCase();
  return {
    baseEquip: /base\s*\/\s*equip/i.test(blob),
    bseRept: /\bbse\s+rept/i.test(blob),
    dyDdDhFlow: /dy\s+dd\s+dh/i.test(blob) || /\bDY\b.*\bDD\b.*\bDH\b/.test(blob),
    tafb: /\bt\.?\s*a\.?\s*f\.?\s*b\.?\b/i.test(blob),
    crew: /\bcrew\s*:/i.test(blob),
    rbcpairInHtml: /rbcpair/i.test(blob),
    rbcpairPath: /\/full\/rbcpair\.cgi/i.test(lower),
    otframe: /otframe\.cgi/i.test(lower),
    otopentimepot: /otopentimepot\.cgi/i.test(lower),
    loginForm: /(userid|user\s*id).{0,120}password/i.test(lower) && /login|logon/i.test(lower),
    captcha: /recaptcha|turnstile|g-recaptcha/i.test(lower),
  };
}

export type FlicaMarketplaceFetchDebugRow = {
  pairingId: string;
  date?: string;
  pairingDetailUrl?: string;
  dateYmd?: string;
  sourceBcid?: string;
  sourceOpenTimePotUrl?: string;
  sourceOtFrameUrl?: string;
  pairingDetailUrlFromLiveHtml?: boolean;
  /** True when URL was built client-side (not used for hub marketplace when gate is on). */
  urlIsSyntheticFallback?: boolean;
};

/**
 * Fetch FLICA pairing detail HTML with saved WebView cookies and map to native marketplace model.
 */
export async function fetchFlicaMarketplacePairingDetail(
  detailUrl: string,
  source: "tradeboard" | "opentime",
  opts?: {
    referer?: string;
    monthFallback?: string;
    /** Logged on parse failure (Open Time diagnostics). */
    debugRow?: FlicaMarketplaceFetchDebugRow;
  },
): Promise<FlicaMarketplacePairingDetail> {
  const u = String(detailUrl ?? "").trim();
  if (!u) throw new Error("Missing pairing detail URL");

  let fetchPath = "";
  let urlPid = "";
  let urlDate = "";
  try {
    const parsedUrl = new URL(u);
    fetchPath = parsedUrl.pathname;
    urlPid = parsedUrl.searchParams.get("PID")?.trim() ?? "";
    urlDate = parsedUrl.searchParams.get("DATE")?.trim() ?? "";
  } catch {
    throw new Error(`Invalid pairing detail URL: ${u}`);
  }

  if (source === "opentime") {
    if (!/\/full\/rbcpair\.cgi/i.test(fetchPath)) {
      throw new Error(
        `Open Time detail must use /full/rbcpair.cgi (DCOR=7&cfg=7&PID&DATE). Path was: ${fetchPath}\nURL: ${u}`,
      );
    }
    if (!/^J[A-Z0-9]{3,5}$/i.test(urlPid)) {
      throw new Error(`Open Time URL missing valid PID. PID="${urlPid}" URL=${u}`);
    }
    if (!/^\d{8}$/.test(urlDate)) {
      throw new Error(`Open Time URL missing YYYYMMDD DATE. DATE="${urlDate}" URL=${u}`);
    }
  }

  const { status, html } = await fetchFlicaHtmlUsingWebViewSession(u, {
    referer: opts?.referer?.trim() || undefined,
  });
  if (status < 200 || status >= 400 || !html?.trim()) {
    throw new Error(`FLICA pairing detail HTTP ${status} (empty body)\nURL: ${u}`);
  }

  if (flicaHtmlLooksLikeSessionOrApplicationFailure(html)) {
    const title = extractFlicaHtmlTitle(html);
    throw new Error(
      [
        "FLICA_APPLICATION_OR_SESSION_ERROR",
        `finalFetchUrl=${u}`,
        `httpStatus=${status} htmlLen=${html.length}`,
        `title=${title}`,
        `selectedRow.pairingDetailUrl=${opts?.debugRow?.pairingDetailUrl ?? "(none)"}`,
      ].join("\n"),
    );
  }

  const fallbackYm = opts?.monthFallback?.trim() || new Date().toISOString().slice(0, 7);
  const monthKey = monthKeyFromDetailUrl(u, fallbackYm);
  const wantPid = pidFromDetailUrl(u);

  const fromRbcpairDetailUrl = /\/full\/rbcpair\.cgi/i.test(fetchPath);

  const parsed = parseReplayHtmlAsPairingDetail(html, {
    pairingId: wantPid,
    monthKey,
    /** Open Time rows use live rbcpair URLs — allow whole-document pairing parse without scheduledetail split markers. */
    forceRbcpairWholeDocument: source === "opentime",
    responseFromRbcpairDetailUrl: fromRbcpairDetailUrl,
  });

  if (!parsed.ok || !parsed.pairing) {
    const title = extractFlicaHtmlTitle(html);
    const markers = pairingDetailFetchMarkers(html);
    const extracted = parseFlicaScheduleHtml(html, monthKey).pairings.length;
    const extractedWhole = parseFlicaScheduleHtml(html, monthKey, {
      treatWholeDocumentAsSinglePairingWhenNoBlocks: true,
      rbcpairForceWholeDocument: true,
      responseFromRbcpairDetailUrl: fromRbcpairDetailUrl,
    }).pairings.length;
    const head = html.slice(0, 1500).replace(/\s+/g, " ");
    const dr = opts?.debugRow;
    const appErr = flicaHtmlLooksLikeSessionOrApplicationFailure(html);
    const lines = [
      source === "opentime" ? "Open Time pairing detail could not be parsed." : "Tradeboard pairing detail could not be parsed.",
      "",
      `refreshedAt=(see hub load) sourceHtmlUrl=(see hub) rowsCount=(see hub)`,
      `selectedRow.pairingId=${dr?.pairingId ?? "(none)"}`,
      `selectedRow.date=${dr?.date ?? "(none)"}`,
      `selectedRow.dateYmd=${dr?.dateYmd ?? "(none)"}`,
      `selectedRow.sourceBcid=${dr?.sourceBcid ?? "(none)"}`,
      `selectedRow.sourceOpenTimePotUrl=${dr?.sourceOpenTimePotUrl ?? "(none)"}`,
      `selectedRow.sourceOtFrameUrl=${dr?.sourceOtFrameUrl ?? "(none)"}`,
      `selectedRow.pairingDetailUrl=${dr?.pairingDetailUrl ?? "(none)"}`,
      `selectedRow.pairingDetailUrlFromLiveHtml=${String(dr?.pairingDetailUrlFromLiveHtml ?? false)}`,
      `selectedRow.urlIsSyntheticFallback=${String(dr?.urlIsSyntheticFallback ?? false)}`,
      `finalFetchUrl=${u}`,
      `fetchPath=${fetchPath} PID=${urlPid} DATE=${urlDate}`,
      `httpStatus=${status} htmlLen=${html.length}`,
      `title=${title}`,
      `applicationOrSessionError=${String(appErr)}`,
      `markers=${JSON.stringify(markers)}`,
      `parseMarkers=${parsed.detection.sourceHints.join(",") || "(none)"}`,
      `pairingBlocksExtracted=${extracted}`,
      `pairingBlocksExtractedWholeDocFallback=${extractedWhole}`,
      `parserMessage=${parsed.error ?? ""}`,
      "",
      "htmlHead1500:",
      head,
    ];
    const msg = lines.join("\n");
    console.warn("[FLICA_MARKETPLACE_PARSE_FAIL]\n", msg);
    throw new Error(msg);
  }

  return flicaPairingToMarketplaceDetail(parsed.pairing, source, {
    monthKey: parsed.monthKey,
    rawHtml: html,
  });
}

/** Alias matching crew-hub naming; same as {@link fetchFlicaMarketplacePairingDetail}. */
export const openFlicaMarketplacePairingDetail = fetchFlicaMarketplacePairingDetail;
