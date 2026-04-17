/**
 * TEMP PoC — best-effort regex parse of visible FLICA-like page text.
 * Read-only debug; not production schedule logic.
 */

export type FlicaPoCReviewModel = {
  metrics: { label: string; value: string }[];
  pairingIds: string[];
  reportTimes: string[];
  cityCodes: string[];
  dEndOrLayoverHints: string[];
  rawPreview: string;
};

const PAIRING_HEAD = /\bJ[A-Z0-9]{3,6}\s*[:/.]?\s*\d{1,2}\s*[A-Za-z]{3}\b/gi;
const PAIRING_ID_ONLY = /\bJ\d{4}\b/gi;
const TIME_HHMM = /\b\d{1,2}:\d{2}\b/g;
/** 3-letter station tokens (no digits) — noisy but useful for PoC */
const CITYISH = /\b[A-Z]{3}\b/g;

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function metricLine(text: string, label: RegExp): string | null {
  const m = text.match(new RegExp(`(${label.source})\\s*[:.]?\\s*([^\\n]{1,40})`, 'i'));
  if (!m) return null;
  return `${m[1]?.trim() ?? ''}: ${m[2]?.trim() ?? ''}`.replace(/\s+/g, ' ');
}

export function parseFlicaPoCPageText(raw: string): FlicaPoCReviewModel {
  const t = raw.replace(/\r/g, '\n');
  const metrics: { label: string; value: string }[] = [];

  const tryMetric = (name: string, re: RegExp) => {
    const line = metricLine(t, re);
    if (line) {
      const parts = line.split(':');
      metrics.push({
        label: name,
        value: parts.slice(1).join(':').trim() || line,
      });
    }
  };

  tryMetric('BLOCK', /\bBLOCK\b/i);
  tryMetric('CREDIT', /\bCREDIT\b/i);
  tryMetric('TAFB', /\bTAFB\b/i);
  tryMetric('YTD', /\bYTD\b/i);
  tryMetric('DAYS OFF', /\bDAYS?\s*OFF\b/i);

  const pairingIds = uniq([
    ...(t.match(PAIRING_HEAD) ?? []),
    ...(t.match(PAIRING_ID_ONLY) ?? []),
  ]).slice(0, 80);

  const reportTimes = uniq((t.match(TIME_HHMM) ?? []).map((s) => s)).slice(0, 60);

  const cityRaw = t.match(CITYISH) ?? [];
  const cityCodes = uniq(
    cityRaw.filter((c) => !['THE', 'AND', 'FOR', 'OFF', 'END', 'MAY', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].includes(c))
  ).slice(0, 40);

  const dEndOrLayoverHints: string[] = [];
  const lines = t.split('\n');
  for (const line of lines) {
    if (/\bD-?END\b|\bLAYOVER\b|\bCONT\b|\bTAFB\b/i.test(line)) {
      dEndOrLayoverHints.push(line.trim().slice(0, 120));
      if (dEndOrLayoverHints.length >= 25) break;
    }
  }

  const rawPreview = t.length > 4000 ? `${t.slice(0, 4000)}\n… [truncated ${t.length} chars]` : t;

  return {
    metrics,
    pairingIds,
    reportTimes,
    cityCodes,
    dEndOrLayoverHints,
    rawPreview,
  };
}

/** Count how many success keywords appear (lowercase) */
export function countAuthKeywordHits(lower: string): number {
  const keys = ['main menu', 'schedule', 'pairing', 'block', 'credit'] as const;
  let n = 0;
  for (const k of keys) {
    if (lower.includes(k)) n += 1;
  }
  return n;
}
