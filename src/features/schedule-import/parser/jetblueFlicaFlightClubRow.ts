/**
 * Maps one JetBlue FLICA pairing block → one Flight Club schedule row (classic list columns).
 * The row is assembled from header + BSE REPT + first duty/layover context — not a single OCR line.
 */

import type { JetBluePairingParsed } from './jetblueFlicaStructuredParser';

export type JetBlueFlicaFlightClubRow = {
  rowDateIso: string | null;
  /** SU..SA — matches schedule_entries.day_of_week usage */
  dayOfWeekShort: string;
  pairingCode: string;
  reportDigits: string | null;
  /** schedule_entries.city: JFK-DUB so tripMapper builds legs (arrival = layover city column) */
  cityRoute: string | null;
  dEndDigits: string | null;
  /** schedule_entries.layover: e.g. DUB 2430 for formatLayoverColumnDisplay */
  layoverDisplay: string | null;
  confidence: number;
  needsReview: boolean;
};

const DOW3 = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function isoToDowThreeLetter(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return DOW3[d.getDay()];
}

function extractDEndDigitsFromText(text: string): string | null {
  const m = text.match(/D-END\s*:?\s*(\d{3,4})L?\b/i);
  return m ? m[1].replace(/\D/g, '').slice(0, 4) : null;
}

function digitsFromBseRept(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  return d.length >= 3 ? d.slice(0, 4) : null;
}

function routeFromParserChain(p: JetBluePairingParsed): { route: string; arrival: string } | null {
  const chain = (p.routeSummary ?? '').trim();
  if (!chain) return null;
  const stations = chain
    .replace(/\s*→\s*/g, '-')
    .split(/-+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const arrival = stations[stations.length - 1];
  if (!arrival) return null;
  return { route: stations.join('-'), arrival };
}

function firstRouteFromSegments(p: JetBluePairingParsed): { route: string; arrival: string } | null {
  for (const dd of p.dutyDays) {
    for (const seg of dd.segments) {
      if (seg.departureStation && seg.arrivalStation) {
        return {
          route: `${seg.departureStation}-${seg.arrivalStation}`,
          arrival: seg.arrivalStation,
        };
      }
    }
  }
  return null;
}

function firstRouteFromRaw(raw: string): { route: string; arrival: string } | null {
  const m = raw.match(/\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/);
  if (!m) return null;
  return { route: `${m[1]}-${m[2]}`, arrival: m[2] };
}

/**
 * FD/PLAYOVER-style "DUB 2430" — skip BSE REPT lines; prefer city matching first arrival.
 */
function extractLayoverPlayover(raw: string, arrivalHint: string | null): string | null {
  const lines = raw.split(/\n/);
  const candidates: { city: string; rest: string; score: number }[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || /BSE\s*REPT/i.test(t)) continue;
    let m: RegExpExecArray | null;
    const re = /\b([A-Z]{3})\s+(\d{4})\b/g;
    while ((m = re.exec(t)) !== null) {
      const city = m[1];
      const rest = m[2];
      const n = Number(rest);
      let score = 0;
      if (arrivalHint && city === arrivalHint) score += 3;
      if (rest === '2430' || rest === '2450' || rest === '2045' || rest === '1227') score += 2;
      if (n >= 1200 && n <= 3059 && !(n >= 1900 && n <= 1959)) score += 1;
      if (n >= 1900 && n <= 1959) score -= 2;
      candidates.push({ city, rest, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 1) {
    if (arrivalHint) {
      const rx = new RegExp(`\\b${arrivalHint}\\s+(\\d{4})\\b`, 'i');
      const m2 = rx.exec(raw);
      if (m2) return `${arrivalHint} ${m2[1]}`;
    }
    return null;
  }
  return `${best.city} ${best.rest}`;
}

/**
 * Build one Flight Club row from a parsed pairing block (pairing-start / first duty day).
 */
export function deriveFlightClubRowFromParsedPairing(p: JetBluePairingParsed): JetBlueFlicaFlightClubRow | null {
  if (!p.pairingCode || p.pairingCode === 'UNKNOWN') return null;

  const rowDateIso = p.pairingStartIso;
  const dayOfWeekShort = rowDateIso ? isoToDowThreeLetter(rowDateIso) : 'MO';

  const route =
    routeFromParserChain(p) ?? firstRouteFromSegments(p) ?? firstRouteFromRaw(p.rawBlock);
  const reportDigits = digitsFromBseRept(p.baseReportTime);

  let dEndDigits: string | null = null;
  for (const dd of p.dutyDays) {
    if (dd.dEndNotes) {
      dEndDigits = extractDEndDigitsFromText(dd.dEndNotes);
      if (dEndDigits) break;
    }
  }
  if (!dEndDigits) dEndDigits = extractDEndDigitsFromText(p.rawBlock);

  const arrival = route?.arrival ?? null;
  const layoverDisplay =
    extractLayoverPlayover(p.rawBlock, arrival) ??
    (p.layoverStations.length > 0 ? p.layoverStations.join(' · ') : null);

  let filled = 0;
  if (rowDateIso) filled += 1;
  if (p.pairingCode) filled += 1;
  if (reportDigits) filled += 1;
  if (route?.route) filled += 1;
  if (dEndDigits) filled += 1;
  if (layoverDisplay) filled += 1;

  let confidence = Math.min(0.95, 0.52 + filled * 0.065);
  confidence = Math.min(confidence, p.confidence);
  const needsReview =
    filled < 4 || !rowDateIso || !route?.route || p.needsReview || p.confidence < 0.55;

  return {
    rowDateIso,
    dayOfWeekShort,
    pairingCode: p.pairingCode,
    reportDigits,
    cityRoute: route?.route ?? null,
    dEndDigits,
    layoverDisplay,
    confidence,
    needsReview,
  };
}
