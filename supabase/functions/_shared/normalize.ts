import {
  buildFlightKey,
  compact,
  fetchProviderJson,
  firstProviderFlight,
  num,
  parseDate,
} from './flightaware_aeroapi.ts';

export type Json = Record<string, unknown>;

export type {
  FlightProviderId,
  LookupFlightInput,
  TrackerStatus,
  NormalizedFlightTrackerResult,
  NormalizedSearchResultItem,
  NormalizedBoardRow,
} from './flight_providers/types.ts';

function toTrackerStatus(raw: string | null | undefined): TrackerStatus {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('divert')) return 'diverted';
  if (s.includes('land')) return 'landed';
  if (s.includes('delay')) return 'delayed';
  if (s.includes('enroute') || s.includes('en route') || s.includes('airborne')) return 'airborne';
  if (s.includes('depart') || s.includes('taxi')) return 'departed';
  if (s.includes('board')) return 'boarding';
  if (s.includes('sched')) return 'scheduled';
  return 'unknown';
}

function computeDelayMinutes(
  scheduledDeparture: string | null,
  estimatedDeparture: string | null,
  scheduledArrival: string | null,
  estimatedArrival: string | null,
): number | null {
  const sDep = scheduledDeparture ? new Date(scheduledDeparture).getTime() : NaN;
  const eDep = estimatedDeparture ? new Date(estimatedDeparture).getTime() : NaN;
  if (Number.isFinite(sDep) && Number.isFinite(eDep)) {
    return Math.round((eDep - sDep) / 60000);
  }
  const sArr = scheduledArrival ? new Date(scheduledArrival).getTime() : NaN;
  const eArr = estimatedArrival ? new Date(estimatedArrival).getTime() : NaN;
  if (Number.isFinite(sArr) && Number.isFinite(eArr)) {
    return Math.round((eArr - sArr) / 60000);
  }
  return null;
}

/** Map a FlightAware flight object to normalized tracker result */
export function mapProviderFlightToNormalized(
  providerFlight: Json,
  fallback: {
    airlineCode?: string;
    flightNumber?: string;
    serviceDate: string;
    origin?: string;
    destination?: string;
  },
): NormalizedFlightTrackerResult | null {
  const ident = compact(providerFlight.ident) || compact(providerFlight.flight_number) || '';
  const airlineCode =
    compact(providerFlight.operator_iata) ||
    compact(providerFlight.airline_iata) ||
    fallback.airlineCode ||
    '';
  const digits = ident.replace(/^[A-Z]+/i, '') || fallback.flightNumber || '';
  const origin =
    compact(providerFlight.origin?.toString()) ||
    compact((providerFlight.origin as Json)?.code_iata) ||
    fallback.origin ||
    '';
  const destination =
    compact(providerFlight.destination?.toString()) ||
    compact((providerFlight.destination as Json)?.code_iata) ||
    fallback.destination ||
    '';
  if (!airlineCode || !digits || !origin || !destination) return null;

  const scheduledDeparture = parseDate(
    providerFlight.scheduled_out || providerFlight.scheduled_departure_time || providerFlight.scheduled_departure,
  );
  const scheduledArrival = parseDate(
    providerFlight.scheduled_in || providerFlight.scheduled_arrival_time || providerFlight.scheduled_arrival,
  );
  const estimatedDeparture = parseDate(
    providerFlight.estimated_out || providerFlight.estimated_departure_time || providerFlight.estimated_departure,
  );
  const estimatedArrival = parseDate(
    providerFlight.estimated_in || providerFlight.estimated_arrival_time || providerFlight.estimated_arrival,
  );
  const actualDeparture = parseDate(
    providerFlight.actual_out || providerFlight.actual_departure_time || providerFlight.actual_departure,
  );
  const actualArrival = parseDate(providerFlight.actual_in || providerFlight.actual_arrival_time || providerFlight.actual_arrival);
  const rawStatus =
    compact(providerFlight.status) ||
    compact(providerFlight.flight_status) ||
    compact(providerFlight.status_text) ||
    compact(providerFlight.progress) ||
    'unknown';

  const depGate = compact(providerFlight.gate_origin) || compact(providerFlight.gate);
  const arrGate = compact(providerFlight.gate_destination);
  const depTerm = compact(providerFlight.terminal_origin) || compact(providerFlight.terminal);
  const arrTerm = compact(providerFlight.terminal_destination);

  const delay = computeDelayMinutes(scheduledDeparture, estimatedDeparture, scheduledArrival, estimatedArrival);
  const faId = compact(providerFlight.fa_flight_id) || compact(providerFlight.provider_flight_id);

  const flightKey = buildFlightKey({
    airlineCode,
    flightNumber: digits,
    serviceDate: fallback.serviceDate,
    origin,
    destination,
  });

  const routeLabel = `${origin.toUpperCase()} → ${destination.toUpperCase()}`;

  let progressPercent: number | null = null;
  const pct = num(providerFlight.percent_complete);
  if (pct != null) progressPercent = Math.min(100, Math.max(0, Math.round(pct)));

  return {
    provider: 'flightaware',
    providerFlightId: faId ?? undefined,
    flightKey,
    carrierCode: airlineCode.toUpperCase(),
    flightNumber: digits.toUpperCase(),
    displayFlightNumber: `${airlineCode.toUpperCase()} ${digits}`,
    flightDate: fallback.serviceDate,
    status: toTrackerStatus(rawStatus),
    departureAirport: origin.toUpperCase(),
    arrivalAirport: destination.toUpperCase(),
    departureTerminal: depTerm,
    arrivalTerminal: arrTerm,
    departureGate: depGate,
    arrivalGate: arrGate,
    scheduledDepartureUtc: scheduledDeparture,
    estimatedDepartureUtc: estimatedDeparture,
    actualDepartureUtc: actualDeparture,
    scheduledArrivalUtc: scheduledArrival,
    estimatedArrivalUtc: estimatedArrival,
    actualArrivalUtc: actualArrival,
    delayMinutes: delay,
    tailNumber: compact(providerFlight.registration) || compact((providerFlight.aircraft as Json)?.registration),
    aircraftType: compact(providerFlight.aircraft_type) || compact((providerFlight.aircraft as Json)?.type),
    routeLabel,
    progressPercent,
  };
}

