import { createNotification } from '../../../lib/notifications';
import {
  airportBoardFetch,
  flightSearch,
  flightStatus,
  flightTrackerDiag,
  listTrackedFlightsFromDb,
  saveTrackedFlight as saveTrackedFlightEdge,
  syncScheduleFlight,
} from '../../features/flight-tracker/api/flightTrackerService';
import { localCalendarDate } from '../../features/flight-tracker/flightDateLocal';
import {
  buildFlightKey as buildFlightKeyImpl,
  parseFlightKey as parseFlightKeyImpl,
} from '../../features/flight-tracker/flightKeys';
import {
  boardRowToLegacyFlight,
  legacyToNormalized,
  searchItemToLegacyFlight,
  toLegacyNormalizedFlight,
  trackedRowToLegacyFlight,
} from '../../features/flight-tracker/mappers';
import { supabase } from '../supabaseClient';

/** Re-export with explicit bindings — Hermes rejects `export { x }` re-exports of imported getters. */
export const buildFlightKey = buildFlightKeyImpl;
export const parseFlightKey = parseFlightKeyImpl;

export type FlightTrackerStatus =
  | 'scheduled'
  | 'boarding'
  | 'taxiing'
  | 'departed'
  | 'en_route'
  | 'delayed'
  | 'holding'
  | 'landed'
  | 'cancelled'
  | 'unknown';

export type FlightAlertPreferences = {
  alert_on_delay: boolean;
  alert_on_cancel: boolean;
  alert_on_departure: boolean;
  alert_on_arrival: boolean;
  alert_on_gate_change: boolean;
};

export type NormalizedFlight = {
  flight_key: string;
  provider_flight_id: string | null;
  airline_code: string;
  airline_name: string | null;
  flight_number: string;
  origin_airport: string;
  destination_airport: string;
  service_date: string;
  normalized_status: FlightTrackerStatus;
  flight_status_raw: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  delay_minutes: number | null;
  aircraft_type: string | null;
  registration: string | null;
  terminal: string | null;
  gate: string | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  route_data: Record<string, unknown> | null;
  last_provider_update_at: string | null;
  cached_at: string | null;
  updated_at: string | null;
};

export type FlightSearchType = 'flight' | 'route' | 'airport';

export type FlightSearchQuery = {
  raw: string;
  type: FlightSearchType;
  ident?: string;
  origin?: string;
  destination?: string;
  airportCode?: string;
};

export type FlightSearchResult = {
  flights: NormalizedFlight[];
  source: 'cache' | 'provider' | 'mixed';
};

export type AirportBoardResult = {
  airport_code: string;
  board_type: 'arrivals' | 'departures';
  flights: NormalizedFlight[];
  source: 'cache' | 'provider' | 'mixed';
};

export type TrackedFlightItem = {
  id: string;
  user_id: string;
  flight_key: string;
  tracked_flight_id?: string;
  created_at: string;
  updated_at: string;
  alerts: FlightAlertPreferences;
  flight: NormalizedFlight | null;
};

function isMissingTableError(error: unknown, tableName: string): boolean {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  return code === 'PGRST205' && message.includes(`'public.${tableName}'`);
}

const warnedMissingTables = new Set<string>();
function warnMissingTableOnce(table: string) {
  if (!__DEV__) return;
  if (warnedMissingTables.has(table)) return;
  warnedMissingTables.add(table);
  console.warn(
    `[FlightTracker] Table "${table}" is not exposed in PostgREST — apply Supabase migrations to enable this feature.`,
  );
}

export function parseFlightSearchInput(rawInput: string): FlightSearchQuery {
  const raw = String(rawInput || '').trim().toUpperCase();
  const normalized = raw.replace(/\s+/g, ' ');
  const routeMatch = normalized.match(/^([A-Z]{3})\s*(?:TO|[-/])\s*([A-Z]{3})$/);
  if (routeMatch) {
    return { raw, type: 'route', origin: routeMatch[1], destination: routeMatch[2] };
  }
  if (/^[A-Z]{3}$/.test(normalized)) {
    return { raw, type: 'airport', airportCode: normalized };
  }
  const identCompact = normalized.replace(/\s+/g, '');
  const identMatch = identCompact.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/);
  if (identMatch) {
    return { raw, type: 'flight', ident: `${identMatch[1]}${identMatch[2]}` };
  }
  return { raw, type: 'flight', ident: identCompact };
}

