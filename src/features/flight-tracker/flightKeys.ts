/** Pure flight key helpers — no supabase imports (avoids require cycles with mappers). */

export function buildFlightKey(input: {
  airlineCode: string;
  flightNumber: string;
  serviceDate: string;
  origin?: string | null;
  destination?: string | null;
}): string {
  const airline = String(input.airlineCode || '').trim().toUpperCase();
  const flight = String(input.flightNumber || '').trim().toUpperCase();
  const date = String(input.serviceDate || '').trim();
  const origin = String(input.origin || '').trim().toUpperCase();
  const destination = String(input.destination || '').trim().toUpperCase();
  return `${airline}-${flight}-${date}-${origin || 'UNK'}-${destination || 'UNK'}`;
}

/** Parse canonical flight_key: AIRLINE-FN-YYYY-MM-DD-ORIG-DEST */
export function parseFlightKey(flightKey: string): {
  airlineCode: string;
  flightNumber: string;
  serviceDate: string;
  origin: string;
  destination: string;
} | null {
  const s = String(flightKey || '').trim();
  const m = s.match(/^([A-Z0-9]{2,3})-(\d+[A-Z]?)-(\d{4}-\d{2}-\d{2})-([A-Z]{3})-([A-Z]{3})$/i);
  if (!m) return null;
  return {
    airlineCode: m[1].toUpperCase(),
    flightNumber: m[2].toUpperCase(),
    serviceDate: m[3],
    origin: m[4].toUpperCase(),
    destination: m[5].toUpperCase(),
  };
}
