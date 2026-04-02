import { createNotification } from '../../../lib/notifications';
import { supabase } from '../supabaseClient';

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
  created_at: string;
  updated_at: string;
  alerts: FlightAlertPreferences;
  flight: NormalizedFlight | null;
};

type FlightTrackerInvokeResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

function isMissingTableError(error: unknown, tableName: string): boolean {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  return code === 'PGRST205' && message.includes(`'public.${tableName}'`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

async function invokeFlightTracker<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('flight-tracker', {
    body: { action, ...payload },
  });
  if (error) throw error;
  const res = data as FlightTrackerInvokeResponse<T>;
  if (!res?.ok) {
    throw new Error(res?.error || 'Flight tracker request failed.');
  }
  return res.data as T;
}

export async function searchFlights(rawQuery: string, serviceDate?: string): Promise<FlightSearchResult> {
  const parsed = parseFlightSearchInput(rawQuery);
  const date = serviceDate || toIsoDate(new Date());
  return invokeFlightTracker<FlightSearchResult>('search', { query: parsed, serviceDate: date });
}

export async function getLiveFlightDetail(flightKey: string, forceRefresh = false): Promise<NormalizedFlight | null> {
  const res = await invokeFlightTracker<{ flight: NormalizedFlight | null }>('detail', {
    flightKey,
    forceRefresh,
  });
  return res.flight ?? null;
}

export async function getAirportBoard(
  airportCode: string,
  boardType: 'arrivals' | 'departures',
): Promise<AirportBoardResult> {
  return invokeFlightTracker<AirportBoardResult>('airport_board', {
    airportCode: airportCode.trim().toUpperCase(),
    boardType,
  });
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
      if (__DEV__) console.log('[FlightTracker] flight_search_history table missing; returning empty history.');
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
      if (__DEV__) console.log('[FlightTracker] flight_search_history table missing; skipping history write.');
      return;
    }
    throw error;
  }
}

export async function listWatchedFlights(userId: string): Promise<TrackedFlightItem[]> {
  const { data, error } = await supabase
    .from('user_tracked_flights')
    .select('*, flight:tracked_flights_cache(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTableError(error, 'user_tracked_flights')) {
      if (__DEV__) console.log('[FlightTracker] user_tracked_flights table missing; returning empty watchlist.');
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
  alerts?: Partial<FlightAlertPreferences>,
): Promise<void> {
  await invokeFlightTracker<{ flight_key: string }>('upsert_cached_flight', {
    flight,
  });
  const { error } = await supabase.from('user_tracked_flights').upsert(
    {
      user_id: userId,
      flight_key: flight.flight_key,
      alert_on_delay: alerts?.alert_on_delay ?? true,
      alert_on_cancel: alerts?.alert_on_cancel ?? true,
      alert_on_departure: alerts?.alert_on_departure ?? true,
      alert_on_arrival: alerts?.alert_on_arrival ?? true,
      alert_on_gate_change: alerts?.alert_on_gate_change ?? true,
    },
    { onConflict: 'user_id,flight_key' },
  );
  if (error) {
    if (isMissingTableError(error, 'user_tracked_flights')) {
      throw new Error('Flight Tracker database migration is missing. Apply migrations and retry.');
    }
    throw error;
  }
}

export async function unwatchFlight(userId: string, flightKey: string): Promise<void> {
  const { error } = await supabase
    .from('user_tracked_flights')
    .delete()
    .eq('user_id', userId)
    .eq('flight_key', flightKey);
  if (error) {
    if (isMissingTableError(error, 'user_tracked_flights')) {
      if (__DEV__) console.log('[FlightTracker] user_tracked_flights table missing; unsave skipped.');
      return;
    }
    throw error;
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
  await invokeFlightTracker<{ refreshed: number }>('refresh_watched', {});
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
  return invokeFlightTracker('enrich_staff_load', { input });
}

export async function enrichCrewScheduleSegment(input: {
  airline_code?: string | null;
  flight_number: string;
  departure_date: string;
  origin_airport?: string | null;
  destination_airport?: string | null;
}): Promise<{
  matched: boolean;
  flight_key?: string;
  normalized_status?: FlightTrackerStatus;
  delay_minutes?: number | null;
  estimated_departure?: string | null;
  estimated_arrival?: string | null;
}> {
  return invokeFlightTracker('enrich_schedule_segment', { input });
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