export async function searchFlights(rawQuery: string, serviceDate?: string): Promise<FlightSearchResult> {
  const date = serviceDate || localCalendarDate();
  const q = String(rawQuery || '').trim();
  flightTrackerDiag('searchFlights', 'start', { queryPreview: q.slice(0, 48), date, len: q.length });
  const res = await flightSearch(rawQuery, date);
  const flights = res.results.map((r) => searchItemToLegacyFlight(r));
  flightTrackerDiag('searchFlights', 'mapped', { flightsCount: flights.length, source: res.source });
  return { flights, source: res.source as FlightSearchResult['source'] };
}

export async function getLiveFlightDetail(flightKey: string, _forceRefresh = false): Promise<NormalizedFlight | null> {
  const parsed = parseFlightKey(flightKey);
  if (!parsed) return null;
  try {
    const st = await flightStatus({
      carrierCode: parsed.airlineCode,
      flightNumber: parsed.flightNumber,
      flightDate: parsed.serviceDate,
      providerFlightId: null,
    });
    return toLegacyNormalizedFlight(st.flight);
  } catch {
    return null;
  }
}

export async function getAirportBoard(
  airportCode: string,
  boardType: 'arrivals' | 'departures',
  serviceDate?: string,
): Promise<AirportBoardResult> {
  const date = serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? serviceDate : localCalendarDate();
  const code = airportCode.trim().toUpperCase();
  flightTrackerDiag('getAirportBoard', 'start', { airportCode: code, boardType, date });
  const res = await airportBoardFetch({ airportCode: code, boardType, date });
  const flights = res.rows.map((r) => boardRowToLegacyFlight(r, date));
  flightTrackerDiag('getAirportBoard', 'mapped', { flightsCount: flights.length, source: res.source });
  return {
    airport_code: res.airportCode,
    board_type: res.boardType as 'arrivals' | 'departures',
    flights,
    source: res.source as AirportBoardResult['source'],
  };
}

export async function listRecentFlightSearches(userId: string, limit = 10): Promise<{ query: string; query_type: string; flight_key: string | null }[]> {
  const { data, error } = await supabase
    .from('flight_search_history')
    .select('query, query_type, flight_key, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, 'flight_search_history')) {
      warnMissingTableOnce('flight_search_history');
      return [];
    }
    throw error;
  }
  return (data || []).map((r: any) => ({
    query: String(r.query || ''),
    query_type: String(r.query_type || ''),
    flight_key: r.flight_key ? String(r.flight_key) : null,
  }));
}

export async function saveFlightSearchHistory(
  userId: string,
  query: string,
  queryType: FlightSearchType,
  flightKey?: string | null,
): Promise<void> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return;
  const { error } = await supabase.from('flight_search_history').insert({
    user_id: userId,
    query: cleanQuery,
    query_type: queryType,
    flight_key: flightKey || null,
  });
  if (error) {
    if (isMissingTableError(error, 'flight_search_history')) {
      warnMissingTableOnce('flight_search_history');
      return;
    }
    throw error;
  }
}

async function listLegacyUserTrackedFlights(userId: string): Promise<TrackedFlightItem[]> {
  const { data, error } = await supabase
    .from('user_tracked_flights')
    .select('*, flight:tracked_flights_cache(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTableError(error, 'user_tracked_flights')) {
      warnMissingTableOnce('user_tracked_flights');
      return [];
    }
    throw error;
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    flight_key: row.flight_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    alerts: {
      alert_on_delay: row.alert_on_delay ?? true,
      alert_on_cancel: row.alert_on_cancel ?? true,
      alert_on_departure: row.alert_on_departure ?? true,
      alert_on_arrival: row.alert_on_arrival ?? true,
      alert_on_gate_change: row.alert_on_gate_change ?? true,
    },
    flight: row.flight || null,
  }));
}

export async function listWatchedFlights(userId: string): Promise<TrackedFlightItem[]> {
  const rows = await listTrackedFlightsFromDb(userId);
  if (rows === null) {
    warnMissingTableOnce('tracked_flights');
    return listLegacyUserTrackedFlights(userId);
  }

  const out: TrackedFlightItem[] = [];
  for (const row of rows.slice(0, 40)) {
    let flight: NormalizedFlight | null = null;
    try {
      const st = await flightStatus({
        carrierCode: row.carrier_code,
        flightNumber: row.flight_number,
        flightDate: row.flight_date,
        providerFlightId: row.api_flight_id,
      });
      flight = toLegacyNormalizedFlight(st.flight);
    } catch {
      flight = trackedRowToLegacyFlight(row);
    }
    out.push({
      id: row.id,
      user_id: row.user_id,
      flight_key: flight?.flight_key ?? row.flight_key ?? buildFlightKey({
        airlineCode: row.carrier_code,
        flightNumber: row.flight_number,
        serviceDate: row.flight_date,
        origin: row.departure_airport,
        destination: row.arrival_airport,
      }),
      tracked_flight_id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      alerts: {
        alert_on_delay: true,
        alert_on_cancel: true,
        alert_on_departure: true,
        alert_on_arrival: true,
        alert_on_gate_change: true,
      },
      flight,
    });
  }
  return out;
}

