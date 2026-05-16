import type { CapturedFlicaPairingLink } from "./flicaActionRecorderTypes";
import { resolveFlicaAbsoluteUrl } from "./flicaTradeBoardAllRequestsForm";

const FLICA_ORIGIN = "https://jetblue.flica.net";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export type FlicaPairOnclick = {
  pid: string;
  dateYmd: string;
};

/** FLICA Open Time: `pair("J3B47","20260613",0,0,"",0,"FA")` */
export function parseFlicaPairOnclick(onclick: string): FlicaPairOnclick | null {
  const m = String(onclick ?? "").match(
    /\bpair\s*\(\s*["']([^"']+)["']\s*,\s*["'](\d{8})["']/i,
  );
  if (!m) return null;
  const pid = m[1].trim().toUpperCase();
  const dateYmd = m[2].trim();
  if (!pid || !/^\d{8}$/.test(dateYmd)) return null;
  return { pid, dateYmd };
}

export function ymdToDdMmmToken(dateYmd: string): string | undefined {
  if (!/^\d{8}$/.test(dateYmd)) return undefined;
  const day = Number(dateYmd.slice(6, 8));
  const mon = Number(dateYmd.slice(4, 6)) - 1;
  if (!Number.isFinite(day) || mon < 0 || mon > 11) return undefined;
  return `${day}${MONTHS[mon]}`;
}

/** Normalize FLICA `DDMMM` tokens for matching (strips leading zeros on day). */
export function normalizeFlicaDdMmmToken(tok: string): string {
  const m = String(tok ?? "")
    .trim()
    .toUpperCase()
    .match(/^0*(\d{1,2})([A-Z]{3})$/);
  if (!m) return String(tok ?? "").trim().toUpperCase();
  return `${Number(m[1])}${m[2]}`;
}

/** Scan HTML/scripts for `pair("PID","YYYYMMDD",…)` (Open Time + Tradeboard pairing links). */
export function extractPairOnclickPidYmdsFromHtml(html: string): FlicaPairOnclick[] {
  const src = String(html ?? "");
  const out: FlicaPairOnclick[] = [];
  const seen = new Set<string>();
  const re = /\bpair\s*\(\s*["']([^"']+)["']\s*,\s*["'](\d{8})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const pid = m[1].trim().toUpperCase();
    const dateYmd = m[2].trim();
    if (!/^J[A-Z0-9]{3,5}$/.test(pid) || !/^\d{8}$/.test(dateYmd)) continue;
    const k = `${pid}|${dateYmd}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ pid, dateYmd });
  }
  return out;
}

export function buildOpenTimePairingDetailUrl(pid: string, dateYmd: string): string {
  const q = new URLSearchParams({
    DCOR: "7",
    cfg: "7",
    PID: pid,
    DATE: dateYmd,
  });
  return `${FLICA_ORIGIN}/full/rbcpair.cgi?${q.toString()}`;
}

export function buildTradeboardPairingDetailUrl(pid: string, dateYmd: string): string {
  const q = new URLSearchParams({
    PID: pid,
    DATE: dateYmd,
    Splits: "",
  });
  return `${FLICA_ORIGIN}/full/RBCPair.cgi?${q.toString()}`;
}

function isJavascriptHref(href: string): boolean {
  return /^javascript:/i.test(String(href ?? "").trim());
}

export function isFlicaPairingDetailHttpUrl(abs: string): boolean {
  return /\/full\/rbcpair\.cgi/i.test(abs) || /\/full\/RBCPair\.cgi/i.test(abs);
}

export function inferPairingDetailSource(
  source: CapturedFlicaPairingLink["source"],
  frameUrl: string,
  topUrl: string,
): CapturedFlicaPairingLink["source"] {
  if (source !== "unknown") return source;
  const u = `${frameUrl} ${topUrl}`.toLowerCase();
  if (u.includes("tb_") || u.includes("tradeboard") || u.includes("tb_frame")) return "tradeboard";
  if (u.includes("ot") || u.includes("opentime")) return "opentime";
  return "unknown";
}

/**
 * Resolve a captured pairing anchor to a replayable FLICA detail URL.
 * javascript:void(0) + pair(...) → rbcpair.cgi (OT) or RBCPair.cgi (TB).
 */
export function resolveFlicaPairingDetailUrl(input: {
  source: CapturedFlicaPairingLink["source"];
  href: string;
  onclick: string;
  frameUrl?: string;
  topUrl?: string;
}): {
  absoluteUrl: string;
  href: string;
  pidFromOnclick?: string;
  dateYmd?: string;
} | null {
  const hrefRaw = String(input.href ?? "").trim();
  const onclick = String(input.onclick ?? "").trim();

  if (hrefRaw && !isJavascriptHref(hrefRaw)) {
    const abs = resolveFlicaAbsoluteUrl(hrefRaw);
    if (isFlicaPairingDetailHttpUrl(abs)) {
      return { absoluteUrl: abs, href: abs };
    }
  }

  const parsed = parseFlicaPairOnclick(onclick);
  if (!parsed) return null;

  const source = inferPairingDetailSource(
    input.source,
    input.frameUrl ?? "",
    input.topUrl ?? "",
  );
  const abs =
    source === "tradeboard"
      ? buildTradeboardPairingDetailUrl(parsed.pid, parsed.dateYmd)
      : buildOpenTimePairingDetailUrl(parsed.pid, parsed.dateYmd);

  return {
    absoluteUrl: abs,
    href: abs,
    pidFromOnclick: parsed.pid,
    dateYmd: parsed.dateYmd,
  };
}
