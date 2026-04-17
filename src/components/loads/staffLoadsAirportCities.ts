/** Common IATA → primary city label for Staff Loads flight status UI. */
const AIRPORT_CITIES: Record<string, string> = {
  ATL: 'Atlanta',
  BOS: 'Boston',
  CLT: 'Charlotte',
  DFW: 'Dallas',
  DEN: 'Denver',
  DTW: 'Detroit',
  EWR: 'Newark',
  FLL: 'Fort Lauderdale',
  IAH: 'Houston',
  JFK: 'New York',
  LAX: 'Los Angeles',
  LGA: 'New York',
  MCO: 'Orlando',
  MIA: 'Miami',
  MSP: 'Minneapolis',
  ORD: 'Chicago',
  PHL: 'Philadelphia',
  PHX: 'Phoenix',
  SEA: 'Seattle',
  SFO: 'San Francisco',
  SLC: 'Salt Lake City',
  STL: 'Saint Louis',
  LAS: 'Las Vegas',
  SAN: 'San Diego',
  TPA: 'Tampa',
  BWI: 'Baltimore',
  DCA: 'Washington',
  IAD: 'Washington',
};

export function staffLoadsAirportCity(code: string | null | undefined): string {
  const k = (code || '').trim().toUpperCase();
  if (!k) return '—';
  return AIRPORT_CITIES[k] ?? k;
}