export async function watchFlight(
  userId: string,
  flight: {
    flight_key: string;
    airline_code: string;
    flight_number: string;
    origin_airport: string;
    destination_airport: string;
    service_date: string;
  },
  _alerts?: Partial<FlightAlertPreferences>,
): Promise<void> {
  void userId;
  try {
    const st = await flightStatus({
      carrierCode: flight.airline_code,
      flightNumber: flight.flight_number,
      flightDate: flight.service_date,
      providerFlightId: null,
    });
    await saveTrackedFlightEdge(st.flight);
  } catch {
    const partial = legacyToNormalized({
      flight_key: flight.flight_key,
      provider_flight_id: null,
      airline_code: flight.airline_code,
      airline_name: null,
      flight_number: flight.flight_number,
      origin_airport: flight.origin_airport,
      destination_airport: flight.destination_airport,
      service_date: flight.service_date,
      normalized_status: 'unknown',
      flight_status_raw: null,
      scheduled_departure: null,
      scheduled_arrival: null,
      estimated_departure: null,
      estimated_arrival: null,
      actual_departure: null,
      actual_arrival: null,
      delay_minutes: null,
      aircraft_type: null,
      registration: null,
      terminal: null,
      gate: null,
      altitude: null,
      speed: null,
      heading: null,
      latitude: null,
      longitude: null,
      route_data: null,
      last_provider_update_at: null,
      cached_at: null,
      updated_at: null,
    } as NormalizedFlight);
    await saveTrackedFlightEdge(partial);
  }

  try {
    await supabase.from('user_tracked_flights').upsert(
      {
        user_id: userId,
        flight_key: flight.flight_key,
        alert_on_delay: _alerts?.alert_on_delay ?? true,
        alert_on_cancel: _alerts?.alert_on_cancel ?? true,
        alert_on_departure: _alerts?.alert_on_departure ?? true,
        alert_on_arrival: _alerts?.alert_on_arrival ?? true,
        alert_on_gate_change: _alerts?.alert_on_gate_change ?? true,
      },
      { onConflict: 'user_id,flight_key' },
    );
  } catch {
    /* legacy table optional */
  }
}

export async function unwatchFlight(userId: string, flightKey: string): Promise<void> {
  const parsed = parseFlightKey(flightKey);
  let q = supabase.from('tracked_flights').delete().eq('user_id', userId);
  if (parsed) {
    q = q
      .eq('carrier_code', parsed.airlineCode)
      .eq('flight_number', parsed.flightNumber)
      .eq('flight_date', parsed.serviceDate);
  } else {
    q = q.eq('flight_key', flightKey);
  }
  const { error } = await q;
  if (error && !isMissingTableError(error, 'tracked_flights')) {
    if (__DEV__) console.warn('[FlightTracker] tracked_flights delete:', error.message);
  }
  try {
    await supabase.from('user_tracked_flights').delete().eq('user_id', userId).eq('flight_key', flightKey);
  } catch {
    /* legacy table optional */
  }
}

export async function updateWatchAlerts(
  userId: string,
  flightKey: string,
  alerts: Partial<FlightAlertPreferences>,
): Promise<void> {
  const { error } = await supabase
    .from('user_tracked_flights')
    .update({
      ...alerts,
    })
    .eq('user_id', userId)
    .eq('flight_key', flightKey);
  if (error) {
    if (isMissingTableError(error, 'user_tracked_flights')) {
      throw new Error('Flight Tracker database migration is missing. Apply migrations and retry.');
    }
    throw error;
  }
}

