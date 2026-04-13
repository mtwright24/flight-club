/**
 * OCR station-code cleanup before route summaries and persistence.
 * Prefer dictionary fixes + simple neighbor/base context (not full geography).
 */

const KNOWN = new Set(
  [
    'JFK',
    'LHR',
    'LAS',
    'MCO',
    'SFO',
    'BOS',
    'SAN',
    'LAX',
    'SEA',
    'FLL',
    'MIA',
    'ATL',
    'ORD',
    'DEN',
    'PHX',
    'SLC',
    'PDX',
    'AUS',
    'MSY',
    'BUF',
    'RIC',
    'DCA',
    'IAD',
    'EWR',
    'LGA',
    'HPN',
    'PBI',
    'RSW',
    'TPA',
    'SJU',
    'STT',
    'BGI',
    'CUN',
    'PIT',
    'CLT',
    'RDU',
    'CHS',
    'SAV',
    'JAX',
    'PVD',
    'PWM',
    'BTV',
  ].map((s) => s.toUpperCase())
);

function isPlausible(code: string): boolean {
  return KNOWN.has(code) || /^[A-Z]{3}$/.test(code);
}

/**
 * Normalize a single 3-letter code using dictionary + neighbor hints.
 * @param neighbors other stations in the same pairing block (from segments + base)
 */
export function normalizeStationCode(code: string | null | undefined, neighbors: Set<string>, base: string | null): string | null {
  if (!code) return null;
  let u = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  if (u.length !== 3) return null;

  if (u === 'JHR') return 'JFK';
  if (u === 'JIK' || u === 'J1K') return 'JFK';
  if (u === 'JAS' && (neighbors.has('LAS') || neighbors.has('MCO'))) return 'LAS';
  if (u === 'JSF') return 'SFO';

  if (!KNOWN.has(u) && base && u.slice(0, 2) === base.slice(0, 2)) {
    if (KNOWN.has(base)) return base;
  }

  return isPlausible(u) ? u : null;
}

export function normalizeSegmentStations(
  dep: string | null,
  arr: string | null,
  neighbors: Set<string>,
  base: string | null
): { dep: string | null; arr: string | null } {
  const n = new Set(neighbors);
  if (dep) n.add(dep.toUpperCase());
  if (arr) n.add(arr.toUpperCase());
  if (base) n.add(base.toUpperCase());
  return {
    dep: normalizeStationCode(dep, n, base),
    arr: normalizeStationCode(arr, n, base),
  };
}

/** Mutates segment stations in-place using block-level neighbor context. */
export function normalizePairingSegments(
  dutyDays: { segments: { departureStation: string | null; arrivalStation: string | null }[] }[],
  baseCode: string | null
): void {
  const baseTok = baseCode?.split('/')[0]?.trim().toUpperCase() ?? null;
  const neighborSet = new Set<string>();
  if (baseTok) neighborSet.add(baseTok);
  for (const dd of dutyDays) {
    for (const s of dd.segments) {
      if (s.departureStation) neighborSet.add(s.departureStation.toUpperCase());
      if (s.arrivalStation) neighborSet.add(s.arrivalStation.toUpperCase());
    }
  }
  for (const dd of dutyDays) {
    for (const s of dd.segments) {
      const r = normalizeSegmentStations(s.departureStation, s.arrivalStation, neighborSet, baseTok);
      s.departureStation = r.dep;
      s.arrivalStation = r.arr;
    }
  }
}