export function searchFlightPayloadToItem(
  f: NormalizedFlightTrackerResult,
): NormalizedSearchResultItem {
  return {
    kind: 'flight',
    carrierCode: f.carrierCode,
    flightNumber: f.flightNumber,
    displayFlightNumber: f.displayFlightNumber,
    flightDate: f.flightDate ?? '',
    departureAirport: f.departureAirport,
    arrivalAirport: f.arrivalAirport,
    status: f.status,
    providerFlightId: f.providerFlightId,
    scheduledDepartureUtc: f.scheduledDepartureUtc ?? null,
    scheduledArrivalUtc: f.scheduledArrivalUtc ?? null,
  };
}

export function toBoardRow(f: NormalizedFlightTrackerResult, boardType: 'arrivals' | 'departures'): NormalizedBoardRow {
  return {
    carrierCode: f.carrierCode,
    flightNumber: f.flightNumber,
    displayFlightNumber: f.displayFlightNumber,
    origin: f.departureAirport,
    destination: f.arrivalAirport,
    scheduledDepartureUtc: f.scheduledDepartureUtc ?? null,
    scheduledArrivalUtc: f.scheduledArrivalUtc ?? null,
    estimatedDepartureUtc: f.estimatedDepartureUtc ?? null,
    estimatedArrivalUtc: f.estimatedArrivalUtc ?? null,
    status: f.status,
    gate: boardType === 'departures' ? f.departureGate : f.arrivalGate,
    terminal: boardType === 'departures' ? f.departureTerminal : f.arrivalTerminal,
    providerFlightId: f.providerFlightId,
  };
}

export async function lookupFlightFromProvider(
  baseUrl: string,
  apiKey: string,
  args: {
    ident: string;
    serviceDate: string;
    origin?: string;
    destination?: string;
    airlineCode?: string;
    flightNumber?: string;
  },
): Promise<NormalizedFlightTrackerResult | null> {
  const { ok, json } = await fetchProviderJson(baseUrl, apiKey, `flights/${encodeURIComponent(args.ident)}`);
  if (!ok) return null;
  const providerFlight = firstProviderFlight(json);
  if (!providerFlight) return null;
  return mapProviderFlightToNormalized(providerFlight, {
    airlineCode: args.airlineCode,
    flightNumber: args.flightNumber,
    serviceDate: args.serviceDate,
    origin: args.origin,
    destination: args.destination,
  });
}

export async function searchByRoute(
  baseUrl: string,
  apiKey: string,
  origin: string,
  destination: string,
  serviceDate: string,
): Promise<NormalizedFlightTrackerResult[]> {
  const { ok, json } = await fetchProviderJson(
    baseUrl,
    apiKey,
    `airports/${encodeURIComponent(origin)}/flights/departures`,
  );
  if (!ok) return [];
  const depObj = json as Json;
  const rows = (Array.isArray(depObj.departures) ? depObj.departures : Array.isArray(depObj.flights) ? depObj.flights : []) as Json[];
  const flights: NormalizedFlightTrackerResult[] = [];
  for (const row of rows.slice(0, 40)) {
    const mapped = mapProviderFlightToNormalized(row, { serviceDate, origin, destination });
    if (!mapped) continue;
    if (mapped.arrivalAirport !== destination) continue;
    flights.push(mapped);
  }
  return flights.sort((a, b) => {
    const at = a.scheduledDepartureUtc ? new Date(a.scheduledDepartureUtc).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.scheduledDepartureUtc ? new Date(b.scheduledDepartureUtc).getTime() : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
}

export async function airportBoard(
  baseUrl: string,
  apiKey: string,
  airportCode: string,
  boardType: 'arrivals' | 'departures',
  serviceDate: string,
): Promise<NormalizedFlightTrackerResult[]> {
  const { ok, json } = await fetchProviderJson(
    baseUrl,
    apiKey,
    `airports/${encodeURIComponent(airportCode)}/flights/${boardType}`,
  );
  if (!ok) return [];
  const obj = json as Json;
  const rows = (Array.isArray(obj[boardType]) ? obj[boardType] : Array.isArray(obj.flights) ? obj.flights : []) as Json[];
  const flights: NormalizedFlightTrackerResult[] = [];
  for (const row of rows.slice(0, 60)) {
    const mapped = mapProviderFlightToNormalized(row, {
      serviceDate,
      origin: boardType === 'departures' ? airportCode : undefined,
      destination: boardType === 'arrivals' ? airportCode : undefined,
    });
    if (mapped) flights.push(mapped);
  }
  return flights;
}

export function riskFromInboundDelay(minutesLate: number | null): 'low' | 'medium' | 'high' | 'unknown' {
  if (minutesLate == null || Number.isNaN(minutesLate)) return 'unknown';
  if (minutesLate <= 10) return 'low';
  if (minutesLate <= 30) return 'medium';
  return 'high';
}