export function subscribeTrackedFlights(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`flight-tracker-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_tracked_flights',
      filter: `user_id=eq.${userId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tracked_flights',
      filter: `user_id=eq.${userId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tracked_flights_cache',
    }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function freshnessLabel(updatedAt: string | null): string {
  if (!updatedAt) return 'No recent update';
  const ms = Date.now() - new Date(updatedAt).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  const hours = Math.floor(min / 60);
  return `Updated ${hours}h ago`;
}

export function statusTone(status: FlightTrackerStatus): { bg: string; fg: string } {
  if (status === 'cancelled') return { bg: '#FEE2E2', fg: '#B91C1C' };
  if (status === 'delayed' || status === 'holding') return { bg: '#FEF3C7', fg: '#92400E' };
  if (status === 'departed' || status === 'en_route' || status === 'boarding') return { bg: '#DBEAFE', fg: '#1D4ED8' };
  if (status === 'landed') return { bg: '#DCFCE7', fg: '#166534' };
  return { bg: '#E2E8F0', fg: '#334155' };
}

export function buildTrackedFlightShareText(flight: NormalizedFlight): string {
  const route = `${flight.origin_airport} -> ${flight.destination_airport}`;
  const status = flight.normalized_status.replace(/_/g, ' ');
  const deepLink = `flightclub://flight-tracker/flight/${encodeURIComponent(flight.flight_key)}`;
  return `${flight.airline_code} ${flight.flight_number}\n${route}\n${flight.service_date}\nStatus: ${status}\n${deepLink}`;
}

export async function runWatchedFlightsRefreshSweep(): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return;
  const rows = await listTrackedFlightsFromDb(uid);
  if (rows === null) return;
  for (const row of rows.slice(0, 25)) {
    try {
      await flightStatus({
        carrierCode: row.carrier_code,
        flightNumber: row.flight_number,
        flightDate: row.flight_date,
        providerFlightId: row.api_flight_id,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function validateAndEnrichStaffLoadFlight(input: {
  airline_code: string;
  flight_number: string;
  origin_airport: string;
  destination_airport: string;
  departure_date: string;
}): Promise<{
  exists: boolean;
  flight_key?: string;
  aircraft_type?: string | null;
  scheduled_departure_at?: string | null;
  scheduled_arrival_at?: string | null;
  normalized_status?: FlightTrackerStatus;
}> {
  try {
    const st = await flightStatus({
      carrierCode: input.airline_code,
      flightNumber: input.flight_number,
      flightDate: input.departure_date,
      providerFlightId: null,
    });
    const leg = toLegacyNormalizedFlight(st.flight);
    return {
      exists: true,
      flight_key: leg.flight_key,
      aircraft_type: leg.aircraft_type,
      scheduled_departure_at: leg.scheduled_departure,
      scheduled_arrival_at: leg.scheduled_arrival,
      normalized_status: leg.normalized_status,
    };
  } catch {
    return { exists: false };
  }
}

export async function enrichCrewScheduleSegment(input: {
  airline_code?: string | null;
  flight_number: string;
  departure_date: string;
  origin_airport?: string | null;
  destination_airport?: string | null;
  schedule_entry_id?: string | null;
}): Promise<{
  matched: boolean;
  flight_key?: string;
  normalized_status?: FlightTrackerStatus;
  delay_minutes?: number | null;
  estimated_departure?: string | null;
  estimated_arrival?: string | null;
}> {
  const carrier = String(input.airline_code || '')
    .trim()
    .toUpperCase();
  const fn = String(input.flight_number || '').trim();

  if (input.schedule_entry_id && carrier) {
    try {
      const r = await syncScheduleFlight({
        scheduleItemId: input.schedule_entry_id,
        carrierCode: carrier,
        flightNumber: fn.replace(/^[A-Z]+/i, ''),
        flightDate: input.departure_date,
      });
      if (r.syncStatus === 'matched' && r.flight) {
        const leg = toLegacyNormalizedFlight(r.flight);
        return {
          matched: true,
          flight_key: leg.flight_key,
          normalized_status: leg.normalized_status,
          delay_minutes: r.flight.delayMinutes ?? null,
          estimated_departure: r.flight.estimatedDepartureUtc ?? null,
          estimated_arrival: r.flight.estimatedArrivalUtc ?? null,
        };
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const ident = fn.replace(/\s+/g, '');
    const digits = ident.replace(/^[A-Z]+/i, '');
    const code = carrier || ident.replace(/\d.*/, '') || 'ZZ';
    const st = await flightStatus({
      carrierCode: code,
      flightNumber: digits || fn,
      flightDate: input.departure_date,
      providerFlightId: null,
    });
    const leg = toLegacyNormalizedFlight(st.flight);
    return {
      matched: true,
      flight_key: leg.flight_key,
      normalized_status: leg.normalized_status,
      delay_minutes: leg.delay_minutes,
      estimated_departure: leg.estimated_departure,
      estimated_arrival: leg.estimated_arrival,
    };
  } catch {
    return { matched: false };
  }
}

export async function notifyFlightStatusChange(params: {
  userId: string;
  actorId: string;
  flightKey: string;
  title: string;
  body: string;
  type:
    | 'flight_tracker_status_change'
    | 'flight_tracker_delay'
    | 'flight_tracker_cancelled'
    | 'flight_tracker_departed'
    | 'flight_tracker_arrived';
}): Promise<void> {
  await createNotification({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    entity_type: 'tracked_flight',
    entity_id: params.flightKey,
    title: params.title,
    body: params.body,
    data: { route: `/flight-tracker/flight/${encodeURIComponent(params.flightKey)}` },
  }).catch(() => {});
}
