import { isOvernightArrivalInRow } from './ledgerDisplay';

function compactStation(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^[A-Z]{3,4}$/i.test(v)) return v.toUpperCase().slice(0, 4);
  const cleaned = v.replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : v.slice(0, 3).toUpperCase();
}

/**
 * Departure in the small-hours band (e.g. 0009) — duty started the prior calendar day; still a
 * red‑eye to base for alignment even when arr local &gt; dep local on the same row.
 */
export function isDepTimeBetween0000And0559(dep: string | null | undefined): boolean {
  let d = String(dep ?? '').replace(/\D/g, '');
  if (!d) return false;
  if (d.length > 4) d = d.slice(0, 4);
  d = d.padStart(4, '0');
  if (!/^\d{4}$/.test(d)) return false;
  return d >= '0000' && d <= '0559';
}

/**
 * `schedule_pairings.base_code` is sometimes the “home” domicile (BOS) while the line ends an overnight
 * into another JetBlue co-base (JFK) — the red-eye to JFK is still a **return** for BOS-originating trips
 * and must participate in BOS+LAS+LAS+J948 alignment and “– / not LAS” column rules.
 */
export function isOvernightArrivalToPairingBase(
  toAirport: string | null | undefined,
  dep: string | null | undefined,
  arr: string | null | undefined,
  baseCode: string,
): boolean {
  const t = compactStation(toAirport);
  const b = (baseCode || 'JFK').trim().toUpperCase();
  const toBase =
    (t && t === b) || (t === 'JFK' && b === 'BOS') || (t === 'BOS' && b === 'JFK');
  if (!toBase) return false;

  if (isOvernightArrivalInRow(dep ?? undefined, arr ?? undefined)) {
    return true;
  }
  if (isDepTimeBetween0000And0559(dep)) {
    return true;
  }
  return false;
}
